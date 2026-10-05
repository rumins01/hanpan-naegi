// 시드 난수와 작은 수학 도구. 같은 시드면 두 사람이 같은 판을 합니다.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const range = (r, lo, hi) => lo + r() * (hi - lo);
export const pick = (r, list) => list[Math.floor(r() * list.length)];

// 게임마다 다른 시드를 쓰도록 섞습니다(같은 판 번호라도 게임별로 다른 배치).
export function subSeed(seed, salt) {
  let h = (seed ^ Math.imul(salt + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  return (h ^ (h >>> 15)) >>> 0 || 1;
}
