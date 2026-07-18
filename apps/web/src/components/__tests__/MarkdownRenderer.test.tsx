import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownRenderer } from '../MarkdownRenderer';

describe('MarkdownRenderer', () => {
  it('renders all heading levels 1-6 correctly', () => {
    const text = [
      '# Heading 1',
      '## Heading 2',
      '### Heading 3',
      '#### Heading 4',
      '##### Heading 5',
      '###### Heading 6',
    ].join('\n');

    const { container } = render(<MarkdownRenderer text={text} />);

    expect(container.querySelector('h1')?.textContent).toBe('Heading 1');
    expect(container.querySelector('h2')?.textContent).toBe('Heading 2');
    expect(container.querySelector('h3')?.textContent).toBe('Heading 3');
    expect(container.querySelector('h4')?.textContent).toBe('Heading 4');
    expect(container.querySelector('h5')?.textContent).toBe('Heading 5');
    expect(container.querySelector('h6')?.textContent).toBe('Heading 6');
  });

  it('renders blockquotes correctly', () => {
    const text = '> This is a blockquote\n>Another blockquote without space';
    const { container } = render(<MarkdownRenderer text={text} />);

    const quotes = container.querySelectorAll('blockquote');
    expect(quotes.length).toBe(2);
    expect(quotes[0].textContent).toBe('This is a blockquote');
    expect(quotes[1].textContent).toBe('Another blockquote without space');
  });

  it('renders horizontal rules correctly', () => {
    const text = '---\n***\n___';
    const { container } = render(<MarkdownRenderer text={text} />);

    const hrs = container.querySelectorAll('hr');
    expect(hrs.length).toBe(3);
  });

  it('renders bold, italic, and inline code formatting correctly', () => {
    const text = 'This is **bold** and *italic* and _italic_ and `code`.';
    const { container } = render(<MarkdownRenderer text={text} />);

    expect(container.querySelector('strong')?.textContent).toBe('bold');
    const italics = container.querySelectorAll('em');
    expect(italics.length).toBe(2);
    expect(italics[0].textContent).toBe('italic');
    expect(italics[1].textContent).toBe('italic');
    expect(container.querySelector('code')?.textContent).toBe('code');
  });

  it('renders links correctly', () => {
    const text = 'Check out [Google](https://google.com).';
    const { container } = render(<MarkdownRenderer text={text} />);

    const link = container.querySelector('a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('https://google.com');
    expect(link?.textContent).toBe('Google');
  });

  it('renders LaTeX inline and block math and cleans up braces/underscores', () => {
    const text = 'Inline math: \\(Σ = \\{a, b\\}\\)\nBlock math: \\[δ(q\\_0, a) = q\\_1\\]';
    const { container } = render(<MarkdownRenderer text={text} />);

    // Inline math
    const inlineMath = container.querySelector('span.font-mono');
    expect(inlineMath?.textContent).toBe('Σ = {a, b}');

    // Block math
    const blockMath = container.querySelector('div.font-mono');
    expect(blockMath?.textContent).toBe('δ(q_0, a) = q_1');
  });

  it('renders bullet and numbered lists with indentation correctly', () => {
    const text = [
      '* Level 0 Bullet',
      '  - Level 1 Bullet',
      '    + Level 2 Bullet',
      '      • Level 3 Bullet',
      '1. Level 0 Number',
      '  2. Level 1 Number',
    ].join('\n');

    const { container } = render(<MarkdownRenderer text={text} />);

    const lists = container.querySelectorAll('div.flex.gap-2');
    expect(lists.length).toBe(6);

    // Bullet levels
    expect(lists[0].getAttribute('style')).toContain('padding-left: 8px');
    expect(lists[1].getAttribute('style')).toContain('padding-left: 40px'); // 8 + 2 * 16
    expect(lists[2].getAttribute('style')).toContain('padding-left: 72px'); // 8 + 4 * 16
    expect(lists[3].getAttribute('style')).toContain('padding-left: 104px'); // 8 + 6 * 16

    // Numbered levels
    expect(lists[4].getAttribute('style')).toContain('padding-left: 8px');
    expect(lists[5].getAttribute('style')).toContain('padding-left: 40px');
  });
});
