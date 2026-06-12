/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy initializer for Gemini to prevent startup crashes if key is initially absent
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required in secrets/env');
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

function parseGeminiError(error: any): string {
  if (!error) return '문제를 분석하는 동안 예상치 못한 시스템 오류가 발생했습니다.';
  
  const errorMsg = error?.message || '';
  const errorStr = typeof error === 'object' ? JSON.stringify(error) : String(error);
  const status = error?.status || error?.statusCode || error?.response?.status;

  const isQuotaExceeded = 
    status === 429 || 
    errorStr.includes('429') || 
    errorStr.toLowerCase().includes('quota') || 
    errorStr.toLowerCase().includes('rate-limit') || 
    errorStr.toLowerCase().includes('resource_exhausted') ||
    errorStr.toLowerCase().includes('limit: 20') ||
    errorMsg.toLowerCase().includes('quota') || 
    errorMsg.toLowerCase().includes('resource_exhausted');

  if (isQuotaExceeded) {
    return '현재 구글 Gemini API의 일일/분당 호출 제한(하루 20회 요청 무료 한도)에 도달했습니다. 일일 한도가 초과되면 요청이 차단되므로, 약 1~2분 뒤 다시 지연 시도하거나 다음 날 한도가 리셋되기를 기다리셔야 합니다. (상세: RESOURCE_EXHAUSTED 429)';
  }

  return errorMsg || '문제를 분석하는 동안 예상치 못한 오류가 발생했습니다. 입력 텍스트/이미지 포맷이나 API 키 상태를 점검하세요.';
}

function handleApiError(error: any, res: express.Response) {
  const errorMsg = parseGeminiError(error);
  const errorStr = typeof error === 'object' ? JSON.stringify(error) : String(error);
  const status = error?.status || error?.statusCode || error?.response?.status;

  const isQuota = 
    status === 429 || 
    errorStr.includes('429') || 
    errorStr.toLowerCase().includes('quota') || 
    errorStr.toLowerCase().includes('rate-limit') || 
    errorStr.toLowerCase().includes('resource_exhausted') ||
    errorStr.toLowerCase().includes('limit: 20');

  const isUnavailable = 
    status === 503 ||
    errorStr.includes('503') ||
    errorStr.toLowerCase().includes('unavailable') ||
    errorStr.toLowerCase().includes('overloaded');

  let retryDelay: number | null = null;
  try {
    const match = errorStr.match(/Please retry in ([\d\.]+)s/);
    if (match && match[1]) {
      retryDelay = Math.ceil(parseFloat(match[1]));
    } else {
      const details = error?.response?.data?.error?.details || error?.error?.details || error?.details;
      if (Array.isArray(details)) {
        for (const d of details) {
          if (d['@type']?.includes('RetryInfo') || d.retryDelay) {
            const delayStr = d.retryDelay;
            if (typeof delayStr === 'string' && delayStr.endsWith('s')) {
              retryDelay = parseInt(delayStr.slice(0, -1), 10);
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('Failed to extract retryDelay on server:', e);
  }

  res.status(status || 500).json({
    error: errorMsg,
    isQuota,
    isUnavailable,
    retryDelay
  });
}


// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// AI analysis endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      res.status(400).json({ error: '수학 문제 텍스트를 입력해주세요.' });
      return;
    }

    const ai = getAiClient();

    const systemPrompt = `당신은 고등학교 수학 교육과정의 최고 전문가이자 수학 문제 분석 앱의 엔진입니다.
제공된 텍스트에서 여러 개의 수학 문제를 식별하여 분류, 유형화하고 각각 구조화된 데이터로 변환해야 합니다.

텍스트는 학생들이 교과서, 문제집 등에서 직접 입력하거나 붙여넣은 형태입니다. 혹은 시험지 PDF나 교재로부터 추출하여 레이아웃 노이즈가 산재할 수 있습니다.
★ 중요 - 파일/텍스트 노이즈 전처리 지침:
- PDF 텍스트 추출 중 흔히 보일 수 있는 지문 주변의 "5지선다형", "1 1 20 5", "O/X 기호", 문항당 배점 기호(예: [3점], [4.5점]), 페이지 번호 및 하단 푸터(예: "- 1 -", "1 / 4"), 시험 과목 분류 등의 불필요한 레이아웃 표제 조각들은 완벽하게 필터링하여 분리 제외하십시오.
- 오직 수학적 문제의 지문과, 질문이 성립하기 위해 필요한 참값/조건식 정보만을 'questionText'에 보존하십시오.
- 만약 문제 번호가 드러나 있지 않다면 내용의 독립성에 따라 문제들을 스스로 나누어 분류하십시오.

각 문제마다 다음 정보를 정확히 채우십시오:
1. id: 1부터 시작하는 순차적인 정수 번호입니다.
2. problemNumber: 본문에 표시된 해당 문항의 실제 문제 번호입니다. 번호가 없는 경우 id와 동일하게 부여하십시오.
3. questionText: 수식과 텍스트를 포함한 전체 문제 내용입니다. LaTeX 기호나 인라인 수식 기호(예: $, ^, _, \\pi)가 있다면 이를 보존하여 사람이 가독하기 좋게 깔끔히 정리해 작성하십시오.
4. firstLine: 해당 문제의 첫 번째 문장이거나 문제를 식별할 수 있는 대표 문장입니다. (반드시 20자 이내로 간략하게 요약)
5. topic (대단원): 고등학교 교육과정 대단원 중 하나를 매핑하십시오. 예: 다항식, 방정식과 부등식, 도형의 방정식, 집합과 명제, 함수와 그래프, 수열, 지수와 로그, 삼각함수, 수열의 극한, 미분법, 적분법, 확률, 통계 등
6. concept (핵심 개념): 해당 문제를 풀 때 가장 직접적으로 요구되는 핵심 수학 개념/공식입니다. 예: '등차수열의 일반항', '이차함수의 최댓값과 최솟값', '조립제법', '로그의 성질' 등
7. difficulty (난이도): 고등학생 기준으로 해당 문제의 난이도를 '상', '중', '하' 중 하나로 설정하십시오.
8. keywords: 문제와 가장 관련이 깊은 단어 또는 식별어구 3개로 구성된 배열입니다. (중요: 정확히 3개의 한글 키워드를 입력하십시오. 고유한 변수명 대신 수학 학술 용어로 채우십시오)
9. summary (유형 요약): 이 문제가 어떤 상황에서 무엇을 증명하거나 연산하기 위해 고안된 조건인지, 어떤 흐름으로 전개해야 하는지 친절하고 상세하기 요약된 한 문장입니다.`;

    const userPrompt = `다음 텍스트에 포함된 수학 문제들을 찾아서 분석해주세요.\n\n--- 입력 텍스트 ---\n${text}\n--- 끝 ---`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            problems: {
              type: Type.ARRAY,
              description: '분석된 고등학교 수학 문제 목록',
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.INTEGER, description: '1부터 시작하는 문제 식별 연속 정수' },
                  problemNumber: { type: Type.INTEGER, description: '실제 문항의 고유 번호' },
                  questionText: { type: Type.STRING, description: '수식과 띄어쓰기를 정돈한 완성형 문제 텍스트' },
                  firstLine: { type: Type.STRING, description: '문제를 대표할 수 있는 첫 문장 또는 요약 문구 (20자 이내)' },
                  topic: { type: Type.STRING, description: '고등학교 수학 정규 교과과정 기준 대단원 명칭' },
                  concept: { type: Type.STRING, description: '문제를 풀기 위해 알아야 하는 유일 핵심 공식 또는 개념 명칭' },
                  difficulty: { type: Type.STRING, description: '난이도: 상, 중, 하 중 택일' },
                  keywords: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: '수학적 특징을 보여주는 한글 키워드 3개'
                  },
                  summary: { type: Type.STRING, description: '해당 문제의 유형을 정확하게 설명하는 1~2문장의 요약' }
                },
                required: ['id', 'problemNumber', 'questionText', 'firstLine', 'topic', 'concept', 'difficulty', 'keywords', 'summary']
              }
            }
          },
          required: ['problems']
        }
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('Gemini API로부터 빈 응답을 받았습니다.');
    }

    // Parse verified response
    const resultObj = JSON.parse(responseText.trim());
    res.json(resultObj);
  } catch (error: any) {
    console.error('Error in analyze API:', error);
    handleApiError(error, res);
  }
});

// AI image analysis endpoint using Gemini Vision
app.post('/api/analyze-image', async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image || typeof image !== 'string' || image.trim().length === 0) {
      res.status(400).json({ error: '수학 문제 이미지 데이터가 누락되었습니다.' });
      return;
    }
    const realMimeType = mimeType || 'image/png';

    const ai = getAiClient();

    const systemPrompt = `당신은 고등학교 수학 교육과정의 최고 전문가이자 수학 문제 이미지 분석 앱의 비전 AI 엔진입니다.
제공된 이미지 파일에서 고등학교 수학 문제를 식별하여 지문을 텍스트로 고정하고, 분류 및 유형화하여 구조화된 데이터로 변환해야 합니다.

★ 중요 - 이미지 오독 및 문제 복구 지침:
1. 이미지 상단/하단에 불필요한 시험 정보(예: "2026학년도 6월", "3점", "5지선다형 번호")가 있으면 제거하십시오.
2. 오직 수학적 문제의 지문과 조건 정보만 'questionText'에 깔끔하게 복구하십시오.
3. 수식은 LaTeX 기호나 인라인 수식 기호 (예: $, ^, _)를 활용하여 수려하게 작성하십시오. 예: "y = -x^2 + 6x + a" -> "$y = -x^2 + 6x + a$"

각 문제마다 다음 정보를 정확히 채우십시오:
1. id: 1부터 시작하는 순차적인 정수 번호입니다.
2. problemNumber: 이미지 상에 드러나는 실제 문제 번호입니다. 번호가 식별되지 않는 경우 id와 동일하게 설정하십시오.
3. questionText: 수식과 지문을 포함한 전체 문제 지문입니다.
4. firstLine: 해당 문제의 첫 번째 문장이거나 문제를 식별할 수 있는 대표 문장입니다. (반드시 20자 이내로 정밀하고 간략하게 전달)
5. topic (대단원): 고등학교 교육과정 대단원 중 하나를 매핑하십시오. 예: 다항식, 방정식과 부등식, 도형의 방정식, 집합과 명제, 함수와 그래프, 수열, 지수와 로그, 삼각함수, 수열의 극한, 미분법, 적분법, 확률, 통계 등
6. concept (핵심 개념): 해당 문제를 풀 때 가장 직접적으로 요구되는 핵심 수학 개념/공식입니다. 예: '등차수열의 일반항', '이차함수의 최댓값과 최솟값', '조립제법', '로그의 성질' 등
7. difficulty (난이도): 고등학생 기준으로 해당 문제의 난이도를 '상', '중', '하' 중 하나로 설정하십시오.
8. keywords: 문제와 가장 관련이 깊은 단어 또는 식별어구 3개로 구성된 배열입니다 (정확히 3개의 한글 키워드를 입력하십시오).
9. summary (유형 요약): 이 문제가 어떤 흐름으로 전개되어 있고 어떤 공식의 매칭을 요하는지 상세하고 친절하게 요약한 한 문장입니다.`;

    const userPrompt = `제공된 이미지 속의 수학 문제를 읽고, 고등학교 수학 교과 범위에 입각하여 상세 분석을 수행한 뒤 지정 스키마에 따라 JSON으로 반환하세요.`;

    const imagePart = {
      inlineData: {
        mimeType: realMimeType,
        data: image,
      },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: {
        parts: [imagePart, { text: userPrompt }],
      },
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            problems: {
              type: Type.ARRAY,
              description: '이미지에서 분석된 고등학교 수학 문제 목록',
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.INTEGER, description: '1부터 시작하는 문제 식별 번호 (이미지에 여러 문제가 있을 때 활용)' },
                  problemNumber: { type: Type.INTEGER, description: '실제 문항 번호' },
                  questionText: { type: Type.STRING, description: 'LaTeX 형식을 아름답게 함유한 완전한 문제 본문' },
                  firstLine: { type: Type.STRING, description: '문제를 대표할 수 있는 첫 문장 또는 요약 문구 (20자 이내)' },
                  topic: { type: Type.STRING, description: '고등학교 수학 교육과정 대단원명' },
                  concept: { type: Type.STRING, description: '풀이 핵심 공식/개념명' },
                  difficulty: { type: Type.STRING, description: '난이도: 상, 중, 하 중 택일' },
                  keywords: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: '수학적 속성 한글 키워드 3개'
                  },
                  summary: { type: Type.STRING, description: '문제 조건/의도에 관한 상세 요약 한 문장' }
                },
                required: ['id', 'problemNumber', 'questionText', 'firstLine', 'topic', 'concept', 'difficulty', 'keywords', 'summary']
              }
            }
          },
          required: ['problems']
        }
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('Gemini API로부터 빈 응답을 받았습니다.');
    }

    const resultObj = JSON.parse(responseText.trim());
    res.json(resultObj);
  } catch (error: any) {
    console.error('Error in analyze-image API:', error);
    handleApiError(error, res);
  }
});

// Integrating Vite middleware for developer server / production serving
async function bootstrap() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening at http://localhost:${PORT}`);
  });
}

bootstrap();
