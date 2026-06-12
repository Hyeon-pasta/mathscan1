/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type DifficultyType = '상' | '중' | '하';

export interface MathProblem {
  id: number;
  questionText: string;
  topic: string;
  concept: string;
  difficulty: DifficultyType;
  keywords: string[];
  summary: string;
  imageUrl?: string; // Optional image URL or base64 representation of the problem image
  fileName?: string;  // For duplication detection
  fileSize?: number;  // For duplication detection
  isDuplicate?: boolean; // Signal potential duplicates
  isSample?: boolean; // Track if this is loaded from sample data
  problemNumber?: number;
  firstLine?: string;
}

export interface SimilarityResult {
  problem: MathProblem;
  score: number;
  breakdown: {
    conceptMatch: boolean; // +50
    topicMatch: boolean;   // +30
    difficultyMatch: boolean; // +10
    matchedKeywords: string[];  // +5 each
  };
  reason: string;
}

export interface AnalyzeRequest {
  text: string;
}

export interface AnalyzeResponse {
  problems: MathProblem[];
}
