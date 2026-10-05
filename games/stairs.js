// 계단 오르기: 오른쪽은 '오르기', 왼쪽은 '방향 바꾸기'. 계단이 꺾이는 곳에서 방향을 바꿔야 해요.
// 시간 막대가 계속 줄고, 한 칸 오를 때마다 조금 찹니다. 참고작: 무한의 계단(구글플레이 1,000만+).
import { rng } from '../core/rng.js';
import { INK, MUTE, RED, PAPER, paper, stickman, roundRect, FONT } from '../core/draw.js';

export const RULES = Object.freeze({ gain: 0.1, drain0: 0.12, drainPer: 0.006, drainMax: 0.78, refill: 0.6 });

function extend(s, upto) {
  while (s.dirs.length < upto) {
    const n = s.dirs.length;
    const prev = s.dirs[n - 1];
    let d = prev;
    if (n >= 3) {
      s.straight += 1;
      if (s.r() < 0.36 || s.straight >= 7) d = -prev;
    }
    if (d !== prev) s.straight = 0;
    s.dirs.push(d);
  }
}

function create(seed, lives = 1) {
  const s = {
    seed, r: rng(seed), score: 0, combo: 0, lives, over: false, t: 0, events: [],
    dirs: [1], straight: 0, n: 0, facing: 1, time: 1, started: false, moveT: -1, hitT: -1,
  };
  extend(s, 64);
  return s;
}

export const drainAt = (score) => Math.min(RULES.drainMax, RULES.drain0 + score * RULES.drainPer);

function act(s, turn) {
  if (s.over) return;
  s.started = true;
  const facing = turn ? -s.facing : s.facing;
  extend(s, s.n + 64);
  if (facing === s.dirs[s.n]) {
    s.facing = facing;
    s.n += 1;
    s.score += 1;
    s.time = Math.min(1, s.time + RULES.gain);
    s.moveT = s.t;
    s.events.push({ type: 'score', perfect: false, combo: 0, quiet: true, turn });
  } else {
    s.lives -= 1;
    s.hitT = s.t;
    s.events.push({ type: 'fail', wrong: true });
    if (s.lives <= 0) { s.facing = facing; s.over = true; s.events.push({ type: 'over' }); }
  }
}

function input(s, ev) {
  if (ev.type !== 'down') return;
  act(s, ev.x < 0.5);
}

function step(s, dt) {
  if (s.over) return;
  s.t += dt;
  if (!s.started) return;
  s.time -= drainAt(s.score) * dt;
  if (s.time <= 0) {
    s.lives -= 1;
    s.hitT = s.t;
    s.events.push({ type: 'fail', timeout: true });
    if (s.lives <= 0) { s.time = 0; s.over = true; s.events.push({ type: 'over' }); return; }
    s.time = RULES.refill;
  }
}

// 초당 약 9칸을 정확하게 누르는 봇.
function bot(s) {
  if (s.t - Math.max(s.moveT, 0) < 1 / 9 && s.started) return null;
  return { type: 'down', x: s.dirs[s.n] === s.facing ? 0.75 : 0.25, y: 0.9 };
}

function draw(ctx, s, v) {
  const { W, H } = v;
  paper(ctx, W, H, '#eef0e6');
  const u = Math.min(W / 7, H / 12);
  const sw = u * 1.05;
  const sh = u * 0.55;
  // 플레이어 위치(칸 좌표)
  let col = 0;
  const cols = [0];
  for (let i = 0; i < s.n + 16 && i < s.dirs.length; i++) { col += s.dirs[i]; cols.push(col); }
  const k = Math.min(1, (s.t - s.moveT) / 0.08);
  const pc = s.n > 0 && s.moveT >= 0 ? cols[s.n - 1] + (cols[s.n] - cols[s.n - 1]) * k : cols[s.n];
  const pr = s.n > 0 && s.moveT >= 0 ? s.n - 1 + k : s.n;
  v.camX = v.camX == null ? pc : v.camX + (pc - v.camX) * Math.min(1, v.dt * 10);
  v.camY = v.camY == null ? pr : v.camY + (pr - v.camY) * Math.min(1, v.dt * 10);
  const X = (c) => W / 2 + (c - v.camX) * sw;
  const Y = (r) => H * 0.6 - (r - v.camY) * sh;
  v.layout = { X, Y, u, pc, pr };
  for (let i = Math.max(0, s.n - 8); i < Math.min(cols.length, s.n + 14); i++) {
    const x = X(cols[i]) - sw / 2;
    const y = Y(i);
    ctx.fillStyle = i < s.n ? '#c9c3b4' : i === s.n ? '#5f8f5a' : '#7aa874';
    ctx.fillRect(x, y, sw, sh * 0.62);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, sw, sh * 0.62);
  }
  const hurt = s.hitT >= 0 && s.t - s.hitT < 0.4;
  stickman(ctx, X(pc), Y(pr), u * 1.05, { pose: s.over ? 'fall' : s.t - s.moveT < 0.1 ? 'climb' : 'stand', t: s.t, color: hurt || s.over ? RED : INK, facing: s.facing });
  if (v.thumb) return;
  // 시간 막대
  const bw = Math.min(W * 0.6, 260);
  const bx = (W - bw) / 2;
  const by = Math.max(H * 0.24, 158); // 위쪽 점수 숫자와 겹치지 않게
  ctx.fillStyle = PAPER;
  roundRect(ctx, bx, by, bw, 12, 6); ctx.fill();
  ctx.fillStyle = s.time < 0.25 ? RED : INK;
  roundRect(ctx, bx, by, Math.max(0, bw * s.time), 12, 6); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  roundRect(ctx, bx, by, bw, 12, 6); ctx.stroke();
  // 버튼 두 개
  const bh = Math.min(96, H * 0.14);
  const top = H - bh - Math.max(16, H * 0.03);
  const pad = 14;
  const half = (W - pad * 3) / 2;
  const btn = (x, label, sub, hot) => {
    ctx.fillStyle = hot ? INK : PAPER;
    roundRect(ctx, x, top, half, bh, 8); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    roundRect(ctx, x, top, half, bh, 8); ctx.stroke();
    ctx.fillStyle = hot ? PAPER : INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 20px ${FONT}`;
    ctx.fillText(label, x + half / 2, top + bh / 2 - 8);
    ctx.font = `600 13px ${FONT}`;
    ctx.fillStyle = hot ? PAPER : MUTE;
    ctx.fillText(sub, x + half / 2, top + bh / 2 + 16);
  };
  const lastTurn = v.lastInputX != null && s.t - (v.lastInputT ?? -9) < 0.08;
  btn(pad, '방향 바꾸기', '왼쪽 누르기', lastTurn && v.lastInputX < 0.5);
  btn(pad * 2 + half, '오르기', '오른쪽 누르기', lastTurn && v.lastInputX >= 0.5);
}

function onEvent(ev, s, v) {
  const L = v.layout;
  if (!L) return;
  if (ev.type === 'score' && s.score % 25 === 0) v.fx.text(L.X(L.pc), L.Y(L.pr) - 70, `${s.score}칸!`, { color: '#3e6b3a', size: 24 });
  if (ev.type === 'score') v.fx.burst(L.X(L.pc), L.Y(L.pr), { n: 3, color: MUTE, speed: 80, size: 2, spread: Math.PI, gravity: 300 });
  if (ev.type === 'fail' && ev.timeout) v.fx.text(W2(v), L.Y(L.pr) - 70, '시간 초과', { color: RED, size: 22 });
}
const W2 = (v) => v.W / 2;

export default {
  id: 'stairs',
  title: '계단 오르기',
  rule: '오른쪽은 오르기, 왼쪽은 방향 바꾸기. 계단이 꺾이면 방향을 바꿔요.',
  control: '좌우 탭',
  ref: '무한의 계단',
  accent: '#5f8f5a',
  focus: 0.5,
  unit: '칸',
  create, input, step, draw, onEvent, bot,
};
