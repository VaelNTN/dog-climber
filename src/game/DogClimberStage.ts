import { CollarColorId, DogAccessoryId, DogBreed } from '../data/dogs';
import { drawCartoonDog } from './dogRenderer';

interface ClimbPopup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

interface PuffParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface DogClimberCallbacks {
  onClimbStep: (deltaMeters: number, bonusType?: 'bone' | 'hydrant') => void;
}

export class DogClimberStage {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private breed: DogBreed;
  private collarColor: CollarColorId;
  private accessory: DogAccessoryId;
  private callbacks: DogClimberCallbacks;

  private width = 0;
  private height = 0;
  private dpr = 1;
  private active = false;
  private rafId: number | null = null;
  private lastTime = 0;

  private targetMeters = 0;
  private visualMeters = 0;
  private bestMeters = 0;
  private climbStepDir = 1;
  private climbAnim = 0;
  private bounceOffset = 0;
  private clock = 0;
  private nextBoneMeter = 8;
  private nextHydrantMeter = 25;
  private combo = 0;
  private comboTimer = 0;

  private popups: ClimbPopup[] = [];
  private particles: PuffParticle[] = [];
  private readonly pxPerMeter = 28;

  constructor(
    canvas: HTMLCanvasElement,
    opts: {
      breed: DogBreed;
      collarColor: CollarColorId;
      accessory: DogAccessoryId;
      initialMeters: number;
      bestMeters: number;
    },
    callbacks: DogClimberCallbacks
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D unavailable');
    this.ctx = context;
    this.breed = opts.breed;
    this.collarColor = opts.collarColor;
    this.accessory = opts.accessory;
    this.targetMeters = opts.initialMeters;
    this.visualMeters = opts.initialMeters;
    this.bestMeters = opts.bestMeters;
    this.nextBoneMeter = Math.floor(opts.initialMeters / 8 + 1) * 8;
    this.nextHydrantMeter = Math.floor(opts.initialMeters / 25 + 1) * 25;
    this.callbacks = callbacks;

    this.handleResize = this.handleResize.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.loop = this.loop.bind(this);
  }

  public setAppearance(opts: {
    breed: DogBreed;
    collarColor: CollarColorId;
    accessory: DogAccessoryId;
  }): void {
    this.breed = opts.breed;
    this.collarColor = opts.collarColor;
    this.accessory = opts.accessory;
  }

  public setMeters(meters: number, bestMeters: number): void {
    this.targetMeters = meters;
    this.visualMeters = meters;
    this.bestMeters = bestMeters;
    this.nextBoneMeter = Math.floor(meters / 8 + 1) * 8;
    this.nextHydrantMeter = Math.floor(meters / 25 + 1) * 25;
  }

  public start(): void {
    if (this.active) return;
    this.active = true;
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.active = false;
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private handleResize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
  }

  private onPointerDown(ev: PointerEvent): void {
    ev.preventDefault();
    this.combo = Math.min(20, this.combo + 1);
    this.comboTimer = 1.1;

    const baseStep = this.combo >= 10 ? 0.5 : 0.35;
    let delta = baseStep;
    let bonusType: 'bone' | 'hydrant' | undefined;

    this.targetMeters += baseStep;
    if (this.targetMeters >= this.nextHydrantMeter) {
      this.nextHydrantMeter += 25;
      delta += 3.5;
      this.targetMeters += 3.5;
      bonusType = 'hydrant';
      this.spawnPopup(this.width / 2, this.height * 0.45, 'BRANDKRAAN +3.5m!', '#38bdf8');
      for (let i = 0; i < 14; i++) {
        this.particles.push({
          x: this.width / 2 + (Math.random() - 0.5) * 40,
          y: this.height * 0.68,
          vx: (Math.random() - 0.5) * 140,
          vy: 120 + Math.random() * 140,
          size: 4 + Math.random() * 4,
          color: '#38bdf8',
          life: 0,
          maxLife: 0.55,
        });
      }
    } else if (this.targetMeters >= this.nextBoneMeter) {
      this.nextBoneMeter += 8;
      delta += 1.2;
      this.targetMeters += 1.2;
      bonusType = 'bone';
      this.spawnPopup(this.width / 2, this.height * 0.48, 'BOTJE +1.2m!', '#facc15');
    } else {
      this.spawnPopup(this.width / 2 + (Math.random() - 0.5) * 48, this.height * 0.52, `+${delta.toFixed(1)}m`, '#fde68a');
    }

    this.climbStepDir *= -1;
    this.climbAnim = 1;
    this.bounceOffset = -10;

    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x: this.width / 2 + (Math.random() - 0.5) * 34,
        y: this.height * 0.65,
        vx: (Math.random() - 0.5) * 90,
        vy: 50 + Math.random() * 80,
        size: 3 + Math.random() * 3,
        color: '#fef08a',
        life: 0,
        maxLife: 0.38,
      });
    }

    this.callbacks.onClimbStep(delta, bonusType);
  }

  private spawnPopup(x: number, y: number, text: string, color: string): void {
    this.popups.push({ x, y, text, color, life: 0, maxLife: 0.7 });
  }

  private loop(now: number): void {
    if (!this.active) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    this.clock += dt;
    this.visualMeters += (this.targetMeters - this.visualMeters) * Math.min(1, dt * 14);
    this.bounceOffset *= Math.pow(0.001, dt);
    this.climbAnim = Math.max(0, this.climbAnim - dt * 4);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    this.popups = this.popups.filter((p) => {
      p.life += dt;
      p.y -= 48 * dt;
      return p.life < p.maxLife;
    });
    this.particles = this.particles.filter((p) => {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      return p.life < p.maxLife;
    });

    this.draw();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private draw(): void {
    const { ctx, width, height } = this;
    if (width <= 0 || height <= 0) return;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Sky gradient transitions by altitude
    const alt = Math.min(1, this.visualMeters / 120);
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, alt > 0.5 ? '#020617' : '#0369a1');
    grad.addColorStop(1, alt > 0.5 ? '#1e1b4b' : '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Clouds / Stars parallax
    const offsetPx = this.visualMeters * this.pxPerMeter;
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let i = 0; i < 14; i++) {
      const sy = ((i * 110 + offsetPx * 0.35) % (height + 80)) - 40;
      const sx = ((i * 173) % Math.max(100, width - 40)) + 20;
      ctx.beginPath();
      ctx.arc(sx, sy, 3 + (i % 3) * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Center ladder / rope pole
    const cx = width / 2;
    const poleW = 54;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fillRect(cx - poleW / 2, 0, poleW, height);
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx - poleW / 2, 0);
    ctx.lineTo(cx - poleW / 2, height);
    ctx.moveTo(cx + poleW / 2, 0);
    ctx.lineTo(cx + poleW / 2, height);
    ctx.stroke();

    // Ladder rungs + milestone treats
    const rungSpacing = 38;
    const shift = offsetPx % rungSpacing;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 5;
    for (let y = -rungSpacing + shift; y < height + rungSpacing; y += rungSpacing) {
      ctx.beginPath();
      ctx.moveTo(cx - poleW / 2, y);
      ctx.lineTo(cx + poleW / 2, y);
      ctx.stroke();
    }

    // Next bone preview
    const boneDistPx = (this.nextBoneMeter - this.visualMeters) * this.pxPerMeter;
    const boneY = height * 0.62 - boneDistPx;
    if (boneY > -40 && boneY < height) {
      ctx.save();
      ctx.translate(cx + 46, boneY);
      ctx.fillStyle = '#fde68a';
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-12, -4, 24, 8, 3);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Best line
    if (this.bestMeters > 0) {
      const bestDistPx = (this.bestMeters - this.visualMeters) * this.pxPerMeter;
      const bestY = height * 0.62 - bestDistPx;
      if (bestY > 10 && bestY < height - 10) {
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(16, bestY);
        ctx.lineTo(width - 16, bestY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`RECORD ${this.bestMeters.toFixed(1)}m`, 20, bestY - 6);
      }
    }

    // Particles
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Cartoon Dog
    drawCartoonDog(ctx, cx, height * 0.62 + this.bounceOffset, 32, {
      breed: this.breed,
      collarColor: this.collarColor,
      accessory: this.accessory,
      pose: 'climb',
      animPhase: this.clock,
      stepDir: this.climbStepDir,
    });

    // Floating popups
    for (const pop of this.popups) {
      ctx.globalAlpha = 1 - pop.life / pop.maxLife;
      ctx.fillStyle = pop.color;
      ctx.font = '800 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pop.text, pop.x, pop.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
