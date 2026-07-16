import { useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { Button } from '@autometa/ui';
import { batchRowsToCsv, downloadText, generateLanguageSamples, runBatch } from '../utils/batchSimulation';
import type { BatchRow } from '../utils/batchSimulation';
import { toAutomaton } from '../utils/flowAutomaton';
import type { AutomatonType } from '../utils/flowAutomaton';

interface BatchModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: Node[];
  edges: Edge[];
  automatonType: AutomatonType;
}

/** Phase 6 batch mode: run many inputs at once (or generate every string up to a length) and export the results. */
export const BatchModeModal = ({ isOpen, onClose, nodes, edges, automatonType }: BatchModeModalProps) => {
  const [alphabetInput, setAlphabetInput] = useState('0,1');
  const [maxLength, setMaxLength] = useState(4);
  const [customInputs, setCustomInputs] = useState('');
  const [rows, setRows] = useState<BatchRow[] | null>(null);

  if (!isOpen) return null;

  const alphabet = alphabetInput.split(',').map(s => s.trim()).filter(Boolean);

  const runWith = (inputs: string[]) => {
    const automaton = toAutomaton(nodes, edges, automatonType);
    setRows(runBatch(automaton, automatonType, inputs));
  };

  const handleGenerateAndRun = () => runWith(generateLanguageSamples(alphabet, maxLength));

  const handleRunCustom = () => {
    const inputs = customInputs.split('\n').map(s => s.trim()).filter(Boolean);
    runWith(inputs);
  };

  const handleExportCsv = () => rows && downloadText(batchRowsToCsv(rows), 'autometa-batch-results.csv', 'text/csv');
  const handleExportJson = () => rows && downloadText(JSON.stringify(rows, null, 2), 'autometa-batch-results.json', 'application/json');

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0b1220] border border-white/5 max-w-2xl w-full rounded-2xl p-6 flex flex-col gap-5 shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar" role="dialog" aria-label="Batch mode">
        <div className="flex justify-between items-center border-b border-white/5 pb-4">
          <h3 className="font-extrabold text-sm tracking-widest text-slate-100 uppercase">Batch Mode</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white bg-transparent border-none cursor-pointer text-sm">
            CLOSE
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs text-slate-400 uppercase font-bold">Generate language samples</span>
          <div className="flex items-end gap-2 flex-wrap">
            <label className="flex flex-col gap-1 text-[10px] text-slate-400">
              Alphabet (comma-separated)
              <input
                value={alphabetInput}
                onChange={e => setAlphabetInput(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none w-40"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-slate-400">
              Up to length
              <input
                type="number"
                min={0}
                max={10}
                value={maxLength}
                onChange={e => setMaxLength(Number(e.target.value))}
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none w-20"
              />
            </label>
            <Button onClick={handleGenerateAndRun} className="!bg-[#00e5a3] !text-black !font-bold">
              Generate &amp; Run
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs text-slate-400 uppercase font-bold">Or run your own inputs (one per line)</span>
          <textarea
            value={customInputs}
            onChange={e => setCustomInputs(e.target.value)}
            rows={4}
            placeholder={'0110\n1010\n0000'}
            className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none custom-scrollbar"
          />
          <Button variant="secondary" onClick={handleRunCustom} className="w-fit">
            Run These Inputs
          </Button>
        </div>

        {rows && (
          <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 uppercase font-bold">{rows.length} results</span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={handleExportCsv} className="!text-xs !py-1.5 !px-3">
                  Export CSV
                </Button>
                <Button variant="secondary" onClick={handleExportJson} className="!text-xs !py-1.5 !px-3">
                  Export JSON
                </Button>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto custom-scrollbar border border-white/5 rounded-lg">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#0b1220]">
                  <tr className="text-left text-slate-400 border-b border-white/10">
                    <th className="py-1.5 px-3">Input</th>
                    <th className="py-1.5 px-3">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="py-1 px-3 font-mono text-slate-300">{row.input || 'ε'}</td>
                      <td className="py-1 px-3">
                        {row.kind === 'accept-reject' ? (
                          <span className={row.accepted ? 'text-emerald-300' : 'text-red-300'}>
                            {row.accepted ? 'accept' : 'reject'}
                          </span>
                        ) : (
                          <span className="font-mono text-slate-300">{row.output}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
