// 2인 대결 규칙: 내기 목록, 이름 정리, 도전장 링크, 판정, 실력 차이 보정, 전적.
// 화면과 무관한 순수 계산만 둡니다.

export const BETS = Object.freeze([
  '설거지 하기',
  '커피 사기',
  '분리수거 하기',
  '다음 데이트 메뉴 양보',
  '어깨 안마 5분',
]);

export const LIMIT = Object.freeze({ name: 8, bet: 20, score: 9999 });

const squash = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

export function cleanName(s, fallback) {
  const v = [...squash(s)].slice(0, LIMIT.name).join('');
  return v || fallback;
}

export function cleanBet(s) {
  const v = [...squash(s)].slice(0, LIMIT.bet).join('');
  return v || BETS[0];
}

export function newSeed() {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] || 1;
}

// 두 이름이 같으면 뒤 사람에게 숫자를 붙입니다.
export function pairNames(a, b) {
  const first = cleanName(a, '나');
  let second = cleanName(b, '상대');
  if (second === first) second = [...second].slice(0, LIMIT.name - 1).join('') + '2';
  return [first, second];
}

const toB64url = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64url = (code) => {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

// 도전장 링크에 싣는 값. 서버 없이 링크만으로 같은 판을 재현합니다.
// 점수는 받는 사람이 고칠 수 있지만, 연인끼리 내기라 첫 버전에서는 감수합니다.
export function encodeChallenge({ seed, name, score, bet }) {
  return toB64url(JSON.stringify({ v: 1, s: seed >>> 0, n: cleanName(name, '도전자'), c: score, b: cleanBet(bet) }));
}

export function decodeChallenge(code) {
  if (typeof code !== 'string' || code.length === 0 || code.length > 400) return null;
  try {
    const o = JSON.parse(fromB64url(code));
    if (!o || o.v !== 1) return null;
    const seed = Number(o.s);
    const score = Number(o.c);
    if (!Number.isInteger(seed) || seed <= 0 || seed > 0xffffffff) return null;
    if (!Number.isInteger(score) || score < 0 || score > LIMIT.score) return null;
    return { seed, name: cleanName(o.n, '도전자'), score, bet: cleanBet(o.b) };
  } catch {
    return null;
  }
}

export function readChallengeFromHash(hash) {
  const m = /(?:^#|&)d=([A-Za-z0-9_-]+)/.exec(hash || '');
  return m ? decodeChallenge(m[1]) : null;
}

// 점수가 높은 쪽이 이깁니다. 같으면 무승부입니다.
export function decide(scores) {
  const [a, b] = scores;
  if (a === b) return { winner: null, loser: null };
  return a > b ? { winner: 0, loser: 1 } : { winner: 1, loser: 0 };
}

// 실력 차이 보정: 보정을 켜면 직전 판에 진 사람이 다음 판에 목숨 2개로 시작합니다.
export function nextLives(result, enabled) {
  const lives = [1, 1];
  if (enabled && result.loser !== null) lives[result.loser] = 2;
  return lives;
}

// 전적은 두 이름 쌍마다 따로 셉니다. 순서를 바꿔도 같은 기록을 씁니다.
export function recordKey(a, b) {
  return [a, b].sort().join('\u0001');
}

export function addRecord(h2h, names, result) {
  const key = recordKey(names[0], names[1]);
  const rec = { ...(h2h[key] || {}) };
  for (const n of names) rec[n] = rec[n] || 0;
  if (result.winner !== null) rec[names[result.winner]] += 1;
  return { ...h2h, [key]: rec };
}
