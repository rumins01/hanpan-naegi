// 탑 쌓기: 좌우로 오가는 블록을 탭해서 내려놓기. 어긋난 만큼 잘리고, 완전히 빗나가면 끝.
// 완벽 연속이면 블록이 다시 커집니다.
import { rng, range } from '../core/rng.js';
import { theme, background, hsl, slab } from '../core/draw.js';

export const RULES = Object.freeze({ width: 10, base: 6, tol: 0.16, grow: 0.5, growFrom: 4, speed0: 6.5, speedPer: 0.12, speedMax: 14 });

function speedFor(s) {
  return Math.min(RULES.speedMax, RULES.speed0 + s.score * RULES.speedPer) * s.jitter[s.score % s.jitter.length];
}

function spawn(s) {
  const top = s.layers[s.layers.length - 1];
  s.moving = { w: top.r - top.l, from: s.score % 2 === 0 ? -1 : 1, t0: s.t };
}

export function movingLeft(s) {
  const m = s.moving;
  const min = -m.w * 0.9;
  const max = RULES.width - m.w * 0.1;
  const D = max - min;
  const d = (speedFor(s) * (s.t - m.t0)) % (2 * D);
  const p = d < D ? d : 2 * D - d;
  return m.from < 0 ? min + p : max - p;
}

function create(seed, lives = 1) {
  const r = rng(seed);
  const s = {
    seed, score: 0, combo: 0, lives, over: false, t: 0, events: [],
    hue: Math.floor(range(r, 0, 360)),
    jitter: Array.from({ length: 64 }, () => range(r, 0.9, 1.12)),
    layers: [{ l: (RULES.width - RULES.base) / 2, r: (RULES.width + RULES.base) / 2 }],
    moving: null, wait: 0,
  };
  spawn(s);
  return s;
}

function input(s, ev) {
  if (ev.type !== 'down' || s.over || !s.moving || s.wait > 0) return;
  const top = s.layers[s.layers.length - 1];
  const w = s.moving.w;
  let l = movingLeft(s);
  const y = s.layers.length;
  if (Math.abs(l - top.l) <= RULES.tol) {
    l = top.l;
    s.combo += 1;
    let nl = l; let nr = l + w;
    if (s.combo >= RULES.growFrom && nr - nl < RULES.base) {
      nl = Math.max(0, nl - RULES.grow / 2);
      nr = Math.min(RULES.width, nr + RULES.grow / 2);
    }
    s.layers.push({ l: nl, r: nr });
    s.score += 1;
    s.events.push({ type: 'score', perfect: true, combo: s.combo, y, l: nl, r: nr, grew: nr - nl > w + 1e-9 });
    spawn(s);
    return;
  }
  const nl = Math.max(l, top.l);
  const nr = Math.min(l + w, top.r);
  if (nr - nl <= 0) {
    s.combo = 0;
    s.lives -= 1;
    s.events.push({ type: 'fail', y, l, r: l + w });
    if (s.lives <= 0) { s.over = true; s.moving = null; s.events.push({ type: 'over' }); return; }
    s.wait = 0.45;
    s.moving = null;
    return;
  }
  s.combo = 0;
  const cut = l < top.l ? { l, r: top.l } : { l: top.r, r: l + w };
  s.layers.push({ l: nl, r: nr });
  s.score += 1;
  s.events.push({ type: 'score', perfect: false, combo: 0, y, l: nl, r: nr, cut });
  spawn(s);
}

function step(s, dt) {
  if (s.over) return;
  s.t += dt;
  if (s.wait > 0) {
    s.wait -= dt;
    if (s.wait <= 0) { s.wait = 0; spawn(s); }
  }
}

function revive(s) {
  s.over = false; s.lives = 1; s.combo = 0; s.moving = null; s.wait = 0.45;
}

function bot(s) {
  if (!s.moving || s.wait > 0) return null;
  const top = s.layers[s.layers.length - 1];
  return Math.abs(movingLeft(s) - top.l) <= RULES.tol * 0.5 ? { type: 'down', x: 0.5, y: 0.5 } : null;
}


const colorOf = (s, i) => hsl(s.hue + i * 8, 62, 66);

function draw(ctx, s, v) {
  const { W, H } = v;
  background(ctx, W, H, theme(s.hue + s.layers.length * 4));
  const u = W / (RULES.width + 2);
  const lh = Math.min(u * 0.8, H / 16);
  const target = Math.max(0, s.layers.length - 6);
  v.cam = v.cam == null ? target : v.cam + (target - v.cam) * Math.min(1, v.dt * 8);
  const baseY = H * 0.78;
  const X = (x) => u + x * u;
  const Y = (layer) => baseY - (layer - v.cam) * lh;
  v.layout = { X, Y, u, lh };
  // 받침 기둥(바닥까지)
  const b0 = s.layers[0];
  ctx.fillStyle = hsl(s.hue - 6, 38, 52);
  ctx.fillRect(X(b0.l), Y(0) + lh, (b0.r - b0.l) * u, H);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(X(b0.l) + (b0.r - b0.l) * u * 0.62, Y(0) + lh, (b0.r - b0.l) * u * 0.38, H);
  const first = Math.max(0, Math.floor(v.cam) - 2);
  for (let i = first; i < s.layers.length; i++) {
    const L = s.layers[i];
    const y = Y(i);
    if (y > H + lh) continue;
    slab(ctx, X(L.l), y, (L.r - L.l) * u, lh, colorOf(s, i), { radius: 2 });
  }
  if (s.moving && !s.over) {
    const l = movingLeft(s);
    const i = s.layers.length;
    slab(ctx, X(l), Y(i), s.moving.w * u, lh, colorOf(s, i), { radius: 2 });
  }
}

function onEvent(ev, s, v) {
  const L = v.layout;
  if (!L) return;
  if (ev.type === 'score') {
    const y = L.Y(ev.y);
    const cx = L.X((ev.l + ev.r) / 2);
    if (ev.perfect) {
      v.fx.ring(cx, y + L.lh / 2, '#ffffff', 10, (ev.r - ev.l) * L.u * 0.75, 0.4);
      v.fx.burst(cx, y, { n: 8 + Math.min(ev.combo, 8) * 2, speed: 200, size: 2.5, gravity: 120, shape: 'square' });
      if (ev.combo >= 2) v.fx.text(cx, y - 34, ev.grew ? `완벽 ×${ev.combo}  커짐` : `완벽 ×${ev.combo}`, { size: 22 });
    } else if (ev.cut) {
      v.fx.chunk(L.X(ev.cut.l), y, (ev.cut.r - ev.cut.l) * L.u, L.lh, colorOf(s, ev.y), ev.cut.l < ev.l ? -60 : 60);
    }
  }
  if (ev.type === 'fail') v.fx.chunk(L.X(ev.l), L.Y(ev.y), (ev.r - ev.l) * L.u, L.lh, colorOf(s, ev.y), 0);
}

export default {
  id: 'stack',
  title: '탑 쌓기',
  rule: '움직이는 블록을 탭해서 쌓기. 어긋난 만큼 잘려요. 딱 맞추면 다시 커져요.',
  control: '탭',
  accent: '#3f7a8c',
  focus: 0.62,
  unit: '층',
  create, input, step, draw, onEvent, bot, revive,
};
