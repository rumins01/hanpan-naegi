// 효과음. 외부 파일 없이 Web Audio로 만듭니다.
// 연속 성공(콤보)일수록 음이 한 칸씩 올라갑니다(탑 쌓기류 상위 게임의 공통 장치).

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export function createAudio(isOn) {
  let ctx = null;
  const get = () => {
    if (!isOn()) return null;
    try {
      ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  };
  const tone = (freq, dur, type = 'square', gain = 0.05, slideTo, delay = 0) => {
    const c = get();
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  };
  const noise = (dur = 0.12, gain = 0.08, freq = 1200) => {
    const c = get();
    if (!c) return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(c.destination);
    src.start();
  };
  const note = (step, base = 392) => base * 2 ** (SCALE[Math.min(step, SCALE.length - 1)] / 12);

  return {
    unlock: () => get(),
    suspend: () => ctx?.suspend?.(),
    sfx: {
      tick: (combo = 0) => tone(note(combo % SCALE.length), 0.07, 'triangle', 0.06),
      tap: () => tone(520, 0.04, 'square', 0.025),
      jump: () => tone(300, 0.08, 'triangle', 0.045, 520),
      perfect: (combo = 0) => { tone(note(Math.min(combo, 10), 523), 0.12, 'triangle', 0.07); tone(note(Math.min(combo, 10) + 2, 523), 0.12, 'sine', 0.04, null, 0.05); },
      thud: () => noise(0.09, 0.12, 700),
      whoosh: () => noise(0.12, 0.05, 2600),
      hit: () => { tone(160, 0.22, 'sawtooth', 0.06, 80); noise(0.15, 0.1, 900); },
      over: () => { tone(440, 0.15, 'triangle', 0.06, 330); tone(330, 0.28, 'triangle', 0.06, 196, 0.16); },
      win: () => { tone(523, 0.1, 'triangle', 0.06); tone(659, 0.1, 'triangle', 0.06, null, 0.1); tone(784, 0.22, 'triangle', 0.06, null, 0.2); },
      stage: () => { tone(659, 0.08, 'square', 0.04); tone(988, 0.16, 'square', 0.04, null, 0.08); },
    },
  };
}
