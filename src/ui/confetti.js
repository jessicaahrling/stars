// A little celebration: confetti falling over the screen for a few seconds, when a step of
// the sky has been learnt in full (or a practice round gone through without a miss). It
// sits above everything, takes no taps, and removes itself. With reduced motion asked for,
// there is none: the words in the panel say it.

const COLORS = ['#ffdc32', '#ef7674', '#06d6a0', '#74b9ff', '#b39ddb', '#f4a261', '#8ce99a', '#ffffff'];
const SECONDS = 3.4;

/**
 * @param {Document} doc
 * @param {{big?: boolean}} [options]  big: more of it, for the last milestone
 */
export function celebrate(doc = document, { big = false } = {}) {
  const win = doc.defaultView;
  if (!win || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  doc.querySelector('canvas.confetti')?.remove();
  const canvas = doc.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '30' });
  doc.body.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }
  const dpr = Math.min(2, win.devicePixelRatio || 1);
  const w = win.innerWidth;
  const h = win.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  // Two bursts from the lower corners, thrown up and in, then falling and fluttering.
  const pieces = Array.from({ length: big ? 240 : 140 }, (_, k) => {
    const left = k % 2 === 0;
    const angle = (left ? -1 : -2.14) + (Math.random() - 0.5) * 0.7;
    const speed = (0.55 + Math.random() * 0.6) * Math.max(h, 500) * 1.6;
    return {
      x: left ? -10 : w + 10, y: h * (0.75 + Math.random() * 0.2),
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 7, spin: (Math.random() - 0.5) * 14, turn: Math.random() * Math.PI,
      flutter: Math.random() * Math.PI * 2, color: COLORS[k % COLORS.length], round: k % 5 === 0,
    };
  });
  let last = null;
  let age = 0;
  const frame = (t) => {
    if (!canvas.isConnected) return;
    const dt = last === null ? 0 : Math.min(0.05, (t - last) / 1000);
    last = t;
    age += dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, Math.min(1, (SECONDS - age) / 0.8));
    for (const p of pieces) {
      p.vy += 900 * dt;
      p.vx *= 1 - 1.6 * dt;
      p.vy *= 1 - 1.2 * dt;
      p.x += (p.vx + Math.sin(age * 6 + p.flutter) * 40) * dt;
      p.y += p.vy * dt;
      p.turn += p.spin * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.turn);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, (p.size / 2) * Math.abs(Math.cos(p.turn * 1.7)) + 1);
      }
      ctx.restore();
    }
    if (age < SECONDS) win.requestAnimationFrame(frame);
    else canvas.remove();
  };
  win.requestAnimationFrame(frame);
}
