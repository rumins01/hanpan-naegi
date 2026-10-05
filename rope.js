// 줄넘기 규칙. 화면과 무관한 순수 계산만 둡니다(테스트가 그대로 불러 씁니다).
// 같은 시드면 줄 속도 순서가 똑같아서, 링크 대결에서 두 사람이 같은 판을 합니다.

export const PHYS = Object.freeze({
  airtime: 0.40, // 점프 체공 시간(초)
  peak: 1.0,     // 점프 최고 높이(월드 단위)
  clear: 0.18,   // 줄이 바닥을 지날 때 발이 이 높이 이상이면 통과
});

const G = (8 * PHYS.peak) / PHYS.airtime ** 2;
const V0 = (G * PHYS.airtime) / 2;

export const SPEED = Object.freeze({ start: 0.8, top: 1.55, rampTo: 80, slow: 0.55, fast: 1.3 });

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

// n번째 바퀴의 속도(초당 바퀴 수). 기본 속도가 서서히 오르고,
// 가끔 갑자기 느려지거나(2~4바퀴) 빨라집니다(1~3바퀴). 리듬만 믿고 뛰면 걸리게 하는 장치입니다.
export function makePattern(seed, length = 600) {
  const next = rng(seed);
  const out = [];
  let mode = 'normal';
  let left = 0;
  for (let n = 0; n < length; n++) {
    const base = SPEED.start + (Math.min(n, SPEED.rampTo) / SPEED.rampTo) * (SPEED.top - SPEED.start);
    if (left <= 0) {
      mode = 'normal';
      const chance = n < 5 ? 0 : Math.min(0.12 + n * 0.004, 0.32);
      if (next() < chance) {
        if (next() < 0.5) { mode = 'slow'; left = 2 + Math.floor(next() * 3); }
        else { mode = 'fast'; left = 1 + Math.floor(next() * 3); }
      }
    }
    const mult = mode === 'slow' ? SPEED.slow : mode === 'fast' ? SPEED.fast : 1;
    out.push(Math.round(base * mult * 10000) / 10000);
    if (left > 0) left -= 1;
  }
  return out;
}

// phase는 바퀴 단위입니다. 정수일 때 줄이 바닥, x.5일 때 머리 위입니다.
// 머리 위(m-0.5)에서 다음 머리 위(m+0.5)까지는 pattern[m-1] 속도를 씁니다.
// 속도는 줄이 머리 위에 있을 때만 바뀌므로, 내려오는 줄을 보고 판단할 수 있습니다.
export function speedAt(run) {
  const m = Math.floor(run.phase + 0.5);
  return run.pattern[Math.min(Math.max(m - 1, 0), run.pattern.length - 1)];
}

export function createRun({ seed, lives = 1 }) {
  return {
    seed: seed >>> 0,
    pattern: makePattern(seed),
    phase: 0.5,
    y: 0,
    vy: 0,
    airborne: false,
    count: 0,
    lives,
    over: false,
    t: 0,
    events: [],
  };
}

export function jump(run) {
  if (run.over || run.airborne) return false;
  run.airborne = true;
  run.vy = V0;
  run.events.push({ type: 'jump' });
  return true;
}

export function step(run, dt) {
  if (run.over) return run;
  run.t += dt;
  if (run.airborne) {
    run.y += run.vy * dt - (G * dt * dt) / 2;
    run.vy -= G * dt;
    if (run.y <= 0) {
      run.y = 0;
      run.vy = 0;
      run.airborne = false;
      run.events.push({ type: 'land' });
    }
  }
  const prev = run.phase;
  const nextPhase = prev + speedAt(run) * dt;
  if (Math.floor(nextPhase) > Math.floor(prev)) {
    if (run.y >= PHYS.clear) {
      run.count += 1;
      run.events.push({ type: 'clear', count: run.count });
    } else {
      run.lives -= 1;
      run.events.push({ type: 'hit', lives: run.lives });
      if (run.lives <= 0) {
        run.over = true;
        run.events.push({ type: 'over', count: run.count });
      }
    }
  }
  run.phase = nextPhase;
  return run;
}

// 그리기용 줄 모양. 바닥(-0.05)과 머리 위(1.95) 사이를 돌고, 위에서 내려올 때 앞쪽에 보입니다.
export const ROPE = Object.freeze({ handX: 1.4, handY: 0.95, radius: 1.0 });

export function ropeShape(phase) {
  const a = 2 * Math.PI * phase;
  const mid = ROPE.handY - ROPE.radius * Math.cos(a);
  return {
    mid,
    control: 2 * mid - ROPE.handY,
    front: Math.sin(a) < 0,
    angle: a,
  };
}
