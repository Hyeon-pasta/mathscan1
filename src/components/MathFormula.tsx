/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface MathFormulaProps {
  text: string;
}

export const MathFormula: React.FC<MathFormulaProps> = ({ text }) => {
  if (!text) return null;

  // Split text by '$' symbol to identify inline math equations
  const parts = text.split('$');

  return (
    <span className="leading-relaxed">
      {parts.map((part, index) => {
        const isMath = index % 2 === 1;

        if (isMath) {
          // A few common LaTeX symbol improvements for crisp browser rendering
          let formattedMath = part
            .replace(/\\cap/g, ' ∩ ')
            .replace(/\\cup/g, ' ∪ ')
            .replace(/\\in/g, ' ∈ ')
            .replace(/\\subset/g, ' ⊂ ')
            .replace(/\\{/g, '{')
            .replace(/\\}/g, '}')
            .replace(/\\empty/g, ' ∅ ')
            .replace(/\\alpha/g, 'α')
            .replace(/\\beta/g, 'β')
            .replace(/\\pi/g, 'π')
            .replace(/\\cdot/g, ' · ')
            .replace(/\\iff/g, ' ⟺ ')
            .replace(/x\^2/g, 'x²')
            .replace(/n\^2/g, 'n²')
            .replace(/2\^\{2x\}/g, '2²ˣ')
            .replace(/2\^x/g, '2ˣ')
            .replace(/a_n/g, 'aₙ')
            .replace(/S_\{10\}/g, 'S₁₀')
            .replace(/S_n/g, 'Sₙ')
            .replace(/S_\{n-1\}/g, 'Sₙ₋₁')
            .replace(/a_\{10\}/g, 'a₁₀')
            .replace(/f'\(x\)/g, "f'(x)");

          return (
            <span
              key={index}
              className="font-serif italic font-semibold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-slate-800/80 px-1 rounded-sm mx-0.5 select-all text-[0.95em]"
              id={`math-part-${index}`}
            >
              {formattedMath}
            </span>
          );
        }

        return <span key={index}>{part}</span>;
      })}
    </span>
  );
};
