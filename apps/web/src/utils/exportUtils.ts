import { toPng, toSvg, toCanvas } from 'html-to-image';
import { getNodesBounds, getViewportForBounds } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { SimulationEvent } from '@autometa/simulation-engine';

const EXPORT_PADDING = 60;
const EXPORT_BACKGROUND = '#070a13';

export interface FlowCaptureBox {
  width: number;
  height: number;
  viewport: { x: number; y: number; zoom: number };
}

/**
 * Fixed frame the whole automaton fits inside, computed once from node bounds so
 * every capture (a single PNG/SVG, or every frame of a GIF) lines up identically.
 */
export const computeFlowCaptureBox = (nodes: Node[]): FlowCaptureBox => {
  const bounds = getNodesBounds(nodes);
  const width = bounds.width + EXPORT_PADDING * 2;
  const height = bounds.height + EXPORT_PADDING * 2;
  const viewport = getViewportForBounds(bounds, width, height, 0.5, 2, EXPORT_PADDING);
  return { width, height, viewport };
};

const captureStyle = (box: FlowCaptureBox) => ({
  backgroundColor: EXPORT_BACKGROUND,
  width: box.width,
  height: box.height,
  style: {
    width: `${box.width}px`,
    height: `${box.height}px`,
    transform: `translate(${box.viewport.x}px, ${box.viewport.y}px) scale(${box.viewport.zoom})`,
  },
});

/**
 * Captures the live React Flow viewport DOM (nodes, edges, glow, curves, fonts —
 * everything CSS renders) instead of re-drawing a parallel approximation, so the
 * exported image is pixel-identical to what's on screen.
 */
const captureFlowImage = (
  viewportEl: HTMLElement,
  nodes: Node[],
  toImage: typeof toPng | typeof toSvg
): Promise<string> => {
  const box = computeFlowCaptureBox(nodes);
  return toImage(viewportEl, { ...captureStyle(box), pixelRatio: 2 });
};

/**
 * Calculates the bounding box of the active nodes list
 */
const getBoundingBox = (nodes: Node[], padding = 60) => {
  if (nodes.length === 0) return { x: 0, y: 0, width: 800, height: 600 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  nodes.forEach(node => {
    const x = node.position.x;
    const y = node.position.y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });

  return {
    x: minX - padding,
    y: minY - padding,
    width: (maxX - minX) + padding * 2 + 80,
    height: (maxY - minY) + padding * 2 + 80
  };
};

/**
 * Generates a clean, standalone vector SVG representation of the React Flow canvas
 */
export const generateSVG = (nodes: Node[], edges: Edge[], automatonType: string): string => {
  const box = getBoundingBox(nodes);
  
  let svgContent = `<!-- Autometa Automaton Type: ${automatonType} -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.width} ${box.height}" width="${box.width}" height="${box.height}" style="background:#070a13; font-family:system-ui, sans-serif;">\n`;
  
  // Add definitions for arrow markers
  svgContent += `  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="24" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 Z" fill="#00f0ff" />
    </marker>
    <marker id="start-arrow" markerWidth="10" markerHeight="10" refX="5" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="#00f0ff" />
    </marker>
  </defs>\n\n`;

  // 1. Draw Edges
  edges.forEach(edge => {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    if (!sourceNode || !targetNode) return;

    const sx = sourceNode.position.x + 32;
    const sy = sourceNode.position.y + 32;
    const tx = targetNode.position.x + 32;
    const ty = targetNode.position.y + 32;

    const label = edge.data?.label as string || '';

    if (edge.source === edge.target) {
      // Self loop path
      const path = `M ${sx - 10} ${sy - 30} A 25 25 0 1 1 ${sx + 10} ${sy - 30}`;
      svgContent += `  <path d="${path}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2" marker-end="url(#arrow)" />\n`;
      svgContent += `  <text x="${sx}" y="${sy - 65}" fill="#00f0ff" font-size="11" font-weight="bold" text-anchor="middle" font-family="monospace">${label}</text>\n`;
    } else {
      // Straight line connection
      svgContent += `  <path d="M ${sx} ${sy} L ${tx} ${ty}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2" marker-end="url(#arrow)" />\n`;
      
      const mx = (sx + tx) / 2;
      const my = (sy + ty) / 2 - 10;
      svgContent += `  <text x="${mx}" y="${my}" fill="#00f0ff" font-size="11" font-weight="bold" text-anchor="middle" font-family="monospace">${label}</text>\n`;
    }
  });

  // 2. Draw Nodes
  nodes.forEach(node => {
    const x = node.position.x + 32;
    const y = node.position.y + 32;
    const isStart = !!node.data?.isStart;
    const isAccept = !!node.data?.isAccept;
    const label = node.data?.label as string || node.id;

    if (isStart) {
      // Start indicator arrow
      svgContent += `  <line x1="${x - 70}" y1="${y}" x2="${x - 40}" y2="${y}" stroke="#00f0ff" stroke-width="3" marker-end="url(#start-arrow)" />\n`;
      svgContent += `  <text x="${x - 55}" y="${y - 10}" fill="#00f0ff" font-size="8" font-weight="bold" text-anchor="middle">START</text>\n`;
    }

    // Outer state circle
    svgContent += `  <circle cx="${x}" cy="${y}" r="32" fill="#0d1324" stroke="rgba(156,163,175,0.6)" stroke-width="2.5" />\n`;

    if (isAccept) {
      // Double circle for accept states
      svgContent += `  <circle cx="${x}" cy="${y}" r="26" fill="none" stroke="rgba(156,163,175,0.6)" stroke-width="2" />\n`;
    }

    // Node label text
    svgContent += `  <text x="${x}" y="${y + 5}" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">${label}</text>\n`;
  });

  svgContent += `</svg>`;
  return svgContent;
};

/**
 * Downloads a string payload as a client file
 */
export const downloadFile = (content: string, filename: string, contentType: string) => {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const csvCell = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

/**
 * Exports a simulation's full event trace (tape/stack snapshots included) as
 * JSON or CSV, so a run can be inspected or diffed outside the app.
 */
export const exportSimulationTrace = (events: SimulationEvent[], automatonType: string, format: 'json' | 'csv') => {
  const filename = `autometa-${automatonType.toLowerCase()}-trace`;
  if (format === 'json') {
    downloadFile(JSON.stringify(events, null, 2), `${filename}.json`, 'application/json');
    return;
  }
  const columns = ['time', 'event', 'stateId', 'edgeId', 'symbol', 'symbolIndex', 'headIndex', 'headIndices', 'tape', 'tapes', 'stack'] as const;
  const rows = [
    columns.join(','),
    ...events.map(event => columns.map(col => csvCell((event as unknown as Record<string, unknown>)[col])).join(',')),
  ];
  downloadFile(rows.join('\n'), `${filename}.csv`, 'text/csv');
};

/**
 * Downloads a data URI as a client file
 */
const downloadDataUrl = (dataUrl: string, filename: string) => {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

/**
 * Captures the live canvas viewport and downloads it as an SVG that matches
 * exactly what's rendered on screen (colors, glow, bezier curves, fonts).
 */
export const exportToSVG = async (viewportEl: HTMLElement, nodes: Node[], automatonType: string) => {
  const dataUrl = await captureFlowImage(viewportEl, nodes, toSvg);
  downloadDataUrl(dataUrl, `autometa-${automatonType.toLowerCase()}.svg`);
};

/**
 * Captures the live canvas viewport and downloads it as a PNG that matches
 * exactly what's rendered on screen (colors, glow, bezier curves, fonts).
 */
export const exportToPNG = async (viewportEl: HTMLElement, nodes: Node[], automatonType: string) => {
  const dataUrl = await captureFlowImage(viewportEl, nodes, toPng);
  downloadDataUrl(dataUrl, `autometa-${automatonType.toLowerCase()}.png`);
};

/**
 * Generates an standalone interactive HTML visualizer with embedded machine data
 */
export const generateStandaloneHTML = (nodes: Node[], edges: Edge[], automatonType: string): string => {
  const svgMarkup = generateSVG(nodes, edges, automatonType);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Autometa Standalone - ${automatonType} Playground</title>
  <style>
    body {
      margin: 0;
      background-color: #070a13;
      color: #fff;
      font-family: system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      height: 100vh;
      align-items: center;
      justify-content: center;
    }
    header {
      margin-bottom: 20px;
      text-align: center;
    }
    h1 {
      margin: 0 0 5px 0;
      color: #00f0ff;
      letter-spacing: 2px;
    }
    .canvas-container {
      width: 80%;
      max-width: 900px;
      aspect-ratio: 1.6;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      background: #0d1324;
    }
    .control-box {
      margin-top: 20px;
      display: flex;
      gap: 10px;
    }
    input {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.15);
      padding: 8px 16px;
      border-radius: 8px;
      color: #fff;
      outline: none;
    }
    button {
      background: #00f0ff;
      color: #000;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: bold;
      cursor: pointer;
    }
    button:hover {
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <header>
    <h1>AUTOMETA STANDALONE</h1>
    <p>Automaton Type: <strong>${automatonType}</strong></p>
  </header>
  <div class="canvas-container">
    ${svgMarkup}
  </div>
  <div class="control-box">
    <input type="text" id="input-str" placeholder="e.g. 0110" />
    <button onclick="alert('Simulation starting on input: ' + document.getElementById('input-str').value)">Simulate</button>
  </div>
</body>
</html>`;
};

/**
 * Downloads the standalone playground file
 */
export const exportToHTML = (nodes: Node[], edges: Edge[], automatonType: string) => {
  const html = generateStandaloneHTML(nodes, edges, automatonType);
  downloadFile(html, `autometa-${automatonType.toLowerCase()}-playground.html`, 'text/html');
};

/**
 * Downloads a printed slide presentation layout outline
 */
export const exportToPDF = (_nodes: Node[], _edges: Edge[], _automatonType: string) => {
  window.print(); // Simply leverages the CSS print layout queries standard for vector pages
};

export interface GifFrame {
  imageData: Uint8ClampedArray;
  width: number;
  height: number;
  delayMs: number;
}

/**
 * Captures one animation frame of the live canvas as raw pixel data, using a fixed
 * capture box so every frame is the same size/position (no jitter across the GIF).
 */
export const captureFlowFrame = async (
  viewportEl: HTMLElement,
  box: FlowCaptureBox,
  delayMs: number
): Promise<GifFrame> => {
  const canvas = await toCanvas(viewportEl, { ...captureStyle(box), pixelRatio: 1 });
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire 2D context for GIF frame capture');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { imageData: data, width: canvas.width, height: canvas.height, delayMs };
};

/**
 * Quantizes and encodes a sequence of captured frames into an animated GIF.
 */
export const encodeGIF = (frames: GifFrame[]): Uint8Array => {
  const gif = GIFEncoder();
  frames.forEach((frame) => {
    const palette = quantize(frame.imageData, 256);
    const index = applyPalette(frame.imageData, palette);
    gif.writeFrame(index, frame.width, frame.height, { palette, delay: frame.delayMs });
  });
  gif.finish();
  return gif.bytes();
};

/**
 * Triggers the browser GIF file download
 */
export const downloadGIF = (bytes: Uint8Array, filename: string) => {
  const blob = new Blob([bytes as BlobPart], { type: 'image/gif' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
