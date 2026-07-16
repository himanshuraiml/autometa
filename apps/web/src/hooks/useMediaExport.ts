import { useRef, useState } from 'react';
import type { Node } from '@xyflow/react';
import { generateTimeline } from '@autometa/timeline-engine';
import { calculateRenderState } from '@autometa/animation-engine';
import { useGraphStore } from '../store/useGraphStore';
import { updateVisualStates } from './useSimulationPlayback';
import type { SimulationPlayback } from './useSimulationPlayback';
import { computeFlowCaptureBox, captureFlowFrame, encodeGIF, downloadGIF } from './../utils/exportUtils';
import { useToast } from '../components/ToastProvider';

interface UseMediaExportArgs {
  playback: SimulationPlayback;
  /** The `.react-flow__viewport` element to capture frames from. */
  getFlowViewportEl: () => HTMLElement | null;
  /** React Flow's live node accessor (positions include drag state). */
  getNodes: () => Node[];
}

/**
 * Screen recording (MediaRecorder) and offline GIF rendering of the current
 * simulation. Both drive the playback pipeline owned by useSimulationPlayback.
 */
export function useMediaExport({ playback, getFlowViewportEl, getNodes }: UseMediaExportArgs) {
  const { showToast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isExportingGif, setIsExportingGif] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser"
        } as MediaTrackConstraints,
        audio: false
      });

      streamRef.current = stream;
      chunksRef.current = [];

      let mimeType = 'video/webm;codecs=vp9';
      if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        mimeType = 'video/webm;codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        mimeType = 'video/webm';
      }

      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const isMp4 = mimeType.includes('mp4');
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `autometa-simulation-${new Date().getTime()}.${isMp4 ? 'mp4' : 'webm'}`;
        a.click();
        URL.revokeObjectURL(url);

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        setIsRecording(false);
      };

      stream.getVideoTracks()[0].onended = () => {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      };

      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      recorder.start();

      if (playback.simulationEvents.length === 0) {
        playback.startSimulation();
      } else {
        playback.setIsPlaying(true);
      }
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const waitForPaint = () => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  // Steps the timeline offline (independent of the live playhead), capturing a
  // canvas frame at each sample so the exported GIF matches the on-screen animation.
  // Auto-starts a run from the current input if none is active yet, mirroring how
  // "Record MP4/WebM" kicks off a simulation when the user hasn't pressed Play.
  const exportSimulationToGIF = async () => {
    if (isExportingGif) return;
    const { nodes, edges } = useGraphStore.getState();
    if (nodes.length === 0) {
      showToast("Add at least one state before exporting a GIF.", 'error');
      return;
    }
    const viewportEl = getFlowViewportEl();
    if (!viewportEl) return;

    const wasPlaying = playback.isPlaying;
    playback.setIsPlaying(false);
    setIsExportingGif(true);

    const savedPlayhead = playback.playhead;
    const savedNodes = JSON.parse(JSON.stringify(nodes));
    const savedEdges = JSON.parse(JSON.stringify(edges));

    try {
      let activeTimeline = playback.timeline;
      if (!activeTimeline) {
        const result = playback.buildSimulationResult();
        activeTimeline = generateTimeline(result.events, 800);
        playback.setSimulationEvents(result.events);
        playback.setSimulationResult({ accepted: result.accepted, outputString: result.outputString });
        playback.setTimeline(activeTimeline);
      }
      if (activeTimeline.duration === 0) {
        showToast("Nothing to animate — this input produces no transitions.", 'error');
        return;
      }

      const box = computeFlowCaptureBox(getNodes());
      const FRAME_STEP_MS = 100;
      const sampleTimes: number[] = [];
      for (let t = 0; t < activeTimeline.duration; t += FRAME_STEP_MS) sampleTimes.push(t);
      sampleTimes.push(activeTimeline.duration);

      const frames = [];
      for (let i = 0; i < sampleTimes.length; i++) {
        const t = sampleTimes[i];
        updateVisualStates(calculateRenderState(activeTimeline, t));
        await waitForPaint();
        const isLast = i === sampleTimes.length - 1;
        frames.push(await captureFlowFrame(viewportEl, box, isLast ? 600 : FRAME_STEP_MS));
      }

      downloadGIF(encodeGIF(frames), `autometa-simulation-${Date.now()}.gif`);
    } finally {
      useGraphStore.setState({ nodes: savedNodes, edges: savedEdges });
      playback.setPlayhead(savedPlayhead);
      setIsExportingGif(false);
      if (wasPlaying) playback.setIsPlaying(true);
    }
  };

  return { isRecording, isExportingGif, startRecording, stopRecording, exportSimulationToGIF };
}
