import React from 'react';

interface MarkdownRendererProps {
  text: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ text }) => {
  // Split by newlines
  const lines = text.split('\n');

  const parseInline = (content: string) => {
    let parsed: React.ReactNode[] = [content];

    const replacePattern = (
      elements: React.ReactNode[],
      regex: RegExp,
      renderFn: (match: string, p1: string) => React.ReactNode
    ): React.ReactNode[] => {
      const result: React.ReactNode[] = [];
      for (const el of elements) {
        if (typeof el !== 'string') {
          result.push(el);
          continue;
        }

        let lastIndex = 0;
        let match;
        regex.lastIndex = 0;

        while ((match = regex.exec(el)) !== null) {
          const matchIndex = match.index;
          if (matchIndex > lastIndex) {
            result.push(el.substring(lastIndex, matchIndex));
          }
          result.push(renderFn(match[0], match[1]));
          lastIndex = regex.lastIndex;
        }

        if (lastIndex < el.length) {
          result.push(el.substring(lastIndex));
        }
      }
      return result;
    };

    // Replace LaTeX inline formulas \( ... \)
    parsed = replacePattern(parsed, /\\\((.*?)\\\)/g, (_, math) => (
      <span key={`inline-math-${math}`} className="font-mono bg-[#00f0ff]/10 text-[#00f0ff] px-1 py-0.5 rounded border border-[#00f0ff]/20 text-[11px] inline-block mx-0.5">
        {math.trim()}
      </span>
    ));

    // Replace LaTeX block formulas \[ ... \]
    parsed = replacePattern(parsed, /\\\[(.*?)\\\]/g, (_, math) => (
      <div key={`block-math-${math}`} className="my-2 p-2 bg-[#00f0ff]/5 text-[#00f0ff] rounded border border-[#00f0ff]/10 text-center font-mono text-xs overflow-x-auto">
        {math.trim()}
      </div>
    ));

    // Replace Bold tags ** ... **
    parsed = replacePattern(parsed, /\*\*(.*?)\*\*/g, (_, boldText) => (
      <strong key={`bold-${boldText}`} className="font-bold text-white">
        {boldText}
      </strong>
    ));

    // Replace Inline Code ` ... `
    parsed = replacePattern(parsed, /`(.*?)`/g, (_, codeText) => (
      <code key={`code-${codeText}`} className="bg-black/40 text-pink-400 font-mono px-1 py-0.5 rounded text-xs">
        {codeText}
      </code>
    ));

    return <>{parsed}</>;
  };

  return (
    <div className="flex flex-col gap-1.5 leading-relaxed text-sm text-gray-200">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        if (trimmed.startsWith('### ')) {
          return (
            <h3 key={`h3-${idx}`} className="text-[#00f0ff] font-bold text-xs uppercase tracking-wider mt-3 mb-1 pb-0.5 border-b border-white/5">
              {parseInline(trimmed.substring(4))}
            </h3>
          );
        }

        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={`h2-${idx}`} className="text-white font-extrabold text-sm mt-4 mb-2 pb-1 border-b border-white/10">
              {parseInline(trimmed.substring(3))}
            </h2>
          );
        }

        if (trimmed.startsWith('# ')) {
          return (
            <h1 key={`h1-${idx}`} className="text-white font-extrabold text-base mt-4 mb-2">
              {parseInline(trimmed.substring(2))}
            </h1>
          );
        }

        // Check if it's a list item starting with * or -
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
          return (
            <div key={`list-${idx}`} className="flex gap-2 pl-2 my-0.5">
              <span className="text-[#00f0ff] select-none">•</span>
              <div className="flex-1">{parseInline(trimmed.substring(2))}</div>
            </div>
          );
        }

        // Check if it's a list item starting with number (e.g. 1., 2.)
        const matchNum = trimmed.match(/^(\d+)\.\s(.*)/);
        if (matchNum) {
          return (
            <div key={`num-${idx}`} className="flex gap-2 pl-2 my-0.5">
              <span className="text-[#00f0ff] font-mono text-xs select-none">{matchNum[1]}.</span>
              <div className="flex-1">{parseInline(matchNum[2])}</div>
            </div>
          );
        }

        // Empty line spacer
        if (trimmed === '') {
          return <div key={`spacer-${idx}`} className="h-1.5" />;
        }

        return <p key={`p-${idx}`}>{parseInline(line)}</p>;
      })}
    </div>
  );
};
