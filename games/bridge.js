// 다리 놓기: 꾹 누르면 막대가 자라고, 떼면 넘어져 다리가 됩니다. 다음 기둥에 닿으면 건너요.
// 참고작: Stick Hero(Ketchapp, 구글플레이 1,000만+). 기둥 가운데 빨간 점에 맞추면 2점.
import { rng, range } from '../core/rng.js';
import { ACCENT, theme, background, figure, label } from '../core/draw.js';

export const RULES = Object.freeze({ grow: 5.2, maxLen: 11, rotate: 0.28, walk: 5.5, perfect: 0.16, fall: 0.6, scroll: 0.35 });

function makePillar(s) {
  const n = s.made;
  const gap = range(s.r, 1.3, 3.2 + Math.min(n, 30) * 0.05);
  const w = range(s.r, Math.max(0.45, 0.9 - n * 0.012), Math.max(0.9, 2.1 - n * 0.04));
  const prev = s.pillars[s.pillars.length - 1];
  s.pillars.push({ x: prev.x + prev.w + gap, w });
  s.made += 1;
}

function create(seed, lives = 1) {
  const s = {
    seed, r: rng(seed), score: 0, combo: 0, lives, over: false, t: 0, events: [],
    pillars: [{ x: 0, w: 1.6 }], made: 0, cur: 0,
    phase: 'ready', len: 0, angle: 0, timer: 0, heroX: 1.6 - 0.2, heroY: 0, outcome: null,
  };
  makePillar(s);
  makePillar(s);
  return s;
}

const next = (s) => s.pillars[s.cur + 1];
const curP = (s) => s.pillars[s.cur];
const base = (s) => curP(s).x + curP(s).w;

function input(s, ev) {
  if (s.over) return;
  if (ev.type === 'down' && s.phase === 'ready') {
    s.phase = 'grow';
    s.len = 0;
    s.events.push({ type: 'grow' });
  } else if (ev.type === 'up' && s.phase === 'grow') {
    release(s);
  }
}

function release(s) {
  s.phase = 'rotate';
  s.timer = 0;
  s.events.push({ type: 'whoosh' });
}

function settle(s) {
  const end = base(s) + s.len;
  const n = next(s);
  if (end >= n.x && end <= n.x + n.w) {
    const perfect = Math.abs(end - (n.x + n.w / 2)) <= RULES.perfect;
    s.outcome = { ok: true, perfect, target: n.x + n.w - 0.2 };
  } else {
    s.outcome = { ok: false, target: end + 0.15 };
  }
  s.phase = 'walk';
  s.events.push({ type: 'thud' });
}

function step(s, dt) {
  if (s.over) return;
  s.t += dt;
  if (s.phase === 'grow') {
    s.len = Math.min(RULES.maxLen, s.len + RULES.grow * dt);
    if (s.len >= RULES.maxLen) release(s);
  } else if (s.phase === 'rotate') {
    s.timer += dt;
    s.angle = Math.min(1, s.timer / RULES.rotate);
    if (s.angle >= 1) settle(s);
  } else if (s.phase === 'walk') {
    s.heroX = Math.min(s.outcome.target, s.heroX + RULES.walk * dt);
    if (s.heroX >= s.outcome.target) {
      if (s.outcome.ok) {
        const gain = s.outcome.perfect ? 2 : 1;
        s.score += gain;
        s.combo = s.outcome.perfect ? s.combo + 1 : 0;
        s.events.push({ type: 'score', perfect: s.outcome.perfect, combo: s.combo, gain, x: next(s).x + next(s).w / 2 });
        s.cur += 1;
        makePillar(s);
        s.phase = 'scroll';
        s.timer = 0;
      } else {
        s.phase = 'fall';
        s.timer = 0;
        s.combo = 0;
        s.lives -= 1;
        s.events.push({ type: 'fail', x: s.heroX });
      }
    }
  } else if (s.phase === 'fall') {
    s.timer += dt;
    s.heroY = -12 * s.timer * s.timer * 2;
    if (s.timer >= RULES.fall) {
      if (s.lives <= 0) { s.over = true; s.events.push({ type: 'over' }); return; }
      s.heroX = base(s) - 0.2; s.heroY = 0; s.len = 0; s.angle = 0; s.phase = 'ready';
    }
  } else if (s.phase === 'scroll') {
    s.timer += dt;
    if (s.timer >= RULES.scroll) { s.len = 0; s.angle = 0; s.phase = 'ready'; }
  }
}

function bot(s) {
  if (s.phase === 'ready') return { type: 'down', x: 0.5, y: 0.5 };
  if (s.phase === 'grow') {
    const n = next(s);
    const want = n.x + n.w / 2 - base(s);
    return s.len + RULES.grow / 240 >= want ? { type: 'up', x: 0.5, y: 0.5 } : null;
  }
  return null;
}

const TH = theme(22);

function draw(ctx, s, v) {
  const { W, H } = v;
  background(ctx, W, H, TH);
  const u = W / 6.5;
  const camTarget = curP(s).x + curP(s).w - 1.3;
  v.cam = v.cam == null ? camTarget : v.cam + (camTarget - v.cam) * Math.min(1, v.dt * 9);
  const gy = H * 0.62;
  const X = (x) => (x - v.cam) * u;
  const Y = (y) => gy - y * u;
  v.layout = { X, Y, u };
  // 먼 언덕 두 겹(느리게 따라옴)
  const hills = (color, k, rx, ry, off) => {
    ctx.fillStyle = color;
    const span = W * 0.95;
    const shift = ((v.cam * u * k + off) % span + span) % span;
    for (let i = -1; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(i * span - shift + span * 0.5, gy + 4, span * rx, H * ry, 0, Math.PI, 0);
      ctx.fill();
    }
  };
  hills(TH.far, 0.15, 0.6, 0.2, 0);
  hills(TH.ground, 0.3, 0.45, 0.12, W * 0.4);
  for (let i = Math.max(0, s.cur - 1); i < s.pillars.length; i++) {
    const p = s.pillars[i];
    const x = X(p.x);
    if (x > W || x + p.w * u < 0) continue;
    ctx.fillStyle = TH.ink;
    ctx.fillRect(x, gy, p.w * u, H - gy);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, gy, p.w * u * 0.3, H - gy);
    if (i > s.cur) {
      ctx.fillStyle = ACCENT;
      ctx.fillRect(X(p.x + p.w / 2 - RULES.perfect), gy, RULES.perfect * 2 * u, Math.max(5, u * 0.09));
    }
  }
  if (s.phase !== 'ready' || s.len > 0) {
    const bx = X(base(s));
    const a = (-Math.PI / 2) * (1 - (s.phase === 'grow' ? 0 : s.angle));
    const fallA = s.phase === 'fall' ? Math.min(Math.PI / 2, s.timer * 5) : 0;
    const ang = a + fallA;
    ctx.strokeStyle = TH.ink;
    ctx.lineWidth = Math.max(4, u * 0.075);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx, gy); ctx.lineTo(bx + Math.cos(ang) * s.len * u, gy + Math.sin(ang) * s.len * u); ctx.stroke();
  }
  const pose = s.phase === 'walk' ? 'run' : s.phase === 'fall' ? 'fall' : 'stand';
  figure(ctx, X(s.heroX), Y(s.heroY), u * 0.9, { pose, t: s.t, color: s.phase === 'fall' ? ACCENT : TH.ink });
  if (s.phase === 'grow' && !v.thumb) label(ctx, '손을 떼면 넘어가요', W / 2, H * 0.82, { size: 15, weight: 600, alpha: 0.9 });
}

function onEvent(ev, s, v) {
  const L = v.layout;
  if (!L) return;
  if (ev.type === 'score') {
    const x = L.X(ev.x);
    const y = L.Y(0);
    if (ev.perfect) {
      v.fx.ring(x, y, '#ffffff', 6, 54, 0.35);
      v.fx.text(x, y - 70, ev.combo >= 2 ? `완벽 +2 ×${ev.combo}` : '완벽 +2', { size: 22 });
    }
    v.fx.burst(x, y, { n: 8, speed: 130, spread: Math.PI, size: 2.5, shape: 'square' });
  }
}

export default {
  id: 'bridge',
  title: '다리 놓기',
  rule: '꾹 눌러 막대를 키우고, 떼서 다리를 놓아요. 빨간 점에 맞추면 2점.',
  control: '꾹 눌렀다 떼기',
  ref: 'Stick Hero',
  accent: '#8a5a2b',
  focus: 0.55,
  unit: '점',
  create, input, step, draw, onEvent, bot,
};
