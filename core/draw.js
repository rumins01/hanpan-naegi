// 공용 그림 도구. 종이 위에 잉크로 그린 졸라맨 그림체를 6개 게임이 함께 씁니다.

export const INK = '#1c1a17';
export const PAPER = '#f3eee4';
export const MUTE = '#6f685d';
export const RULE = '#d6cdbd';
export const RED = '#c23b2c';
export const FONT = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';

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

export function circle(ctx, x, y, r, { fill = null, stroke = INK, width = 2 } = {}) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// 졸라맨. (x, y)는 발 위치(화면 좌표), s는 키(화면 픽셀). pose: stand | run | jump | fall | climb
export function stickman(ctx, x, y, s, { pose = 'stand', t = 0, color = INK, facing = 1, squash = 1 } = {}) {
  const w = Math.max(2, s * 0.06);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing / Math.sqrt(squash), squash);
  const hip = [0, -s * 0.42];
  const neck = [0, -s * 0.84];
  const sh = [0, -s * 0.76];
  let legs; let arms;
  if (pose === 'run' || pose === 'climb') {
    const a = Math.sin(t * 14) * 0.5;
    legs = [[hip, [s * 0.22 * Math.sin(a), -s * 0.2], [s * 0.26 * Math.sin(a) + s * 0.05, 0]], [hip, [-s * 0.22 * Math.sin(a), -s * 0.2], [-s * 0.26 * Math.sin(a) - s * 0.05, 0]]];
    arms = [[sh, [s * 0.24 * Math.sin(-a), -s * 0.52]], [sh, [-s * 0.24 * Math.sin(-a), -s * 0.52]]];
  } else if (pose === 'jump') {
    legs = [[hip, [-s * 0.14, -s * 0.24], [-s * 0.07, -s * 0.08]], [hip, [s * 0.14, -s * 0.24], [s * 0.07, -s * 0.08]]];
    arms = [[sh, [-s * 0.27, -s * 0.98]], [sh, [s * 0.27, -s * 0.98]]];
  } else if (pose === 'fall') {
    legs = [[hip, [-s * 0.22, -s * 0.12]], [hip, [s * 0.26, -s * 0.3]]];
    arms = [[sh, [-s * 0.3, -s * 1.0]], [sh, [s * 0.32, -s * 0.95]]];
  } else {
    legs = [[hip, [-s * 0.12, 0]], [hip, [s * 0.12, 0]]];
    arms = [[sh, [-s * 0.22, -s * 0.5]], [sh, [s * 0.22, -s * 0.5]]];
  }
  legs.forEach((p) => line(ctx, p, w, color));
  line(ctx, [hip, neck], w, color);
  arms.forEach((p) => line(ctx, p, w, color));
  circle(ctx, 0, -s * 0.99, s * 0.14, { fill: PAPER, stroke: color, width: w });
  ctx.restore();
}

// 잉크 테두리가 있는 채색 블록.
export function inkBlock(ctx, x, y, w, h, fill, width = 2) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.strokeRect(x, y, w, h);
}

export function hsl(h, s, l) {
  return `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`;
}
