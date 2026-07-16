import { describe, expect, it } from 'vitest';
import { batchRowsToCsv, generateLanguageSamples, runBatch } from '../batchSimulation';

const evenZerosDfa = {
  nodes: [
    { id: 'q0', label: 'q0', isStart: true, isAccept: true },
    { id: 'q1', label: 'q1', isStart: false, isAccept: false },
  ],
  edges: [
    { id: 'e0', source: 'q0', target: 'q1', symbols: ['0'] },
    { id: 'e1', source: 'q1', target: 'q0', symbols: ['0'] },
    { id: 'e2', source: 'q0', target: 'q0', symbols: ['1'] },
    { id: 'e3', source: 'q1', target: 'q1', symbols: ['1'] },
  ],
};

describe('generateLanguageSamples', () => {
  it('enumerates every string up to the given length', () => {
    const samples = generateLanguageSamples(['0', '1'], 2);
    expect(samples).toEqual(['', '0', '1', '00', '01', '10', '11']);
  });

  it('respects the cap', () => {
    const samples = generateLanguageSamples(['a', 'b', 'c'], 5, 10);
    expect(samples.length).toBeLessThanOrEqual(10);
  });
});

describe('runBatch', () => {
  it('runs DFA inputs and reports accept/reject', () => {
    const rows = runBatch(evenZerosDfa, 'DFA', ['', '0', '00', '01']);
    expect(rows).toEqual([
      { input: '', kind: 'accept-reject', accepted: true },
      { input: '0', kind: 'accept-reject', accepted: false },
      { input: '00', kind: 'accept-reject', accepted: true },
      { input: '01', kind: 'accept-reject', accepted: false },
    ]);
  });

  it('runs Mealy inputs and reports the output string', () => {
    const mealy = {
      nodes: [{ id: 'q0', label: 'q0', isStart: true, isAccept: false }],
      edges: [
        { id: 'e0', source: 'q0', target: 'q0', symbols: ['0/1'] },
        { id: 'e1', source: 'q0', target: 'q0', symbols: ['1/0'] },
      ],
    };
    const rows = runBatch(mealy, 'Mealy', ['01', '10']);
    expect(rows).toEqual([
      { input: '01', kind: 'transducer', output: '10' },
      { input: '10', kind: 'transducer', output: '01' },
    ]);
  });
});

describe('batchRowsToCsv', () => {
  it('formats accept/reject rows', () => {
    const csv = batchRowsToCsv([
      { input: '00', kind: 'accept-reject', accepted: true },
      { input: '0', kind: 'accept-reject', accepted: false },
    ]);
    expect(csv).toBe('input,result\n"00","accept"\n"0","reject"');
  });

  it('formats transducer rows and escapes quotes', () => {
    const csv = batchRowsToCsv([{ input: 'a"b', kind: 'transducer', output: 'x"y' }]);
    expect(csv).toBe('input,result\n"a""b","x""y"');
  });
});
