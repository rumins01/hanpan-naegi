// 화살 꽂기: 탭하면 화살이 날아가 회전하는 과녁에 꽂혀요. 이미 꽂힌 화살에 닿으면 실패.
// 정해진 개수를 다 꽂으면 과녁이 깨지고 다음 단계. 참고작: Knife Hit(Ketchapp, 구글플레이 1억+).
import { rng, range } from '../core/rng.js';
import { INK, MUTE, RED, paper, line, circle } from '../core/draw.js';

export const RULES = Object.freeze({ flight: 0.11, gap: 0.13, ease: 0.35, clearDelay: 0.7 });
const TAU = Math.PI * 2;
const norm = (a) => ((a % TAU) + TAU) % TAU;
const diff = (a, b) => { const d = norm(a - b); return Math.min(d, TAU - d); };

function makeStage(s) {
  const k = s.stage;
  const r = s.r;
  const need = 6 + Math.min(k, 3);
  const pre = Math.min(k, 3);
  const stuck = [];
  for (let i = 0; i < pre; i++) {
    let a; let tries = 0;
    do { a = range(r, 0, TAU); tries++; } while (stuck.some((b) => diff(a, b.a) < 0.6) && tries < 20);
    stuck.push({ a, pre: true });
  }
  const segs = [];
  const base = 1.9 + Math.min(k, 8) * 0.22;
  let total = 0;
  for (let i = 0; i < 24; i++) {
    const dur = range(r, 0.7, 2.0);
    let w = base * range(r, 0.6, 1.25);
    if (k >= 1 && r() < 0.35) w = -w;
    if (k >= 3 && r() < 0.2) w *= 1.7;
    segs.push({ start: total, dur, w });
    total += dur;
  }
  if (k === 0) segs.forEach((g) => { g.w = Math.abs(g.w); });
  s.st = { need, got: 0, stuck, segs, total, t: 0, angle: 0, w: segs[0].w };
}

export function omega(st) {
  const tt = st.t % st.total;
  let i = st.segs.findIndex((g) => tt < g.start + g.dur);
  if (i < 0) i = st.segs.length - 1;
  const g = st.segs[i];
  const prev = st.segs[(i + st.segs.length - 1) % st.segs.length];
  const k = Math.min(1, (tt - g.start) / RULES.ease);
  return prev.w + (g.w - prev.w) * k;
}

function create(seed, lives = 1) {
  const s = { seed, r: rng(seed), score: 0, combo: 0, lives, over: false, t: 0, events: [], stage: 0, flying: null, clearT: 0 };
  makeStage(s);
  return s;
}

function input(s, ev) {
  if (ev.type !== 'down' || s.over || s.flying || s.clearT > 0) return;
  s.flying = { t: 0 };
  s.events.push({ type: 'whoosh' });
}

function impact(s) {
  const st = s.st;
  const rel = norm(Math.PI / 2 - st.angle);
  s.flying = null;
  if (st.stuck.some((b) => diff(rel, b.a) < RULES.gap)) {
    s.lives -= 1;
    s.combo = 0;
    s.events.push({ type: 'fail', a: rel });
    if (s.lives <= 0) { s.over = true; s.events.push({ type: 'over' }); }
    return;
  }
  st.stuck.push({ a: rel, pre: false });
  st.got += 1;
  s.score += 1;
  s.combo += 1;
  s.events.push({ type: 'score', perfect: false, combo: Math.min(s.combo, 10), quiet: false });
  if (st.got >= st.need) {
    s.clearT = RULES.clearDelay;
    s.events.push({ type: 'stage', stage: s.stage + 1 });
  }
}

function step(s, dt) {
  if (s.over) return;
  s.t += dt;
  const st = s.st;
  if (s.clearT > 0) {
    s.clearT -= dt;
    if (s.clearT <= 0) { s.clearT = 0; s.stage += 1; makeStage(s); }
    return;
  }
  st.t += dt;
  st.w = omega(st);
  st.angle = norm(st.angle + st.w * dt);
  if (s.flying) {
    s.flying.t += dt;
    if (s.flying.t >= RULES.flight) impact(s);
  }
}

function bot(s) {
  if (s.flying || s.clearT > 0) return null;
  const st = s.st;
  // 비행 중 회전 변화까지 그대로 따라 계산합니다.
  const sim = { ...st };
  let future = st.angle;
  for (let i = 0; i < Math.round(RULES.flight * 240); i++) { sim.t += 1 / 240; future += omega(sim) / 240; }
  future = norm(future);
  const rel = norm(Math.PI / 2 - future);
  return st.stuck.every((b) => diff(rel, b.a) > RULES.gap * 1.4) ? { type: 'down', x: 0.5, y: 0.5 } : null;
}

function drawArrow(ctx, x, y, ang, len, w) {
  const tx = x + Math.cos(ang) * len;
  const ty = y + Math.sin(ang) * len;
  line(ctx, [[x, y], [tx, ty]], w, INK);
  const fx = Math.cos(ang); const fy = Math.sin(ang);
  const px = -fy; const py = fx;
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(tx - fx * len * 0.02, ty - fy * len * 0.02);
  ctx.lineTo(tx - fx * len * 0.22 + px * w * 2.2, ty - fy * len * 0.22 + py * w * 2.2);
  ctx.lineTo(tx - fx * len * 0.16, ty - fy * len * 0.16);
  ctx.lineTo(tx - fx * len * 0.22 - px * w * 2.2, ty - fy * len * 0.22 - py * w * 2.2);
  ctx.closePath();
  ctx.fill();
}

function draw(ctx, s, v) {
  const { W, H } = v;
  paper(ctx, W, H, '#f2ede6');
  const st = s.st;
  const R = Math.min(W * 0.24, H * 0.15);
  const cx = W / 2;
  const cy = H * 0.34;
  const len = R * 1.25;
  const aw = Math.max(2.5, R * 0.035);
  v.layout = { cx, cy, R, len };
  const breaking = s.clearT > 0;
  if (!breaking) {
    for (const b of st.stuck) {
      const a = b.a + st.angle;
      drawArrow(ctx, cx + Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len), a + Math.PI, len, aw);
    }
    circle(ctx, cx, cy, R, { fill: '#e8d3a8', stroke: INK, width: 3 });
    for (let i = 1; i <= 3; i++) circle(ctx, cx, cy, (R * i) / 4, { fill: i === 1 ? RED : null, stroke: 'rgba(28,26,23,0.35)', width: 2 });
    ctx.strokeStyle = 'rgba(28,26,23,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = st.angle + (i * TAU) / 3;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3); ctx.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95); ctx.stroke();
    }
  }
  // 날아가는 화살 / 대기 중인 화살
  const restY = H * 0.82;
  if (!s.over && !breaking) {
    const k = s.flying ? s.flying.t / RULES.flight : 0;
    const tipY = restY - len + k * (cy + R - (restY - len));
    drawArrow(ctx, cx, tipY + len, -Math.PI / 2, len, aw);
  }
  if (v.thumb) return;
  // 남은 화살 표시
  const left = st.need - st.got;
  for (let i = 0; i < st.need; i++) {
    const y = H * 0.9 - i * 16;
    ctx.fillStyle = i < left ? INK : 'rgba(28,26,23,0.18)';
    ctx.fillRect(24, y, 18, 4);
  }
  // 단계 점
  ctx.textAlign = 'center';
  ctx.fillStyle = MUTE;
  ctx.font = '700 13px system-ui';
  ctx.fillText(`${s.stage + 1}단계`, cx, cy + R + len + 34);
  if (breaking) {
    ctx.fillStyle = INK;
    ctx.font = '800 26px system-ui';
    ctx.fillText('과녁 격파!', cx, cy);
  }
}

function onEvent(ev, s, v) {
  const L = v.layout;
  if (!L) return;
  if (ev.type === 'score') {
    v.fx.burst(L.cx, L.cy + L.R, { n: 6, color: '#b58a4a', speed: 160, angle: Math.PI / 2, spread: Math.PI * 0.9, size: 2.5 });
    v.fx.shake(2.5, 0.08);
  }
  if (ev.type === 'stage') {
    v.fx.burst(L.cx, L.cy, { n: 26, color: '#c9a36a', speed: 380, size: 5, shape: 'square', gravity: 900 });
    v.fx.ring(L.cx, L.cy, INK, L.R * 0.6, L.R * 1.8, 0.4);
  }
  if (ev.type === 'fail') {
    v.fx.chunk(L.cx - 2, L.cy + L.R + 6, 4, L.len, INK, (Math.random() - 0.5) * 300);
  }
}

export default {
  id: 'arrow',
  title: '화살 꽂기',
  rule: '탭하면 화살이 날아가요. 이미 꽂힌 화살에 닿지 않게 과녁에 꽂으세요.',
  control: '탭',
  ref: 'Knife Hit',
  accent: '#b58a4a',
  focus: 0.42,
  unit: '개',
  create, input, step, draw, onEvent, bot,
};
