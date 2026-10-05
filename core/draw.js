// 공용 그림 도구 v0.3. 레퍼런스: Ketchapp 계열(Stack, Knife Hit, Rider, Twist) 스토어 스크린샷.
// 규칙: 화면 전체 그라데이션 배경, 테두리 없는 평면 도형, 아래쪽만 살짝 어둡게, 강조색은 산호색 하나,
// 캐릭터는 6개 게임 모두 같은 실루엣(머리띠만 산호색).

export const FONT = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", system-ui, sans-serif';
export const ACCENT = '#ff6b57';
export const WHITE = '#ffffff';
export const INK = '#1f1d24';
// 하위 호환 이름(이전 코드가 쓰던 이름)
export const RED = ACCENT;
export const MUTE = 'rgba(31,29,36,0.45)';
export const PAPER = '#f7f5f2';
export const RULE = 'rgba(31,29,36,0.12)';

export const hsl = (h, s, l, a = 1) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}% / ${a})`;

// 게임 한 판의 색 묶음. hue 하나로 배경, 땅, 실루엣 색이 모두 정해져 6개 게임의 톤이 맞습니다.
export function theme(h) {
  return {
    h,
    top: hsl(h, 58, 70),
    bottom: hsl(h + 22, 78, 90),
    ground: hsl(h + 10, 40, 80),
    groundDark: hsl(h + 10, 32, 72),
    far: hsl(h + 8, 45, 82),
    ink: hsl(h, 32, 20),
    mid: hsl(h, 30, 42),
    soft: hsl(h, 60, 96),
    shade: 'rgba(0,0,0,0.10)',
  };
}

export function background(ctx, W, H, th) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, th.top);
  g.addColorStop(1, th.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// 이전 이름. 이제는 테마 배경을 그립니다.
export function paper(ctx, W, H, tint = PAPER) {
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);
}

export function line(ctx, pts, width, color = INK) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

export function circle(ctx, x, y, r, { fill = null, stroke = null, width = 2 } = {}) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// 평면 블록: 윗면은 밝게, 아래 35%는 살짝 어둡게(입체감), 테두리 없음.
export function slab(ctx, x, y, w, h, color, { radius = 3, face = 0.38 } = {}) {
  roundRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  ctx.fillRect(x, y + h * (1 - face), w, h * face);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x, y, w, Math.max(1.5, h * 0.08));
  ctx.restore();
}

export function shadow(ctx, x, y, rx, ry, alpha = 0.14) {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  ctx.fill();
}

// 공용 캐릭터. (x, y)는 발 위치, s는 키(픽셀). 굵은 실루엣 + 산호색 머리띠.
// pose: stand | run | jump | fall | climb
export function figure(ctx, x, y, s, { pose = 'stand', t = 0, color = INK, facing = 1, squash = 1, band = ACCENT } = {}) {
  const w = Math.max(3, s * 0.12);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing / Math.sqrt(squash), squash);
  const hip = [0, -s * 0.4];
  const neck = [0, -s * 0.74];
  const sh = [0, -s * 0.68];
  let legs; let arms;
  if (pose === 'run' || pose === 'climb') {
    const a = Math.sin(t * 16) * 0.55;
    legs = [[hip, [s * 0.2 * Math.sin(a), -s * 0.2], [s * 0.24 * Math.sin(a) + s * 0.05, -w / 2]], [hip, [-s * 0.2 * Math.sin(a), -s * 0.2], [-s * 0.24 * Math.sin(a) - s * 0.05, -w / 2]]];
    arms = [[sh, [s * 0.22 * Math.sin(-a), -s * 0.46]], [sh, [-s * 0.22 * Math.sin(-a), -s * 0.46]]];
  } else if (pose === 'jump') {
    legs = [[hip, [-s * 0.13, -s * 0.24], [-s * 0.06, -s * 0.1]], [hip, [s * 0.13, -s * 0.24], [s * 0.06, -s * 0.1]]];
    arms = [[sh, [-s * 0.25, -s * 0.9]], [sh, [s * 0.25, -s * 0.9]]];
  } else if (pose === 'fall') {
    legs = [[hip, [-s * 0.22, -s * 0.12]], [hip, [s * 0.24, -s * 0.28]]];
    arms = [[sh, [-s * 0.28, -s * 0.92]], [sh, [s * 0.3, -s * 0.88]]];
  } else {
    legs = [[hip, [-s * 0.1, -w / 2]], [hip, [s * 0.1, -w / 2]]];
    arms = [[sh, [-s * 0.18, -s * 0.44]], [sh, [s * 0.18, -s * 0.44]]];
  }
  legs.forEach((p) => line(ctx, p, w, color));
  arms.forEach((p) => line(ctx, p, w * 0.85, color));
  line(ctx, [hip, neck], w * 1.35, color);
  const hr = s * 0.15;
  circle(ctx, 0, -s * 0.9, hr, { fill: color });
  ctx.fillStyle = band;
  ctx.fillRect(-hr, -s * 0.9 - hr * 0.35, hr * 2, hr * 0.42);
  // 머리띠 꼬리(뒤로 날림)
  const tail = Math.sin(t * 10) * hr * 0.25;
  ctx.beginPath();
  ctx.moveTo(-hr * 0.9, -s * 0.9 - hr * 0.2);
  ctx.lineTo(-hr * 1.9, -s * 0.9 - hr * 0.55 + tail);
  ctx.lineTo(-hr * 1.75, -s * 0.9 + hr * 0.05 + tail);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// 이전 이름 호환.
export const stickman = figure;
export function inkBlock(ctx, x, y, w, h, fill) { slab(ctx, x, y, w, h, fill); }

// 캔버스 안 글자(효과 텍스트 등): 흰색 + 옅은 그림자.
export function label(ctx, text, x, y, { size = 16, weight = 700, color = WHITE, align = 'center', alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}
