// 똥 피하기: 화면 왼쪽·오른쪽을 누르고 있으면 그쪽으로 움직여요. 바닥에 떨어진 똥 하나가 1점.
// 참고작: 똥피하기 계열(똥왕의 분노, 구글플레이 100만+). 떨어지는 순서와 속도는 시드로 정해져 두 사람이 같아요.
import { rng, range, clamp } from '../core/rng.js';
import { INK, MUTE, RED, paper, stickman } from '../core/draw.js';

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

function poop(ctx, x, y, r) {
  ctx.fillStyle = '#7b5133';
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  const layers = [[0, 0.55, 1], [0, 0.05, 0.72], [0.05, -0.4, 0.45]];
  for (const [ox, oy, k] of layers) {
    ctx.beginPath();
    ctx.ellipse(x + ox * r, y + oy * r, r * k, r * k * 0.55, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x + 0.05 * r, y - 0.7 * r);
  ctx.quadraticCurveTo(x + 0.35 * r, y - 0.95 * r, x + 0.2 * r, y - 1.05 * r);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - 0.22 * r, y + 0.02 * r, r * 0.11, 0, 7); ctx.arc(x + 0.22 * r, y + 0.02 * r, r * 0.11, 0, 7); ctx.fill();
}

function draw(ctx, s, v) {
  const { W, H } = v;
  paper(ctx, W, H, '#f1ece2');
  const u = Math.min(W / RULES.width, (H * 0.92) / RULES.height);
  const ox = (W - RULES.width * u) / 2;
  const oy = H * 0.92 - RULES.height * u;
  const X = (x) => ox + x * u;
  const Y = (y) => oy + y * u;
  v.layout = { X, Y, u };
  ctx.fillStyle = '#e4dccb';
  ctx.fillRect(0, Y(RULES.height), W, H);
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, Y(RULES.height)); ctx.lineTo(W, Y(RULES.height)); ctx.stroke();
  // 좌우 조작 영역 표시
  ctx.fillStyle = 'rgba(28,26,23,0.05)';
  if (s.hold < 0) ctx.fillRect(0, 0, W / 2, H);
  if (s.hold > 0) ctx.fillRect(W / 2, 0, W / 2, H);
  if (!v.thumb) {
  ctx.fillStyle = MUTE;
  ctx.font = '700 22px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('◀', W * 0.12, H - 18);
  ctx.fillText('▶', W * 0.88, H - 18);
  }
  for (const d of s.drops) {
    ctx.fillStyle = 'rgba(28,26,23,0.10)';
    const k = clamp(d.y / RULES.height, 0, 1);
    ctx.beginPath(); ctx.ellipse(X(d.x), Y(RULES.height) + 2, d.rad * u * k, d.rad * u * 0.2 * k, 0, 0, 7); ctx.fill();
    poop(ctx, X(d.x), Y(d.y), d.rad * u);
  }
  const blink = s.invuln > 0 && Math.floor(s.t * 14) % 2 === 0;
  if (!blink) {
    const run = s.hold !== 0;
    stickman(ctx, X(s.x), Y(RULES.height), u * 1.3, { pose: s.over ? 'fall' : run ? 'run' : 'stand', t: s.t, color: s.t - s.hitT < 0.4 || s.over ? RED : INK, facing: s.hold < 0 ? -1 : 1 });
  }
}

function onEvent(ev, s, v) {
  const L = v.layout;
  if (!L) return;
  if (ev.type === 'score') v.fx.burst(L.X(ev.x), L.Y(RULES.height), { n: 5, color: '#7b5133', speed: 140, spread: Math.PI * 0.8, size: 2.5, gravity: 600 });
  if (ev.type === 'near') v.fx.text(L.X(s.x), L.Y(PLAYER_Y) - 70, '아슬!', { color: INK, size: 20, life: 0.6 });
  if (ev.type === 'fail') v.fx.burst(L.X(ev.x), L.Y(ev.y), { n: 16, color: '#7b5133', speed: 260, size: 3.5 });
}

export default {
  id: 'dodge',
  title: '똥 피하기',
  rule: '화면 왼쪽·오른쪽을 누르고 있으면 그쪽으로 가요. 떨어지는 똥을 피하세요.',
  control: '좌우 누르기',
  ref: '똥피하기',
  accent: '#7b5133',
  focus: 0.7,
  unit: '개',
  create, input, step, draw, onEvent, bot,
};
