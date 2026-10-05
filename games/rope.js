// 줄넘기: 줄이 발밑을 지날 때 공중에 있으면 1개. 참고작: 침착한 줄넘기(방치된 인기작).
// v1 도전장과 같은 판이 나오도록 줄 속도 생성 방식은 바꾸지 않습니다.
import { rng } from '../core/rng.js';
import { ACCENT, theme, background, figure, shadow } from '../core/draw.js';

export const PHYS = Object.freeze({ airtime: 0.40, peak: 1.0, clear: 0.18, perfect: 0.72, buffer: 0.09 });
const G = (8 * PHYS.peak) / PHYS.airtime ** 2;
const V0 = (G * PHYS.airtime) / 2;
export const SPEED = Object.freeze({ start: 0.8, top: 1.55, rampTo: 80, slow: 0.55, fast: 1.3 });

export function makePattern(seed, length = 600) {
  const next = rng(seed);
  const out = [];
  let mode = 'normal';
  let left = 0;
  for (let n = 0; n < length; n++) {
    const base = SPEED.start + (Math.min(n, SPEED.rampTo) / SPEED.rampTo) * (SPEED.top - SPEED.start);
    if (left <= 0) {
      mode = 'normal';
      const chance = n < 5 ? 0 : Math.min(0.12 + n * 0.004, 0.32);
      if (next() < chance) {
        if (next() < 0.5) { mode = 'slow'; left = 2 + Math.floor(next() * 3); }
        else { mode = 'fast'; left = 1 + Math.floor(next() * 3); }
      }
    }
    const mult = mode === 'slow' ? SPEED.slow : mode === 'fast' ? SPEED.fast : 1;
    out.push(Math.round(base * mult * 10000) / 10000);
    if (left > 0) left -= 1;
  }
  return out;
}

export function speedAt(s) {
  const m = Math.floor(s.phase + 0.5);
  return s.pattern[Math.min(Math.max(m - 1, 0), s.pattern.length - 1)];
}

function create(seed, lives = 1) {
  return {
    seed: seed >>> 0, pattern: makePattern(seed), phase: 0.5, y: 0, vy: 0, airborne: false,
    score: 0, combo: 0, lives, over: false, t: 0, buffered: false, landT: -1, hitT: -1, events: [],
  };
}

function doJump(s) {
  s.airborne = true;
  s.vy = V0;
  s.events.push({ type: 'jump' });
}

function input(s, ev) {
  if (ev.type !== 'down' || s.over) return;
  if (!s.airborne) { doJump(s); return; }
  // 착지 직전에 누른 탭은 기억했다가 착지하자마자 뜁니다(미리 입력).
  const tLeft = (s.vy + Math.sqrt(s.vy * s.vy + 2 * G * s.y)) / G;
  if (tLeft <= PHYS.buffer) s.buffered = true;
}

function step(s, dt) {
  if (s.over) return;
  s.t += dt;
  if (s.airborne) {
    s.y += s.vy * dt - (G * dt * dt) / 2;
    s.vy -= G * dt;
    if (s.y <= 0) {
      s.y = 0; s.vy = 0; s.airborne = false; s.landT = s.t;
      if (s.buffered) { s.buffered = false; doJump(s); }
    }
  }
  const prev = s.phase;
  const next = prev + speedAt(s) * dt;
  if (Math.floor(next) > Math.floor(prev)) {
    if (s.y >= PHYS.clear) {
      s.score += 1;
      const perfect = s.y >= PHYS.perfect;
      s.combo = perfect ? s.combo + 1 : 0;
      s.events.push({ type: 'score', perfect, combo: s.combo });
    } else {
      s.lives -= 1;
      s.combo = 0;
      s.hitT = s.t;
      s.events.push({ type: 'fail' });
      if (s.lives <= 0) { s.over = true; s.events.push({ type: 'over' }); }
    }
  }
  s.phase = next;
}

// 줄이 바닥에 닿기 직전(체공 시간의 절반 전)에 뛰는 봇. 테스트와 검수용.
function bot(s) {
  if (s.airborne) return null;
  const toBottom = (Math.ceil(s.phase) - s.phase) / speedAt(s);
  return toBottom <= PHYS.airtime / 2 ? { type: 'down', x: 0.5, y: 0.5 } : null;
}

const ROPE = { handX: 1.4, handY: 0.95, radius: 1.0 };
const TH = theme(205);

function draw(ctx, s, v) {
  const { W, H } = v;
  background(ctx, W, H, TH);
  const u = Math.min(W / 4.2, H / 3.6);
  const gy = H * 0.7;
  const X = (x) => W / 2 + x * u;
  const Y = (y) => gy - y * u;
  v.layout = { X, Y, u };
  ctx.fillStyle = TH.far;
  ctx.beginPath(); ctx.ellipse(W * 0.15, gy, W * 0.55, H * 0.13, 0, Math.PI, 0); ctx.fill();
  ctx.beginPath(); ctx.ellipse(W * 0.95, gy, W * 0.5, H * 0.09, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = TH.ground;
  ctx.fillRect(0, gy, W, H - gy);
  ctx.fillStyle = TH.groundDark;
  ctx.fillRect(0, gy, W, 4);

  const a = 2 * Math.PI * s.phase;
  const mid = ROPE.handY - ROPE.radius * Math.cos(a);
  const front = Math.sin(a) < 0;
  const hand = (side) => ({ x: side * ROPE.handX + side * 0.05 * Math.sin(a), y: ROPE.handY - 0.07 * Math.cos(a) });
  const L = hand(-1);
  const R = hand(1);
  const holder = (side, hd) => {
    const x = side * 1.78;
    shadow(ctx, X(x), gy + 2, u * 0.26, u * 0.05, 0.1);
    figure(ctx, X(x), Y(0), u * 1.3, { pose: 'stand', color: TH.mid, facing: -side, band: TH.mid, t: s.t });
    ctx.strokeStyle = TH.mid; ctx.lineWidth = u * 0.1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(X(x), Y(0.86)); ctx.lineTo(X(hd.x), Y(hd.y)); ctx.stroke();
  };
  const rope = (isFront) => {
    ctx.globalAlpha = isFront ? 1 : 0.4;
    ctx.strokeStyle = ACCENT;
    ctx.lineCap = 'round';
    ctx.lineWidth = u * (isFront ? 0.055 : 0.035);
    ctx.beginPath();
    ctx.moveTo(X(L.x), Y(L.y));
    ctx.quadraticCurveTo(X(0), Y(2 * mid - (L.y + R.y) / 2), X(R.x), Y(R.y));
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  holder(-1, L);
  holder(1, R);
  if (!front) rope(false);
  const sw = 0.3 * (1 - Math.min(s.y, 1) * 0.45);
  shadow(ctx, X(0), gy + 2, sw * u, sw * u * 0.2);
  const sinceLand = s.t - s.landT;
  const squash = s.airborne ? 1 + Math.min(0.12, Math.abs(s.vy) * 0.012) : sinceLand < 0.1 ? 0.85 + sinceLand * 1.5 : 1;
  const hurt = s.hitT >= 0 && s.t - s.hitT < 0.45;
  ctx.save();
  if (hurt) { ctx.translate(X(0), Y(s.y)); ctx.rotate(Math.sin((s.t - s.hitT) * 40) * 0.25); ctx.translate(-X(0), -Y(s.y)); }
  figure(ctx, X(0), Y(s.y), u * 1.4, { pose: hurt ? 'fall' : s.airborne ? 'jump' : 'stand', color: hurt ? ACCENT : TH.ink, squash, t: s.t });
  ctx.restore();
  if (front) rope(true);
}

function onEvent(ev, s, v) {
  const L = v.layout;
  if (!L) return;
  if (ev.type === 'score') {
    v.fx.burst(L.X(0), L.Y(0), { n: ev.perfect ? 10 : 5, speed: 150, spread: Math.PI, angle: -Math.PI / 2, size: 2.5, gravity: 500, shape: 'square' });
    if (ev.perfect && ev.combo >= 2) v.fx.text(L.X(0), L.Y(2.15), `완벽 ×${ev.combo}`, { size: 22 });
  }
  if (ev.type === 'fail') v.fx.burst(L.X(0), L.Y(0.3), { n: 14, color: ACCENT, speed: 260, size: 3 });
}

export default {
  id: 'rope',
  title: '줄넘기',
  rule: '줄이 발밑에 올 때 탭해서 점프. 줄 속도가 갑자기 바뀌어요.',
  control: '탭',
  ref: '침착한 줄넘기',
  accent: ACCENT,
  focus: 0.6,
  unit: '개',
  create, input, step, draw, onEvent, bot,
};
