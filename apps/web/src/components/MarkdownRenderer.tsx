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
      renderFn: (match: string, ...groups: any[]) => React.ReactNode
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
          result.push(renderFn(match[0], ...match.slice(1)));
          lastIndex = regex.lastIndex;
        }

        if (lastIndex < el.length) {
          result.push(el.substring(lastIndex));
        }
      }
      return result;
    };

    // Replace LaTeX inline formulas \( ... \)
    parsed = replacePattern(parsed, /\\\((.*?)\\\)/g, (_, math) => {
      const cleaned = math.trim().replace(/\\{/g, '{').replace(/\\}/g, '}').replace(/\\_/g, '_');
      return (
        <span key={`inline-math-${math}`} className="font-mono bg-[#00f0ff]/10 text-[#00f0ff] px-1 py-0.5 rounded border border-[#00f0ff]/20 text-[11px] inline-block mx-0.5">
          {cleaned}
        </span>
      );
    });

    // Replace LaTeX block formulas \[ ... \]
    parsed = replacePattern(parsed, /\\\[(.*?)\\\]/g, (_, math) => {
      const cleaned = math.trim().replace(/\\{/g, '{').replace(/\\}/g, '}').replace(/\\_/g, '_');
      return (
        <div key={`block-math-${math}`} className="my-2 p-2 bg-[#00f0ff]/5 text-[#00f0ff] rounded border border-[#00f0ff]/10 text-center font-mono text-xs overflow-x-auto">
          {cleaned}
        </div>
      );
    });

    // Replace Bold tags ** ... **
    parsed = replacePattern(parsed, /\*\*(.*?)\*\*/g, (_, boldText) => (
      <strong key={`bold-${boldText}`} className="font-bold text-white">
        {boldText}
      </strong>
    ));

    // Replace Italic tags * ... *
    parsed = replacePattern(parsed, /\*(.*?)\*/g, (_, italicText) => (
      <em key={`italic-ast-${italicText}`} className="italic text-gray-300">
        {italicText}
      </em>
    ));

    // Replace Italic tags _ ... _
    parsed = replacePattern(parsed, /_(.*?)_/g, (_, italicText) => (
      <em key={`italic-und-${italicText}`} className="italic text-gray-300">
        {italicText}
      </em>
    ));

    // Replace Links [text](url)
    parsed = replacePattern(parsed, /\[(.*?)\]\((.*?)\)/g, (_, linkText, url) => (
      <a key={`link-${linkText}-${url}`} href={url} target="_blank" rel="noopener noreferrer" className="text-[#00f0ff] hover:underline decoration-[#00f0ff]/50">
        {linkText}
      </a>
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

        // Headings 1-6
        const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const content = headingMatch[2];
          switch (level) {
            case 1:
              return (
                <h1 key={`h1-${idx}`} className="text-white font-extrabold text-base mt-4 mb-2">
                  {parseInline(content)}
                </h1>
              );
            case 2:
              return (
                <h2 key={`h2-${idx}`} className="text-white font-extrabold text-sm mt-4 mb-2 pb-1 border-b border-white/10">
                  {parseInline(content)}
                </h2>
              );
            case 3:
              return (
                <h3 key={`h3-${idx}`} className="text-[#00f0ff] font-bold text-xs uppercase tracking-wider mt-3 mb-1 pb-0.5 border-b border-white/5">
                  {parseInline(content)}
                </h3>
              );
            case 4:
              return (
                <h4 key={`h4-${idx}`} className="text-white font-bold text-xs mt-3 mb-1">
                  {parseInline(content)}
                </h4>
              );
            case 5:
              return (
                <h5 key={`h5-${idx}`} className="text-white/90 font-bold text-xs mt-2 mb-1">
                  {parseInline(content)}
                </h5>
              );
            case 6:
              return (
                <h6 key={`h6-${idx}`} className="text-white/80 font-semibold text-xs mt-2 mb-1">
                  {parseInline(content)}
                </h6>
              );
          }
        }

        // Blockquote
        if (trimmed.startsWith('>')) {
          const content = trimmed.startsWith('> ') ? trimmed.substring(2) : trimmed.substring(1);
          return (
            <blockquote key={`quote-${idx}`} className="border-l-2 border-[#00f0ff]/40 pl-3 my-1.5 italic text-gray-400">
              {parseInline(content)}
            </blockquote>
          );
        }

        // Horizontal rule
        if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
          return <hr key={`hr-${idx}`} className="border-white/10 my-3" />;
        }

        // Check if it's a list item starting with * or - or + or •
        const isBullet = trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('+ ') || trimmed.startsWith('• ');
        if (isBullet) {
          const indent = line.length - line.trimStart().length;
          const content = trimmed.substring(2);
          return (
            <div key={`list-${idx}`} className="flex gap-2 my-0.5" style={{ paddingLeft: `${8 + indent * 16}px` }}>
              <span className="text-[#00f0ff] select-none">•</span>
              <div className="flex-1">{parseInline(content)}</div>
            </div>
          );
        }

        // Check if it's a list item starting with number (e.g. 1., 2.)
        const matchNum = trimmed.match(/^(\d+)\.\s(.*)/);
        if (matchNum) {
          const indent = line.length - line.trimStart().length;
          return (
            <div key={`num-${idx}`} className="flex gap-2 my-0.5" style={{ paddingLeft: `${8 + indent * 16}px` }}>
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
