import { useState } from 'react';
import type { Node } from '@xyflow/react';
import { FileDown, FileUp, Undo2, Redo2 } from 'lucide-react';
import { Button } from '@autometa/ui';
import { useGraphStore } from '../store/useGraphStore';
import { useToast } from './ToastProvider';
import { PREDEFINED_TEMPLATES } from '../data/templates';
import { exportToSVG, exportToPNG, exportToHTML, exportToPDF } from '../utils/exportUtils';
import { exportProjectToJflap } from '../utils/jflapExport';
import { UNDO_SHORTCUT_HINT, REDO_SHORTCUT_HINT } from '../utils/shortcuts';
import type { AutomatonType } from '../utils/flowAutomaton';
import type { ProjectPersistence } from '../hooks/useProjectPersistence';

interface EditorHeaderProps {
  isEditorView: boolean;
  automatonType: AutomatonType;
  persistence: ProjectPersistence;
  stopSimulation: () => void;
  setInputString: (value: string) => void;
  selectedExampleIndex: string;
  setSelectedExampleIndex: (value: string) => void;
  isExportingGif: boolean;
  onExportGif: () => void;
  getFlowViewportEl: () => HTMLElement | null;
  getNodes: () => Node[];
  onSaveVersion: () => void;
}

/** Top navbar: engine/template selectors, undo/redo, DB actions, import/export. */
export const EditorHeader = ({
  isEditorView, automatonType, persistence, stopSimulation, setInputString,
  selectedExampleIndex, setSelectedExampleIndex, isExportingGif, onExportGif,
  getFlowViewportEl, getNodes, onSaveVersion,
}: EditorHeaderProps) => {
  const { nodes, edges, loadGraph, clearGraph, setAutomatonType, undo, redo, past, future } = useGraphStore();
  const [isExportOpen, setIsExportOpen] = useState(false);
  const { showToast } = useToast();

  return (
    <header className="h-16 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] flex items-center justify-between px-6 z-10 select-none shrink-0 text-[var(--text-main)]">
      {/* Middle: Configuration & Syllabus Toggles */}
      <div className="flex items-center gap-4 bg-[var(--bg-primary)] p-1.5 px-3 rounded-xl border border-[var(--border-color)] shadow-sm">
        {/* Automaton Type Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Engine:</span>
          <select
            value={automatonType}
            onChange={(e) => {
              stopSimulation();
              setAutomatonType(e.target.value as AutomatonType);
              setSelectedExampleIndex("");
            }}
            aria-label="Automaton engine type"
            className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-2 py-1 text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--color-ui-accent)] transition-all font-bold cursor-pointer"
          >
            <option className="bg-[var(--bg-primary)] text-[var(--text-main)]" value="DFA">DFA</option>
            <option className="bg-[var(--bg-primary)] text-[var(--text-main)]" value="NFA">NFA</option>
            <option className="bg-[var(--bg-primary)] text-[var(--text-main)]" value="Mealy">Mealy</option>
            <option className="bg-[var(--bg-primary)] text-[var(--text-main)]" value="Moore">Moore</option>
            <option className="bg-[var(--bg-primary)] text-[var(--text-main)]" value="PDA">PDA</option>
            <option className="bg-[var(--bg-primary)] text-[var(--text-main)]" value="TM">Turing</option>
          </select>
        </div>

        <span className="h-4 w-px bg-[var(--border-color)]" />

        {/* Predefined Syllabus Select */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Syllabus:</span>
          <select
            value={selectedExampleIndex}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedExampleIndex(val);
              if (val !== "") {
                stopSimulation();
                const idx = parseInt(val, 10);
                const template = PREDEFINED_TEMPLATES[idx];
                persistence.setCurrentProjectId(null);
                loadGraph(template.nodes, template.edges, template.nodes.length);
                setInputString(template.input);
              }
            }}
            aria-label="Predefined example"
            className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-2 py-1 text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--color-ui-accent)] transition-all font-bold cursor-pointer max-w-[160px]"
          >
            <option className="bg-[var(--bg-primary)] text-[var(--text-main)]" value="">-- Choose --</option>
            {PREDEFINED_TEMPLATES.map((tmpl, idx) => {
              if (tmpl.type !== automatonType) return null;
              return (
                <option className="bg-[var(--bg-primary)] text-[var(--text-main)]" key={idx} value={idx.toString()}>
                  {tmpl.name}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Right: Workspace & File Control Actions */}
      <div className="flex items-center gap-2">
        {isEditorView && (
          <>
            <Button
              variant="secondary"
              onClick={undo}
              disabled={past.length === 0}
              title={`Undo (${UNDO_SHORTCUT_HINT})`}
              className="flex items-center gap-1.5 !px-3 !py-1.5 text-xs border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)]"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="secondary"
              onClick={redo}
              disabled={future.length === 0}
              title={`Redo (${REDO_SHORTCUT_HINT})`}
              className="flex items-center gap-1.5 !px-3 !py-1.5 text-xs border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)]"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
        {/* Database actions */}
        <Button variant="secondary" onClick={persistence.loadProjectsFromDB} className="flex items-center gap-1.5 !px-3 !py-1.5 text-xs border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)]">
          Load DB
        </Button>
        <Button variant="secondary" onClick={() => persistence.setIsProjectsListOpen(true)} className="flex items-center gap-1.5 !px-3 !py-1.5 text-xs border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)]">
          Save DB
        </Button>
        {persistence.currentProjectId !== null && (
          <Button variant="secondary" onClick={onSaveVersion} title="Save a named snapshot of this project you can restore later" className="flex items-center gap-1.5 !px-3 !py-1.5 text-xs border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)]">
            Save Version
          </Button>
        )}

        {/* Project File actions */}
        <div className="relative">
          <button
            onClick={() => setIsExportOpen(!isExportOpen)}
            aria-haspopup="menu"
            aria-expanded={isExportOpen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs bg-[var(--bg-primary)] border border-[var(--border-color)] hover:bg-[var(--bg-secondary)] text-[var(--text-main)] transition-all duration-200 cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" /> Export As...
          </button>
          {isExportOpen && (
            <div className="absolute right-0 mt-1 w-44 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-color)] p-1.5 shadow-2xl z-50 flex flex-col gap-0.5 animate-slide-down animate-fade-in" role="menu">
              <button
                onClick={() => { persistence.exportProject(); setIsExportOpen(false); }}
                className="text-left w-full px-2.5 py-1.5 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-secondary)] rounded-md cursor-pointer border-none bg-transparent"
              >
                .project (Full Project)
              </button>
              <button
                onClick={() => {
                  const viewportEl = getFlowViewportEl();
                  if (viewportEl) exportToSVG(viewportEl, getNodes(), automatonType).catch(console.error);
                  setIsExportOpen(false);
                }}
                className="text-left w-full px-2.5 py-1.5 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-secondary)] rounded-md cursor-pointer border-none bg-transparent"
              >
                Vector SVG
              </button>
              <button
                onClick={() => {
                  const viewportEl = getFlowViewportEl();
                  if (viewportEl) exportToPNG(viewportEl, getNodes(), automatonType).catch(console.error);
                  setIsExportOpen(false);
                }}
                className="text-left w-full px-2.5 py-1.5 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-secondary)] rounded-md cursor-pointer border-none bg-transparent"
              >
                PNG Image
              </button>
              <button
                onClick={() => { exportToHTML(nodes, edges, automatonType); setIsExportOpen(false); }}
                className="text-left w-full px-2.5 py-1.5 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-secondary)] rounded-md cursor-pointer border-none bg-transparent"
              >
                Interactive HTML
              </button>
              <button
                onClick={() => { exportToPDF(nodes, edges, automatonType); setIsExportOpen(false); }}
                className="text-left w-full px-2.5 py-1.5 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-secondary)] rounded-md cursor-pointer border-none bg-transparent"
              >
                PDF / Print
              </button>
              <button
                onClick={() => {
                  try {
                    const xml = exportProjectToJflap(nodes, edges, automatonType);
                    const blob = new Blob([xml], { type: 'application/xml' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `autometa-${automatonType.toLowerCase()}.jff`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : 'Failed to export JFLAP file.', 'error');
                  }
                  setIsExportOpen(false);
                }}
                className="text-left w-full px-2.5 py-1.5 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-secondary)] rounded-md cursor-pointer border-none bg-transparent"
              >
                JFLAP (.jff)
              </button>
              <button
                onClick={() => { onExportGif(); setIsExportOpen(false); }}
                disabled={isExportingGif}
                className="text-left w-full px-2.5 py-1.5 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-secondary)] rounded-md cursor-pointer border-none bg-transparent disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isExportingGif ? 'Exporting GIF...' : 'GIF Animation'}
              </button>
            </div>
          )}
        </div>
        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all duration-200 bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)] cursor-pointer">
          <FileUp className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Import
          <input type="file" accept=".project,.jff" onChange={persistence.importProject} className="hidden" />
        </label>

        <Button variant="danger" onClick={() => { stopSimulation(); clearGraph(); persistence.setCurrentProjectId(null); }} className="flex items-center gap-1.5 !px-3 !py-1.5 text-xs bg-[var(--color-rose)] text-white hover:bg-[var(--color-rose)]/90 border-transparent">
          Reset
        </Button>
      </div>
    </header>
  );
};
