// 똥 피하기: 화면 왼쪽·오른쪽을 누르고 있으면 그쪽으로 움직여요. 바닥에 떨어진 똥 하나가 1점.
// 떨어지는 순서와 속도는 시드로 정해져 두 사람이 같아요.
import { rng, range, clamp } from '../core/rng.js';
import { ACCENT, WHITE, theme, background, figure, shadow, label } from '../core/draw.js';

export const RULES = Object.freeze({ width: 9, height: 16, speed: 8.5, accel: 60, radius: 0.42, body: 0.32, invuln: 1.3, near: 0.75 });
const PLAYER_Y = RULES.height - 0.7;

function nextSpawn(s) {
  const t = s.spawnT;
  const interval = Math.max(0.13, 0.62 - t * 0.011) * range(s.r, 0.65, 1.35);
  const speed = Math.min(15, 5.5 + t * 0.16) * range(s.r, 0.85, 1.15);
  const x = range(s.r, 0.5, RULES.width - 0.5);
  const big = t > 20 && s.r() < 0.12;
  s.queue.push({ t, x, speed, rad: RULES.radius * (big ? 1.5 : 1) });
  s.spawnT = t + interval;
}

function create(seed, lives = 1) {
  const s = {
    seed, r: rng(seed), score: 0, combo: 0, lives, over: false, t: 0, events: [],
    x: RULES.width / 2, vx: 0, hold: 0, holdL: false, holdR: false,
    spawnT: 0.6, queue: [], drops: [], invuln: 0, hitT: -1, id: 0,
  };
  return s;
}

function input(s, ev) {
  if (ev.type === 'down') { if (ev.x < 0.5) s.holdL = true; else s.holdR = true; s.last = ev.x < 0.5 ? -1 : 1; }
  if (ev.type === 'up') { if (ev.x == null) { s.holdL = false; s.holdR = false; } else if (ev.x < 0.5) s.holdL = false; else s.holdR = false; }
  s.hold = s.holdL && s.holdR ? s.last : s.holdL ? -1 : s.holdR ? 1 : 0;
}

function step(s, dt) {
  if (s.over) return;
  s.t += dt;
  while (s.spawnT <= s.t) nextSpawn(s);
  while (s.queue.length && s.queue[0].t <= s.t) {
    const q = s.queue.shift();
    s.drops.push({ ...q, y: -0.5, id: s.id++, near: false });
  }
  // 이동: 빠르게 가속하고 손을 떼면 바로 멈춥니다(조작이 미끄럽지 않게).
  const target = s.hold * RULES.speed;
  const dv = RULES.accel * dt;
  s.vx = Math.abs(target - s.vx) <= dv ? target : s.vx + Math.sign(target - s.vx) * dv;
  if (s.hold === 0) s.vx = 0;
  s.x = clamp(s.x + s.vx * dt, 0.45, RULES.width - 0.45);
  if (s.invuln > 0) s.invuln -= dt;
  const keep = [];
  for (const d of s.drops) {
    d.y += d.speed * dt;
    const dx = Math.abs(d.x - s.x);
    const dy = Math.abs(d.y - (PLAYER_Y - 0.35));
    if (s.invuln <= 0 && dx < d.rad + RULES.body && dy < d.rad + 0.55) {
      s.lives -= 1;
      s.hitT = s.t;
      s.invuln = RULES.invuln;
      s.events.push({ type: 'fail', x: d.x, y: d.y });
      if (s.lives <= 0) { s.over = true; s.events.push({ type: 'over' }); return; }
      continue;
    }
    if (!d.near && d.y > PLAYER_Y - 0.4 && dx < d.rad + RULES.body + RULES.near) {
      d.near = true;
      s.events.push({ type: 'near', x: d.x });
    }
    if (d.y >= RULES.height) {
      s.score += 1;
      s.events.push({ type: 'score', perfect: false, combo: 0, quiet: true, x: d.x });
      continue;
    }
    keep.push(d);
  }
  s.drops = keep;
}

// 갈 위치 후보를 훑어 0.55초 동안 가장 안전한 곳으로 가는 봇(검수용).
function bot(s) {
  let bestX = s.x; let best = -Infinity;
  for (let tx = 0.5; tx <= RULES.width - 0.5 + 1e-9; tx += 0.25) {
    let worst = 3;
    for (let k = 1; k <= 8; k++) {
      const h = k * 0.07;
      const px = s.x + Math.sign(tx - s.x) * Math.min(Math.abs(tx - s.x), RULES.speed * h);
      for (const d of s.drops) {
        const dy = Math.abs(d.y + d.speed * h - (PLAYER_Y - 0.35));
        if (dy > d.rad + 0.7) continue;
        worst = Math.min(worst, Math.abs(d.x - px) - d.rad - RULES.body);
      }
    }
    const sc = worst - Math.abs(tx - s.x) * 0.02 + Math.min(0.5, Math.min(tx, RULES.width - tx) * 0.1);
    if (sc > best) { best = sc; bestX = tx; }
  }
  const want = Math.abs(bestX - s.x) < 0.12 ? 0 : Math.sign(bestX - s.x);
  if (want === s.hold) return null;
  if (want === 0) return { type: 'up', x: null };
  return [{ type: 'up', x: null }, { type: 'down', x: want < 0 ? 0.2 : 0.8, y: 0.8 }];
}


const TH = theme(42);

function revive(s) {
  s.over = false; s.lives = 1; s.invuln = RULES.invuln + 0.5;
  s.hold = 0; s.holdL = false; s.holdR = false; s.vx = 0;
}

function poop(ctx, x, y, r) {
  const layers = [[0, 0.5, 1, '#7d5236'], [0, 0.02, 0.74, '#8d5f40'], [0.04, -0.42, 0.47, '#9c6b49']];
  for (const [ox, oy, k, c] of layers) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(x + ox * r, y + oy * r, r * k, r * k * 0.56, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#9c6b49';
  ctx.beginPath();
  ctx.moveTo(x - 0.05 * r, y - 0.62 * r);
  ctx.quadraticCurveTo(x + 0.3 * r, y - 1.02 * r, x + 0.18 * r, y - 1.1 * r);
  ctx.quadraticCurveTo(x + 0.06 * r, y - 0.85 * r, x - 0.05 * r, y - 0.62 * r);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath(); ctx.ellipse(x - 0.35 * r, y + 0.35 * r, r * 0.22, r * 0.09, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = WHITE;
  ctx.beginPath(); ctx.arc(x - 0.22 * r, y + 0.04 * r, r * 0.13, 0, 7); ctx.arc(x + 0.22 * r, y + 0.04 * r, r * 0.13, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a1a10';
  ctx.beginPath(); ctx.arc(x - 0.2 * r, y + 0.07 * r, r * 0.06, 0, 7); ctx.arc(x + 0.24 * r, y + 0.07 * r, r * 0.06, 0, 7); ctx.fill();
}

function draw(ctx, s, v) {
  const { W, H } = v;
  background(ctx, W, H, TH);
  const u = Math.min(W / RULES.width, (H * 0.92) / RULES.height);
  const ox = (W - RULES.width * u) / 2;
  const oy = H * 0.92 - RULES.height * u;
  const X = (x) => ox + x * u;
  const Y = (y) => oy + y * u;
  v.layout = { X, Y, u };
  const gy = Y(RULES.height);
  ctx.fillStyle = TH.ground;
  ctx.fillRect(0, gy, W, H - gy);
  ctx.fillStyle = TH.groundDark;
  ctx.fillRect(0, gy, W, 4);
  if (!v.thumb) {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    if (s.hold < 0) ctx.fillRect(0, 0, W / 2, gy);
    if (s.hold > 0) ctx.fillRect(W / 2, 0, W / 2, gy);
    label(ctx, '◀', W * 0.1, (gy + H) / 2, { size: 20, alpha: s.hold < 0 ? 1 : 0.6 });
    label(ctx, '▶', W * 0.9, (gy + H) / 2, { size: 20, alpha: s.hold > 0 ? 1 : 0.6 });
  }
  for (const d of s.drops) {
    const k = Math.min(1, Math.max(0, d.y / RULES.height));
    shadow(ctx, X(d.x), gy + 2, d.rad * u * k, d.rad * u * 0.2 * k, 0.12);
    poop(ctx, X(d.x), Y(d.y), d.rad * u);
  }
  const blink = s.invuln > 0 && Math.floor(s.t * 14) % 2 === 0;
  shadow(ctx, X(s.x), gy + 2, u * 0.32, u * 0.07);
  if (!blink) {
    const run = s.hold !== 0;
    figure(ctx, X(s.x), gy, u * 1.35, { pose: s.over ? 'fall' : run ? 'run' : 'stand', t: s.t, color: s.t - s.hitT < 0.4 || s.over ? ACCENT : TH.ink, facing: s.hold < 0 ? -1 : 1 });
  }
}

function onEvent(ev, s, v) {
  const L = v.layout;
  if (!L) return;
  if (ev.type === 'score') v.fx.burst(L.X(ev.x), L.Y(RULES.height), { n: 5, color: '#8d5f40', speed: 130, spread: Math.PI * 0.8, size: 2.5, gravity: 600 });
  if (ev.type === 'near') v.fx.text(L.X(s.x), L.Y(PLAYER_Y) - 80, '아슬!', { size: 20, life: 0.6 });
  if (ev.type === 'fail') v.fx.burst(L.X(ev.x), L.Y(ev.y), { n: 16, color: '#8d5f40', speed: 260, size: 3.5 });
}

export default {
  id: 'dodge',
  title: '똥 피하기',
  rule: '화면 왼쪽·오른쪽을 누르고 있으면 그쪽으로 가요. 떨어지는 똥을 피하세요.',
  control: '좌우 누르기',
  accent: '#7b5133',
  focus: 0.7,
  unit: '개',
  create, input, step, draw, onEvent, bot, revive,
};
