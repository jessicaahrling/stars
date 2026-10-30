// Pointer, wheel and keyboard gestures on the sky. Turns raw events into calls on
// a small handler interface so the app stays free of event bookkeeping.

const TAP_SLOP = 6; // px a pointer may move and still count as a tap
const TAP_MS = 500;

/**
 * @param {HTMLElement} el  element receiving the gestures
 * @param {object} h
 * @param {(dx: number, dy: number) => void} h.pan        drag by CSS px
 * @param {(factor: number, x: number, y: number) => void} h.zoom  fov *= factor around a point
 * @param {(x: number, y: number, again: boolean) => void} h.tap  again: the second click of a double click
 * @param {(x: number, y: number) => void} h.hover       mouse moved without buttons
 * @param {() => void} h.leave
 * @param {(vx: number, vy: number) => void} h.fling     release velocity in px/ms
 * @param {() => void} h.grab                          a gesture started
 */
export function attachSkyInput(el, h) {
  const pointers = new Map();
  let start = null;
  let dragging = false;
  let pinchDist = 0;
  let mid = null;
  let samples = [];
  // Clicks in a row as the system counts them (the mouse's own double-click time).
  let clicks = 0;
  let touchTapped = false;

  const center = () => {
    const ps = [...pointers.values()];
    return {
      x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
      y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
    };
  };
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const local = (e) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button > 0) return;
    el.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, local(e));
    clicks = 0;
    touchTapped = false;
    h.grab();
    samples = [];
    if (pointers.size === 1) {
      start = { ...local(e), t: performance.now() };
      dragging = false;
    } else {
      start = null;
      dragging = true;
      if (pointers.size === 2) pinchDist = spread();
    }
    mid = center();
  });

  el.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') h.hover(local(e).x, local(e).y);
      return;
    }
    pointers.set(e.pointerId, local(e));
    const c = center();
    if (!dragging && start && Math.hypot(c.x - start.x, c.y - start.y) > TAP_SLOP) dragging = true;
    if (!dragging) return;
    if (pointers.size === 2) {
      const d = spread();
      if (pinchDist > 0 && d > 0) h.zoom(pinchDist / d, c.x, c.y);
      pinchDist = d;
    }
    const dx = c.x - mid.x;
    const dy = c.y - mid.y;
    h.pan(dx, dy);
    const t = performance.now();
    samples.push({ dx, dy, t });
    while (samples.length && t - samples[0].t > 90) samples.shift();
    mid = c;
  });

  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      if (!dragging && start && performance.now() - start.t < TAP_MS) {
        touchTapped = e.pointerType === 'touch';
        h.tap(p.x, p.y, clicks > 1);
      } else if (dragging && samples.length > 1) {
        const span = samples[samples.length - 1].t - samples[0].t || 16;
        const vx = samples.reduce((s, q) => s + q.dx, 0) / span;
        const vy = samples.reduce((s, q) => s + q.dy, 0) / span;
        if (performance.now() - samples[samples.length - 1].t < 60) h.fling(vx, vy);
      }
      start = null;
      dragging = false;
    } else {
      mid = center();
      if (pointers.size === 2) pinchDist = spread();
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('mousedown', (e) => {
    clicks = e.detail;
  });
  // A touch tap ends with a click the browser makes up and sends to whatever is under the
  // finger by then. When the tap has changed the page (the training panel growing under
  // it), that would press a button never touched, so the made-up click is dropped; focus
  // leaves where it was, as the click would have made it.
  el.addEventListener('touchend', (e) => {
    if (!touchTapped || !e.cancelable) return;
    touchTapped = false;
    e.preventDefault();
    el.ownerDocument.activeElement?.blur?.();
  }, { passive: false });
  el.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !pointers.size) h.leave();
  });

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const p = local(e);
    h.grab();
    h.zoom(Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * unit * 0.0015))), p.x, p.y);
  }, { passive: false });
}
