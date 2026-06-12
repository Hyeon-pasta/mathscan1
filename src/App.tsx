/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  HelpCircle, 
  Search, 
  Filter, 
  ChevronRight, 
  RefreshCw, 
  BookOpen, 
  Award, 
  Flame, 
  CheckCircle2,
  Bookmark,
  Info,
  ZoomIn,
  Maximize2,
  Eye,
  CheckCircle,
  Hash,
  X,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { MathProblem, SimilarityResult } from './types';
import { MathFormula } from './components/MathFormula';
import { ProblemInputForm } from './components/ProblemInputForm';
import { calculateSimilarProblems, SAMPLE_MATH_PROBLEMS, getHash, getCachedAnalysis, setCachedAnalysis } from './utils';

// Helper to generate elegant math placeholder SVG when user doesn't upload a vision image
function getMathPlaceholderSvg(id: number, topic: string): string {
  const colors = [
    { bg: 'from-amber-50 to-orange-100', stroke: '#D97706', label: '∑' },
    { bg: 'from-emerald-50 to-teal-100', stroke: '#059669', label: '∫' },
    { bg: 'from-blue-50 to-indigo-100', stroke: '#2563EB', label: 'lim' },
    { bg: 'from-purple-50 to-fuchsia-100', stroke: '#7C3AED', label: 'f(x)' },
    { bg: 'from-rose-50 to-pink-100', stroke: '#E11D48', label: 'log' },
  ];
  const theme = colors[id % colors.length];
  
  let shapes = '';
  const searchTopic = topic.toLowerCase();
  if (searchTopic.includes('함수') || searchTopic.includes('미분') || searchTopic.includes('적분')) {
    // Elegant Curve (Polynomial Graph)
    shapes = `<path d="M 15 80 Q 30 10, 50 60 T 85 20" fill="none" stroke="${theme.stroke}" stroke-width="4" stroke-linecap="round"/>
              <line x1="10" y1="50" x2="90" y2="50" stroke="#9A948C" stroke-width="2" stroke-dasharray="4,4"/>
              <line x1="50" y1="10" x2="50" y2="90" stroke="#9A948C" stroke-width="2" stroke-dasharray="4,4"/>`;
  } else if (searchTopic.includes('수열') || searchTopic.includes('극한') || searchTopic.includes('지수') || searchTopic.includes('로그')) {
    // Discrete scatter points or limits convergence
    shapes = `<circle cx="20" cy="80" r="5" fill="${theme.stroke}"/>
              <circle cx="40" cy="55" r="5" fill="${theme.stroke}"/>
              <circle cx="60" cy="40" r="5" fill="${theme.stroke}"/>
              <circle cx="80" cy="30" r="5" fill="${theme.stroke}"/>
              <path d="M20 80 L 40 55 L 60 40 L 80 30" fill="none" stroke="${theme.stroke}" stroke-width="2" stroke-linecap="round" stroke-dasharray="3,3"/>`;
  } else if (searchTopic.includes('도형') || searchTopic.includes('삼각') || searchTopic.includes('방정식') || searchTopic.includes('원')) {
    // Triangle and circumcircle
    shapes = `<polygon points="25,75 75,75 50,30" fill="none" stroke="${theme.stroke}" stroke-width="4" stroke-linejoin="round"/>
              <circle cx="50" cy="58" r="18" fill="none" stroke="${theme.stroke}" stroke-dasharray="5,3" stroke-width="2"/>`;
  } else {
    // Sigma or structural grid
    shapes = `<rect x="20" y="20" width="60" height="60" rx="8" fill="none" stroke="${theme.stroke}" stroke-width="3"/>
              <text x="50" y="56" font-family="'Courier New', Courier, monospace" font-size="28" font-weight="900" fill="${theme.stroke}" text-anchor="middle" dominant-baseline="middle" font-style="italic">${theme.label}</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
    <defs>
      <linearGradient id="grad-${id}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FDFBF9" />
        <stop offset="100%" stop-color="#F1EDE8" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#grad-${id})" rx="16"/>
    <g opacity="0.85">
      ${shapes}
    </g>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default function App() {
  const [problems, setProblems] = useState<MathProblem[]>(() => {
    try {
      const saved = localStorage.getItem('math_problems');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [selectedProblem, setSelectedProblem] = useState<MathProblem | null>(() => {
    try {
      const saved = localStorage.getItem('math_problems');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed[0] || null;
      }
    } catch {
      // fallback
    }
    return null;
  });
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Lightbox Modal State
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [lightboxTitle, setLightboxTitle] = useState<string>('');

  // Search & Filters State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('모든 대단원');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('모든 난이도');

  // Deletion State
  const [deletePending, setDeletePending] = useState<MathProblem | null>(null);

  // Mobile / Tablet Tab Layout State
  const [mobileViewTab, setMobileViewTab] = useState<'list' | 'detail'>('list');

  const [importNotice, setImportNotice] = useState<{
    totalCount: number;
    newCount: number;
    dupCount: number;
    failedCount: number;
    type: 'image' | 'text' | 'multi';
    isCacheReused?: boolean;
  } | null>(null);

  // Sync problems to localStorage dynamically
  React.useEffect(() => {
    try {
      localStorage.setItem('math_problems', JSON.stringify(problems));
    } catch (e) {
      console.error('Failed to save problems to localStorage', e);
    }
  }, [problems]);

  // Let ESC close the lightbox modal
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxImg(null);
        setDeletePending(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Unified problem adder with continuous incremental IDs
  const appendProblems = (
    newProbs: MathProblem[], 
    uploadedImageUrl?: string,
    fileName?: string,
    fileSize?: number
  ) => {
    setProblems((prev) => {
      const maxId = prev.reduce((max, p) => p.id > max ? p.id : max, 0);
      const remapped = newProbs.map((p, idx) => ({
        ...p,
        id: maxId + 1 + idx,
        imageUrl: p.imageUrl || uploadedImageUrl, // Bind user uploaded image if available
        fileName: p.fileName || fileName,
        fileSize: p.fileSize || fileSize,
      }));
      const updated = [...prev, ...remapped];
      setSelectedProblem((prevSelected) => {
        // If there's an existing selected problem, preserve it. Otherwise set to the first new one.
        return prevSelected || remapped[0] || prev[0] || null;
      });
      return updated;
    });
  };

  // Process incoming newly parsed problems, doing automatic exact-duplication detection and batch registering
  const processIncomingAnalyzedProblems = async (
    rawProblems: MathProblem[],
    type: 'image' | 'text',
    uploadedUrl?: string,
    fileName?: string,
    fileSize?: number
  ) => {
    let newCount = 0;
    let dupCount = 0;
    const problemsToRegister: MathProblem[] = [];

    // Duplication Check function matching criteria:
    // 1) Space-stripped question text matches
    // 2) Topic, concept, AND summary match
    const checkIsDuplicate = (prob: MathProblem, listToCheck1: MathProblem[], listToCheck2: MathProblem[]) => {
      const combined = [...listToCheck1, ...listToCheck2];
      return combined.some((existing) => {
        // 1. Check direct questionText equality or highly similar (whitespace stripped comparison)
        const cleanNew = prob.questionText.replace(/\s+/g, '').toLowerCase();
        const cleanExisting = existing.questionText.replace(/\s+/g, '').toLowerCase();
        if (cleanNew && cleanExisting) {
          if (cleanNew === cleanExisting) return true;
          // Substring matching for extreme similarity
          if (cleanNew.length > 10 && cleanExisting.length > 10) {
            if (cleanNew.includes(cleanExisting) || cleanExisting.includes(cleanNew)) {
              return true;
            }
          }
        }

        // 2. Check category (topic, concept, summary) overlap
        const bTopic = prob.topic?.trim().toLowerCase() === existing.topic?.trim().toLowerCase();
        const bConcept = prob.concept?.trim().toLowerCase() === existing.concept?.trim().toLowerCase();
        
        let sharesSummary = false;
        if (prob.summary && existing.summary) {
          const s1 = prob.summary.trim().toLowerCase();
          const s2 = existing.summary.trim().toLowerCase();
          if (s1 === s2) {
            sharesSummary = true;
          } else {
            const w1 = s1.split(/\s+/).filter(x => x.length > 1);
            const matched = w1.filter(word => s2.includes(word));
            if (matched.length >= 2) {
              sharesSummary = true;
            }
          }
        }

        return bTopic && bConcept && sharesSummary;
      });
    };

    for (const prob of rawProblems) {
      const isDup = checkIsDuplicate(prob, problems, problemsToRegister);
      
      problemsToRegister.push({
        ...prob,
        fileName,
        fileSize,
        isDuplicate: isDup ? true : undefined
      });

      if (isDup) {
        dupCount++;
      } else {
        newCount++;
      }
    }

    if (problemsToRegister.length > 0) {
      appendProblems(problemsToRegister, uploadedUrl, fileName, fileSize);
    }

    // Single upload text notice banner
    if (type === 'text') {
      setImportNotice({
        totalCount: rawProblems.length,
        newCount,
        dupCount,
        failedCount: 0,
        type: 'text'
      });
    }

    return {
      problemsCount: rawProblems.length,
      newCount,
      duplicateCount: dupCount
    };
  };

  // Load sample problems
  const handleLoadSamples = () => {
    const rawSamples = SAMPLE_MATH_PROBLEMS.map((prob) => ({
      ...prob,
      isSample: true,
    }));
    processIncomingAnalyzedProblems(rawSamples, 'text');
    setErrorMsg(null);
  };

  const handleClearAll = () => {
    setProblems([]);
    setSelectedProblem(null);
    setErrorMsg(null);
    setImportNotice(null);
  };

  const handleClearSamplesOnly = () => {
    setProblems((prev) => {
      const remaining = prev.filter((p) => !p.isSample);
      setSelectedProblem((prevSelected) => {
        if (prevSelected?.isSample) {
          // If the currently selected problem was a sample, switch selection to first remaining problem
          return remaining[0] || null;
        }
        return prevSelected;
      });
      return remaining;
    });
    setImportNotice(null);
    setErrorMsg(null);
  };

  const handleConfirmDelete = () => {
    if (!deletePending) return;
    const targetId = deletePending.id;
    setProblems((prev) => {
      const remaining = prev.filter((p) => p.id !== targetId);
      setSelectedProblem((prevSelected) => {
        if (prevSelected?.id === targetId) {
          return remaining[0] || null;
        }
        return prevSelected;
      });
      return remaining;
    });
    setDeletePending(null);
    // Clear old import summary to avoid UI confusion after deletion
    setImportNotice(null);
  };

  // Analyze API request to server-side Gemini (Text)
  const handleAnalyzeText = async (text: string) => {
    setIsAnalyzing(true);
    setErrorMsg(null);
    setImportNotice(null);
    try {
      const normalizedText = text.trim();
      const textHash = getHash(normalizedText);
      const cached = getCachedAnalysis(textHash);

      if (cached) {
        const stats = await processIncomingAnalyzedProblems(cached, 'text');
        setImportNotice({
          totalCount: cached.length,
          newCount: stats ? stats.newCount : cached.length,
          dupCount: stats ? stats.duplicateCount : 0,
          failedCount: 0,
          type: 'text',
          isCacheReused: true
        });
        return;
      }

      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        const errObj = new Error(errorData.error || `서버 응답 오류 (코드: ${resp.status})`) as any;
        errObj.isQuota = errorData.isQuota;
        errObj.isUnavailable = errorData.isUnavailable;
        errObj.retryDelay = errorData.retryDelay;
        throw errObj;
      }

      const data = await resp.json();
      if (data && Array.isArray(data.problems)) {
        setCachedAnalysis(textHash, data.problems);
        await processIncomingAnalyzedProblems(data.problems, 'text');
      } else {
        throw new Error('Gemini 분석 응답 규격이 올바르지 않습니다.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || '수학 문제 분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Analyze API request to server-side Gemini Vision (Image)
  const handleAnalyzeImage = async (base64Data: string, mimeType: string, fileName?: string, fileSize?: number) => {
    setIsAnalyzingImage(true);
    setErrorMsg(null);
    setImportNotice(null);
    try {
      const imageHash = getHash(base64Data);
      const cached = getCachedAnalysis(imageHash);

      if (cached) {
        const uploadedUrl = `data:${mimeType};base64,${base64Data}`;
        const stats = await processIncomingAnalyzedProblems(cached, 'image', uploadedUrl, fileName, fileSize);
        return stats;
      }

      const resp = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Data, mimeType }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        const errObj = new Error(errorData.error || `서버 응답 오류 (코드: ${resp.status})`) as any;
        errObj.isQuota = errorData.isQuota;
        errObj.isUnavailable = errorData.isUnavailable;
        errObj.retryDelay = errorData.retryDelay;
        throw errObj;
      }

      const data = await resp.json();
      if (data && Array.isArray(data.problems)) {
        setCachedAnalysis(imageHash, data.problems);
        const uploadedUrl = `data:${mimeType};base64,${base64Data}`;
        const stats = await processIncomingAnalyzedProblems(data.problems, 'image', uploadedUrl, fileName, fileSize);
        return stats;
      } else {
        throw new Error('Gemini 이미지 분석 응답 규격이 올바르지 않습니다.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || '이미지 수학 문제 분석 중 오류가 발생했습니다.');
      throw err; // Rethrow to let the sequencer proceed to other queued images
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  // Collect unique topics from loaded problems for filtering
  const availableTopics = useMemo(() => {
    const topicsSet = new Set<string>();
    problems.forEach((p) => {
      if (p.topic) topicsSet.add(p.topic.trim());
    });
    return ['모든 대단원', ...Array.from(topicsSet)];
  }, [problems]);

  // Filtered problems list
  const filteredProblems = useMemo(() => {
    return problems.filter((prob) => {
      // 1. Search text match (checks text, topic, concept, and keywords)
      const query = searchTerm.toLowerCase().trim();
      const textMatch = 
        !query || 
        prob.questionText.toLowerCase().includes(query) ||
        prob.topic.toLowerCase().includes(query) ||
        prob.concept.toLowerCase().includes(query) ||
        prob.keywords.some((k) => k.toLowerCase().includes(query));

      // 2. Topic Match
      const topicMatch = selectedTopic === '모든 대단원' || prob.topic.trim() === selectedTopic.trim();

      // 3. Difficulty Match
      const difficultyMatch = selectedDifficulty === '모든 난이도' || prob.difficulty === selectedDifficulty;

      return textMatch && topicMatch && difficultyMatch;
    });
  }, [problems, searchTerm, selectedTopic, selectedDifficulty]);

  // Calculate similarity recommendation for the selected problem
  const recommendedSimilar = useMemo(() => {
    if (!selectedProblem || problems.length <= 1) return [];
    // Compare selected problem with all loaded problems
    return calculateSimilarProblems(selectedProblem, problems, 3);
  }, [selectedProblem, problems]);

  // Aggregate student learning statistics/insights statically from the current problems array
  const learningInsights = useMemo(() => {
    if (problems.length === 0) return null;

    const total = problems.length;

    // 1. Calculate most frequent topic
    const topicCounts: Record<string, number> = {};
    problems.forEach((p) => {
      if (p.topic) {
        const t = p.topic.trim();
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      }
    });
    let topTopic = 'N/A';
    let topTopicCount = 0;
    Object.entries(topicCounts).forEach(([topic, count]) => {
      if (count > topTopicCount) {
        topTopicCount = count;
        topTopic = topic;
      }
    });

    // 2. Calculate most frequent concept
    const conceptCounts: Record<string, number> = {};
    problems.forEach((p) => {
      if (p.concept) {
        const c = p.concept.trim();
        conceptCounts[c] = (conceptCounts[c] || 0) + 1;
      }
    });
    let topConcept = 'N/A';
    let topConceptCount = 0;
    Object.entries(conceptCounts).forEach(([concept, count]) => {
      if (count > topConceptCount) {
        topConceptCount = count;
        topConcept = concept;
      }
    });

    // 3. Difficulty distribution
    let highCount = 0;
    let midCount = 0;
    let lowCount = 0;
    problems.forEach((p) => {
      if (p.difficulty === '상') highCount++;
      else if (p.difficulty === '중') midCount++;
      else if (p.difficulty === '하') lowCount++;
    });

    // 4. Potential duplicate count
    const duplicateCount = problems.filter((p) => p.isDuplicate).length;

    return {
      total,
      topTopic,
      topTopicCount,
      topConcept,
      topConceptCount,
      difficulties: { high: highCount, mid: midCount, low: lowCount },
      duplicateCount,
    };
  }, [problems]);

  return (
    <div className="min-h-screen bg-[#F8F5F2] text-[#2C2C2A] flex flex-col selection:bg-[#5A5A40]/10 selection:text-[#5A5A40] pb-12 transition-colors duration-200" id="main-layout">
      {/* Top Stylish Header */}
      <header className="border-b border-[#D6D0C7] bg-[#F8F5F2] sticky top-0 z-50 px-4 sm:px-8 py-4" id="app-header">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-[#5A5A40] rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-md select-none transform transition hover:scale-105">
              ∑
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#2C2C2A] serif-font italic flex items-center gap-1">
                AI Math Analysis Lab
                <span className="text-xs font-normal non-italic bg-[#5A5A40]/10 text-[#5A5A40] border border-[#5A5A40]/20 px-2 py-0.5 rounded-full ml-2">고교 수학 전용</span>
              </h1>
              <p className="text-xs text-[#9A948C] font-medium mt-0.5">고등학생용 지능형 수학 문제 유형 분석 및 쌍둥이 유사 문제 추천 시스템</p>
            </div>
          </div>

          <div className="flex items-center gap-4 self-end md:self-auto">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-white/80 border border-[#D6D0C7] rounded-full text-xs text-[#5A5A40] font-medium shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Gemini 3.5 Flash Connected
            </div>
            <a 
              href="#input-container"
              className="px-4 py-1.5 bg-[#5A5A40] hover:bg-[#4A4A35] text-[#F8F5F2] rounded-xl text-xs font-semibold shadow-sm transition hover:shadow-md cursor-pointer"
            >
              새 문제 분석
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-8 mt-6 flex-1 flex flex-col gap-6" id="main-content-flow">
        
        {/* Service Hero Card */}
        <section className="bg-[#5A5A40] text-amber-50 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-lg border border-[#4A4A35] flex flex-col lg:flex-row lg:items-center justify-between gap-6" id="brand-hero">
          <div className="relative z-10 max-w-2xl">
            <span className="inline-block px-3 py-1 bg-white/10 text-stone-200 border border-white/10 rounded-full text-xs font-semibold mb-3">
              유형별 반복 학습의 혁신
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight serif-font italic leading-snug">
              문제를 분석하고, 닮은꼴 '쌍둥이 문항'으로 완벽 점검하자
            </h2>
            <p className="text-sm text-stone-200 mt-2 leading-relaxed">
              교과서나 문제집의 수학 문제를 텍스트로 자유롭게 붙여넣으세요. Gemini AI 모델이 즉시 대단원 분류, 핵심 역량 개념, 난이도 및 키워드를 오차 없이 요약 분석해 줍니다. 등록된 다른 문제들과의 정형화된 수학적 유사도 연산으로 오답 극복을 위한 유사 문항도 정밀하게 자동 매치합니다.
            </p>
            <div className="flex flex-wrap gap-4 mt-4">
              <div className="flex items-center gap-1.5 text-xs text-amber-100 font-medium">
                <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                대단원 자동 매핑
              </div>
              <div className="flex items-center gap-1.5 text-xs text-amber-100 font-medium">
                <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                핵심 개념 & 키워드 3종 분류
              </div>
              <div className="flex items-center gap-1.5 text-xs text-amber-100 font-medium">
                <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                수학적 스코어 기반 유사도 매칭
              </div>
            </div>
          </div>
          <div className="lg:w-1/3 shrink-0 flex flex-col justify-center items-center bg-white/5 border border-white/10 p-5 rounded-2xl">
            <div className="text-center">
              <span className="text-5xl font-extrabold text-amber-300 font-mono">100%</span>
              <p className="text-xs text-stone-300 mt-1 font-semibold uppercase tracking-wider">Client In-Memory Storage</p>
            </div>
            <div className="w-full h-px bg-white/10 my-3"></div>
            <p className="text-[11px] text-stone-300 text-center leading-normal">
              로그인이나 데이터 공유 없이 안전하게 브라우저 로컬 데이터로 실시간 전처리됩니다. 안심하고 학습 자료를 등록하세요.
            </p>
          </div>
        </section>

        {/* Input Form Module */}
        <section id="form-section" className="flex flex-col gap-4">
          <ProblemInputForm 
            onAnalyze={handleAnalyzeText} 
            onAnalyzeImage={handleAnalyzeImage}
            onAddProblemsDirectly={async (rawProbs, type, imgUrl, fName, fSize) => {
              return await processIncomingAnalyzedProblems(rawProbs, type, imgUrl, fName, fSize);
            }}
            onLoadSamples={handleLoadSamples}
            onClearAll={handleClearAll}
            onClearSamplesOnly={handleClearSamplesOnly}
            isAnalyzing={isAnalyzing}
            isAnalyzingImage={isAnalyzingImage}
            errorMsg={errorMsg}
            hasProblems={problems.length > 0}
            existingProblems={problems}
            setImportNotice={setImportNotice}
          />
        </section>

          {/* Import Summary Notice Banner */}
          {importNotice && (
            <div 
              className="p-5 bg-white dark:bg-slate-900 border-2 border-[#D6D0C7]/80 dark:border-slate-800 rounded-3xl shadow-sm text-left flex items-start justify-between gap-4 transition-all duration-300 animate-fadeIn"
              id="import-notice-banner"
            >
              <div className="flex items-start gap-4 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#5A5A40]/10 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-[#5A5A40] dark:text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 serif-font italic">수학 문제 분석 완료 안내</h4>
                  {importNotice.isCacheReused && (
                    <div className="mt-1 px-2.5 py-0.5 inline-flex items-center gap-1 text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg animate-pulse dark:bg-slate-800 dark:text-indigo-300 dark:border-indigo-900/60">
                      ⚡ 기존 분석 결과를 재사용했습니다.
                    </div>
                  )}
                  
                  {importNotice.type === 'multi' ? (
                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-350 space-y-1.5 leading-relaxed">
                      <p className="font-semibold text-slate-700 dark:text-slate-200">총 <span className="text-[#5A5A40] dark:text-emerald-450 text-sm font-extrabold">{importNotice.totalCount}</span>개의 문제가 분석되었습니다.</p>
                      <ul className="space-y-1 pl-1">
                        <li className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                          <span className="shrink-0 flex items-center justify-center w-4 h-4 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-[10px]">✓</span> 
                          새로 등록된 문제: {importNotice.newCount}개
                        </li>
                        <li className="flex items-center gap-1.5 text-amber-600 dark:text-amber-450 font-medium">
                          <span className="shrink-0 flex items-center justify-center w-4 h-4 rounded-full bg-amber-50 dark:bg-amber-950/40 text-[10px]">⚠</span> 
                          중복 가능성 문제: {importNotice.dupCount}개
                        </li>
                        <li className="flex items-center gap-1.5 text-rose-600 dark:text-rose-450 font-medium">
                          <span className="shrink-0 flex items-center justify-center w-4 h-4 rounded-full bg-rose-50 dark:bg-rose-950/40 text-[10px]">✕</span> 
                          분석 실패 문제: {importNotice.failedCount}개
                        </li>
                      </ul>
                      <p className="text-[10px] text-slate-400 mt-1 italic">※ 유사도가 매우 높은 중복 가능성이 검출된 문제도 등록을 차단하지 않고 대시보드에 정상 등록되었습니다. ('중복 가능성 있음' 배지 부착)</p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 dark:text-slate-350 mt-1 leading-relaxed">
                      {importNotice.type === 'image' ? '이미지' : '직접 입력한 텍스트'} 분석 결과가 정상 반영되었습니다.{' '}
                      총 <strong className="text-[#5A5A40] dark:text-emerald-400 font-bold">{importNotice.totalCount}개 문항</strong>이 분석 완료되었으며,{' '}
                      이 중 <strong className="text-emerald-700 dark:text-emerald-450 font-bold">{importNotice.newCount}개 문항이 신규</strong> 등록되었습니다.
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImportNotice(null)}
                className="p-1 px-2 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-350 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer"
              >
                닫기
              </button>
            </div>
          )}

          {problems.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-20">
              
              {/* 1. 학습 인사이트 (statistics panel) spanning all 12 columns */}
              {learningInsights && (
                <div className="col-span-12 bg-white dark:bg-slate-900 border border-[#D6D0C7] dark:border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 card-shadow" id="learning-insights">
                  <div className="flex items-center gap-2 mb-4 border-b border-[#D6D0C7]/30 pb-3">
                    <Award className="w-5 h-5 text-amber-600 dark:text-emerald-400" />
                    <div>
                      <h3 className="text-base font-bold text-[#5A5A40] dark:text-slate-100 serif-font italic">실시간 학습 분석 및 취약 유형 인사이트</h3>
                      <p className="text-[10px] text-[#9A948C]">학습 중인 문항들을 정형 데이터 상태로 일괄 집계한 정보 지표입니다.</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
                    {/* Card A: Total Count */}
                    <div className="bg-[#FDFBF9] dark:bg-slate-950 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#D6D0C7]/40 dark:border-slate-800 flex flex-col justify-between shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-[#9A948C] tracking-wide">총 분석 문제 수</span>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-2xl sm:text-3xl font-extrabold text-[#5A5A40] dark:text-emerald-450">{learningInsights.total}</span>
                        <span className="text-[10px] sm:text-xs text-slate-500 font-bold">개 문항</span>
                      </div>
                    </div>
                    
                    {/* Card B: Top Topic */}
                    <div className="bg-[#FDFBF9] dark:bg-slate-950 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#D6D0C7]/40 dark:border-slate-800 flex flex-col justify-between shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-[#9A948C] tracking-wide">가장 많이 등장한 단원</span>
                      <div className="mt-2 text-left">
                        <p className="text-xs font-black text-[#5A5A40] dark:text-slate-200 truncate" title={learningInsights.topTopic}>
                          {learningInsights.topTopic}
                        </p>
                        <p className="text-[9.5px] text-slate-400 mt-1 font-semibold">{learningInsights.topTopicCount}회 집중 출제됨</p>
                      </div>
                    </div>
   
                    {/* Card C: Top Concept */}
                    <div className="bg-[#FDFBF9] dark:bg-slate-950 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#D6D0C7]/40 dark:border-slate-800 flex flex-col justify-between shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-[#9A948C] tracking-wide">가장 많이 등장한 핵심 개념</span>
                      <div className="mt-2 text-left">
                        <p className="text-[11.5px] font-black text-[#5A5A40] dark:text-slate-200 truncate" title={learningInsights.topConcept}>
                          {learningInsights.topConcept}
                        </p>
                        <p className="text-[9.5px] text-slate-400 mt-1 font-semibold">{learningInsights.topConceptCount}회 오답 분석됨</p>
                      </div>
                    </div>
   
                    {/* Card D: Difficulty Distribution */}
                    <div className="bg-[#FDFBF9] dark:bg-slate-950 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#D6D0C7]/40 dark:border-slate-800 flex flex-col justify-between shadow-xs">
                      <span className="text-[10px] uppercase font-bold text-[#9A948C] tracking-wide">난이도 분포</span>
                      <div className="mt-1.5 text-left">
                        <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-[10px] font-bold">
                          <span className="text-rose-600">상: {learningInsights.difficulties.high}</span>
                          <span className="text-amber-600">중: {learningInsights.difficulties.mid}</span>
                          <span className="text-emerald-600">하: {learningInsights.difficulties.low}</span>
                        </div>
                        <div className="flex h-2 bg-slate-100 dark:bg-slate-850 rounded-full overflow-hidden mt-1.5 border border-slate-200/50">
                          {learningInsights.total > 0 && (
                            <>
                              <div className="bg-rose-500 transition-all duration-300" style={{ width: `${(learningInsights.difficulties.high / learningInsights.total) * 100}%` }} />
                              <div className="bg-amber-500 transition-all duration-300" style={{ width: `${(learningInsights.difficulties.mid / learningInsights.total) * 100}%` }} />
                              <div className="bg-emerald-500 transition-all duration-300" style={{ width: `${(learningInsights.difficulties.low / learningInsights.total) * 105}%` }} />
                            </>
                          )}
                        </div>
                      </div>
                    </div>
   
                    {/* Card E: Potential Duplicates */}
                    <div className="bg-[#FDFBF9] dark:bg-slate-950 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#D6D0C7]/40 dark:border-slate-800 flex flex-col justify-between shadow-xs col-span-2 sm:col-span-1">
                      <span className="text-[10px] uppercase font-bold text-[#9A948C] tracking-wide">중복 가능성 문제 개수</span>
                      <div className="mt-2 flex items-baseline gap-1.5 text-left">
                        <span className={`text-2xl font-extrabold ${learningInsights.duplicateCount > 0 ? 'text-amber-655' : 'text-slate-400'}`}>
                          {learningInsights.duplicateCount}
                        </span>
                        <span className="text-[10.5px] text-slate-500 font-bold">개 감지</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Mobile/Tablet tab switcher for List and Detail views spanning all 12 columns */}
              <div className="lg:hidden col-span-12 flex p-1 bg-[#F1EDE8] dark:bg-slate-850 rounded-2xl border border-[#D6D0C7]/40 dark:border-slate-800/80 mb-2" id="mobile-views-tab-switcher">
                <button
                  type="button"
                  onClick={() => setMobileViewTab('list')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 text-xs font-bold rounded-xl transition-all duration-200 cursor-pointer ${
                    mobileViewTab === 'list'
                      ? 'bg-white dark:bg-slate-900 text-[#5A5A40] dark:text-emerald-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-350'
                  }`}
                >
                  <Filter className="w-4 h-4 text-[#5A5A40] dark:text-emerald-450" />
                  <span>진단 목록 ({filteredProblems.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileViewTab('detail')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 text-xs font-bold rounded-xl transition-all duration-200 cursor-pointer ${
                    mobileViewTab === 'detail'
                      ? 'bg-white dark:bg-slate-900 text-[#5A5A40] dark:text-emerald-450 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-350'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>문항 상세 / 추천</span>
                  {selectedProblem && (
                    <span className="px-1.5 py-0.5 rounded bg-[#F1EDE8] dark:bg-slate-850 text-[#5A5A40] dark:text-amber-400 text-[9px] font-extrabold shadow-xs">
                      #{selectedProblem.problemNumber || selectedProblem.id}
                    </span>
                  )}
                </button>
              </div>
            
            {/* Left/Center Part: Analysis Table & Search/Filter (Cols span 8) */}
            <div className={`lg:col-span-8 flex flex-col gap-4 ${mobileViewTab === 'list' ? 'flex' : 'hidden lg:flex'}`}>
              
              {/* Filter and Search Bar Card */}
              <div className="bg-white dark:bg-slate-900 border border-[#D6D0C7] dark:border-slate-800 rounded-3xl p-5 card-shadow" id="filters-panel">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-[#5A5A40]" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-[#5A5A40]">조건 검색 및 필터</h3>
                  </div>
                  
                  {/* Stats bubble */}
                  <span className="text-xs px-2.5 py-1 bg-[#F1EDE8] dark:bg-slate-800 text-[#5A5A40] dark:text-slate-300 font-bold rounded-lg border border-[#D6D0C7]/40">
                    전체 {problems.length}문항 분석됨
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                  {/* Search bar */}
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <Search className="h-4 h-4 text-slate-400" />
                    </span>
                    <input
                      type="text"
                      id="search-input"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="단어, 개념, 수식 키워드로 찾기"
                      className="block w-full pl-9 pr-3 py-2 text-xs bg-[#FDFBF9] dark:bg-slate-950 border border-[#D6D0C7] dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#5A5A40]"
                    />
                  </div>

                  {/* Topic Select */}
                  <div>
                    <select
                      id="filter-topic-select"
                      value={selectedTopic}
                      onChange={(e) => setSelectedTopic(e.target.value)}
                      className="block w-full py-2 px-3 border border-[#D6D0C7] dark:border-slate-800 bg-[#FDFBF9] dark:bg-slate-950 text-xs rounded-xl text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-[#5A5A40]"
                    >
                      {availableTopics.map((topic) => (
                        <option key={topic} value={topic}>{topic}</option>
                      ))}
                    </select>
                  </div>

                  {/* Difficulty Select */}
                  <div>
                    <select
                      id="filter-difficulty-select"
                      value={selectedDifficulty}
                      onChange={(e) => setSelectedDifficulty(e.target.value)}
                      className="block w-full py-2 px-3 border border-[#D6D0C7] dark:border-slate-800 bg-[#FDFBF9] dark:bg-slate-950 text-xs rounded-xl text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-[#5A5A40]"
                    >
                      <option value="모든 난이도">모든 난이도</option>
                      <option value="상">상 (심화)</option>
                      <option value="중">중 (응용)</option>
                      <option value="하">하 (기본)</option>
                    </select>
                  </div>
                </div>

                {/* Filter Clear Helpers */}
                {(searchTerm || selectedTopic !== '모든 대단원' || selectedDifficulty !== '모든 난이도') && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#D6D0C7]/40 text-xs">
                    <span className="text-slate-500">
                      필터링 검색 결과: <strong>{filteredProblems.length}</strong>개 문제 표시 중
                    </span>
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setSelectedTopic('모든 대단원');
                        setSelectedDifficulty('모든 난이도');
                      }}
                      className="text-[#5A5A40] underline font-medium cursor-pointer"
                    >
                      필터 초기화
                    </button>
                  </div>
                )}
              </div>

              {/* Student-Friendly Math Diagnosis Cards Container */}
              <div className="flex flex-col gap-4" id="analysis-cards-container">
                <div className="p-5 bg-[#FDFBF9] dark:bg-slate-950 border border-[#D6D0C7]/80 dark:border-slate-800 rounded-3xl flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                  <div>
                    <h3 className="text-base font-bold serif-font italic text-[#5A5A40] flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-[#5A5A40]" />
                      심층 수학 진단 카드 대시보드
                    </h3>
                    <p className="text-[11px] text-[#9A948C] font-medium mt-0.5">평가 문항의 카드 썸네일을 선택하거나 돋보기(🔍) 아이콘을 눌러 원본을 확대할 수 있습니다.</p>
                  </div>
                  <span className="text-xs shrink-0 self-start sm:self-auto bg-[#5A5A40]/5 dark:bg-slate-800 text-[#5A5A40] dark:text-slate-300 font-bold px-3 py-1 rounded-full border border-[#5A5A40]/10">
                    전체 {filteredProblems.length}개 유형 표시 중
                  </span>
                </div>

                {filteredProblems.length === 0 ? (
                  <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center text-slate-400 border border-[#D6D0C7] dark:border-slate-800">
                    <HelpCircle className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-medium">검색 결과 및 조건과 일치하는 수학 문항이 존재하지 않습니다.</p>
                    <p className="text-xs mt-1">상단의 검색 키워드를 조합해 보시거나 다른 필터 상태를 변경해 보세요.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="math-problem-cards-grid">
                    {filteredProblems.map((prob) => {
                      const isSelected = selectedProblem?.id === prob.id;
                      const thumbUrl = prob.imageUrl || getMathPlaceholderSvg(prob.id, prob.topic);
                      
                      return (
                        <div
                          key={prob.id}
                          onClick={() => {
                            setSelectedProblem(prob);
                            setMobileViewTab('detail');
                            setTimeout(() => {
                              const viewport = document.getElementById('selected-problem-viewport');
                              if (viewport) {
                                viewport.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            }, 50);
                          }}
                          className={`group relative bg-white dark:bg-slate-900 border transition-all duration-300 rounded-2xl overflow-hidden cursor-pointer flex flex-col ${
                            isSelected 
                              ? 'ring-2 ring-[#5A5A40] dark:ring-emerald-400 border-transparent shadow-md transform -translate-y-0.5' 
                              : 'border-[#D6D0C7] dark:border-slate-800 hover:border-[#5A5A40] hover:shadow-sm'
                          }`}
                          id={`problem-card-${prob.id}`}
                        >
                          {/* Duplicate Badge */}
                          {prob.isDuplicate && (
                            <div className="bg-amber-500/10 dark:bg-amber-950/15 border-b border-amber-500/20 px-4 py-1.5 flex items-center gap-1.5 text-[10px] text-amber-700 dark:text-amber-400 font-semibold shrink-0" id={`duplicate-badge-${prob.id}`}>
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>기존 문항과 유사합니다. (중복 가능성 있음)</span>
                            </div>
                          )}

                          {/* Card Header Info Bar */}
                          <div className="px-4 py-2 bg-[#FDFBF9] dark:bg-slate-950 border-b border-[#D6D0C7]/40 dark:border-slate-800/60 flex items-center justify-between">
                            <span className="text-xs font-mono font-extrabold text-[#5A5A40] dark:text-emerald-400" id={`card-id-label-${prob.id}`}>
                              문항 #{prob.problemNumber || prob.id}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                prob.difficulty === '상'
                                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30'
                                  : prob.difficulty === '중'
                                  ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30'
                                  : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30'
                              }`}>
                                난이도: {prob.difficulty}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletePending(prob);
                                }}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-md transition duration-150 cursor-pointer"
                                title="문제 제거"
                                id={`delete-prob-btn-${prob.id}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Card Body with Thumbnail and Question Formula text */}
                          <div className="p-4 flex gap-3.5 flex-1 items-start">
                            {/* Interactive Thumbnail Box */}
                            <div 
                              className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 bg-stone-50 rounded-xl overflow-hidden border border-[#D6D0C7]/50 dark:border-slate-800 shadow-inner group-hover:border-[#5A5A40]/40"
                              onClick={(e) => {
                                e.stopPropagation(); // Avoid selecting problem when just enlarging thumbnail
                                setSelectedProblem(prob);
                                setLightboxImg(thumbUrl);
                                setLightboxTitle(`[문항 #${String(prob.problemNumber || prob.id).padStart(3, '0')}] ${prob.concept}`);
                              }}
                            >
                              <img
                                src={thumbUrl}
                                alt={`문제 썸네일 #${prob.id}`}
                                className="w-full h-full object-contain group-hover:scale-105 transition duration-300"
                                referrerPolicy="no-referrer"
                              />
                              {/* Magnifying Glass Indicator on Hover */}
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition duration-200">
                                <ZoomIn className="w-4 h-4 text-white" />
                              </div>
                            </div>

                            {/* Question Info */}
                            <div className="flex-1 min-w-0">
                              <span className="block text-[11px] font-bold text-amber-600 dark:text-amber-450 truncate mb-1" title={prob.firstLine}>
                                대표: {prob.firstLine || "수학 문제 분석 요약"}
                              </span>
                              <span className="block text-[9px] uppercase font-bold text-[#5A5A40] dark:text-emerald-400 truncate mb-1">
                                [대단원] {prob.topic}
                              </span>
                              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-3 leading-relaxed">
                                <MathFormula text={prob.questionText} />
                              </div>
                            </div>
                          </div>

                          {/* Card Footer tags and summary info */}
                          <div className="px-4 py-3 bg-stone-50/50 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-850 mt-auto space-y-2">
                            {/* Prominent Concept Label */}
                            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-450 flex items-center gap-1">
                              <Bookmark className="w-3.5 h-3.5 text-[#5A5A40]/80 dark:text-emerald-500" />
                              <span>개념: <strong className="text-slate-700 dark:text-slate-300">{prob.concept}</strong></span>
                            </div>

                            {/* One line summary list */}
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 italic bg-[#FBF9F6] dark:bg-slate-800/20 border border-[#EAE6DF] dark:border-slate-800/50 rounded-lg p-2 flex items-start gap-1 leading-snug">
                              <Sparkles className="w-3 h-3 text-[#5A5A40]/80 dark:text-emerald-450 shrink-0 mt-0.5" />
                              <span>{prob.summary}</span>
                            </div>

                            <div className="flex flex-wrap gap-1 pt-1">
                              {prob.keywords.map((kw, idx) => (
                                <span
                                  key={`${prob.id}-${kw}-${idx}`}
                                  className="px-1.5 py-0.5 bg-[#F1EDE8] dark:bg-slate-800 text-[#5A5A40] dark:text-slate-350 rounded text-[9px] font-medium border border-transparent hover:border-[#D6D0C7] dark:hover:border-slate-700"
                                >
                                  #{kw}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Part: Selection Detail & Similarity Recommendation list (Cols span 4) */}
            <div className={`lg:col-span-4 flex flex-col gap-4 ${mobileViewTab === 'detail' ? 'flex' : 'hidden lg:flex'}`} id="selected-problem-viewport">
              
              {/* Card 1: Selected Math Problem Details */}
              {selectedProblem && (
                <div className="bg-[#5A5A40] text-stone-50 p-6 rounded-3xl card-shadow border border-[#4A4A35]" id="selection-card">
                  {/* Mobile Back navigation button */}
                  <div className="lg:hidden flex items-center justify-between mb-4 pb-3 border-b border-white/10" id="selection-card-mobile-back">
                    <button
                      type="button"
                      onClick={() => setMobileViewTab('list')}
                      className="inline-flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white font-extrabold rounded-lg px-2.5 py-1 text-[10.5px] border border-white/5 transition-all cursor-pointer shadow-inner"
                    >
                      ← 문항 목록·조건 검색으로
                    </button>
                    <span className="text-[10px] font-black text-amber-250">
                      #{selectedProblem.problemNumber || selectedProblem.id} 상세 보기
                    </span>
                  </div>

                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#F8F5F2]/70 flex items-center gap-1">
                      <Bookmark className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                      선택 문제 정형 정보
                    </span>
                    <span className="text-xs font-mono font-medium text-[#F8F5F2]/80">
                      문제 번호 #{selectedProblem.problemNumber || selectedProblem.id}
                    </span>
                  </div>

                  {/* High Quality Mathematical Visual Container */}
                  <div className="mb-4 bg-white/10 border border-white/10 rounded-2xl p-3 relative group">
                    <div className="text-[10px] text-amber-300 font-bold uppercase tracking-widest mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Maximize2 className="w-3 h-3 text-amber-350" />
                        수학 도식 및 문제 비주얼
                      </span>
                      {selectedProblem.imageUrl ? (
                        <span className="text-[8px] bg-emerald-500/30 text-emerald-200 px-1 rounded font-bold">
                          분석 이미지 원본
                        </span>
                      ) : (
                        <span className="text-[8px] bg-amber-500/30 text-amber-200 px-1 rounded font-bold">
                          단원별 기하 시각화
                        </span>
                      )}
                    </div>
                    
                    <div 
                      className="relative h-72 w-full bg-[#4E4E3B] rounded-xl overflow-hidden flex items-center justify-center cursor-zoom-in border border-white/10 hover:border-amber-300/60 transition-all duration-300"
                      onClick={() => {
                        const viewUrl = selectedProblem.imageUrl || getMathPlaceholderSvg(selectedProblem.id, selectedProblem.topic);
                        setLightboxImg(viewUrl);
                        setLightboxTitle(`[확대 보기 문항 #${selectedProblem.problemNumber || selectedProblem.id}] ${selectedProblem.concept}`);
                      }}
                    >
                      <div className="relative inline-block max-h-full max-w-full" id="selected-problem-viewport">
                        <img 
                          src={selectedProblem.imageUrl || getMathPlaceholderSvg(selectedProblem.id, selectedProblem.topic)}
                          alt="선택 수학 문제 원본 및 플레이스홀더" 
                          className="block max-h-64 max-w-full object-contain group-hover:scale-[1.02] transition duration-300"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="absolute bottom-1.5 right-1.5 bg-black/65 text-white rounded-md px-2 py-0.5 flex items-center gap-1.5 transition text-[9px] font-bold border border-white/10 shadow-md">
                        <ZoomIn className="w-3.5 h-3.5 text-amber-300" />
                        확대 보기
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#4A4A35] rounded-2xl p-4 mb-4 border border-white/5 shadow-inner">
                    <p className="text-sm leading-relaxed serif-font italic font-medium select-all">
                      <MathFormula text={selectedProblem.questionText} />
                    </p>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-white/20 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-[#F8F5F2]/70 text-[11px] font-medium">대표 문항 명칭</span>
                      <span className="font-semibold text-amber-250 truncate max-w-[180px]">{selectedProblem.firstLine || "N/A"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#F8F5F2]/70 text-[11px] font-medium">교과 대단원</span>
                      <span className="font-semibold text-amber-300">{selectedProblem.topic}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#F8F5F2]/70 text-[11px] font-medium">핵심 역량 개념</span>
                      <span className="font-semibold">{selectedProblem.concept}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#F8F5F2]/70 text-[11px] font-medium">종합 난이도</span>
                      <span className="font-bold inline-block px-1.5 py-0.5 bg-white/10 rounded">{selectedProblem.difficulty}</span>
                    </div>
                    <div className="pt-2 border-t border-white/10">
                      <span className="text-[#F8F5F2]/60 text-[10px] uppercase font-bold tracking-wider block mb-1">AI 정밀 요약</span>
                      <p className="text-[11px] leading-relaxed text-stone-200">
                        {selectedProblem.summary}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Card 2: TOP 3 Similarity Recommendation List */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-[#D6D0C7] dark:border-slate-800 card-shadow flex-col flex" id="recommendations-container">
                <div className="flex items-center gap-2 mb-4">
                  <Flame className="w-5 h-5 text-amber-600" />
                  <div>
                    <h3 className="text-sm font-bold text-[#5A5A40]">유사 문항 추천 (Top 3)</h3>
                    <p className="text-[10px] text-slate-400">지정 공식과 단원, 키워드 일치율 가중치 정밀 연산</p>
                  </div>
                </div>

                {/* Score Policy Info Accordion/Indicator */}
                <div className="bg-[#F8F5F2] dark:bg-slate-800/40 border border-[#D6D0C7]/60 p-3 rounded-2xl mb-4 text-[10px] text-[#5A5A40] dark:text-slate-300 leading-normal gap-2 flex items-start">
                  <Info className="w-4 h-4 text-[#5A5A40] shrink-0 mt-0.5" />
                  <div>
                    <strong className="block mb-0.5 text-[#5A5A40] text-[11px]">유사도 점수 산출 표준안(100점 만점):</strong>
                    동일 개념 +50 · 동일 대단원 +30 · 동일 난이도 +10 • 공통 키워드개수당 +5 (각 유형별 쌍둥이 문제 계산 방식 자동 적용)
                  </div>
                </div>

                <div className="space-y-4 max-h-[460px] overflow-y-auto scrollbar-hide pr-1">
                  {recommendedSimilar.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 bg-[#FDFBF9] dark:bg-slate-950/20 rounded-2xl border border-dashed border-slate-200">
                      <HelpCircle className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="text-xs font-semibold">비교할 다른 문제가 충분치 않습니다.</p>
                      <p className="text-[10px] inline-block mt-1">유사 문제 추천을 경험하시려면 최소 2개 이상의 문항이 분석에 등록되어야 합니다.</p>
                    </div>
                  ) : (
                    recommendedSimilar.map((rec) => {
                      const prob = rec.problem;
                      const recThumbUrl = prob.imageUrl || getMathPlaceholderSvg(prob.id, prob.topic);
                      return (
                        <div
                          key={rec.problem.id}
                          className="p-4 bg-[#FDFBF9] dark:bg-slate-950 rounded-2xl border border-[#D6D0C7] dark:border-slate-800 hover:border-[#5A5A40] transition-all duration-200 cursor-pointer shadow-xs hover:shadow-sm"
                          onClick={() => {
                            setSelectedProblem(prob);
                            setMobileViewTab('detail');
                            setTimeout(() => {
                              const viewport = document.getElementById('selected-problem-viewport');
                              if (viewport) {
                                viewport.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            }, 50);
                          }}
                          id={`recommendation-${prob.id}`}
                        >
                          <div className="flex justify-between items-start mb-2.5">
                            <span className="text-[10px] font-bold text-white bg-[#5A5A40] px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                              매칭 점수: {rec.score}점
                            </span>
                            <span className="text-[10px] font-mono text-[#9A948C]">
                              ID #{String(prob.id).padStart(3, '0')}
                            </span>
                          </div>

                          {/* Side-by-side math card with interactive thumbnail */}
                          <div className="flex gap-3 mb-2.5">
                            {/* Recommend Mini Thumbnail */}
                            <div 
                              className="group/thumb relative w-12 h-12 sm:w-14 sm:h-14 shrink-0 bg-stone-50 rounded-xl overflow-hidden border border-[#D6D0C7]/40 dark:border-slate-800 shadow-inner"
                              onClick={(e) => {
                                e.stopPropagation(); // Only trigger lightbox, do not swap selectedProblem yet
                                setLightboxImg(recThumbUrl);
                                setLightboxTitle(`[유사 추천 ID #${String(prob.id).padStart(3, '0')}] ${prob.concept}`);
                              }}
                            >
                              <img 
                                src={recThumbUrl} 
                                alt={`추천 문항 #${prob.id}`} 
                                className="w-full h-full object-cover group-hover/thumb:scale-105 transition duration-200"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition duration-155">
                                <ZoomIn className="w-3.5 h-3.5 text-white" />
                              </div>
                            </div>

                            {/* Question preview */}
                            <div className="bg-white dark:bg-slate-900 border border-[#D6D0C7]/40 dark:border-slate-800/80 rounded-xl p-2.5 flex-1 min-w-0">
                              <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-200 line-clamp-3">
                                <MathFormula text={prob.questionText} />
                              </p>
                            </div>
                          </div>

                          <div className="text-[10px] text-[#5A5A40] dark:text-slate-300 space-y-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-850">
                            {/* Detailed breakdown per user requirements */}
                            <div className="bg-[#F6F4F0] dark:bg-slate-900 p-2.5 rounded-xl border border-[#D6D0C7]/40 dark:border-slate-800 text-[10.5px] space-y-1 text-slate-700 dark:text-slate-300">
                              <span className="font-bold text-[#5A5A40] dark:text-slate-200 block mb-1">추천 이유</span>
                              <div className="space-y-0.5">
                                <p className="flex items-center gap-1">
                                  {rec.breakdown.conceptMatch ? (
                                    <span className="text-emerald-600 font-bold font-mono">✓</span>
                                  ) : (
                                    <span className="text-rose-500 font-bold font-mono">✕</span>
                                  )}
                                  <span>핵심 개념이 {rec.breakdown.conceptMatch ? '동일합니다.' : '다릅니다.'}</span>
                                </p>
                                <p className="flex items-center gap-1">
                                  {rec.breakdown.topicMatch ? (
                                    <span className="text-emerald-600 font-bold font-mono">✓</span>
                                  ) : (
                                    <span className="text-rose-500 font-bold font-mono">✕</span>
                                  )}
                                  <span>단원이 {rec.breakdown.topicMatch ? '동일합니다.' : '다릅니다.'}</span>
                                </p>
                                <p className="flex items-center gap-1">
                                  {rec.breakdown.difficultyMatch ? (
                                    <span className="text-emerald-600 font-bold font-mono">✓</span>
                                  ) : (
                                    <span className="text-rose-500 font-bold font-mono">✕</span>
                                  )}
                                  <span>난이도가 {rec.breakdown.difficultyMatch ? '유사합니다.' : '다릅니다.'}</span>
                                </p>
                                <p className="flex items-center gap-1">
                                  {rec.breakdown.matchedKeywords.length > 0 ? (
                                    <span className="text-emerald-600 font-bold font-mono">✓</span>
                                  ) : (
                                    <span className="text-rose-500 font-bold font-mono">✕</span>
                                  )}
                                  <span>
                                    핵심 키워드 {rec.breakdown.matchedKeywords.length || 0}개가 일치합니다.
                                    {rec.breakdown.matchedKeywords.length > 0 && ` (${rec.breakdown.matchedKeywords.slice(0, 3).join(', ')})`}
                                  </span>
                                </p>
                              </div>
                            </div>
                            <p className="leading-relaxed bg-amber-500/5 p-2 rounded-lg border border-amber-500/10 text-amber-900 dark:text-[#E9D5C3] text-[10px]">
                              <span className="font-bold">✨ 특징:</span> {' '}
                              {rec.reason}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>

          </div>
        ) : (
          /* Empty state guidelines when no problems initialized */
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 border border-[#D6D0C7] dark:border-slate-800 text-center max-w-2xl mx-auto my-6 card-shadow" id="init-guide">
            <Sparkles className="w-12 h-12 text-[#5A5A40] mx-auto mb-4 animate-bounce" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 serif-font italic">시작할 데이터가 준비되지 않았습니다</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-2 leading-relaxed">
              위의 입력란에 수학 문항을 붙여넣고 AI 분석하기를 실행하시거나, <strong className="text-slate-700 dark:text-slate-300">'예시 문제 즉시 가져오기'</strong> 버튼을 클릭하여 시뮬레이션용 데이터 12종을 즉시 바인딩하여 앱을 자유롭게 실험해보세요!
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={handleLoadSamples}
                className="px-6 py-2 bg-[#5A5A40] hover:bg-[#4A4A35] text-white text-xs font-semibold rounded-xl shadow-sm hover:shadow transition duration-150 cursor-pointer"
                id="init-load-samples-btn"
              >
                예시 문항으로 먼저 시작해보기
              </button>
            </div>
          </div>
        )}

      </main>

      {/* Aesthetic Footer */}
      <footer className="mt-16 border-t border-[#D6D0C7] dark:border-slate-800 bg-[#F8F5F2] pt-8" id="app-footer">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-400 gap-4">
          <p>© 2026 AI Math Analysis Lab. All rights in-memory client-side calculated.</p>
          <div className="flex gap-4">
            <span className="hover:text-slate-600 transition">개인정보 처리방침</span>
            <span>•</span>
            <span className="hover:text-slate-600 transition">이용 약관</span>
            <span>•</span>
            <span className="hover:text-slate-600 transition">고교 수학 가이드라인</span>
          </div>
        </div>
      </footer>

      {/* 1) Deletion Confirmation Custom Modal */}
      {deletePending && (
        <div 
          className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          id="delete-confirm-backdrop"
          onClick={() => setDeletePending(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 border border-[#D6D0C7] dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl relative text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600 shrink-0">
                <X className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 serif-font">수학 문항 삭제 확인</h4>
                <p className="text-xs text-slate-500 dark:text-[#9A948C] mt-1 leading-relaxed">
                  선택하신 수학 분석 문항을 영구히 삭제하시겠습니까? 삭제 즉시 쌍둥이 유사 문제 목록 분석과 전체 등록 문항이 자동으로 다시 정형 연산되어 갱신됩니다.
                </p>
              </div>
            </div>

            <div className="bg-stone-50 dark:bg-slate-950 p-3.5 rounded-2xl border border-slate-150 dark:border-slate-800 text-xs mb-5 font-medium">
              <span className="block text-[10px] text-slate-400 font-mono mb-1">삭제 대상 ID #{String(deletePending.id).padStart(3, '0')}</span>
              <p className="text-slate-805 dark:text-slate-205 line-clamp-2"><MathFormula text={deletePending.questionText} /></p>
              <span className="inline-block mt-2 text-[10px] bg-amber-50 dark:bg-slate-800 text-amber-800 dark:text-amber-350 px-1.5 py-0.5 rounded">
                {deletePending.topic} • {deletePending.concept}
              </span>
            </div>

            <div className="flex gap-2.5 justify-end">
              <button
                type="button"
                onClick={() => setDeletePending(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-650 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                삭제 취소
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition cursor-pointer"
                id="delete-confirm-final"
              >
                삭제 확정
              </button>
            </div>
          </div>
        </div>
      )}

      {/* High Quality Centered Lightbox Image Viewer Modal */}
      {lightboxImg && (
        <div 
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in transition duration-300"
          id="lightbox-backdrop"
          onClick={() => setLightboxImg(null)}
        >
          {/* Top Control Bar */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-center select-none">
            <span className="text-white/60 text-xs font-semibold uppercase tracking-wider bg-white/5 border border-white/10 px-3 py-1.5 rounded-full backdrop-blur-xs">
              {lightboxTitle}
            </span>
            <button
              onClick={() => setLightboxImg(null)}
              className="px-4 py-2 bg-white/10 hover:bg-white/25 text-white/90 hover:text-white rounded-full text-xs font-bold tracking-wide uppercase transition border border-white/10 shrink-0 cursor-pointer"
              id="lightbox-close-btn"
            >
              닫기 (ESC)
            </button>
          </div>

          {/* Large Image Box */}
          <div 
            className="relative max-w-4xl max-h-[75vh] flex items-center justify-center bg-[#1F1F1C] rounded-2xl border border-white/10 shadow-2xl p-4 sm:p-6 overflow-hidden mt-8"
            onClick={(e) => e.stopPropagation()} // Prevent closing modal when clicking on the image card
          >
            <div className="relative inline-block max-h-[70vh] max-w-full">
              <img 
                src={lightboxImg} 
                alt="수학 문제 고해상도 크게보기 원본" 
                className="block max-h-[70vh] max-w-full object-contain rounded-lg shadow-inner select-text"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>

          {/* Bottom Guideline HUD */}
          <p className="text-[#9A948C] text-center font-medium mt-6 text-xs bg-stone-900/60 border border-stone-800/80 px-4 py-2 rounded-full backdrop-blur-xs shadow-md select-none">
            💡 <strong className="text-stone-300">원본 스크린 비율 보존용</strong> · 외부 영역을 클릭하면 축소됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
