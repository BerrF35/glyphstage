import type { StudyId } from '@/types/studio';

export interface StudySpec {
  id: StudyId;
  name: string;
  canvas: HTMLCanvasElement;
}

function renderDomeStudy(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#06070a';
  ctx.fillRect(0, 0, w, h);

  const cx = w * 0.5;
  const cy = h * 0.52;
  const maxR = Math.min(w, h) * 0.42;

  const base = ctx.createRadialGradient(cx - maxR * 0.25, cy - maxR * 0.25, maxR * 0.05, cx, cy, maxR);
  base.addColorStop(0, '#f4f7fa');
  base.addColorStop(0.55, '#64748b');
  base.addColorStop(0.88, '#1e293b');
  base.addColorStop(1, '#06070a');
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
  ctx.fill();

  // Concentric ribbed oculus rings
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  for (let i = 1; i <= 7; i++) {
    const r = (i / 7.5) * maxR;
    ctx.lineWidth = i === 1 ? 3 : 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Radial structural ribs
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(148,163,184,0.35)';
    ctx.lineWidth = i % 4 === 0 ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * maxR * 0.14, cy + Math.sin(a) * maxR * 0.14);
    ctx.lineTo(cx + Math.cos(a) * maxR * 0.98, cy + Math.sin(a) * maxR * 0.98);
    ctx.stroke();
  }

  // Deep dark oculus opening
  ctx.fillStyle = '#040507';
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.13, 0, Math.PI * 2);
  ctx.fill();
}

function renderMonolithStudy(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#050608';
  ctx.fillRect(0, 0, w, h);

  // Brutalist stepped architectural facade with harsh raking light
  const slabs = 11;
  const padX = w * 0.16;
  const slabW = (w - padX * 2) / slabs;

  for (let i = 0; i < slabs; i++) {
    const t = i / (slabs - 1);
    const arch = Math.sin(t * Math.PI);
    const top = h * (0.14 + (1 - arch) * 0.24);
    const height = h * 0.78 - top;
    const x = padX + i * slabW;

    const grad = ctx.createLinearGradient(x, top, x + slabW, top + height * 0.35);
    grad.addColorStop(0, '#f8fafc');
    grad.addColorStop(0.45, '#94a3b8');
    grad.addColorStop(1, '#0f172a');

    ctx.fillStyle = grad;
    ctx.fillRect(x + 2, top, slabW - 4, height);
  }

  // Crisp horizon band & plinth shadow
  const barGrad = ctx.createLinearGradient(0, h * 0.78, w, h * 0.78);
  barGrad.addColorStop(0, '#0f172a');
  barGrad.addColorStop(0.5, '#e2e8f0');
  barGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = barGrad;
  ctx.fillRect(w * 0.1, h * 0.78, w * 0.8, h * 0.045);
}

function renderInterferenceStudy(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const cx1 = w * 0.38;
  const cy1 = h * 0.44;
  const cx2 = w * 0.62;
  const cy2 = h * 0.56;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r1 = Math.hypot(x - cx1, y - cy1);
      const r2 = Math.hypot(x - cx2, y - cy2);
      const env = Math.exp(-Math.hypot(x - w * 0.5, y - h * 0.5) / (w * 0.42));
      const wave = (Math.sin(r1 * 0.18) + Math.sin(r2 * 0.18)) * 0.5;
      const v = Math.max(0, Math.min(255, Math.round((wave * 0.5 + 0.5) * env * 255)));
      const idx = (y * w + x) * 4;
      d[idx] = v;
      d[idx + 1] = Math.round(v * 0.96);
      d[idx + 2] = Math.round(v * 0.9);
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

let cachedStudies: StudySpec[] | null = null;

export function getBuiltInStudies(): StudySpec[] {
  if (cachedStudies) return cachedStudies;
  const specs: Array<{ id: StudyId; name: string; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }> = [
    { id: 'dome', name: 'Oculus Dome', draw: renderDomeStudy },
    { id: 'monolith', name: 'Fluted Colonnade', draw: renderMonolithStudy },
    { id: 'interference', name: 'Wave Plate', draw: renderInterferenceStudy },
  ];

  cachedStudies = specs.map((s) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) s.draw(ctx, 512, 512);
    return { id: s.id, name: s.name, canvas };
  });

  return cachedStudies;
}
