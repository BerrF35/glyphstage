const MAX_PARTICLES = 640;
const STRIDE = 8; // x, y, size, life, glyph, r, g, b
const MAX_SHOCKWAVES = 4;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  glyph: number;
  r: number;
  g: number;
  b: number;
}

interface Shockwave {
  x: number;
  y: number;
  age: number;
  strength: number;
}

export class AsciiParticleSystem {
  private particles: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private buffer = new Float32Array(MAX_PARTICLES * STRIDE);
  private shockBuffer = new Float32Array(MAX_SHOCKWAVES * 4);

  public get count(): number {
    return this.particles.length;
  }

  public get hasActiveEffects(): boolean {
    return this.particles.length > 0 || this.shockwaves.length > 0;
  }

  public burst(
    normX: number,
    normY: number,
    primaryRgb: [number, number, number],
    accentRgb: [number, number, number],
    amount = 115,
    strength = 1.0
  ): void {
    if (this.shockwaves.length >= MAX_SHOCKWAVES) {
      this.shockwaves.shift();
    }
    this.shockwaves.push({ x: normX, y: normY, age: 0.01, strength });

    for (let i = 0; i < amount; i++) {
      if (this.particles.length >= MAX_PARTICLES) {
        this.particles.shift();
      }
      const ang = (i / amount) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const speed = (0.09 + Math.random() * 0.54) * (0.7 + 0.3 * strength);
      const useAccent = Math.random() > 0.42;
      const col = useAccent ? accentRgb : primaryRgb;

      this.particles.push({
        x: normX,
        y: normY,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        size: 11 + Math.random() * 16,
        life: 1.0,
        maxLife: 0.72 + Math.random() * 1.15,
        glyph: 2 + Math.floor(Math.random() * 13),
        r: col[0],
        g: col[1],
        b: col[2],
      });
    }
  }

  public update(dt: number, aspect: number): Float32Array {
    // Advance radial shockwave rings
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      this.shockwaves[i].age += dt * 1.35;
      if (this.shockwaves[i].age >= 1.2) {
        this.shockwaves.splice(i, 1);
      }
    }

    this.shockBuffer.fill(0);
    for (let i = 0; i < Math.min(MAX_SHOCKWAVES, this.shockwaves.length); i++) {
      const sw = this.shockwaves[i];
      const base = i * 4;
      this.shockBuffer[base] = sw.x;
      this.shockBuffer[base + 1] = sw.y;
      this.shockBuffer[base + 2] = sw.age;
      this.shockBuffer[base + 3] = sw.strength;
    }

    let write = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt / p.maxLife;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      const drag = Math.exp(-2.3 * dt);
      p.vx *= drag;
      p.vy = p.vy * drag - 0.14 * dt;
      p.x += (p.vx / Math.max(0.5, aspect)) * dt;
      p.y += p.vy * dt;

      if (Math.random() < dt * 9.0) {
        p.glyph = 2 + ((p.glyph + 3) % 13);
      }

      const base = write * STRIDE;
      this.buffer[base] = p.x;
      this.buffer[base + 1] = p.y;
      this.buffer[base + 2] = p.size * (0.55 + 0.45 * p.life);
      this.buffer[base + 3] = p.life;
      this.buffer[base + 4] = p.glyph;
      this.buffer[base + 5] = p.r;
      this.buffer[base + 6] = p.g;
      this.buffer[base + 7] = p.b;
      write++;
    }
    return this.buffer.subarray(0, write * STRIDE);
  }

  public getShockwaveUniforms(): Float32Array {
    return this.shockBuffer;
  }

  public clear(): void {
    this.particles.length = 0;
    this.shockwaves.length = 0;
    this.shockBuffer.fill(0);
  }
}
