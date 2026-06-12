/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { MathProblem } from '../types';
import { 
  Image as ImageIcon, 
  Upload, 
  Sparkles, 
  AlertCircle, 
  RefreshCw, 
  Clipboard, 
  Trash2, 
  CheckCircle, 
  CheckCircle2, 
  X, 
  AlertTriangle, 
  Play, 
  FolderMinus,
  HelpCircle
} from 'lucide-react';
import { getHash, getCachedAnalysis, setCachedAnalysis } from '../utils';

interface ProblemInputFormProps {
  onAnalyze: (text: string) => Promise<void>;
  onAnalyzeImage: (base64Data: string, mimeType: string, fileName?: string, fileSize?: number) => Promise<{ problemsCount: number; newCount: number; duplicateCount: number } | null>;
  onAddProblemsDirectly: (rawProblems: MathProblem[], type: 'image' | 'text', uploadedUrl?: string, fileName?: string, fileSize?: number) => Promise<{ problemsCount: number; newCount: number; duplicateCount: number } | null>;
  onLoadSamples: () => void;
  onClearAll: () => void;
  onClearSamplesOnly?: () => void;
  isAnalyzing: boolean;
  isAnalyzingImage: boolean;
  errorMsg: string | null;
  hasProblems: boolean;
  existingProblems: MathProblem[];
  setImportNotice: React.Dispatch<React.SetStateAction<{
    totalCount: number;
    newCount: number;
    dupCount: number;
    failedCount: number;
    type: 'image' | 'text' | 'multi';
  } | null>>;
}

interface QueuedImage {
  id: string;
  name: string;
  size: number;
  previewUrl: string;
  base64: string;
  mimeType: string;
  status: 'pending' | 'analyzing' | 'completed' | 'failed' | 'retrying';
  error?: string;
  isCached?: boolean;
}

export const ProblemInputForm: React.FC<ProblemInputFormProps> = ({
  onAnalyze,
  onAnalyzeImage,
  onAddProblemsDirectly,
  onLoadSamples,
  onClearAll,
  onClearSamplesOnly,
  isAnalyzing,
  isAnalyzingImage,
  errorMsg,
  hasProblems,
  existingProblems,
  setImportNotice,
}) => {
  const [text, setText] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [queue, setQueue] = useState<QueuedImage[]>([]);
  const [internalIsAnalyzing, setInternalIsAnalyzing] = useState<boolean>(false);
  const [activeQueueIndex, setActiveQueueIndex] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const expectedStats = React.useMemo(() => {
    let cachedCount = 0;
    let newCount = 0;
    queue.forEach(item => {
      const itemHash = getHash(item.base64);
      const isCached = !!getCachedAnalysis(itemHash);
      if (isCached || item.isCached || item.status === 'completed') {
        cachedCount++;
      } else {
        newCount++;
      }
    });
    return { cachedCount, newCount };
  }, [queue]);

  // Parse files and push them into queue
  const processFiles = (filesList: FileList) => {
    Array.from(filesList).forEach(file => {
      // Validate JPG and PNG
      if (!file.type.startsWith('image/')) {
        setUploadStatus('오류: 이미지 형식(PNG, JPG, JPEG) 파일만 업로드할 수 있습니다.');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const resultStr = reader.result as string;
        const parts = resultStr.split(';base64,');
        if (parts.length === 2) {
          const mime = parts[0].split(':')[1] || file.type;
          const b64 = parts[1];

          setQueue(prev => {
            // Avoid adding duplicate identical files
            if (prev.some(item => item.name === file.name && item.size === file.size)) {
              return prev;
            }
            return [...prev, {
              id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
              name: file.name,
              size: file.size,
              previewUrl: resultStr,
              base64: b64,
              mimeType: mime,
              status: 'pending' as const
            }];
          });
          setUploadStatus('');
        } else {
          setUploadStatus('오류: 일부 이미지 파일을 디코딩하지 못했습니다.');
        }
      };
      reader.onerror = () => {
        setUploadStatus('오류: 파일을 읽는 도중 이상이 발생했습니다.');
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const analyzeSingleQueueItem = async (
    i: number, 
    currentQueue: QueuedImage[]
  ): Promise<{ problemsCount: number; newCount: number; duplicateCount: number } | null> => {
    const item = currentQueue[i];
    const itemHash = getHash(item.base64);
    const cached = getCachedAnalysis(itemHash);
    
    if (cached) {
      // Mark as analyzing for a very short duration for nice UX transition
      setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'analyzing' as const, error: undefined } : q));
      await sleep(400);
      
      const uploadedUrl = item.previewUrl;
      const stats = await onAddProblemsDirectly(cached, 'image', uploadedUrl, item.name, item.size);
      
      setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'completed' as const, isCached: true, error: undefined } : q));
      return stats;
    } else {
      let success = false;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (!success && attempts < maxAttempts) {
        try {
          setQueue(prev => prev.map((q, idx) => idx === i ? { 
            ...q, 
            status: attempts > 0 ? 'retrying' as any : 'analyzing' as const,
            error: attempts > 0 ? `AI 서버 사용량이 많아 재시도 중입니다. (잠시만 기다려주세요, ${attempts}/3차)` : undefined
          } : q));
          
          const stats = await onAnalyzeImage(item.base64, item.mimeType, item.name, item.size);
          
          setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'completed' as const, error: undefined } : q));
          success = true;
          return stats;
        } catch (err: any) {
          attempts++;
          console.error(`Attempt ${attempts} failed for ${item.name}:`, err);
          
          const isQuota = err?.isQuota || err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED') || err?.message?.includes('호출 제한') || err?.message?.includes('용량 제한');
          const isUnavailable = err?.isUnavailable || err?.message?.includes('503') || err?.message?.includes('UNAVAILABLE') || err?.message?.includes('서버 사용량이 많아');
          
          if (attempts < maxAttempts) {
            if (isQuota) {
              const delaySec = err?.retryDelay || 60;
              for (let countdown = delaySec; countdown > 0; countdown--) {
                setQueue(prev => prev.map((q, idx) => idx === i ? { 
                  ...q, 
                  status: 'retrying' as any,
                  error: `무료 API 사용량 제한으로 인해 잠시 후 자동으로 다시 시도합니다. (남은 시간: ${countdown}초)` 
                } : q));
                await sleep(1000);
              }
            } else if (isUnavailable) {
              const delaySec = attempts === 1 ? 3 : attempts === 2 ? 6 : 12;
              for (let countdown = delaySec; countdown > 0; countdown--) {
                setQueue(prev => prev.map((q, idx) => idx === i ? { 
                  ...q, 
                  status: 'retrying' as any,
                  error: `현재 AI 서버 사용량이 많아 잠시 후 다시 시도합니다. (남은 시간: ${countdown}초, ${attempts}/3차)` 
                } : q));
                await sleep(1000);
              }
            } else {
              // General retry sleep fallback
              for (let countdown = 3; countdown > 0; countdown--) {
                setQueue(prev => prev.map((q, idx) => idx === i ? { 
                  ...q, 
                  status: 'retrying' as any,
                  error: `일시적 분석 지연으로 재시도 중... (남은 시간: ${countdown}초)` 
                } : q));
                await sleep(1000);
              }
            }
          } else {
            // Out of retries
            throw err;
          }
        }
      }
      return null;
    }
  };

  // Trigger sequential Vision queue processing
  const handleBatchAnalyze = async () => {
    if (queue.length === 0 || internalIsAnalyzing || isAnalyzingImage) return;
    setInternalIsAnalyzing(true);
    setUploadStatus('');
    setImportNotice(null);

    // Mark non-completed as pending
    const updatedQueueBefore = queue.map(item => 
      item.status === 'completed' ? item : { ...item, status: 'pending' as const, error: undefined }
    );
    setQueue(updatedQueueBefore);

    let totalProblems = 0;
    let totalNew = 0;
    let totalDup = 0;
    let totalFailed = 0;

    for (let i = 0; i < updatedQueueBefore.length; i++) {
      const item = updatedQueueBefore[i];
      if (item.status === 'completed') continue;

      try {
        setActiveQueueIndex(i);
        const stats = await analyzeSingleQueueItem(i, updatedQueueBefore);
        if (stats) {
          totalProblems += stats.problemsCount;
          totalNew += stats.newCount;
          totalDup += stats.duplicateCount;
        }
      } catch (err: any) {
        console.error(`Index ${i} image parse ultimately failed:`, err);
        const failMessage = err?.message || 'Gemini Vision 분석 실패';
        setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'failed' as const, error: failMessage } : q));
        totalFailed++;
      }
    }

    setInternalIsAnalyzing(false);
    setActiveQueueIndex(null);

    // Render multi-analysis results notice once completed
    setImportNotice({
      totalCount: totalProblems + totalFailed,
      newCount: totalNew,
      dupCount: totalDup,
      failedCount: totalFailed,
      type: 'multi'
    });
  };

  // Retry single failed queue item
  const handleRetrySingleItem = async (id: string) => {
    if (internalIsAnalyzing) return;
    
    const idx = queue.findIndex(q => q.id === id);
    if (idx === -1) return;
    
    setInternalIsAnalyzing(true);
    setUploadStatus('');
    
    try {
      setActiveQueueIndex(idx);
      setQueue(prev => prev.map((q, i) => i === idx ? { ...q, status: 'pending' as const, error: undefined } : q));
      
      const stats = await analyzeSingleQueueItem(idx, queue);
      if (stats) {
        setImportNotice({
          totalCount: stats.problemsCount,
          newCount: stats.newCount,
          dupCount: stats.duplicateCount,
          failedCount: 0,
          type: 'image'
        });
      }
    } catch (err: any) {
      console.error(`Retry for single item failed:`, err);
      const failMessage = err?.message || 'Gemini Vision 분석 실패';
      setQueue(prev => prev.map((q, i) => i === idx ? { ...q, status: 'failed' as const, error: failMessage } : q));
    } finally {
      setInternalIsAnalyzing(false);
      setActiveQueueIndex(null);
    }
  };

  // Remove a single image from the upload queue
  const handleRemoveQueueItem = (id: string) => {
    if (internalIsAnalyzing) return;
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  // Clear all queued images
  const handleClearQueue = () => {
    if (internalIsAnalyzing) return;
    setQueue([]);
    setUploadStatus('');
  };

  // Form helpers
  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isAnalyzing) return;
    onAnalyze(text);
  };

  // Formatting file sizing
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 1;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Calculation for progress tracking bars
  const completedCount = queue.filter(q => q.status === 'completed').length;
  const failedCount = queue.filter(q => q.status === 'failed').length;
  const processedCount = completedCount + failedCount;
  const totalCount = queue.length;
  const progressPercent = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;
  const isAnyFailed = failedCount > 0;

  return (
    <div className="bg-white dark:bg-slate-900 border border-[#D6D0C7] dark:border-slate-800 rounded-3xl shadow-md p-6 overflow-hidden" id="input-container">
      {/* Form Top Control Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-5 border-b border-[#D6D0C7]/40">
        <div>
          <h2 className="text-xl font-bold serif-font italic text-[#5A5A40] flex items-center gap-2" id="input-title">
            <Sparkles className="w-5 h-5 text-amber-600 animate-pulse" />
            AI 멀티 수학 문제 분석 터미널
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            수학 이미지 복수 동시 업로드(JPG, PNG) 및 개별 OCR 분석 기능을 제공하는 지능형 대시보드입니다.
          </p>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onLoadSamples}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition cursor-pointer shadow-xs"
            id="btn-load-samples"
            title="인프라/네트워크 장애 상황 대비 시연용 로컬 데이터 전송"
          >
            <Clipboard className="w-3.5 h-3.5" />
            샘플 데이터 불러오기
          </button>
          
          {hasProblems && existingProblems.some(p => p.isSample) && (
            <button
              type="button"
              onClick={onClearSamplesOnly}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-400 bg-amber-55/10 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-850 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-950/40 transition cursor-pointer"
              id="btn-clear-samples-only"
              title="등록된 샘플 문제만 목록에서 지우고, 사용자가 업로드한 개별 문항들은 보존합니다."
            >
              <Trash2 className="w-3.5 h-3.5" />
              샘플 데이터만 삭제
            </button>
          )}
          
          {hasProblems && (
            <button
              type="button"
              onClick={onClearAll}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-950/60 transition cursor-pointer"
              id="btn-clear-pool"
            >
              <Trash2 className="w-3.5 h-3.5" />
              대시보드 초기화
            </button>
          )}
        </div>
      </div>

      {/* Grid Layout containing Multi-Image upload queue & Text Input side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Side: Mock Exam Image Analysis (Vision Queue) */}
        <div className="flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#D6D0C7]/40 pb-6 lg:pb-0 lg:pr-8">
          <div>
            <div className="flex justify-between items-center mb-2.5">
              <label className="text-sm font-bold text-[#5A5A40] flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-indigo-600" />
                모의고사 수학 문제 이미지 (드래그/복수선택)
              </label>
              <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                Gemini Vision Queue
              </span>
            </div>
            
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              수학 이미지들(JPG, PNG)을 동시에 선택하거나 아래 영역에 놓으세요. 분석 시작 클릭 시 이미지를 안전하게 순차 분석하여 최댓값, 대단원 등을 판단합니다. (중복 배제)
            </p>

            {/* Drop Zone Box (Sleek Compact Version) */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-4 text-center transition ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/10'
                  : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-slate-50/40 dark:bg-slate-800/10 cursor-pointer'
              }`}
              id="drag-drop-zone-multi"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png, image/jpeg, image/jpg"
                multiple
                className="hidden"
              />
              <Upload className="w-6 h-6 text-indigo-500/80 mb-1 animate-bounce" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                수학 문제 이미지들 마우스 드롭 또는 클릭하여 추가
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5">
                JPG, PNG 개별 이미지 다중 바인딩 연계 가능
              </span>
            </div>

            {/* Upload message logs */}
            {uploadStatus && (
              <div className={`mt-3 p-2.5 rounded-xl text-xs leading-normal border ${
                uploadStatus.includes('오류')
                  ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-900/50'
                  : 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/50'
              }`}>
                {uploadStatus}
              </div>
            )}

            {/* Expected Call and Cache Report */}
            {queue.length > 0 && !internalIsAnalyzing && (
              <div className="mt-3 p-3 bg-indigo-50/20 dark:bg-slate-800/40 border border-indigo-100/60 dark:border-slate-800/80 rounded-xl text-xs space-y-1">
                <div className="flex justify-between items-center text-[#5A5A40] font-bold">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                    대기열 분석 예상 리포트 (API 안정성 최적화)
                  </span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                  대기열 {queue.length}개 항목 중 <strong>신규 분석 대상은 {expectedStats.newCount}개</strong>이며, <strong>기존 캐시 재사용은 {expectedStats.cachedCount}개</strong>입니다. (예상 Gemini API 실 호출 횟수: {expectedStats.newCount}회)
                </p>
              </div>
            )}

            {/* Styled Queue Queue List Container */}
            {queue.length > 0 && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-bold text-[#5A5A40] flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                    대기열 이미지 목록 ({queue.length}개 파일)
                  </span>
                  {!internalIsAnalyzing && (
                    <button
                      type="button"
                      onClick={handleClearQueue}
                      className="text-[10px] font-bold text-rose-600 flex items-center gap-1 hover:text-rose-800 transition"
                    >
                      <FolderMinus className="w-3 h-3" />
                      대기열 전체 비우기
                    </button>
                  )}
                </div>

                <div className="max-h-[260px] overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl p-2 bg-stone-50/50 dark:bg-slate-950/30 divide-y divide-slate-100 dark:divide-slate-800/60" id="image-queue-wrapper">
                  {queue.map((item, idx) => {
                    const isCompleted = item.status === 'completed';
                    const isFailed = item.status === 'failed';
                    const isCurrent = item.status === 'analyzing';
                    const isRetrying = item.status === 'retrying';

                    return (
                      <div 
                        key={item.id} 
                        className={`py-2 px-1.5 flex items-center justify-between gap-3 text-xs ${
                          isCurrent || isRetrying ? 'bg-indigo-50/40 dark:bg-slate-800/20 rounded-lg' : ''
                        }`}
                        id={`queue-item-${idx}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {/* Small 1:1 image thumbnail list preview */}
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 shrink-0 bg-stone-100">
                            <img 
                              src={item.previewUrl} 
                              alt="썸네일" 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate" title={item.name}>
                              {item.name}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                              <span>{formatBytes(item.size)}</span>
                              {isFailed && <span className="text-rose-500 font-semibold">● 최종 분석실패</span>}
                              {isCompleted && <span className="text-emerald-500 font-semibold">● 완료됨 {item.isCached ? '(기존 분석 결과 재사용)' : ''}</span>}
                              {isCurrent && <span className="text-indigo-600 font-bold animate-pulse">● 분석 진행 중...</span>}
                              {isRetrying && <span className="text-amber-500 font-semibold animate-pulse">● 임시 지연 및 재시도 대기 중</span>}
                            </p>
                            
                            {/* Detailed in-line message status when retrying or failed */}
                            {((isRetrying || isFailed) && item.error) && (
                              <p className={`text-[10px] p-2 rounded-lg border mt-1.5 leading-relaxed select-text font-medium ${
                                isFailed 
                                  ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 border-rose-100 dark:border-rose-900/40' 
                                  : 'bg-amber-50 dark:bg-amber-950/20 text-slate-700 dark:text-slate-200 border-amber-100 dark:border-slate-800/60 animate-pulse'
                              }`}>
                                {item.error}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Status badge with indicator or retry/delete option */}
                        <div className="shrink-0 flex items-center gap-2">
                          {isCurrent && (
                            <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" />
                          )}
                          {isRetrying && (
                            <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />
                          )}
                          {isCompleted && (
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                          )}
                          {isFailed && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleRetrySingleItem(item.id)}
                                disabled={internalIsAnalyzing}
                                className="px-2 py-1 bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700 text-white font-semibold text-[10px] rounded-lg transition-all flex items-center gap-1 disabled:opacity-50"
                                title="이 문제만 재시도"
                              >
                                <RefreshCw className="w-2.5 h-2.5 animate-spin-reverse" />
                                재시도
                              </button>
                            </div>
                          )}
                          {!isCurrent && !isRetrying && (
                            <button
                              type="button"
                              onClick={() => handleRemoveQueueItem(item.id)}
                              disabled={internalIsAnalyzing}
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-600 rounded transition disabled:opacity-30"
                              title="대기열에서 제거"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Nice progression summary dashboard with smooth percent loading */}
                {totalCount > 0 && (processedCount > 0 || internalIsAnalyzing) && (
                  <div className="mt-4 p-3.5 bg-indigo-50/30 dark:bg-indigo-950/10 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl text-xs">
                    
                    {activeQueueIndex !== null && queue[activeQueueIndex] && (
                      <div className="bg-indigo-600/5 dark:bg-indigo-500/5 border border-indigo-100/40 p-2.5 rounded-xl mb-3.5 flex items-center gap-1.5 text-[10px] text-slate-700 dark:text-slate-300 font-semibold shadow-inner">
                        <RefreshCw className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 animate-spin" />
                        <span>
                          현재 분석 중인 문제 이미지: <strong className="text-indigo-600 dark:text-indigo-400">{queue[activeQueueIndex].name}</strong> (대기열 #{activeQueueIndex + 1}/{totalCount})
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-[11px] font-bold text-[#5A5A40] mb-1.5">
                      <span>분석 진행율</span>
                      <span>{completedCount + failedCount} / {totalCount} 완료 ({progressPercent}%)</span>
                    </div>
                    {/* Progress track */}
                    <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
                      <div 
                        className="h-full bg-indigo-600 rounded-full transition-all duration-300" 
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>성공: {completedCount}건</span>
                      {failedCount > 0 && <span className="text-rose-600 font-semibold underline">실패 건너뜀: {failedCount}건</span>}
                    </div>

                    {isAnyFailed && (
                      <p className="text-[9.5px] text-stone-500 mt-2 leading-relaxed italic border-t border-indigo-100/40 pt-1.5 flex items-start gap-1">
                        <HelpCircle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                        분석이 실패한 이미지는 수식이 흐리거나 불필요한 테두리가 많은 경우일 수 있으니, 크롭하거나 밝기를 조정해 다시 시도하십시오.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-5 pt-1.5 flex gap-2 justify-end">
            <button
              type="button"
              onClick={handleBatchAnalyze}
              disabled={internalIsAnalyzing || queue.length === 0}
              className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-xs transition cursor-pointer ${
                internalIsAnalyzing || queue.length === 0
                  ? 'bg-indigo-450/80 opacity-60 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
              id="btn-image-submit"
            >
              {internalIsAnalyzing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  순차 분석 진행 중...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  분석 대기열 실행하기 ({queue.filter(q => q.status !== 'completed').length}개 분석)
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Side: Text math problem input (Gemini regular text API) */}
        <form onSubmit={handleTextSubmit} className="flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-2.5">
              <label htmlFor="problem-text-area" className="text-sm font-bold text-[#5A5A40] flex items-center gap-1.5PP">
                <Trash2 className="w-4 h-4 text-emerald-600 rotate-180" />
                수학 문제 원본 텍스트 직접 입력하기
              </label>
              <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                Gemini Text
              </span>
            </div>

            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              교과서나 문제의 지문을 그대로 복사하여 붙여넣으세요. 여러 문항이 섞여 있더라도 스스로 분할하여 고등학교 수학 단원을 정형화 분석해 드립니다.
            </p>

            <textarea
              id="problem-text-area"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="예시)
[문제 1] 이차함수 y = -x^2 + 6x + 5의 최댓값을 구하시오.

[문제 2] 등차수열 {a_n}에서 a_3 = 8, a_7 = 20일 때 제15항을 구하는 풀이과정을 서술하시오."
              className="w-full h-[190px] p-3 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-2xl text-xs placeholder-slate-400 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition shadow-inner resize-none text-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="mt-4 flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setText('')}
              disabled={isAnalyzing}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 border border-slate-300 rounded-xl hover:bg-slate-100 transition"
              id="btn-clear-text"
            >
              텍스트 비우기
            </button>
            <button
              type="submit"
              disabled={isAnalyzing || !text.trim()}
              className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-xs transition cursor-pointer ${
                isAnalyzing || !text.trim()
                  ? 'bg-[#5A5A40]/50 opacity-60 cursor-not-allowed'
                  : 'bg-[#5A5A40] hover:bg-[#4A4A35]'
              }`}
              id="btn-submit-analyze"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Gemini 메인 분석 중...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  AI 수학 분석 시작하기
                </>
              )}
            </button>
          </div>
        </form>

      </div>

      {errorMsg && (
        (() => {
          const isQuota = errorMsg.includes('429') || errorMsg.includes('호출 제한') || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('할당량');
          return (
            <div 
              className={`mt-6 p-4.5 rounded-2xl flex items-start gap-3.5 border text-left ${
                isQuota 
                  ? 'bg-amber-50/70 dark:bg-amber-950/15 border-amber-300 dark:border-amber-900/50' 
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50'
              }`} 
              id="error-message"
            >
              {isQuota ? (
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 animate-pulse" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <h5 className={`text-xs font-bold uppercase tracking-wider ${
                  isQuota ? 'text-amber-800 dark:text-amber-450' : 'text-rose-800 dark:text-rose-400'
                }`}>
                  {isQuota ? '⚠️ API 일일 무료 이용량 한도 초과' : 'AI 분석 처리 오류'}
                </h5>
                <p className="text-xs mt-1.5 leading-relaxed text-slate-700 dark:text-slate-350 font-medium">
                  {errorMsg}
                </p>
                {isQuota && (
                  <div className="mt-3 text-[11px] leading-relaxed text-amber-850 dark:text-amber-250 bg-amber-100/40 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200/40 space-y-1">
                    <p className="font-bold">💡 조치 팁 & 원인 규명:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong>20회 일일 한도</strong>: 구글 Gemini 3.5 Flash 무료 요금제는 프로젝트당 <strong>하루 최대 20회 요청</strong>만 처리하도록 엄격히 통제됩니다.</li>
                      <li><strong>해결 방법</strong>: API 쿼터는 24시간 뒤 순차 재충전됩니다. 계속 개발하시려면 설정 메뉴에서 별도 API Key를 연동해 보시기 바랍니다.</li>
                      <li><strong>대안 테스트</strong>: 상단에 있는 <strong>[예시 문제 12종 즉시 추가]</strong> 버튼을 누르시면, API 호출 한도 소모 없이 이미 빌트인된 수학 패키지 데이터로 단원 필터링 및 쌍둥이 유사도 계산 기능을 즉시 테스트하실 수 있습니다!</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
};
