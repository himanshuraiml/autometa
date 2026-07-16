// jsdom doesn't implement ResizeObserver, which @xyflow/react's internal
// hooks reference even when a component is rendered outside a full
// <ReactFlow> tree (e.g. testing a custom node/edge component in isolation).
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}
