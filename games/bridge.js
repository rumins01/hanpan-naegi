// 다리 놓기: 꾹 누르면 막대가 자라고, 떼면 넘어져 다리가 됩니다. 다음 기둥에 닿으면 건너요.
// 참고작: Stick Hero(Ketchapp, 구글플레이 1,000만+). 기둥 가운데 빨간 점에 맞추면 2점.
import { rng, range } from '../core/rng.js';
import { INK, MUTE, RED, paper, line, stickman } from '../core/draw.js';

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

function draw(ctx, s, v) {
  const { W, H } = v;
  paper(ctx, W, H);
  const u = W / 6.5;
  const camTarget = curP(s).x + curP(s).w - 1.3;
  v.cam = v.cam == null ? camTarget : v.cam + (camTarget - v.cam) * Math.min(1, v.dt * 9);
  const gy = H * 0.62;
  const X = (x) => (x - v.cam) * u;
  const Y = (y) => gy - y * u;
  v.layout = { X, Y, u };
  // 먼 언덕(느리게 따라오는 배경)
  ctx.fillStyle = 'rgba(28,26,23,0.06)';
  const span = W * 0.9;
  const shift = ((v.cam * u * 0.25) % span + span) % span;
  for (let i = -1; i < 3; i++) {
    const cx = i * span - shift + span * 0.5;
    ctx.beginPath();
    ctx.ellipse(cx, gy, span * 0.55, H * 0.16, 0, Math.PI, 0);
    ctx.fill();
  }
  for (let i = Math.max(0, s.cur - 1); i < s.pillars.length; i++) {
    const p = s.pillars[i];
    const x = X(p.x);
    if (x > W || x + p.w * u < 0) continue;
    ctx.fillStyle = INK;
    ctx.fillRect(x, gy, p.w * u, H - gy);
    if (i > s.cur || (i === s.cur + 1)) {
      ctx.fillStyle = RED;
      ctx.fillRect(X(p.x + p.w / 2 - RULES.perfect), gy, RULES.perfect * 2 * u, Math.max(4, u * 0.08));
    }
  }
  // 막대
  if (s.phase !== 'ready' || s.len > 0) {
    const bx = X(base(s));
    const a = (-Math.PI / 2) * (1 - (s.phase === 'grow' ? 0 : s.angle));
    const fallA = s.phase === 'fall' ? Math.min(Math.PI / 2, s.timer * 5) : 0;
    const ang = a + fallA;
    line(ctx, [[bx, gy], [bx + Math.cos(ang) * s.len * u, gy + Math.sin(ang) * s.len * u]], Math.max(3, u * 0.07), '#8a5a2b');
  }
  const pose = s.phase === 'walk' ? 'run' : s.phase === 'fall' ? 'fall' : 'stand';
  stickman(ctx, X(s.heroX), Y(s.heroY), u * 0.85, { pose, t: s.t, color: s.phase === 'fall' ? RED : INK });
  if (s.phase === 'grow' && !v.thumb) {
    ctx.fillStyle = MUTE;
    ctx.font = `700 13px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('떼면 넘어져요', X(base(s)), gy + 22);
  }
}

function onEvent(ev, s, v) {
  const L = v.layout;
  if (!L) return;
  if (ev.type === 'score') {
    const x = L.X(ev.x);
    const y = L.Y(0);
    if (ev.perfect) {
      v.fx.ring(x, y, RED, 6, 50, 0.35);
      v.fx.text(x, y - 60, ev.combo >= 2 ? `완벽 +2 ×${ev.combo}` : '완벽 +2', { color: RED, size: 22 });
    }
    v.fx.burst(x, y, { n: 6, color: MUTE, speed: 120, spread: Math.PI, size: 2.5 });
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
