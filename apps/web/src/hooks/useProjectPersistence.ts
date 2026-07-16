import { useEffect, useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { useGraphStore } from '../store/useGraphStore';
import { ApiError, createProject, listProjects, updateProject } from '../utils/apiClient';
import type { ProjectDTO } from '../utils/apiClient';
import { PREDEFINED_TEMPLATES } from '../data/templates';
import type { AutomatonType } from '../utils/flowAutomaton';
import { createProjectFile, parseProjectFile } from '../utils/projectFormat';
import { importProjectFromJflap } from '../utils/jflapExport';
import { useToast } from '../components/ToastProvider';

/** Workspace snapshot kept in localStorage for the dashboard's recent list. */
export interface RecentProject {
  id: string;
  name: string;
  type: AutomatonType;
  description: string;
  nodes: Node[];
  edges: Edge[];
  input: string;
  lastModified: string;
}

const RECENT_PROJECTS_KEY = 'autometa_recent_projects';
const CONTINUE_PROJECT_KEY = 'autometa_continue_project';

interface UseProjectPersistenceArgs {
  automatonType: AutomatonType;
  inputString: string;
  setInputString: (value: string) => void;
  stopSimulation: () => void;
  /** Called after a project lands on the canvas (App switches to the editor view). */
  onProjectLoaded: () => void;
}

/**
 * Everything that saves or restores canvas content: the localStorage-backed
 * recent/continue workspace snapshots, the SQLite-backed project rows behind
 * Save DB / Load DB, and .project file export/import.
 */
export function useProjectPersistence({
  automatonType,
  inputString,
  setInputString,
  stopSimulation,
  onProjectLoaded,
}: UseProjectPersistenceArgs) {
  const { nodes, edges, nodeCounter, alphabet, tapeAlphabet, stackAlphabet, tapeCount, testSuites, loadGraph, setAutomatonType } = useGraphStore();
  const { showToast } = useToast();

  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [continueProject, setContinueProject] = useState<RecentProject | null>(null);

  const [dbProjects, setDbProjects] = useState<ProjectDTO[]>([]);
  const [isProjectsListOpen, setIsProjectsListOpen] = useState(false);
  const [saveName, setSaveName] = useState('My DFA Project');
  // DB row backing the current canvas; saves update it instead of inserting
  // a duplicate. Null whenever the canvas holds unsaved/non-DB content.
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);

  useEffect(() => {
    const storedRecent = localStorage.getItem(RECENT_PROJECTS_KEY);
    if (storedRecent) {
      setRecentProjects(JSON.parse(storedRecent));
    } else {
      const seeded: RecentProject[] = [
        {
          id: 'temp-1',
          name: "Binary Parity Checker",
          type: "DFA",
          description: "Accepts binary strings containing an even number of '0' symbols.",
          nodes: PREDEFINED_TEMPLATES[1].nodes,
          edges: PREDEFINED_TEMPLATES[1].edges,
          input: PREDEFINED_TEMPLATES[1].input,
          lastModified: "Yesterday"
        },
        {
          id: 'temp-2',
          name: "Email Validator",
          type: "NFA",
          description: "NFA that detects if the substring '101' appears anywhere in the input.",
          nodes: PREDEFINED_TEMPLATES[2].nodes,
          edges: PREDEFINED_TEMPLATES[2].edges,
          input: PREDEFINED_TEMPLATES[2].input,
          lastModified: "Oct 12"
        },
        {
          id: 'temp-5',
          name: "Balanced Parentheses",
          type: "PDA",
          description: "Pushdown Automaton that uses a stack to match equal counts of 'a' and 'b'.",
          nodes: PREDEFINED_TEMPLATES[5].nodes,
          edges: PREDEFINED_TEMPLATES[5].edges,
          input: PREDEFINED_TEMPLATES[5].input,
          lastModified: "Oct 08"
        },
        {
          id: 'temp-6',
          name: "Binary Inverter",
          type: "TM",
          description: "Turing Machine that moves to the end of a binary string, inverts bits on carry, and increments.",
          nodes: PREDEFINED_TEMPLATES[6].nodes,
          edges: PREDEFINED_TEMPLATES[6].edges,
          input: PREDEFINED_TEMPLATES[6].input,
          lastModified: "Sep 30"
        }
      ];
      setRecentProjects(seeded);
      localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(seeded));
    }

    const storedContinue = localStorage.getItem(CONTINUE_PROJECT_KEY);
    if (storedContinue) {
      setContinueProject(JSON.parse(storedContinue));
    } else {
      const defaultProj: RecentProject = {
        id: 'temp-0',
        name: "DFA for Regex `(a|b)*abb`",
        type: "DFA",
        description: "Complex state-machine modeling the lexical analysis for a custom subset of C-minus grammar.",
        nodes: PREDEFINED_TEMPLATES[0].nodes,
        edges: PREDEFINED_TEMPLATES[0].edges,
        input: PREDEFINED_TEMPLATES[0].input,
        lastModified: "2h ago"
      };
      setContinueProject(defaultProj);
      localStorage.setItem(CONTINUE_PROJECT_KEY, JSON.stringify(defaultProj));
    }
  }, []);

  const saveCurrentToRecent = () => {
    if (nodes.length === 0) return;
    const currentProj: RecentProject = {
      id: 'recent-' + Date.now(),
      name: automatonType === 'DFA' && inputString === 'abb'
        ? "DFA for Regex `(a|b)*abb`"
        : `${automatonType} Project: ${nodes.length} States`,
      type: automatonType,
      description: `Workspace simulation using input "${inputString}".`,
      nodes: nodes,
      edges: edges,
      input: inputString,
      lastModified: "Just now"
    };

    setContinueProject(currentProj);
    localStorage.setItem(CONTINUE_PROJECT_KEY, JSON.stringify(currentProj));

    setRecentProjects(prev => {
      const filtered = prev.filter(p => p.type !== currentProj.type);
      const updated = [currentProj, ...filtered].slice(0, 4);
      localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const handleSelectRecentProject = (proj: RecentProject) => {
    stopSimulation();
    setAutomatonType(proj.type);
    setCurrentProjectId(null);
    loadGraph(proj.nodes, proj.edges, proj.nodes.length);
    setInputString(proj.input);
    onProjectLoaded();
  };

  const saveProjectToDB = async () => {
    const payload = {
      name: saveName,
      automaton_type: automatonType,
      nodes_json: JSON.stringify(nodes),
      edges_json: JSON.stringify(edges),
      node_counter: nodeCounter,
      metadata_json: JSON.stringify({ alphabet, tapeAlphabet, stackAlphabet, tapeCount, testSuites }),
    };
    try {
      if (currentProjectId !== null) {
        try {
          await updateProject(currentProjectId, payload);
          showToast("Project updated in the local database!", 'success');
          return;
        } catch (err) {
          // Row was deleted elsewhere; fall through and save as new.
          if (!(err instanceof ApiError && err.status === 404)) throw err;
        }
      }
      const created = await createProject(payload);
      setCurrentProjectId(created.id);
      showToast("Project saved to the local database!", 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error: Could not save the project.", 'error');
    }
  };

  const loadProjectsFromDB = async () => {
    try {
      const data = await listProjects();
      setDbProjects(data);
      setIsProjectsListOpen(true);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error: Could not load projects.", 'error');
    }
  };

  const selectProjectFromDB = (proj: ProjectDTO) => {
    try {
      const parsedNodes = JSON.parse(proj.nodes_json);
      const parsedEdges = JSON.parse(proj.edges_json);
      stopSimulation();
      const metadata = proj.metadata_json ? JSON.parse(proj.metadata_json) : {};
      loadGraph(parsedNodes, parsedEdges, proj.node_counter, { alphabet: metadata.alphabet, tapeAlphabet: metadata.tapeAlphabet, stackAlphabet: metadata.stackAlphabet, tapeCount: metadata.tapeCount, testSuites: metadata.testSuites });
      setAutomatonType(proj.automaton_type as AutomatonType);
      setCurrentProjectId(typeof proj.id === 'number' ? proj.id : null);
      if (proj.name) setSaveName(proj.name);
      setIsProjectsListOpen(false);
      onProjectLoaded();
    } catch {
      showToast("Failed to load project details.", 'error');
    }
  };

  // Export project to file
  const exportProject = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(
      JSON.stringify(createProjectFile({
        automatonType,
        nodes,
        edges,
        nodeCounter,
        alphabet,
        tapeAlphabet,
        stackAlphabet,
        tapeCount,
        testSuites,
      }), null, 2)
    );
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `autometa-${automatonType.toLowerCase()}.project`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import project from file — either Autometa's own .project JSON or a JFLAP .jff file.
  const importProject = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const isJflap = file.name.toLowerCase().endsWith('.jff');

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        if (isJflap) {
          const project = importProjectFromJflap(text);
          setCurrentProjectId(null);
          loadGraph(project.nodes, project.edges, project.nodes.length);
          setAutomatonType(project.automatonType);
        } else {
          const project = parseProjectFile(JSON.parse(text));
          setCurrentProjectId(null);
          loadGraph(project.nodes, project.edges, project.nodeCounter, { alphabet: project.alphabet, tapeAlphabet: project.tapeAlphabet, stackAlphabet: project.stackAlphabet, tapeCount: project.tapeCount, testSuites: project.testSuites });
          setAutomatonType(project.automatonType);
        }
      } catch (err) {
        showToast(err instanceof Error ? `Failed to import project: ${err.message}` : 'Failed to parse project file.', 'error');
      }
    };
    reader.readAsText(file);
  };

  return {
    recentProjects,
    continueProject,
    saveCurrentToRecent,
    handleSelectRecentProject,
    dbProjects,
    isProjectsListOpen, setIsProjectsListOpen,
    saveName, setSaveName,
    currentProjectId, setCurrentProjectId,
    saveProjectToDB,
    loadProjectsFromDB,
    selectProjectFromDB,
    exportProject,
    importProject,
  };
}

export type ProjectPersistence = ReturnType<typeof useProjectPersistence>;
