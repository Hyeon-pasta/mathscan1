/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MathProblem, SimilarityResult } from './types';

/**
 * Calculates similarity between a selected problem and all other problems,
 * returning the top N similar problems.
 * 
 * Score Criteria:
 * - concept 동일: +50점
 * - topic 동일: +30점
 * - difficulty 동일: +10점
 * - keywords 1개 당 일치: +5점
 */
export function calculateSimilarProblems(
  selected: MathProblem,
  allProblems: MathProblem[],
  limit = 3
): SimilarityResult[] {
  const list = allProblems.filter((p) => p.id !== selected.id);
  const results: SimilarityResult[] = [];

  for (const item of list) {
    const conceptMatch = item.concept.trim() === selected.concept.trim();
    const topicMatch = item.topic.trim() === selected.topic.trim();
    const difficultyMatch = item.difficulty === selected.difficulty;

    // Check keyword matches
    const matchedKeywords: string[] = [];
    const selectedKeys = selected.keywords.map((k) => k.toLowerCase().trim());
    for (const kw of item.keywords) {
      const formattedKw = kw.toLowerCase().trim();
      if (selectedKeys.includes(formattedKw)) {
        matchedKeywords.push(kw);
      }
    }

    // Accumulate scores
    const conceptScore = conceptMatch ? 50 : 0;
    const topicScore = topicMatch ? 30 : 0;
    const difficultyScore = difficultyMatch ? 10 : 0;
    const keywordsScore = matchedKeywords.length * 5;
    const totalScore = conceptScore + topicScore + difficultyScore + keywordsScore;

    // Build human-friendly reason
    let reasonText = '';
    const itemsMatched: string[] = [];

    if (conceptMatch) {
      itemsMatched.push(`핵심 개념('${selected.concept}')이 동일`);
    } else if (topicMatch) {
      itemsMatched.push(`대단원('${selected.topic}') 공통`);
    }

    if (difficultyMatch) {
      itemsMatched.push(`난이도(${selected.difficulty}) 일치`);
    }

    if (matchedKeywords.length > 0) {
      itemsMatched.push(`공통 키워드(${matchedKeywords.join(', ')}) 포함`);
    }

    if (totalScore >= 80) {
      reasonText = `동일한 핵심 개념과 단원을 공유하는 최고 순위 고유사형 쌍둥이 유형입니다.`;
    } else if (totalScore >= 50) {
      reasonText = `유사 개념 및 교과과정을 공유하여 개념 응용 학습에 알맞은 복습용 문제입니다.`;
    } else if (totalScore >= 30) {
      reasonText = `동일 단원의 연관된 키워드를 담고 있어 문제 해결력 확장에 유용합니다.`;
    } else {
      reasonText = `비교적 연관성은 낮으나, 영역별 통합 기본기를 강화하는 데 도움을 줍니다.`;
    }

    results.push({
      problem: item,
      score: totalScore,
      breakdown: {
        conceptMatch,
        topicMatch,
        difficultyMatch,
        matchedKeywords,
      },
      reason: reasonText,
    });
  }

  // Sort by score descending, then by id ascending
  return results
    .sort((a, b) => b.score - a.score || a.problem.id - b.problem.id)
    .slice(0, limit);
}

/**
 * 12 High-school curriculum sample questions for students to easily playground-test the application.
 */
export const SAMPLE_MATH_PROBLEMS: MathProblem[] = [
  {
    id: 1,
    problemNumber: 1,
    questionText: "다항식 $A = x^2 + 2x - 3$, $B = 2x^2 - x + 4$ 일 때, 다항식 $2A - B$의 전개식을 구하시오.",
    firstLine: "다항식 $2A-B$ 구하기",
    topic: "다항식",
    concept: "다항식의 덧셈과 뺄셈",
    difficulty: "하",
    keywords: ["다항식", "동류항", "식의 연산"],
    summary: "두 다항식에 연산 계수를 적용해 동류항 처리를 하는 다항식 단순 가감법 연산 문제입니다."
  },
  {
    id: 2,
    problemNumber: 2,
    questionText: "이차방정식 $x^2 - 4x + (k + 1) = 0$이 서로 다른 두 실근을 갖도록 하는 정수 $k$의 최댓값을 구하시오.",
    firstLine: "서로 다른 두 실근 정수 k",
    topic: "방정식과 부등식",
    concept: "이차방정식의 판별식",
    difficulty: "중",
    keywords: ["이차방정식", "실근", "판별식"],
    summary: "이차방정식이 실근을 가질 조건($D > 4$ 또는 $D > 0$)을 응용하여 부등식 영역 속 정수 최댓값을 판단하는 유형입니다."
  },
  {
    id: 3,
    problemNumber: 3,
    questionText: "이차함수 $y = -x^2 + 6x + a$의 최댓값이 10일 때, 상수 $a$의 값을 구하시오.",
    firstLine: "이차함수의 최댓값 성질",
    topic: "방정식과 부등식",
    concept: "이차함수의 최댓값과 최솟값",
    difficulty: "하",
    keywords: ["이차함수", "최댓값", "완전제곱식"],
    summary: "이차함수 표준형 변환을 통해 대칭축에서의 함숫값 최댓값을 도출하는 기본 유형입니다."
  },
  {
    id: 4,
    problemNumber: 4,
    questionText: "두 점 $A(1, 2)$, $B(5, -2)$를 이은 선분 $AB$를 $3:1$로 내분하는 점 $P$의 좌표가 $(a, b)$일 때, $a + b$의 값을 구하시오.",
    firstLine: "선분의 내분점 계산",
    topic: "도형의 방정식",
    concept: "선분의 내분점과 외분점",
    difficulty: "하",
    keywords: ["내분점", "선분", "평면좌표"],
    summary: "좌표평면 상의 두 점을 지정 비율로 분할하는 내분점 공식을 대입하는 연산 문제입니다."
  },
  {
    id: 5,
    problemNumber: 5,
    questionText: "전체집합 $U = \\{1, 2, 3, 4, 5, 6\\}$의 두 부분집합 $A = \\{1, 3, 5\\}$, $B = \\{3, 4, 5, 6\\}$에 대하여 집합 $A \\cap B^c$의 모든 원소의 합을 구하시오.",
    firstLine: "집합 연산과 차집합 원소합",
    topic: "집합과 명제",
    concept: "여집합과 차집합",
    difficulty: "하",
    keywords: ["집합", "여집합", "교집합"],
    summary: "차집합 성질($A \\cap B^c = A - B$)을 규명하여 해당하는 원소의 가산 연산을 수행합니다."
  },
  {
    id: 6,
    problemNumber: 6,
    questionText: "등차수열 $\\{a_n\\}$에 대하여 제3항이 8이고 제7항이 20일 때, 이 수열의 첫째항부터 제10항까지의 합 $S_{10}$을 구하시오.",
    firstLine: "등차수열의 유한합 연산",
    topic: "수열",
    concept: "등차수열의 합",
    difficulty: "중",
    keywords: ["등차수열", "수열의 합", "일반항"],
    summary: "공차와 첫째항을 연립방정식으로 얻어내고 유한 등차급수 공식에 적용하는 전형적인 수열 기초 응용 문항입니다."
  },
  {
    id: 7,
    problemNumber: 7,
    questionText: "방정식 $2^{2x} - 5 \\cdot 2^x + 4 = 0$의 두 실근을 $\\alpha, \\beta$라 할 때, $\\alpha + \\beta$의 값을 구하시오.",
    firstLine: "지수방정식 치환 근 분석",
    topic: "지수와 로그",
    concept: "지수방정식",
    difficulty: "중",
    keywords: ["지수방정식", "치환", "근과 계수의 관계"],
    summary: "$2^x = t$로 치환해 생성되는 이차방정식의 근과 지수합 공식의 연결 관계를 묻는 단골 유형입니다."
  },
  {
    id: 8,
    problemNumber: 8,
    questionText: "함수 $f(x) = 2^{x-1} + 3$의 역함수를 $g(x)$라 할 때, $g(7)$의 값을 구하시오.",
    firstLine: "지수 역함수의 대입 값",
    topic: "지수와 로그",
    concept: "역함수의 성질",
    difficulty: "하",
    keywords: ["지수함수", "역함수", "로그함수"],
    summary: "역함수의 정의인 $g(y)=x \\iff f(x)=y$ 성질을 사용하여 복잡한 역함수의 식 유도 없이 해를 도출합니다."
  },
  {
    id: 9,
    problemNumber: 9,
    questionText: "함수 $f(x) = x^3 - 3x^2 - 9x + 5$의 극댓값과 극솟값을 각각 $M, m$이라 할 때, $M - m$의 값을 구하시오.",
    firstLine: "삼차함수 극대 및 극소 차",
    topic: "미분법",
    concept: "함수의 극대와 극소",
    difficulty: "중",
    keywords: ["미분법", "삼차함수", "극값"],
    summary: "도함수 $f'(x)=0$이 되는 극점의 좌표를 활용하여 함수의 극대점 및 극소점을 판별하고 차를 구합니다."
  },
  {
    id: 10,
    problemNumber: 10,
    questionText: "곡선 $y = x^2 - 4x$와 $x$축으로 둘러싸인 도형의 넓이를 구하시오.",
    firstLine: "정적분을 이용한 면적 넓이",
    topic: "적분법",
    concept: "정적분과 넓이",
    difficulty: "중",
    keywords: ["정적분", "도형의 넓이", "이차곡선"],
    summary: "이차함수 그래프가 $x$축과 만드는 교점을 파악하여 정적분 수식에 대입하거나 공식을 적용해 음의 적분값을 넓이로 부호 보정합니다."
  },
  {
    id: 11,
    problemNumber: 11,
    questionText: "이차방정식 $x^2 - (2k-4)x + k^2 - 5 = 0$이 허근을 갖도록 하는 정수 $k$의 최솟값을 구하시오.",
    firstLine: "허근을 판정하는 최솟값",
    topic: "방정식과 부등식",
    concept: "이차방정식의 판별식",
    difficulty: "중",
    keywords: ["이차방정식", "허근", "판별식"],
    summary: "판별식 $D < 0$ 조건을 풀이하여 범위에 수반되는 임의의 정수 성질 상한값이나 하한값을 분석하는 문제입니다."
  },
  {
    id: 12,
    problemNumber: 12,
    questionText: "수열 $\\{a_n\\}$의 첫째항부터 제$n$항까지의 합 $S_n = n^2 + 2n$ 일 때, 일반항 $a_n$을 구하고 이를 활용해 $a_{10}$의 값을 구하시오.",
    firstLine: "수열의 합과 일반항의 관계",
    topic: "수열",
    concept: "수열의 합과 일반항의 관계",
    difficulty: "중",
    keywords: ["수열", "수열의 합", "일반항"],
    summary: "$a_n = S_n - S_{n-1}$ 성질의 점화 연립 관계를 응용하여 특정 등차수열의 일반 수식이나 타겟 원소를 취득합니다."
  }
];

/**
 * Simple hash function to create unique short keys for caching based on string inputs
 */
export function getHash(str: string): string {
  let hash = 0;
  const processed = str.trim().replace(/\s+/g, ' ').toLowerCase();
  for (let i = 0; i < processed.length; i++) {
    const char = processed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return 'h_' + Math.abs(hash).toString(36);
}

export interface CachedAnalysis {
  problems: MathProblem[];
  timestamp: number;
}

/**
 * Retrieves cached analysis from localStorage
 */
export function getCachedAnalysis(key: string): MathProblem[] | null {
  try {
    const cacheStr = localStorage.getItem('math_analysis_cache_v1');
    if (!cacheStr) return null;
    const cacheObj = JSON.parse(cacheStr);
    const item = cacheObj[key];
    if (item && Array.isArray(item.problems)) {
      return item.problems;
    }
  } catch (e) {
    console.warn('Failed to retrieve from localStorage cache:', e);
  }
  return null;
}

/**
 * Saves analysis result to localStorage cache
 */
export function setCachedAnalysis(key: string, problems: MathProblem[]): void {
  try {
    const cacheStr = localStorage.getItem('math_analysis_cache_v1');
    const cacheObj = cacheStr ? JSON.parse(cacheStr) : {};
    cacheObj[key] = {
      problems,
      timestamp: Date.now()
    } as CachedAnalysis;
    // Keep cache inside 100 entries to prevent localStorage bloat.
    const keys = Object.keys(cacheObj);
    if (keys.length > 100) {
      // Delete the oldest entry
      const oldestKey = keys.sort((a, b) => cacheObj[a].timestamp - cacheObj[b].timestamp)[0];
      delete cacheObj[oldestKey];
    }
    localStorage.setItem('math_analysis_cache_v1', JSON.stringify(cacheObj));
  } catch (e) {
    console.warn('Failed to update localStorage cache:', e);
  }
}

