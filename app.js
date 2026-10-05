// 화면과 흐름 v0.4: 게임 바깥 화면은 토스 디자인 시스템(TDS) 문법을 따릅니다. 기준: DESIGN.md 8장.
// 게임 규칙은 games/, 대결 규칙은 duel.js, 웹과 앱의 차이는 platform.js에 있습니다.
import { GAMES, byId } from './games/index.js';
import {
  BETS, LIMIT, cleanName, cleanBet, newSeed, pairNames, encodeChallenge, readChallengeFromHash,
  decide, nextLives, recordKey, addRecord,
} from './duel.js';
import { loadJSON, saveJSON, vibrate, challengeUrl, shareText, onHidden } from './platform.js';
import { Fx } from './core/fx.js';
import { createAudio } from './core/audio.js';
import { FONT, ACCENT as RED } from './core/draw.js';

export const VERSION = '0.4.0';
const KEY = 'hanpan.v1';
const QA = new URLSearchParams(location.search);

const store = loadJSON(KEY, {
  best: {}, sound: true, handicap: true, names: ['나', '상대'], bet: BETS[0], myName: '', h2h: {},
});
if (typeof store.best === 'number') store.best = { rope: store.best }; // v0.1 기록 옮기기
const persist = () => saveJSON(KEY, store);
const bestOf = (g) => store.best[g.id] || 0;
function recordBest(g, score) {
  if (score > bestOf(g)) { store.best = { ...store.best, [g.id]: score }; persist(); return true; }
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

// ---------- TDS 문법의 공용 부품 ----------
const ICONS = {
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9 5l7 7-7 7',
  soundOn: 'M4 9v6h4l5 4V5L8 9H4z M16 8.5a5 5 0 0 1 0 7 M18.5 6a8.5 8.5 0 0 1 0 12',
  soundOff: 'M4 9v6h4l5 4V5L8 9H4z M16 9.5l5 5 M21 9.5l-5 5',
  close: 'M6 6l12 12 M18 6L6 18',
  duo: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3.5 19c.4-3 2.7-5 5.5-5s5.1 2 5.5 5 M16 5.2a3 3 0 0 1 0 5.6 M17.5 14.2c1.7.6 2.8 2.4 3 4.8',
  send: 'M21 3L10 14 M21 3l-7 18-4-7-7-4 18-7z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 12.5v-1',
  swap: 'M7 7h11l-3-3 M17 17H6l3 3',
  home: 'M4 11l8-7 8 7 M6 9.5V20h12V9.5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
};
function icon(name, size = 24) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
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

// 상단 내비게이션(뒤로가기). 앱인토스에서는 토스 내비게이션 바가 위에 따로 붙습니다.
const navBar = (onBack, label = '뒤로') => h('header', { class: 'nav' },
  onBack ? h('button', { type: 'button', class: 'nav-back', 'aria-label': label, onclick: onBack }, icon('back')) : null);

const titleBlock = (title, desc, extra) => h('div', { class: 'top' },
  h('h1', { class: 'top-title' }, title, extra || null),
  desc ? h('p', { class: 'top-desc' }, desc) : null);

const sectionHeader = (text) => h('h2', { class: 'section-header' }, text);
const divider = () => h('div', { class: 'divider', role: 'presentation' });

// 목록 행: 왼쪽 아이콘, 제목·설명, 오른쪽 값·화살표(또는 스위치).
function listRow({ iconName, tone = 'blue', title, sub, right, chevron = false, onClick, control }) {
  const tag = onClick ? 'button' : 'div';
  return h(tag, { type: onClick ? 'button' : null, class: `list-row${onClick ? ' pressable' : ''}`, onclick: onClick || null },
    iconName ? h('span', { class: `row-icon tone-${tone}` }, icon(iconName, 22)) : null,
    h('span', { class: 'row-text' },
      h('span', { class: 'row-title' }, title),
      sub ? h('span', { class: 'row-sub' }, sub) : null),
    right != null ? h('span', { class: 'row-right' }, right) : null,
    control || null,
    chevron ? h('span', { class: 'row-chevron' }, icon('chevron', 20)) : null);
}

function switchEl(checked, onChange, label) {
  const btn = h('button', { type: 'button', role: 'switch', class: 'switch', 'aria-checked': String(checked), 'aria-label': label },
    h('span', { class: 'switch-knob' }));
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  return btn;
}

function textField(label, value, { maxlength = LIMIT.name, placeholder = '' } = {}) {
  const input = h('input', { class: 'tf-input', type: 'text', maxlength, autocomplete: 'off', placeholder });
  input.value = value || '';
  return { el: h('label', { class: 'tf' }, h('span', { class: 'tf-label' }, label), input), input };
}

const button = (label, onClick, { variant = 'primary', size = 'xl' } = {}) =>
  h('button', { type: 'button', class: `btn btn-${variant} btn-${size}`, onclick: onClick }, label);

// 화면 아래 고정 버튼(1개 또는 2개).
function bottomCTA(primary, secondary) {
  return h('div', { class: 'cta' },
    h('div', { class: `cta-inner${secondary ? ' double' : ''}` },
      secondary ? button(secondary.label, secondary.onClick, { variant: 'weak' }) : null,
      button(primary.label, primary.onClick, { variant: 'primary' })));
}

const textButton = (label, onClick) => h('button', { type: 'button', class: 'text-btn', onclick: onClick }, label);
const badge = (text, tone = 'blue') => h('span', { class: `badge tone-${tone}` }, text);

let toastTimer = 0;
function toast(msg) {
  if (!msg) return;
  let el = document.querySelector('.toast');
  if (!el) { el = h('div', { class: 'toast', role: 'status' }); document.body.append(el); }
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

function page(cls, ...kids) {
  return h('section', { class: `screen ${cls || ''}` }, ...kids);
}

function soundToggle(compact = false) {
  if (!compact) return switchEl(store.sound, (v) => { store.sound = v; persist(); if (!v) audio.suspend(); }, '효과음');
  const btn = h('button', { type: 'button', class: 'hud-btn' });
  const render = () => {
    btn.setAttribute('aria-pressed', String(store.sound));
    btn.setAttribute('aria-label', store.sound ? '소리 끄기' : '소리 켜기');
    btn.replaceChildren(icon(store.sound ? 'soundOn' : 'soundOff', 22));
  };
  render();
  btn.addEventListener('click', () => { store.sound = !store.sound; persist(); if (!store.sound) audio.suspend(); render(); });
  return btn;
}

function betPicker(initial) {
  const labels = [...BETS, '직접 쓰기'];
  let chosen = BETS.includes(initial) ? initial : initial ? '직접 쓰기' : BETS[0];
  const custom = textField('내기 직접 쓰기', chosen === '직접 쓰기' ? initial : '', { maxlength: LIMIT.bet, placeholder: '예: 이번 주 장보기' });
  const chips = labels.map((label) => h('button', {
    type: 'button', class: 'chip',
    onclick: () => { chosen = label; sync(); if (label === '직접 쓰기') custom.input.focus(); },
  }, label));
  function sync() {
    chips.forEach((c, i) => c.setAttribute('aria-pressed', String(labels[i] === chosen)));
    custom.el.hidden = chosen !== '직접 쓰기';
  }
  sync();
  return {
    el: h('div', { class: 'group' }, h('div', { class: 'chips', role: 'group', 'aria-label': '지는 사람이 할 일' }, chips), custom.el),
    value: () => (chosen === '직접 쓰기' ? cleanBet(custom.input.value) : chosen),
  };
}

function scoreList(g, names, scores, winner) {
  return h('div', { class: 'list' }, names.map((n, i) => listRow({
    title: h('span', {}, n, winner === i ? badge('승', 'blue') : null),
    right: h('span', { class: 'score' }, `${scores[i]}${g.unit}`),
  })));
}

function penaltyCard(loserName, bet) {
  if (loserName == null) return h('div', { class: 'card-soft' }, h('p', { class: 'card-caption' }, '무승부'), h('p', { class: 'card-title' }, '한 판 더 해서 정하세요'));
  return h('div', { class: 'card-soft tone-red' },
    h('p', { class: 'card-caption' }, '내기 당첨'),
    h('p', { class: 'card-title' }, `${loserName}, ${bet}`));
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

// 썸네일: 휴대폰 크기(360x640)로 그린 뒤 게임이 정한 초점 주변을 캔버스 비율대로 잘라 씁니다.
function drawThumb(game, canvas) {
  const { W, H, dpr } = sizeCanvas(canvas);
  const VW = 360; const VH = 640; const k = 2;
  const off = document.createElement('canvas');
  off.width = VW * k; off.height = VH * k;
  const octx = off.getContext('2d');
  octx.setTransform(k, 0, 0, k, 0, 0);
  const s = warm(game, 7, 4);
  game.draw(octx, s, { W: VW, H: VH, dpr: k, fx: new Fx(), dt: 1, layout: null, thumb: true });
  const ch = Math.min(VH, VW * (H / W));
  const cy = Math.min(VH - ch / 2, Math.max(ch / 2, VH * (game.focus ?? 0.5)));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(off, 0, (cy - ch / 2) * k, VW * k, ch * k, 0, 0, W * dpr, H * dpr);
}

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
// 처음 화면, 대결 후 '다음 게임', 연습 후 '다른 게임'이 이 부품 하나를 같이 씁니다.
const thumbCache = new Map();
function gameGrid(onPick, { current = null } = {}) {
  const cards = GAMES.map((g) => {
    const canvas = h('canvas', { class: 'thumb', 'aria-hidden': 'true' });
    const best = bestOf(g);
    const card = h('button', { type: 'button', class: 'game-card', onclick: () => onPick(g), 'aria-label': `${g.title}, ${g.control}${best ? `, 최고 ${best}${g.unit}` : ''}${g.id === current ? ', 방금 한 게임' : ''}` },
      h('span', { class: 'thumb-wrap' }, canvas, g.id === current ? badge('방금 한 게임', 'white') : null),
      h('span', { class: 'card-text' },
        h('span', { class: 'card-name' }, g.title),
        h('span', { class: 'card-meta' }, best ? `최고 ${best}${g.unit}` : g.control)));
    return { card, canvas, g };
  });
  const el = h('div', { class: 'game-grid' }, cards.map((c) => c.card));
  requestAnimationFrame(() => cards.forEach((c) => {
    if (!c.canvas.isConnected) return;
    const key = `${c.g.id}:${c.canvas.clientWidth}`;
    if (thumbCache.has(key)) {
      const { W, H, dpr } = sizeCanvas(c.canvas);
      c.canvas.getContext('2d').drawImage(thumbCache.get(key), 0, 0, W * dpr, H * dpr);
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
  const played = Object.keys(store.best).length;
  show(page('home',
    titleBlock('한판내기', '1분짜리 게임으로 내기해요. 진 사람이 설거지!'),
    gameGrid(gameMenu),
    divider(),
    sectionHeader('설정'),
    h('div', { class: 'list' },
      listRow({ title: '효과음', control: soundToggle() }),
      listRow({ title: '해 본 게임', right: `${played} / ${GAMES.length}` })),
    h('p', { class: 'footnote' }, '두 사람이 같은 판으로 겨뤄요. 기록은 이 기기에만 저장돼요.')));
}

// ---------- 화면: 게임 고르기 ----------
function gameMenu(g) {
  const demo = h('canvas', { class: 'demo', role: 'img', 'aria-label': `${g.title} 플레이 미리보기` });
  const best = bestOf(g);
  show(page('',
    navBar(home, '게임 목록으로'),
    demo,
    titleBlock(g.title, g.rule),
    divider(),
    sectionHeader('어떻게 할까요?'),
    h('div', { class: 'list' },
      listRow({ iconName: 'duo', tone: 'blue', title: '둘이 한 폰으로', sub: '번갈아 하고, 진 사람이 내기해요', chevron: true, onClick: () => duoSetup(g) }),
      listRow({ iconName: 'send', tone: 'teal', title: '도전장 보내기', sub: '링크를 받은 사람이 같은 판으로 도전해요', chevron: true, onClick: () => linkSetup(g) }),
      listRow({ iconName: 'target', tone: 'grey', title: '혼자 연습', sub: best ? `내 최고 기록 ${best}${g.unit}` : `${g.ref} 방식 · ${g.control}`, chevron: true, onClick: () => practice(g) }))));
  requestAnimationFrame(() => { if (demo.isConnected) cleanup = runDemo(g, demo); });
}

// ---------- 화면: 둘이 한 폰으로 ----------
function duoSetup(g) {
  const a = textField('먼저 할 사람', store.names[0]);
  const b = textField('다음 사람', store.names[1]);
  const bet = betPicker(store.bet);
  let handicap = store.handicap;
  const start = () => {
    const names = pairNames(a.input.value, b.input.value);
    Object.assign(store, { names, bet: bet.value(), handicap });
    persist();
    startDuo({ game: g, names, bet: store.bet, handicap, lives: [1, 1], round: 1, first: 0 });
  };
  show(page('has-cta',
    navBar(() => gameMenu(g)),
    titleBlock('누가 할까요?', `${g.title} · 폰 하나로 번갈아 해요`),
    h('div', { class: 'fields' }, a.el, b.el),
    divider(),
    sectionHeader('지는 사람이'),
    bet.el,
    divider(),
    h('div', { class: 'list' },
      listRow({ title: '실력 차이 보정', sub: '진 사람은 다음 판에 목숨 2개', control: switchEl(handicap, (v) => { handicap = v; }, '실력 차이 보정') })),
    bottomCTA({ label: '시작하기', onClick: start })));
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
  const notes = [];
  if (turn === 1) notes.push(listRow({ title: `${match.names[prevIdx]} 기록`, right: h('span', { class: 'score' }, `${match.scores[prevIdx]}${g.unit}`) }));
  notes.push(listRow({ title: '목숨', right: match.lives[idx] > 1 ? '2개 (지난 판 보정)' : '1개' }));
  show(page('has-cta',
    art,
    h('p', { class: 'eyebrow first' }, `${g.title} · ${match.round}판 · ${turn + 1}번째`),
    titleBlock(`${name} 차례예요`, turn === 1 ? `폰을 ${name}에게 건네주세요. 앞사람 기록보다 많으면 이겨요.` : `폰을 ${name}에게 건네주세요.`),
    h('div', { class: 'list' }, notes),
    bottomCTA({
      label: '준비됐어요',
      onClick: () => play(g, {
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
    })));
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
  show(page('has-cta',
    navBar(home, '처음으로'),
    titleBlock(res.winner === null ? '무승부예요' : `${match.names[res.winner]} 승리!`, `${g.title} · ${match.round}판 결과`),
    penaltyCard(res.loser === null ? null : match.names[res.loser], match.bet),
    scoreList(g, match.names, match.scores, res.winner),
    divider(),
    h('div', { class: 'list' },
      listRow({ title: '전적', right: `${A} ${rec[A]} : ${rec[B]} ${B}` }),
      res.loser !== null && match.handicap ? listRow({ title: '다음 판 보정', right: `${match.names[res.loser]} 목숨 2개` }) : null),
    bottomCTA(
      { label: '한 판 더', onClick: () => startDuo({ ...match, counted: false, round: match.round + 1, lives, first: 1 - match.first }) },
      { label: '다른 게임', onClick: () => pickNext(match, lives) })));
}

// 같은 두 사람, 같은 내기로 게임만 바꿔 이어 갑니다(전적은 이어서 셉니다).
function pickNext(match, lives) {
  show(page('',
    navBar(() => duoResult(match), '결과로'),
    titleBlock('다음 게임은?', `${match.names[0]} 대 ${match.names[1]} · ${match.bet}. 전적은 이어서 세요.`),
    gameGrid((g) => startDuo({ ...match, counted: false, game: g, round: match.round + 1, lives, first: 1 - match.first }), { current: match.game.id })));
}

// ---------- 화면: 링크 도전장 ----------
function linkSetup(g, prefill = {}) {
  const me = textField('내 이름', store.myName);
  const bet = betPicker(prefill.bet || store.bet);
  const go = () => {
    const name = cleanName(me.input.value, '나');
    Object.assign(store, { myName: name, bet: bet.value() });
    persist();
    recordForLink(g, name, store.bet);
  };
  show(page('has-cta',
    navBar(() => gameMenu(g)),
    titleBlock('먼저 한 판 하고\n기록을 보내요', `받은 사람은 똑같은 판으로 ${g.title}에 도전해요.`),
    h('div', { class: 'fields' }, me.el),
    divider(),
    sectionHeader('지는 사람이'),
    bet.el,
    bottomCTA({ label: '한 판 하기', onClick: go })));
}

function recordForLink(g, name, bet) {
  const seed = newSeed();
  play(g, { seed, lives: 1, label: name, onDone: (score) => linkReady(g, { game: g.id, seed, name, score, bet }) });
}

async function shareAndToast(msg, texts) {
  const r = await shareText(msg);
  toast(texts[r]);
}

function linkReady(g, ch) {
  const isBest = recordBest(g, ch.score);
  const url = challengeUrl(encodeChallenge(ch));
  const msg = `[${g.title}] ${ch.name}의 기록 ${ch.score}${g.unit}. 지는 사람이 ${ch.bet}. 이길 수 있어요?\n${url}`;
  show(page('has-cta',
    navBar(home, '처음으로'),
    titleBlock(`${ch.score}${g.unit}`, '이 기록으로 도전장을 보낼까요?', isBest ? badge('최고 기록', 'red') : null),
    h('div', { class: 'card-soft' }, h('p', { class: 'card-caption' }, '보낼 메시지'), h('p', { class: 'card-body' }, msg)),
    bottomCTA(
      { label: '도전장 보내기', onClick: () => shareAndToast(msg, { shared: '보냈어요', copied: '복사했어요. 카톡에 붙여 넣으세요', failed: '복사하지 못했어요. 메시지를 길게 눌러 복사해 주세요', cancelled: '' }) },
      { label: '다시 하기', onClick: () => recordForLink(g, ch.name, ch.bet) })));
}

function leaveChallenge() {
  history.replaceState(null, '', location.pathname + location.search);
  home();
}

function challengeIntro(ch) {
  const g = byId(ch.game);
  if (!g) {
    show(page('has-cta',
      titleBlock('이 게임은 아직 없어요', '도전장을 보낸 사람의 앱이 더 새 버전일 수 있어요. 새로고침해 보세요.'),
      bottomCTA({ label: '처음으로', onClick: leaveChallenge })));
    return;
  }
  const me = textField('내 이름', store.myName);
  const demo = h('canvas', { class: 'demo short', role: 'img', 'aria-label': `${g.title} 플레이 미리보기` });
  const go = () => {
    const name = pairNames(ch.name, me.input.value)[1];
    store.myName = name;
    persist();
    play(g, { seed: ch.seed, lives: 1, target: ch.score, label: name, onDone: (score) => challengeResult(g, ch, name, score) });
  };
  show(page('has-cta',
    h('p', { class: 'eyebrow first' }, `도전장 · ${g.title}`),
    titleBlock(`${ch.name}의 기록 ${ch.score}${g.unit}`, `${g.rule} 같은 판으로 한 번, 목숨은 1개예요.`),
    h('div', { class: 'card-soft tone-red' }, h('p', { class: 'card-caption' }, '지는 사람이'), h('p', { class: 'card-title' }, ch.bet)),
    demo,
    h('div', { class: 'fields' }, me.el),
    h('div', { class: 'center' }, textButton('나중에 할게요', leaveChallenge)),
    bottomCTA({ label: '도전하기', onClick: go })));
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
  show(page('has-cta',
    navBar(leaveChallenge, '처음으로'),
    titleBlock(res.winner === 0 ? '이겼어요!' : res.winner === 1 ? '아쉽게 졌어요' : '무승부예요', `${g.title} · 도전 결과`),
    penaltyCard(loser, ch.bet),
    scoreList(g, names, scores, res.winner),
    divider(),
    h('div', { class: 'list' },
      listRow({ iconName: 'send', tone: 'teal', title: '나도 도전장 보내기', sub: '이번엔 내가 먼저 해요', chevron: true, onClick: () => { history.replaceState(null, '', location.pathname + location.search); linkSetup(g, { bet: ch.bet }); } })),
    bottomCTA({ label: '결과 알려주기', onClick: () => shareAndToast(msg, { shared: '보냈어요', copied: '결과를 복사했어요', failed: '복사하지 못했어요', cancelled: '' }) })));
}

// ---------- 화면: 혼자 연습 ----------
function practice(g) {
  play(g, {
    seed: newSeed(), lives: 1, label: '연습',
    onDone: (score) => {
      const isBest = recordBest(g, score) && score > 0;
      if (isBest) sfx.win();
      const art = h('canvas', { class: 'thumb hero', 'aria-hidden': 'true' });
      requestAnimationFrame(() => { if (art.isConnected) drawThumb(g, art); });
      show(page('has-cta',
        navBar(home, '처음으로'),
        art,
        titleBlock(`${score}${g.unit}`, isBest ? '새 최고 기록이에요!' : `${g.title} · 최고 기록은 ${bestOf(g)}${g.unit}예요`, isBest ? badge('최고 기록', 'red') : null),
        h('div', { class: 'list' },
          listRow({ iconName: 'send', tone: 'teal', title: '이 게임으로 도전장 보내기', chevron: true, onClick: () => linkSetup(g) }),
          listRow({ iconName: 'duo', tone: 'blue', title: '둘이 한 폰으로 하기', chevron: true, onClick: () => duoSetup(g) })),
        bottomCTA({ label: '바로 다시', onClick: () => practice(g) }, { label: '다른 게임', onClick: () => pickSolo(g) })));
    },
  });
}

function pickSolo(last) {
  show(page('',
    navBar(home, '처음으로'),
    titleBlock('다음 게임은?', '하고 싶은 게임을 골라요.'),
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
  const livesEl = h('span', { class: 'lives' });
  const hintTitle = h('strong', {}, '화면을 누르면 시작');
  const hintRule = h('span', {}, game.rule);
  const hint = h('div', { class: 'hint' }, hintTitle, hintRule);
  const quit = h('button', { type: 'button', class: 'hud-btn', 'aria-label': '그만하기' }, icon('close', 22));
  // 오른쪽 위는 앱인토스의 '더보기·닫기' 버튼 자리라 비워 둡니다.
  const stage = h('div', { class: 'stage' },
    canvas,
    h('div', { class: 'hud' },
      h('div', { class: 'hud-top' }, quit, soundToggle(true)),
      h('div', { class: 'hud-center' }, scoreEl, h('div', { class: 'hud-sub' }, h('span', { class: 'who' }, label), livesEl), targetEl)),
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
  const renderLives = () => { livesEl.textContent = '●'.repeat(Math.max(s.lives, 0)); };
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
    else if (ev.type === 'stage') { sfx.stage(); v.fx.text(v.W / 2, v.H * 0.5, `${ev.stage + 1}단계`, { size: 28, life: 1 }); }
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
