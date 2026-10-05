// 화면과 조작. 규칙은 rope.js와 duel.js, 웹과 앱의 차이는 platform.js에 있습니다.
import { createRun, step, jump, ropeShape, ROPE } from './rope.js';
import {
  BETS, LIMIT, cleanName, cleanBet, newSeed, pairNames, encodeChallenge, readChallengeFromHash,
  decide, nextLives, recordKey, addRecord,
} from './duel.js';
import { loadJSON, saveJSON, vibrate, challengeUrl, shareText, onHidden } from './platform.js';

export const VERSION = '0.1.1';
const KEY = 'hanpan.v1';
const COLORS = { paper: '#f3eee4', ink: '#1c1a17', rule: '#d6cdbd', red: '#c23b2c', mute: '#7a7266' };

const store = loadJSON(KEY, {
  best: 0, sound: true, handicap: true, names: ['나', '상대'], bet: BETS[0], myName: '', h2h: {},
});
const persist = () => saveJSON(KEY, store);

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
function show(el) {
  view.replaceChildren(el);
  window.scrollTo(0, 0);
}

function josa(word, withFinal, withoutFinal) {
  const c = word.charCodeAt(word.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return word + ((c - 0xac00) % 28 ? withFinal : withoutFinal);
  return `${word}${withFinal}(${withoutFinal})`;
}

// ---------- 소리 ----------
let actx = null;
function audio() {
  if (!store.sound) return null;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  } catch {
    return null;
  }
}
function tone(freq, dur, type = 'square', gain = 0.05, slideTo) {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
const sfx = {
  clear: () => tone(880, 0.05, 'square', 0.035),
  jump: () => tone(300, 0.08, 'triangle', 0.05, 520),
  hit: () => tone(150, 0.22, 'sawtooth', 0.06, 90),
  over: () => { tone(440, 0.15, 'triangle', 0.06, 330); setTimeout(() => tone(330, 0.25, 'triangle', 0.06, 220), 160); },
  win: () => { tone(523, 0.1, 'triangle', 0.06); setTimeout(() => tone(784, 0.2, 'triangle', 0.06), 110); },
};

function soundToggle(compact = false) {
  const label = () => (compact ? (store.sound ? '소리 켬' : '소리 끔') : (store.sound ? '소리 켜짐' : '소리 꺼짐'));
  const btn = h('button', { type: 'button', class: compact ? 'hud-btn' : 'link', 'aria-pressed': String(store.sound) }, label());
  btn.addEventListener('click', () => {
    store.sound = !store.sound;
    persist();
    if (!store.sound) actx?.suspend?.();
    btn.textContent = label();
    btn.setAttribute('aria-pressed', String(store.sound));
  });
  return btn;
}

// ---------- 공용 조각 ----------
const topbar = (onBack) => h('div', { class: 'topbar' }, h('button', { type: 'button', class: 'link', onclick: onBack }, '처음으로'));

function betPicker(initial) {
  const labels = [...BETS, '직접 쓰기'];
  let chosen = BETS.includes(initial) ? initial : initial ? '직접 쓰기' : BETS[0];
  const input = h('input', {
    class: 'field', type: 'text', maxlength: LIMIT.bet, placeholder: '예: 이번 주 장보기', 'aria-label': '내기 직접 쓰기',
  });
  if (chosen === '직접 쓰기') input.value = initial;
  const custom = h('div', { class: 'custom-bet' }, input);
  const chips = labels.map((label) => h('button', {
    type: 'button',
    class: 'chip',
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

function scoreboard(names, scores, winner) {
  return h('div', { class: 'board' }, names.map((n, i) => h('div', { class: `row${winner === i ? ' win' : ''}` },
    h('span', { class: 'row-name' }, n),
    h('span', { class: 'row-score' }, `${scores[i]}개`))));
}

function penalty(loserName, bet) {
  if (loserName == null) return h('div', { class: 'penalty tie' }, h('span', { class: 'penalty-label' }, '무승부'), h('p', {}, '한 판 더 해서 정하세요.'));
  return h('div', { class: 'penalty' },
    h('span', { class: 'penalty-label' }, '내기 당첨'),
    h('strong', { class: 'penalty-name' }, loserName),
    h('p', { class: 'penalty-bet' }, bet));
}

// ---------- 화면: 처음 ----------
function home() {
  show(h('section', { class: 'screen home' },
    h('p', { class: 'kicker' }, '한판내기 · 첫 번째 게임'),
    h('h1', {}, '줄넘기 내기'),
    h('p', { class: 'lede' }, '줄이 갑자기 느려지고 빨라져요. 박자만 믿고 뛰면 걸립니다. 더 많이 넘은 사람이 이기고, 진 사람이 내기를 합니다.'),
    h('div', { class: 'stack' },
      h('button', { type: 'button', class: 'btn primary', onclick: duoSetup }, '둘이 한 폰으로'),
      h('button', { type: 'button', class: 'btn', onclick: () => linkSetup() }, '링크로 도전장 보내기'),
      h('button', { type: 'button', class: 'btn ghost', onclick: practice }, '혼자 연습')),
    h('footer', { class: 'foot' },
      h('span', {}, store.best ? `내 최고 기록 ${store.best}개` : '아직 기록이 없어요'),
      soundToggle())));
}

// ---------- 화면: 둘이 한 폰으로 ----------
function duoSetup() {
  const a = nameField('먼저 할 사람', store.names[0]);
  const b = nameField('다음 사람', store.names[1]);
  const bet = betPicker(store.bet);
  const hc = h('input', { type: 'checkbox' });
  hc.checked = store.handicap;
  show(h('section', { class: 'screen' },
    topbar(home),
    h('p', { class: 'kicker' }, '둘이 한 폰으로'),
    h('h2', {}, '누가 할까요?'),
    a.el, b.el,
    bet.el,
    h('label', { class: 'check' }, hc, h('span', {}, '실력 차이 보정: 진 사람은 다음 판에 목숨 2개')),
    h('button', {
      type: 'button',
      class: 'btn primary',
      onclick: () => {
        const names = pairNames(a.input.value, b.input.value);
        Object.assign(store, { names, bet: bet.value(), handicap: hc.checked });
        persist();
        startDuo({ names, bet: store.bet, handicap: hc.checked, lives: [1, 1], round: 1, first: 0 });
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
  const idx = match.order[turn];
  const name = match.names[idx];
  const prevIdx = match.order[0];
  show(h('section', { class: 'screen handoff' },
    h('p', { class: 'kicker' }, `${match.round}판 · ${turn + 1}번째 차례`),
    h('h2', { class: 'big' }, `${name} 차례`),
    h('p', { class: 'lede' }, `폰을 ${name}에게 건네주세요.`),
    turn === 1 ? h('p', { class: 'note' }, `${match.names[prevIdx]} 기록 ${match.scores[prevIdx]}개. 이보다 많이 넘으면 이겨요.`) : null,
    match.lives[idx] > 1 ? h('p', { class: 'note' }, '지난 판 보정으로 목숨 2개로 시작해요.') : null,
    h('button', {
      type: 'button',
      class: 'btn primary',
      onclick: () => play({
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
  const res = decide(match.scores);
  store.h2h = addRecord(store.h2h, match.names, res);
  store.best = Math.max(store.best, ...match.scores);
  persist();
  sfx.win();
  const [A, B] = match.names;
  const rec = store.h2h[recordKey(A, B)];
  const lives = nextLives(res, match.handicap);
  show(h('section', { class: 'screen result' },
    h('p', { class: 'kicker' }, `${match.round}판 결과`),
    h('h2', { class: 'big' }, res.winner === null ? '무승부' : `${match.names[res.winner]} 승리`),
    scoreboard(match.names, match.scores, res.winner),
    penalty(res.loser === null ? null : match.names[res.loser], match.bet),
    h('p', { class: 'record' }, `전적  ${A} ${rec[A]} : ${rec[B]} ${B}`),
    res.loser !== null && match.handicap ? h('p', { class: 'note' }, `다음 판은 ${match.names[res.loser]} 목숨 2개로 시작해요.`) : null,
    h('div', { class: 'stack' },
      h('button', {
        type: 'button',
        class: 'btn primary',
        onclick: () => startDuo({ ...match, round: match.round + 1, lives, first: 1 - match.first }),
      }, '한 판 더'),
      h('button', { type: 'button', class: 'btn', onclick: duoSetup }, '사람·내기 바꾸기'),
      h('button', { type: 'button', class: 'btn ghost', onclick: home }, '처음으로'))));
}

// ---------- 화면: 링크 도전장 ----------
function linkSetup(prefill = {}) {
  const me = nameField('내 이름', store.myName);
  const bet = betPicker(prefill.bet || store.bet);
  show(h('section', { class: 'screen' },
    topbar(home),
    h('p', { class: 'kicker' }, '링크로 도전장'),
    h('h2', {}, '먼저 한 판 하고 기록을 보내요'),
    h('p', { class: 'lede' }, '받은 사람은 똑같은 줄 속도로 도전해요.'),
    me.el,
    bet.el,
    h('button', {
      type: 'button',
      class: 'btn primary',
      onclick: () => {
        const name = cleanName(me.input.value, '나');
        Object.assign(store, { myName: name, bet: bet.value() });
        persist();
        recordForLink(name, store.bet);
      },
    }, '한 판 하기')));
}

function recordForLink(name, bet) {
  const seed = newSeed();
  play({ seed, lives: 1, label: name, onDone: (score) => linkReady({ seed, name, score, bet }) });
}

function linkReady(ch) {
  store.best = Math.max(store.best, ch.score);
  persist();
  const url = challengeUrl(encodeChallenge(ch));
  const msg = `${ch.name}의 줄넘기 기록 ${ch.score}개. 지는 사람이 ${ch.bet}. 이길 수 있어요?\n${url}`;
  const status = h('p', { class: 'status', role: 'status' });
  show(h('section', { class: 'screen result' },
    h('p', { class: 'kicker' }, '도전장 준비 완료'),
    h('h2', { class: 'big' }, `${ch.score}개`),
    h('p', { class: 'lede' }, '이 기록으로 도전장을 보낼까요?'),
    h('div', { class: 'preview', 'aria-label': '보낼 메시지' }, msg),
    h('div', { class: 'stack' },
      h('button', {
        type: 'button',
        class: 'btn primary',
        onclick: async () => {
          const r = await shareText(msg);
          status.textContent = {
            shared: '보냈어요.',
            copied: '메시지를 복사했어요. 카톡에 붙여 넣으세요.',
            failed: '복사하지 못했어요. 위 글을 길게 눌러 복사해 주세요.',
            cancelled: '',
          }[r];
        },
      }, '도전장 보내기'),
      status,
      h('button', { type: 'button', class: 'btn', onclick: () => recordForLink(ch.name, ch.bet) }, '다시 해서 기록 올리기'),
      h('button', { type: 'button', class: 'btn ghost', onclick: home }, '처음으로'))));
}

function leaveChallenge() {
  history.replaceState(null, '', location.pathname + location.search);
  home();
}

function challengeIntro(ch) {
  const me = nameField('내 이름', store.myName);
  show(h('section', { class: 'screen' },
    h('p', { class: 'kicker' }, '도전장 도착'),
    h('h2', { class: 'big' }, `${ch.name}의 기록 ${ch.score}개`),
    h('div', { class: 'penalty' },
      h('span', { class: 'penalty-label' }, '지는 사람이'),
      h('p', { class: 'penalty-bet' }, ch.bet)),
    h('p', { class: 'lede' }, '같은 줄 속도로 한 판, 목숨은 1개예요.'),
    me.el,
    h('div', { class: 'stack' },
      h('button', {
        type: 'button',
        class: 'btn primary',
        onclick: () => {
          const name = pairNames(ch.name, me.input.value)[1];
          store.myName = name;
          persist();
          play({ seed: ch.seed, lives: 1, target: ch.score, label: name, onDone: (score) => challengeResult(ch, name, score) });
        },
      }, '도전하기'),
      h('button', { type: 'button', class: 'btn ghost', onclick: leaveChallenge }, '나중에 할게요'))));
}

function challengeResult(ch, me, score) {
  const names = [me, ch.name];
  const scores = [score, ch.score];
  const res = decide(scores);
  store.best = Math.max(store.best, score);
  persist();
  if (res.winner === 0) sfx.win();
  const loser = res.loser === null ? null : names[res.loser];
  const msg = `줄넘기 내기 결과: ${me} ${score}개, ${ch.name} ${ch.score}개. `
    + (loser ? `${josa(loser, '이', '가')} ${ch.bet}!` : '무승부!');
  const status = h('p', { class: 'status', role: 'status' });
  show(h('section', { class: 'screen result' },
    h('p', { class: 'kicker' }, '도전 결과'),
    h('h2', { class: 'big' }, res.winner === 0 ? '이겼어요' : res.winner === 1 ? '졌어요' : '무승부'),
    scoreboard(names, scores, res.winner),
    penalty(loser, ch.bet),
    h('div', { class: 'stack' },
      h('button', {
        type: 'button',
        class: 'btn primary',
        onclick: async () => {
          const r = await shareText(msg);
          status.textContent = { shared: '보냈어요.', copied: '결과를 복사했어요.', failed: '복사하지 못했어요.', cancelled: '' }[r];
        },
      }, '결과 알려주기'),
      status,
      h('button', {
        type: 'button',
        class: 'btn',
        onclick: () => { history.replaceState(null, '', location.pathname + location.search); linkSetup({ bet: ch.bet }); },
      }, '나도 도전장 보내기'),
      h('button', { type: 'button', class: 'btn ghost', onclick: leaveChallenge }, '처음으로'))));
}

// ---------- 화면: 혼자 연습 ----------
function practice() {
  const before = store.best;
  play({
    seed: newSeed(),
    lives: 1,
    label: '연습',
    onDone: (score) => {
      store.best = Math.max(store.best, score);
      persist();
      show(h('section', { class: 'screen result' },
        h('p', { class: 'kicker' }, '혼자 연습'),
        h('h2', { class: 'big' }, `${score}개`),
        h('p', { class: 'lede' }, score > before ? '최고 기록이에요.' : `최고 기록은 ${store.best}개예요.`),
        h('div', { class: 'stack' },
          h('button', { type: 'button', class: 'btn primary', onclick: practice }, '다시 하기'),
          h('button', { type: 'button', class: 'btn ghost', onclick: home }, '처음으로'))));
    },
  });
}

// ---------- 화면: 게임 ----------
function play({ seed, lives, target = null, label, onDone }) {
  const run = createRun({ seed, lives });
  if (new URLSearchParams(location.search).has('qa')) globalThis.__qaRun = run; // 검수용: ?qa 일 때만
  const canvas = h('canvas', { class: 'stage-canvas', role: 'img', 'aria-label': '줄넘기 화면. 화면을 누르면 점프합니다.' });
  const countEl = h('div', { class: 'count' }, '0');
  const targetEl = target != null ? h('div', { class: 'target' }, `목표 ${target + 1}개`) : null;
  const livesEl = h('div', { class: 'lives' });
  const hintTitle = h('strong', {}, '화면을 누르면 시작');
  const hintSub = h('span', {}, '줄이 발밑에 올 때 눌러서 점프');
  const hint = h('div', { class: 'hint' }, hintTitle, hintSub);
  const quit = h('button', { type: 'button', class: 'hud-btn' }, '그만');
  const stage = h('div', { class: 'stage' },
    canvas,
    h('div', { class: 'hud' },
      h('div', { class: 'hud-side' }, h('span', { class: 'who' }, label), livesEl),
      h('div', { class: 'hud-center' }, countEl, targetEl),
      h('div', { class: 'hud-side right' }, soundToggle(true), quit)),
    hint);
  show(stage);

  const ctx = canvas.getContext('2d');
  let W = 0; let H = 0; let dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let started = false; let paused = false; let ended = false; let done = false;
  let raf = 0; let last = 0; let acc = 0; let countdown = 0;
  const fx = { hit: 0, pulse: 0, passed: false };
  const renderLives = () => { livesEl.textContent = `목숨 ${'●'.repeat(Math.max(run.lives, 0))}`; };
  renderLives();

  function press(e) {
    if (e?.target?.closest?.('button')) return;
    e?.preventDefault?.();
    audio();
    if (ended) return;
    if (!started || paused) {
      started = true;
      paused = false;
      countdown = 1.2; // 3, 2, 1 동안 줄은 머리 위에서 멈춰 있음
      hintTitle.textContent = '3';
      hintSub.hidden = true;
      hint.classList.add('counting');
      last = performance.now();
      return;
    }
    if (countdown > 0) return;
    jump(run);
  }
  const onKey = (e) => { if (e.code === 'Space') press(e); };
  stage.addEventListener('pointerdown', press);
  addEventListener('keydown', onKey);
  const offHidden = onHidden(() => {
    if (started && !ended) {
      paused = true;
      hintTitle.textContent = '화면을 누르면 계속';
      hintSub.hidden = false;
      hint.classList.remove('counting');
      hint.hidden = false;
    }
    actx?.suspend?.();
  });
  quit.addEventListener('click', () => finish());

  function handleEvents() {
    for (const ev of run.events) {
      if (ev.type === 'clear') {
        sfx.clear();
        fx.pulse = 1;
        countEl.textContent = String(ev.count);
        if (target != null && !fx.passed && ev.count > target) {
          fx.passed = true;
          targetEl.textContent = '역전!';
          targetEl.classList.add('passed');
        }
      } else if (ev.type === 'jump') sfx.jump();
      else if (ev.type === 'hit') { sfx.hit(); vibrate(80); fx.hit = 0.45; renderLives(); }
      else if (ev.type === 'over') sfx.over();
    }
    run.events.length = 0;
  }

  const FIXED = 1 / 240;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (started && !paused && !ended && countdown > 0) {
      countdown -= Math.min((now - last) / 1000, 0.05);
      last = now;
      if (countdown <= 0) { hint.hidden = true; hint.classList.remove('counting'); acc = 0; }
      else hintTitle.textContent = String(Math.ceil(countdown / 0.4));
    } else if (started && !paused && !ended) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      acc += dt;
      while (acc >= FIXED) { step(run, FIXED); acc -= FIXED; }
      handleEvents();
      fx.hit = Math.max(0, fx.hit - dt);
      fx.pulse = Math.max(0, fx.pulse - dt * 4);
      if (run.over) { ended = true; setTimeout(finish, 900); }
    } else {
      last = now;
    }
    countEl.style.transform = `scale(${1 + fx.pulse * 0.12})`;
    draw();
  }
  raf = requestAnimationFrame(frame);

  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    removeEventListener('keydown', onKey);
    offHidden();
    onDone(run.count);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, 0, W, H);
    const u = Math.min(W / 4.2, H / 3.6);
    const gy = H * 0.7;
    const cx = W / 2;
    const X = (x) => cx + x * u;
    const Y = (y) => gy - y * u;
    ctx.save();
    if (fx.hit > 0) ctx.translate((Math.random() - 0.5) * 12 * fx.hit, (Math.random() - 0.5) * 6 * fx.hit);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 땅
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    for (let x = -20; x < W + 20; x += 14) {
      ctx.beginPath(); ctx.moveTo(x, Y(0) + 3); ctx.lineTo(x - 9, Y(0) + 13); ctx.stroke();
    }
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.stroke();

    const shape = ropeShape(run.phase);
    const hand = (side) => ({
      x: side * ROPE.handX + side * 0.05 * Math.sin(shape.angle),
      y: ROPE.handY - 0.07 * Math.cos(shape.angle),
    });
    const L = hand(-1);
    const R = hand(1);

    const line = (pts, width, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.stroke();
    };
    const head = (x, y, r, width, color) => {
      ctx.fillStyle = COLORS.paper;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath(); ctx.arc(X(x), Y(y), r * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    };
    const drawHolder = (side, hd) => {
      const x = side * 1.78;
      const w = u * 0.04;
      line([[x - 0.12, 0], [x, 0.5], [x + 0.12, 0]], w, COLORS.mute);
      line([[x, 0.5], [x, 1.02]], w, COLORS.mute);
      line([[x, 0.92], [hd.x, hd.y]], w, COLORS.mute);
      line([[x, 0.92], [x - side * 0.22, 0.6]], w, COLORS.mute);
      head(x, 1.2, 0.15, w, COLORS.mute);
    };
    const drawRope = (front) => {
      ctx.globalAlpha = front ? 1 : 0.45;
      ctx.strokeStyle = COLORS.red;
      ctx.lineWidth = u * (front ? 0.05 : 0.03);
      ctx.beginPath();
      ctx.moveTo(X(L.x), Y(L.y));
      ctx.quadraticCurveTo(X(0), Y(2 * shape.mid - (L.y + R.y) / 2), X(R.x), Y(R.y));
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    const drawJumper = () => {
      const y = run.y;
      // 그림자
      ctx.fillStyle = 'rgba(28,26,23,0.12)';
      const sw = 0.32 * (1 - Math.min(y, 1) * 0.45);
      ctx.beginPath(); ctx.ellipse(X(0), Y(0) + 2, sw * u, sw * u * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      const wob = fx.hit > 0 ? Math.sin(fx.hit * 40) * 0.25 : 0;
      ctx.translate(X(0), Y(y));
      ctx.rotate(wob);
      ctx.translate(-X(0), -Y(y));
      const c = fx.hit > 0 ? COLORS.red : COLORS.ink;
      const w = u * 0.06;
      const air = run.airborne;
      const legs = air
        ? [[[0, y + 0.5], [-0.16, y + 0.28], [-0.08, y + 0.1]], [[0, y + 0.5], [0.16, y + 0.28], [0.08, y + 0.1]]]
        : [[[0, y + 0.5], [-0.14, y]], [[0, y + 0.5], [0.14, y]]];
      legs.forEach((p) => line(p, w, c));
      line([[0, y + 0.5], [0, y + 1.02]], w, c);
      const hands = air ? [[-0.32, y + 1.12], [0.32, y + 1.12]] : [[-0.28, y + 0.62], [0.28, y + 0.62]];
      hands.forEach((p) => line([[0, y + 0.92], p], w, c));
      head(0, y + 1.2, 0.16, w, c);
      ctx.restore();
    };

    drawHolder(-1, L);
    drawHolder(1, R);
    if (!shape.front) drawRope(false);
    drawJumper();
    if (shape.front) drawRope(true);
    ctx.restore();
  }
}

// ---------- 시작 ----------
function boot() {
  const ch = readChallengeFromHash(location.hash);
  if (ch) challengeIntro(ch);
  else home();
}
addEventListener('hashchange', boot);
boot();
