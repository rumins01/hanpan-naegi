// 계단 오르기: 오른쪽은 '오르기', 왼쪽은 '방향 바꾸기'. 계단이 꺾이는 곳에서 방향을 바꿔야 해요.
// 시간 막대가 계속 줄고, 한 칸 오를 때마다 조금 찹니다.
import { rng } from '../core/rng.js';
import { ACCENT, WHITE, theme, background, figure, roundRect, slab, label, FONT } from '../core/draw.js';

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
  s.prevFacing = s.facing;
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

function revive(s) {
  s.over = false; s.lives = 1; s.hitT = -1;
  if (s.prevFacing != null) s.facing = s.prevFacing;
  s.time = Math.max(s.time, RULES.refill);
}

// 초당 약 9칸을 정확하게 누르는 봇.
function bot(s) {
  if (s.t - Math.max(s.moveT, 0) < 1 / 9 && s.started) return null;
  return { type: 'down', x: s.dirs[s.n] === s.facing ? 0.75 : 0.25, y: 0.9 };
}

const TH = theme(150);

function draw(ctx, s, v) {
  const { W, H } = v;
  background(ctx, W, H, TH);
  const u = Math.min(W / 7, H / 12);
  const sw = u * 1.05;
  const sh = u * 0.55;
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
  for (let i = Math.min(cols.length, s.n + 14) - 1; i >= Math.max(0, s.n - 8); i--) {
    const x = X(cols[i]) - sw / 2;
    const y = Y(i);
    ctx.globalAlpha = i < s.n ? 0.45 : 1;
    slab(ctx, x + 1, y, sw - 2, sh * 0.7, i === s.n ? ACCENT : 'hsl(150 40% 97%)', { radius: 3, face: 0.45 });
    ctx.globalAlpha = 1;
  }
  const hurt = s.hitT >= 0 && s.t - s.hitT < 0.4;
  figure(ctx, X(pc), Y(pr), u * 1.1, { pose: s.over ? 'fall' : s.t - s.moveT < 0.1 ? 'climb' : 'stand', t: s.t, color: hurt || s.over ? ACCENT : TH.ink, facing: s.facing });
  if (v.thumb) return;
  // 시간 막대
  const bw = Math.min(W * 0.56, 240);
  const bx = (W - bw) / 2;
  const by = Math.max(H * 0.24, 158); // 위쪽 점수 숫자와 겹치지 않게
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  roundRect(ctx, bx, by, bw, 10, 5); ctx.fill();
  ctx.fillStyle = s.time < 0.25 ? ACCENT : WHITE;
  roundRect(ctx, bx, by, Math.max(0, bw * s.time), 10, 5); ctx.fill();
  // 버튼 두 개
  const bh = Math.min(92, H * 0.13);
  const top = H - bh - Math.max(18, H * 0.035);
  const pad = 16;
  const half = (W - pad * 3) / 2;
  const btn = (x, title, sub, hot) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
    ctx.fillStyle = hot ? TH.ink : 'rgba(255,255,255,0.92)';
    roundRect(ctx, x, top, half, bh, 18); ctx.fill();
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 19px ${FONT}`;
    ctx.fillStyle = hot ? WHITE : TH.ink;
    ctx.fillText(title, x + half / 2, top + bh / 2 - 9);
    ctx.font = `500 12px ${FONT}`;
    ctx.fillStyle = hot ? 'rgba(255,255,255,0.7)' : TH.mid;
    ctx.fillText(sub, x + half / 2, top + bh / 2 + 14);
  };
  const recent = v.lastInputX != null && s.t - (v.lastInputT ?? -9) < 0.08;
  btn(pad, '방향 바꾸기', '왼쪽', recent && v.lastInputX < 0.5);
  btn(pad * 2 + half, '오르기', '오른쪽', recent && v.lastInputX >= 0.5);
}

function onEvent(ev, s, v) {
  const L = v.layout;
  if (!L) return;
  if (ev.type === 'score' && s.score % 25 === 0) v.fx.text(L.X(L.pc), L.Y(L.pr) - 80, `${s.score}칸`, { size: 24 });
  if (ev.type === 'score') v.fx.burst(L.X(L.pc), L.Y(L.pr), { n: 4, speed: 90, size: 2, spread: Math.PI, gravity: 300, shape: 'square' });
  if (ev.type === 'fail' && ev.timeout) v.fx.text(v.W / 2, L.Y(L.pr) - 80, '시간 초과', { color: ACCENT, size: 22 });
}

export default {
  id: 'stairs',
  title: '계단 오르기',
  rule: '오른쪽은 오르기, 왼쪽은 방향 바꾸기. 계단이 꺾이면 방향을 바꿔요.',
  control: '좌우 탭',
  accent: '#5f8f5a',
  focus: 0.5,
  unit: '칸',
  create, input, step, draw, onEvent, bot, revive,
};
