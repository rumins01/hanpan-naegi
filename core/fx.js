// 손맛 효과: 파편, 떠오르는 글자, 화면 흔들림, 번쩍임, 히트스톱.
// 화면 효과에만 Math.random을 씁니다. 판정과 점수에는 영향이 없습니다.

const reduceMotion = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export class Fx {
  constructor() {
    this.parts = [];
    this.texts = [];
    this.rings = [];
    this.shakeT = 0;
    this.shakeP = 0;
    this.flashT = 0;
    this.flashMax = 0.15;
    this.flashColor = '#ffffff';
    this.stop = 0;
    this.calm = reduceMotion();
  }

  burst(x, y, { n = 10, color = '#ffffff', speed = 220, life = 0.6, size = 3.5, gravity = 700, angle = -Math.PI / 2, spread = Math.PI * 2, shape = 'dot' } = {}) {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: size * (0.6 + Math.random() * 0.8), color, gravity, shape, rot: Math.random() * 6 });
    }
  }

  // 잘려 나가는 조각처럼 큰 사각형 하나를 떨어뜨립니다(탑 쌓기 등).
  chunk(x, y, w, h, color, vx = 0) {
    this.parts.push({ x, y, w, h, vx, vy: -40, life: 1.4, max: 1.4, color, gravity: 1400, shape: 'rect', rot: 0, spin: (Math.random() - 0.5) * 3 });
  }

  ring(x, y, color = '#ffffff', r0 = 10, r1 = 80, life = 0.35) {
    this.rings.push({ x, y, color, r0, r1, life, max: life });
  }

  text(x, y, str, { color = '#ffffff', size = 24, life = 0.8, rise = 50 } = {}) {
    this.texts.push({ x, y, str, color, size, life, max: life, rise });
  }

  shake(power = 7, time = 0.25) {
    if (this.calm) return;
    this.shakeP = Math.max(this.shakeP, power);
    this.shakeT = Math.max(this.shakeT, time);
  }

  flash(color = '#ffffff', time = 0.15) {
    this.flashColor = color;
    this.flashT = time;
    this.flashMax = time;
  }

  hitstop(ms = 60) { this.stop = Math.max(this.stop, ms / 1000); }

  update(dt) {
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.shakeT === 0) this.shakeP = 0;
    this.flashT = Math.max(0, this.flashT - dt);
    for (const p of this.parts) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin) p.rot += p.spin * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const t of this.texts) t.life -= dt;
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
  }

  offset() {
    if (!this.shakeT) return [0, 0];
    const k = this.shakeP * (this.shakeT / 0.25);
    return [(Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k];
  }

  draw(ctx) {
    for (const p of this.parts) {
      ctx.globalAlpha = Math.min(1, p.life / (p.max * 0.5));
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.save();
        ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      } else if (p.shape === 'square') {
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawOverlay(ctx, W, H, font) {
    for (const t of this.texts) {
      const k = 1 - t.life / t.max;
      ctx.globalAlpha = Math.min(1, t.life / (t.max * 0.4));
      const s = t.size * (k < 0.15 ? 0.7 + k * 2 : 1);
      ctx.font = `800 ${s}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.22)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y - t.rise * k);
      ctx.restore();
    }
    if (this.flashT > 0) {
      ctx.globalAlpha = (this.flashT / this.flashMax) * 0.28;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1;
  }
}
