// 화면과 흐름. 게임 규칙은 games/, 대결 규칙은 duel.js, 웹과 앱의 차이는 platform.js에 있습니다.
import { GAMES, byId } from './games/index.js';
import {
  BETS, LIMIT, cleanName, cleanBet, newSeed, pairNames, encodeChallenge, readChallengeFromHash,
  decide, nextLives, recordKey, addRecord,
} from './duel.js';
import { loadJSON, saveJSON, vibrate, challengeUrl, shareText, onHidden } from './platform.js';
import { Fx } from './core/fx.js';
import { createAudio } from './core/audio.js';
import { FONT, ACCENT as RED } from './core/draw.js';

export const VERSION = '0.3.0';
const KEY = 'hanpan.v1';
const QA = new URLSearchParams(location.search);

const store = loadJSON(KEY, {
  best: {}, sound: true, handicap: true, names: ['나', '상대'], bet: BETS[0], myName: '', h2h: {},
});
if (typeof store.best === 'number') store.best = { rope: store.best }; // v0.1 기록 옮기기
const persist = () => saveJSON(KEY, store);
const bestOf = (g) => store.best[g.id] || 0;
function recordBest(g, score) {
  const before = bestOf(g);
  if (score > before) { store.best = { ...store.best, [g.id]: score }; persist(); return true; }
  return false;
}

const audio = createAudio(() => store.sound);
const sfx = audio.sfx;

// ---------- 작은 도구 ----------
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const view = document.getElementById('view');
let cleanup = null;
function show(el) {
  if (cleanup) { const c = cleanup; cleanup = null; c(); }
  view.replaceChildren(el);
  window.scrollTo(0, 0);
}

function josa(word, withFinal, withoutFinal) {
  const c = word.charCodeAt(word.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return word + ((c - 0xac00) % 28 ? withFinal : withoutFinal);
  return `${word}${withFinal}(${withoutFinal})`;
}

const ICONS = {
  soundOn: 'M4 9v6h4l5 4V5L8 9H4z M16 8.5a5 5 0 0 1 0 7 M18.5 6a8.5 8.5 0 0 1 0 12',
  soundOff: 'M4 9v6h4l5 4V5L8 9H4z M16 9.5l5 5 M21 9.5l-5 5',
  close: 'M6 6l12 12 M18 6L6 18',
};
function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', ICONS[name]);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

function soundToggle(compact = false) {
  const btn = h('button', { type: 'button', class: compact ? 'hud-btn' : 'link', 'aria-pressed': String(store.sound) });
  const render = () => {
    btn.setAttribute('aria-pressed', String(store.sound));
    btn.setAttribute('aria-label', store.sound ? '소리 끄기' : '소리 켜기');
    if (compact) btn.replaceChildren(icon(store.sound ? 'soundOn' : 'soundOff'));
    else btn.textContent = store.sound ? '소리 켜짐' : '소리 꺼짐';
  };
  render();
  btn.addEventListener('click', () => {
    store.sound = !store.sound;
    persist();
    if (!store.sound) audio.suspend();
    render();
  });
  return btn;
}

const topbar = (onBack, label = '처음으로') => h('div', { class: 'topbar' }, h('button', { type: 'button', class: 'link', onclick: onBack }, label));

function betPicker(initial) {
  const labels = [...BETS, '직접 쓰기'];
  let chosen = BETS.includes(initial) ? initial : initial ? '직접 쓰기' : BETS[0];
  const input = h('input', { class: 'field', type: 'text', maxlength: LIMIT.bet, placeholder: '예: 이번 주 장보기', 'aria-label': '내기 직접 쓰기' });
  if (chosen === '직접 쓰기') input.value = initial;
  const custom = h('div', { class: 'custom-bet' }, input);
  const chips = labels.map((label) => h('button', {
    type: 'button', class: 'chip',
    onclick: () => { chosen = label; sync(); if (label === '직접 쓰기') input.focus(); },
  }, label));
  function sync() {
    chips.forEach((c, i) => c.setAttribute('aria-pressed', String(labels[i] === chosen)));
    custom.hidden = chosen !== '직접 쓰기';
  }
  sync();
  return {
    el: h('fieldset', { class: 'group' }, h('legend', {}, '지는 사람이'), h('div', { class: 'chips' }, chips), custom),
    value: () => (chosen === '직접 쓰기' ? cleanBet(input.value) : chosen),
  };
}

function nameField(label, value) {
  const input = h('input', { class: 'field', type: 'text', maxlength: LIMIT.name, autocomplete: 'off' });
  input.value = value || '';
  return { el: h('label', { class: 'lab' }, h('span', {}, label), input), input };
}

function scoreboard(g, names, scores, winner) {
  return h('div', { class: 'board' }, names.map((n, i) => h('div', { class: `row${winner === i ? ' win' : ''}` },
    h('span', { class: 'row-name' }, n),
    h('span', { class: 'row-score' }, `${scores[i]}${g.unit}`))));
}

function penalty(loserName, bet) {
  if (loserName == null) return h('div', { class: 'penalty tie' }, h('span', { class: 'penalty-label' }, '무승부'), h('p', {}, '한 판 더 해서 정하세요.'));
  return h('div', { class: 'penalty' },
    h('span', { class: 'penalty-label' }, '내기 당첨'),
    h('strong', { class: 'penalty-name' }, loserName),
    h('p', { class: 'penalty-bet' }, bet));
}

// ---------- 캔버스 도우미: 썸네일과 봇 데모 ----------
function sizeCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth || 160;
  const H = canvas.clientHeight || 160;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  return { W, H, dpr };
}

function warm(game, seed, seconds) {
  const s = game.create(seed, 99);
  for (let i = 0; i < seconds * 120; i++) {
    const ev = game.bot(s);
    if (ev) for (const e of [].concat(ev)) game.input(s, e);
    game.step(s, 1 / 120);
    s.events.length = 0;
  }
  return s;
}

// 썸네일: 휴대폰 크기(360x640)로 그린 뒤 게임이 정한 초점 주변을 정사각형으로 잘라 씁니다.
function drawThumb(game, canvas) {
  const { W, H, dpr } = sizeCanvas(canvas);
  const VW = 360; const VH = 640; const k = 2;
  const off = document.createElement('canvas');
  off.width = VW * k; off.height = VH * k;
  const octx = off.getContext('2d');
  octx.setTransform(k, 0, 0, k, 0, 0);
  const s = warm(game, 7, 4);
  game.draw(octx, s, { W: VW, H: VH, dpr: k, fx: new Fx(), dt: 1, layout: null, thumb: true });
  const ch = Math.min(VH, VW * (H / W)); // 캔버스 비율대로 잘라 찌그러지지 않게
  const cy = Math.min(VH - ch / 2, Math.max(ch / 2, VH * (game.focus ?? 0.5)));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(off, 0, (cy - ch / 2) * k, VW * k, ch * k, 0, 0, W * dpr, H * dpr);
}

// 봇이 실제로 플레이하는 데모(소리 없음). 반환값은 정지 함수.
function runDemo(game, canvas) {
  const ctx = canvas.getContext('2d');
  let dims = sizeCanvas(canvas);
  let s = game.create(newSeed(), 99);
  const v = { W: dims.W, H: dims.H, fx: new Fx(), dt: 0, layout: null, thumb: true };
  let raf = 0; let last = performance.now(); let acc = 0; let alive = true;
  const frame = (now) => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    acc += dt;
    while (acc >= 1 / 240) {
      const ev = game.bot(s);
      if (ev) for (const e of [].concat(ev)) game.input(s, e);
      game.step(s, 1 / 240);
      acc -= 1 / 240;
    }
    for (const ev of s.events) game.onEvent?.(ev, s, v);
    s.events.length = 0;
    v.fx.update(dt);
    v.dt = dt;
    if (s.over || s.score >= 14) { s = game.create(newSeed(), 99); v.cam = null; v.camX = null; v.camY = null; }
    ctx.setTransform(dims.dpr, 0, 0, dims.dpr, 0, 0);
    const [ox, oy] = v.fx.offset();
    ctx.save();
    ctx.translate(ox, oy);
    game.draw(ctx, s, v);
    v.fx.draw(ctx);
    ctx.restore();
    v.fx.drawOverlay(ctx, v.W, v.H, FONT);
  };
  const ro = new ResizeObserver(() => { dims = sizeCanvas(canvas); v.W = dims.W; v.H = dims.H; });
  ro.observe(canvas);
  raf = requestAnimationFrame(frame);
  return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); };
}

// ---------- 공용 부품: 게임 카드 그리드 ----------
// 처음 화면과 '다음 게임' 화면이 이 부품 하나를 같이 씁니다(같은 모양 유지).
const thumbCache = new Map();
function gameGrid(onPick, { current = null } = {}) {
  const cards = GAMES.map((g) => {
    const canvas = h('canvas', { class: 'thumb', 'aria-hidden': 'true' });
    const best = bestOf(g);
    const card = h('button', { type: 'button', class: 'card', onclick: () => onPick(g), 'aria-label': `${g.title}, ${g.control}${best ? `, 최고 ${best}${g.unit}` : ''}${g.id === current ? ', 방금 한 게임' : ''}` },
      canvas,
      g.id === current ? h('span', { class: 'badge' }, '방금 한 게임') : null,
      h('span', { class: 'card-body' },
        h('span', { class: 'card-title' }, g.title),
        h('span', { class: 'card-meta' }, g.control, best ? ` · 최고 ${best}${g.unit}` : '')));
    return { card, canvas, g };
  });
  const el = h('div', { class: 'grid' }, cards.map((c) => c.card));
  requestAnimationFrame(() => cards.forEach((c) => {
    if (!c.canvas.isConnected) return;
    const key = `${c.g.id}:${c.canvas.clientWidth}`;
    if (thumbCache.has(key)) {
      const src = thumbCache.get(key);
      const { W, H, dpr } = sizeCanvas(c.canvas);
      c.canvas.getContext('2d').drawImage(src, 0, 0, W * dpr, H * dpr);
    } else {
      drawThumb(c.g, c.canvas);
      const copy = document.createElement('canvas');
      copy.width = c.canvas.width; copy.height = c.canvas.height;
      copy.getContext('2d').drawImage(c.canvas, 0, 0);
      thumbCache.set(key, copy);
    }
  }));
  return el;
}

// ---------- 화면: 처음 ----------
function home() {
  show(h('section', { class: 'screen home' },
    h('p', { class: 'kicker' }, '한판내기'),
    h('h1', {}, '둘이 한 판, 진 사람이 내기'),
    h('p', { class: 'lede' }, '1분이면 끝나는 게임 6개. 둘이 폰 하나로 번갈아 하거나, 도전장 링크를 보내세요.'),
    gameGrid(gameMenu),
    h('footer', { class: 'foot' }, h('span', {}, '두 사람이 같은 판으로 겨뤄요'), soundToggle())));
}

// ---------- 화면: 게임 고르기 ----------
function gameMenu(g) {
  const demo = h('canvas', { class: 'demo', role: 'img', 'aria-label': `${g.title} 플레이 미리보기` });
  const best = bestOf(g);
  show(h('section', { class: 'screen' },
    topbar(home, '게임 목록'),
    h('p', { class: 'kicker' }, `${g.control} · ${g.ref} 방식`),
    h('h2', { class: 'big' }, g.title),
    demo,
    h('p', { class: 'lede' }, g.rule),
    h('div', { class: 'stack' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => duoSetup(g) }, '둘이 한 폰으로'),
      h('button', { type: 'button', class: 'btn', onclick: () => linkSetup(g) }, '링크로 도전장 보내기'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => practice(g) }, best ? `혼자 연습 (최고 ${best}${g.unit})` : '혼자 연습'))));
  requestAnimationFrame(() => { if (demo.isConnected) cleanup = runDemo(g, demo); });
}

// ---------- 화면: 둘이 한 폰으로 ----------
function duoSetup(g) {
  const a = nameField('먼저 할 사람', store.names[0]);
  const b = nameField('다음 사람', store.names[1]);
  const bet = betPicker(store.bet);
  const hc = h('input', { type: 'checkbox' });
  hc.checked = store.handicap;
  show(h('section', { class: 'screen' },
    topbar(() => gameMenu(g), g.title),
    h('p', { class: 'kicker' }, `${g.title} · 둘이 한 폰으로`),
    h('h2', {}, '누가 할까요?'),
    a.el, b.el, bet.el,
    h('label', { class: 'check' }, hc, h('span', {}, '실력 차이 보정: 진 사람은 다음 판에 목숨 2개')),
    h('button', {
      type: 'button', class: 'btn primary',
      onclick: () => {
        const names = pairNames(a.input.value, b.input.value);
        Object.assign(store, { names, bet: bet.value(), handicap: hc.checked });
        persist();
        startDuo({ game: g, names, bet: store.bet, handicap: hc.checked, lives: [1, 1], round: 1, first: 0 });
      },
    }, '시작하기')));
}

function startDuo(match) {
  match.seed = newSeed();
  match.scores = [null, null];
  match.order = [match.first, 1 - match.first];
  handoff(match, 0);
}

function handoff(match, turn) {
  const g = match.game;
  const idx = match.order[turn];
  const name = match.names[idx];
  const prevIdx = match.order[0];
  const art = h('canvas', { class: 'thumb hero', 'aria-hidden': 'true' });
  requestAnimationFrame(() => { if (art.isConnected) drawThumb(g, art); });
  show(h('section', { class: 'screen handoff' },
    h('p', { class: 'kicker' }, `${g.title} · ${match.round}판 · ${turn + 1}번째 차례`),
    art,
    h('h2', { class: 'big' }, `${name} 차례`),
    h('p', { class: 'lede' }, `폰을 ${name}에게 건네주세요.`),
    turn === 1 ? h('p', { class: 'note' }, `${match.names[prevIdx]} 기록 ${match.scores[prevIdx]}${g.unit}. 이보다 많으면 이겨요.`) : null,
    match.lives[idx] > 1 ? h('p', { class: 'note' }, '지난 판 보정으로 목숨 2개로 시작해요.') : null,
    h('button', {
      type: 'button', class: 'btn primary',
      onclick: () => play(g, {
        seed: match.seed,
        lives: match.lives[idx],
        target: turn === 1 ? match.scores[prevIdx] : null,
        label: name,
        onDone: (score) => {
          match.scores[idx] = score;
          if (turn === 0) handoff(match, 1);
          else duoResult(match);
        },
      }),
    }, '준비됐어요')));
}

function duoResult(match) {
  const g = match.game;
  const res = decide(match.scores);
  if (!match.counted) {
    match.counted = true;
    store.h2h = addRecord(store.h2h, match.names, res);
    persist();
    match.scores.forEach((sc) => recordBest(g, sc));
    sfx.win();
  }
  const [A, B] = match.names;
  const rec = store.h2h[recordKey(A, B)];
  const lives = nextLives(res, match.handicap);
  show(h('section', { class: 'screen result' },
    h('p', { class: 'kicker' }, `${g.title} · ${match.round}판 결과`),
    h('h2', { class: 'big' }, res.winner === null ? '무승부' : `${match.names[res.winner]} 승리`),
    scoreboard(g, match.names, match.scores, res.winner),
    penalty(res.loser === null ? null : match.names[res.loser], match.bet),
    h('p', { class: 'record' }, `전적  ${A} ${rec[A]} : ${rec[B]} ${B}`),
    res.loser !== null && match.handicap ? h('p', { class: 'note' }, `다음 판은 ${match.names[res.loser]} 목숨 2개로 시작해요.`) : null,
    h('div', { class: 'stack' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => startDuo({ ...match, counted: false, round: match.round + 1, lives, first: 1 - match.first }) }, '한 판 더'),
      h('button', { type: 'button', class: 'btn', onclick: () => pickNext(match, lives) }, '다른 게임으로 한 판'),
      h('button', { type: 'button', class: 'btn ghost', onclick: home }, '처음으로'))));
}

// 같은 두 사람, 같은 내기로 게임만 바꿔 이어 갑니다(전적은 이어서 셉니다).
function pickNext(match, lives) {
  show(h('section', { class: 'screen' },
    topbar(() => duoResult(match), '결과로'),
    h('p', { class: 'kicker' }, `${match.names[0]} 대 ${match.names[1]} · ${match.bet}`),
    h('h2', {}, '다음 게임은?'),
    h('p', { class: 'lede' }, '같은 두 사람, 같은 내기로 이어서 해요. 전적도 이어서 셉니다.'),
    gameGrid((g) => startDuo({ ...match, counted: false, game: g, round: match.round + 1, lives, first: 1 - match.first }), { current: match.game.id })));
}

// ---------- 화면: 링크 도전장 ----------
function linkSetup(g, prefill = {}) {
  const me = nameField('내 이름', store.myName);
  const bet = betPicker(prefill.bet || store.bet);
  show(h('section', { class: 'screen' },
    topbar(() => gameMenu(g), g.title),
    h('p', { class: 'kicker' }, `${g.title} · 링크로 도전장`),
    h('h2', {}, '먼저 한 판 하고 기록을 보내요'),
    h('p', { class: 'lede' }, '받은 사람은 똑같은 판으로 도전해요.'),
    me.el, bet.el,
    h('button', {
      type: 'button', class: 'btn primary',
      onclick: () => {
        const name = cleanName(me.input.value, '나');
        Object.assign(store, { myName: name, bet: bet.value() });
        persist();
        recordForLink(g, name, store.bet);
      },
    }, '한 판 하기')));
}

function recordForLink(g, name, bet) {
  const seed = newSeed();
  play(g, { seed, lives: 1, label: name, onDone: (score) => linkReady(g, { game: g.id, seed, name, score, bet }) });
}

function linkReady(g, ch) {
  const isBest = recordBest(g, ch.score);
  const url = challengeUrl(encodeChallenge(ch));
  const msg = `[${g.title}] ${ch.name}의 기록 ${ch.score}${g.unit}. 지는 사람이 ${ch.bet}. 이길 수 있어요?\n${url}`;
  const status = h('p', { class: 'status', role: 'status' });
  show(h('section', { class: 'screen result' },
    h('p', { class: 'kicker' }, `${g.title} · 도전장 준비 완료`),
    h('h2', { class: 'big' }, `${ch.score}${g.unit}`, isBest ? h('span', { class: 'newbest' }, '최고 기록') : null),
    h('p', { class: 'lede' }, '이 기록으로 도전장을 보낼까요?'),
    h('div', { class: 'preview', 'aria-label': '보낼 메시지' }, msg),
    h('div', { class: 'stack' },
      h('button', {
        type: 'button', class: 'btn primary',
        onclick: async () => {
          const r = await shareText(msg);
          status.textContent = { shared: '보냈어요.', copied: '메시지를 복사했어요. 카톡에 붙여 넣으세요.', failed: '복사하지 못했어요. 위 글을 길게 눌러 복사해 주세요.', cancelled: '' }[r];
        },
      }, '도전장 보내기'),
      status,
      h('button', { type: 'button', class: 'btn', onclick: () => recordForLink(g, ch.name, ch.bet) }, '다시 해서 기록 올리기'),
      h('button', { type: 'button', class: 'btn ghost', onclick: home }, '처음으로'))));
}

function leaveChallenge() {
  history.replaceState(null, '', location.pathname + location.search);
  home();
}

function challengeIntro(ch) {
  const g = byId(ch.game);
  if (!g) {
    show(h('section', { class: 'screen' },
      h('p', { class: 'kicker' }, '도전장'),
      h('h2', {}, '이 게임은 아직 없어요'),
      h('p', { class: 'lede' }, '도전장을 보낸 사람의 앱이 더 새 버전일 수 있어요. 새로고침해 보세요.'),
      h('button', { type: 'button', class: 'btn primary', onclick: leaveChallenge }, '처음으로')));
    return;
  }
  const me = nameField('내 이름', store.myName);
  const demo = h('canvas', { class: 'demo short', role: 'img', 'aria-label': `${g.title} 플레이 미리보기` });
  show(h('section', { class: 'screen' },
    h('p', { class: 'kicker' }, `도전장 도착 · ${g.title}`),
    h('h2', { class: 'big' }, `${ch.name}의 기록 ${ch.score}${g.unit}`),
    h('div', { class: 'penalty' }, h('span', { class: 'penalty-label' }, '지는 사람이'), h('p', { class: 'penalty-bet' }, ch.bet)),
    demo,
    h('p', { class: 'lede' }, `${g.rule} 같은 판으로 한 번, 목숨은 1개예요.`),
    me.el,
    h('div', { class: 'stack' },
      h('button', {
        type: 'button', class: 'btn primary',
        onclick: () => {
          const name = pairNames(ch.name, me.input.value)[1];
          store.myName = name;
          persist();
          play(g, { seed: ch.seed, lives: 1, target: ch.score, label: name, onDone: (score) => challengeResult(g, ch, name, score) });
        },
      }, '도전하기'),
      h('button', { type: 'button', class: 'btn ghost', onclick: leaveChallenge }, '나중에 할게요'))));
  requestAnimationFrame(() => { if (demo.isConnected) cleanup = runDemo(g, demo); });
}

function challengeResult(g, ch, me, score) {
  const names = [me, ch.name];
  const scores = [score, ch.score];
  const res = decide(scores);
  recordBest(g, score);
  if (res.winner === 0) sfx.win();
  const loser = res.loser === null ? null : names[res.loser];
  const msg = `[${g.title}] 내기 결과: ${me} ${score}${g.unit}, ${ch.name} ${ch.score}${g.unit}. `
    + (loser ? `${josa(loser, '이', '가')} ${ch.bet}!` : '무승부!');
  const status = h('p', { class: 'status', role: 'status' });
  show(h('section', { class: 'screen result' },
    h('p', { class: 'kicker' }, `${g.title} · 도전 결과`),
    h('h2', { class: 'big' }, res.winner === 0 ? '이겼어요' : res.winner === 1 ? '졌어요' : '무승부'),
    scoreboard(g, names, scores, res.winner),
    penalty(loser, ch.bet),
    h('div', { class: 'stack' },
      h('button', {
        type: 'button', class: 'btn primary',
        onclick: async () => {
          const r = await shareText(msg);
          status.textContent = { shared: '보냈어요.', copied: '결과를 복사했어요.', failed: '복사하지 못했어요.', cancelled: '' }[r];
        },
      }, '결과 알려주기'),
      status,
      h('button', {
        type: 'button', class: 'btn',
        onclick: () => { history.replaceState(null, '', location.pathname + location.search); linkSetup(g, { bet: ch.bet }); },
      }, '나도 도전장 보내기'),
      h('button', { type: 'button', class: 'btn ghost', onclick: leaveChallenge }, '처음으로'))));
}

// ---------- 화면: 혼자 연습 ----------
function practice(g) {
  play(g, {
    seed: newSeed(), lives: 1, label: '연습',
    onDone: (score) => {
      const isBest = recordBest(g, score) && score > 0;
      if (isBest) sfx.win();
      show(h('section', { class: 'screen result' },
        h('p', { class: 'kicker' }, `${g.title} · 혼자 연습`),
        h('h2', { class: 'big' }, `${score}${g.unit}`, isBest ? h('span', { class: 'newbest' }, '최고 기록') : null),
        h('p', { class: 'lede' }, isBest ? '새 최고 기록이에요.' : `최고 기록은 ${bestOf(g)}${g.unit}예요.`),
        h('div', { class: 'stack' },
          h('button', { type: 'button', class: 'btn primary', onclick: () => practice(g) }, '바로 다시'),
          h('button', { type: 'button', class: 'btn', onclick: () => linkSetup(g) }, '이 게임으로 도전장 보내기'),
          h('button', { type: 'button', class: 'btn ghost', onclick: () => pickSolo(g) }, '다른 게임 고르기'))));
    },
  });
}

function pickSolo(last) {
  show(h('section', { class: 'screen' },
    topbar(home),
    h('p', { class: 'kicker' }, '혼자 연습'),
    h('h2', {}, '다음 게임은?'),
    gameGrid(gameMenu, { current: last.id })));
}

// ---------- 화면: 게임 ----------
function play(game, { seed, lives, target = null, label, onDone }) {
  const s = game.create(seed, lives);
  if (QA.has('qa')) globalThis.__qa = { s, game }; // 검수용: ?qa 일 때만
  const auto = QA.has('bot');
  const canvas = h('canvas', { class: 'stage-canvas', role: 'img', 'aria-label': `${game.title} 화면` });
  const scoreEl = h('div', { class: 'count' }, '0');
  const targetEl = target != null ? h('div', { class: 'target' }, `목표 ${target + 1}${game.unit}`) : null;
  const livesEl = h('div', { class: 'lives' });
  const hintTitle = h('strong', {}, '화면을 누르면 시작');
  const hintRule = h('span', {}, game.rule);
  const hint = h('div', { class: 'hint' }, hintTitle, hintRule);
  const quit = h('button', { type: 'button', class: 'hud-btn', 'aria-label': '그만하기' }, icon('close'));
  const stage = h('div', { class: 'stage' },
    canvas,
    h('div', { class: 'hud' },
      h('div', { class: 'hud-side' }, h('span', { class: 'who' }, label), livesEl),
      h('div', { class: 'hud-center' }, scoreEl, targetEl),
      h('div', { class: 'hud-side right' }, soundToggle(true), quit)),
    hint);
  show(stage);

  const ctx = canvas.getContext('2d');
  const v = { W: 0, H: 0, dpr: 1, fx: new Fx(), dt: 0, layout: null, lastInputX: null, lastInputT: -9 };
  const resize = () => {
    v.dpr = Math.min(window.devicePixelRatio || 1, 3);
    v.W = canvas.clientWidth;
    v.H = canvas.clientHeight;
    canvas.width = Math.round(v.W * v.dpr);
    canvas.height = Math.round(v.H * v.dpr);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let started = false; let paused = false; let ended = false; let done = false;
  let raf = 0; let last = performance.now(); let acc = 0; let countdown = 0;
  const pointers = new Map();
  const renderLives = () => { livesEl.textContent = `목숨 ${'●'.repeat(Math.max(s.lives, 0))}`; };
  renderLives();

  const begin = () => {
    started = true; paused = false; countdown = 1.2;
    hintTitle.textContent = '3';
    hintRule.hidden = true;
    hint.classList.add('counting');
    hint.hidden = false;
    last = performance.now();
  };
  const send = (type, x, y) => {
    if (!started || paused || countdown > 0 || ended) return;
    if (type === 'down') { v.lastInputX = x; v.lastInputT = s.t; }
    game.input(s, { type, x, y });
  };
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  function onDown(e) {
    if (e.target?.closest?.('button')) return;
    e.preventDefault();
    audio.unlock();
    if (ended) return;
    if (!started || paused) { begin(); return; }
    const [x, y] = pos(e);
    pointers.set(e.pointerId, x);
    try { stage.setPointerCapture(e.pointerId); } catch { /* 일부 브라우저 */ }
    send('down', x, y);
  }
  function onUp(e) {
    if (!pointers.has(e.pointerId)) return;
    const x = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    send('up', x, 0.5);
  }
  const keyX = { Space: 0.5, ArrowLeft: 0.2, ArrowRight: 0.8, ArrowUp: 0.8 };
  const onKey = (e) => {
    if (!(e.code in keyX) || e.repeat) return;
    e.preventDefault();
    audio.unlock();
    if (e.type === 'keydown') {
      if (!started || paused) { begin(); return; }
      send('down', keyX[e.code], 0.5);
    } else send('up', keyX[e.code], 0.5);
  };
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKey);
  const offHidden = onHidden(() => {
    if (started && !ended) {
      paused = true;
      countdown = 0;
      for (const id of [...pointers.keys()]) onUp({ pointerId: id });
      hintTitle.textContent = '화면을 누르면 계속';
      hintRule.hidden = false;
      hint.classList.remove('counting');
      hint.hidden = false;
    }
    audio.suspend();
  });
  quit.addEventListener('click', () => finish());

  function common(ev) {
    if (ev.type === 'score') {
      if (!ev.quiet) { if (ev.perfect) { sfx.perfect(ev.combo); vibrate(12); } else sfx.tick(ev.combo); }
      scoreEl.textContent = String(s.score);
      scoreEl.classList.remove('pop'); void scoreEl.offsetWidth; scoreEl.classList.add('pop');
      if (target != null && targetEl && !targetEl.classList.contains('passed') && s.score > target) {
        targetEl.textContent = '역전!';
        targetEl.classList.add('passed');
        sfx.stage();
        v.fx.text(v.W / 2, v.H * 0.3, '역전!', { color: RED, size: 34, life: 1 });
      }
    } else if (ev.type === 'fail') {
      sfx.hit(); vibrate(70);
      v.fx.shake(9, 0.3); v.fx.flash(RED, 0.18); v.fx.hitstop(90);
      renderLives();
      if (!s.over && s.lives > 0) v.fx.text(v.W / 2, v.H * 0.42, '목숨 1개 사용', { color: RED, size: 20, life: 0.9 });
    } else if (ev.type === 'over') {
      sfx.over();
      ended = true;
      setTimeout(finish, 1100);
    } else if (ev.type === 'jump') sfx.jump();
    else if (ev.type === 'whoosh') sfx.whoosh();
    else if (ev.type === 'thud') sfx.thud();
    else if (ev.type === 'stage') { sfx.stage(); v.fx.text(v.W / 2, v.H * 0.5, `${ev.stage + 1}단계`, { color: RED, size: 28, life: 1 }); }
  }

  const FIXED = 1 / 240;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    v.dt = dt;
    v.fx.update(dt);
    if (started && !paused && !ended) {
      if (countdown > 0) {
        countdown -= dt;
        if (countdown <= 0) { hint.hidden = true; hint.classList.remove('counting'); acc = 0; }
        else hintTitle.textContent = String(Math.ceil(countdown / 0.4));
      } else if (v.fx.stop > 0) {
        v.fx.stop -= dt;
      } else {
        acc += dt;
        while (acc >= FIXED && !s.over) {
          if (auto) { const ev = game.bot(s); if (ev) for (const e of [].concat(ev)) game.input(s, e); }
          game.step(s, FIXED);
          acc -= FIXED;
        }
      }
    }
    for (const ev of s.events) { common(ev); game.onEvent?.(ev, s, v); }
    s.events.length = 0;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    const [ox, oy] = v.fx.offset();
    ctx.save();
    ctx.translate(ox, oy);
    game.draw(ctx, s, v);
    v.fx.draw(ctx);
    ctx.restore();
    v.fx.drawOverlay(ctx, v.W, v.H, FONT);
    if (ended) {
      ctx.fillStyle = 'rgba(20,18,26,0.28)';
      ctx.fillRect(0, 0, v.W, v.H);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `200 72px ${FONT}`;
      ctx.fillText(String(s.score), v.W / 2, v.H * 0.44);
      ctx.font = `600 16px ${FONT}`;
      ctx.fillText(`${game.title} 끝`, v.W / 2, v.H * 0.44 + 52);
      ctx.restore();
    }
  }
  raf = requestAnimationFrame(frame);

  const stop = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    removeEventListener('keydown', onKey);
    removeEventListener('keyup', onKey);
    offHidden();
  };
  function finish() {
    if (done) return;
    done = true;
    stop();
    cleanup = null;
    onDone(s.score);
  }
  cleanup = () => { if (!done) { done = true; stop(); } };
  if (auto) begin();
}

// ---------- 시작 ----------
function boot() {
  const ch = readChallengeFromHash(location.hash);
  if (ch) challengeIntro(ch);
  else if (QA.get('game') && byId(QA.get('game'))) gameMenu(byId(QA.get('game')));
  else home();
}
addEventListener('hashchange', boot);
boot();
