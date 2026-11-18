import { CollarColorId, DogAccessoryId, DogBreed } from '../data/dogs';
import { drawCartoonDog } from './dogRenderer';

interface ClimbPopup {
  x: number;
  y: number;
  text: string;
  color: string;
  scale: number;
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
  kind: 'puff' | 'leaf' | 'spark';
  rot: number;
  vrot: number;
  life: number;
  maxLife: number;
}

interface SpeedLine {
  x: number;
  y: number;
  len: number;
  speed: number;
  color: string;
  life: number;
  maxLife: number;
}

interface ShockwaveRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface DogClimberCallbacks {
  onClimbStep: (deltaMeters: number, bonusType?: 'bone' | 'hydrant') => void;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpHex(hexA: string, hexB: string, t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, c));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, c));
  const bl = Math.round(lerp(a & 255, b & 255, c));
  return `rgb(${r}, ${g}, ${bl})`;
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
  private hydrantBoostTimer = 0;

  private popups: ClimbPopup[] = [];
  private particles: PuffParticle[] = [];
  private speedLines: SpeedLine[] = [];
  private shockwaves: ShockwaveRing[] = [];
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
    this.onContextMenu = this.onContextMenu.bind(this);
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
    this.combo = 0;
    this.comboTimer = 0;
    this.hydrantBoostTimer = 0;
    this.climbAnim = 0;
    this.bounceOffset = 0;
    this.popups = [];
    this.particles = [];
    this.speedLines = [];
    this.shockwaves = [];
  }

  public start(): void {
    if (this.active) return;
    this.active = true;
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.active = false;
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
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

  private onContextMenu(ev: Event): void {
    ev.preventDefault();
  }

  private onPointerDown(ev: PointerEvent): void {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    this.combo = Math.min(20, this.combo + 1);
    this.comboTimer = 1.15;

    const baseStep = this.combo >= 10 ? 0.5 : 0.35;
    let delta = baseStep;
    let bonusType: 'bone' | 'hydrant' | undefined;

    const cx = this.width / 2;
    const dogY = this.height * 0.62;

    this.targetMeters += baseStep;
    if (this.targetMeters >= this.nextHydrantMeter) {
      this.nextHydrantMeter += 25;
      delta += 3.5;
      this.targetMeters += 3.5;
      this.hydrantBoostTimer = 2.6;
      bonusType = 'hydrant';
      this.spawnPopup(cx, this.height * 0.43, 'SUPER HYDRANT +3.5m!', '#38bdf8', 1.18);
      this.shockwaves.push({
        x: cx,
        y: dogY,
        radius: 18,
        maxRadius: 120,
        color: '#facc15',
        life: 0,
        maxLife: 0.45,
      });
      this.shockwaves.push({
        x: cx,
        y: dogY,
        radius: 12,
        maxRadius: 95,
        color: '#38bdf8',
        life: 0,
        maxLife: 0.38,
      });
      for (let i = 0; i < 18; i++) {
        const ang = (Math.PI * 2 * i) / 18;
        const spd = 90 + Math.random() * 140;
        this.particles.push({
          x: cx + (Math.random() - 0.5) * 32,
          y: dogY,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd * 0.7 + 80,
          size: 4 + Math.random() * 4,
          color: i % 2 === 0 ? '#facc15' : '#38bdf8',
          kind: 'spark',
          rot: Math.random() * Math.PI,
          vrot: (Math.random() - 0.5) * 10,
          life: 0,
          maxLife: 0.6,
        });
      }
      for (let i = 0; i < 8; i++) {
        this.speedLines.push({
          x: cx + (Math.random() - 0.5) * Math.min(260, this.width * 0.75),
          y: Math.random() * this.height * 0.35,
          len: 36 + Math.random() * 48,
          speed: 520 + Math.random() * 240,
          color: i % 2 === 0 ? 'rgba(250, 204, 21, 0.75)' : 'rgba(56, 189, 248, 0.8)',
          life: 0,
          maxLife: 0.38,
        });
      }
    } else if (this.targetMeters >= this.nextBoneMeter) {
      this.nextBoneMeter += 8;
      delta += 1.2;
      this.targetMeters += 1.2;
      bonusType = 'bone';
      this.spawnPopup(cx, this.height * 0.47, 'GOLDEN BONE +1.2m!', '#facc15', 1.08);
      this.shockwaves.push({
        x: cx,
        y: dogY,
        radius: 14,
        maxRadius: 72,
        color: '#fde047',
        life: 0,
        maxLife: 0.32,
      });
      for (let i = 0; i < 10; i++) {
        this.particles.push({
          x: cx + (Math.random() - 0.5) * 36,
          y: dogY - 8,
          vx: (Math.random() - 0.5) * 150,
          vy: -40 + Math.random() * 140,
          size: 3.5 + Math.random() * 3,
          color: i % 2 === 0 ? '#fef08a' : '#f59e0b',
          kind: 'spark',
          rot: 0,
          vrot: (Math.random() - 0.5) * 8,
          life: 0,
          maxLife: 0.48,
        });
      }
    } else {
      this.spawnPopup(
        cx + (Math.random() - 0.5) * 48,
        this.height * 0.52,
        `+${delta.toFixed(1)}m`,
        this.hydrantBoostTimer > 0 ? '#7dd3fc' : '#fde68a',
        1
      );
    }

    this.climbStepDir *= -1;
    this.climbAnim = 1;
    this.bounceOffset = -11;

    // Bouncy cloud & leaf puffs on every climb tap
    const inLeafZone = this.visualMeters < 95;
    for (let i = 0; i < 6; i++) {
      const isLeaf = inLeafZone && i < 2;
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 40,
        y: dogY + 18 + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 95,
        vy: 55 + Math.random() * 85,
        size: isLeaf ? 5 + Math.random() * 3 : 5 + Math.random() * 4.5,
        color: isLeaf
          ? i % 2 === 0
            ? '#4ade80'
            : '#86efac'
          : this.hydrantBoostTimer > 0
            ? '#bae6fd'
            : '#f8fafc',
        kind: isLeaf ? 'leaf' : 'puff',
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 7,
        life: 0,
        maxLife: 0.42,
      });
    }

    // Upward motion speed lines
    const lineCount = this.combo >= 8 || this.hydrantBoostTimer > 0 ? 4 : 2;
    for (let i = 0; i < lineCount; i++) {
      this.speedLines.push({
        x: cx + (Math.random() - 0.5) * Math.min(220, this.width * 0.72),
        y: Math.random() * this.height * 0.45,
        len: 26 + Math.random() * 34,
        speed: 420 + Math.random() * 200,
        color:
          this.hydrantBoostTimer > 0
            ? 'rgba(250, 204, 21, 0.72)'
            : 'rgba(125, 211, 252, 0.58)',
        life: 0,
        maxLife: 0.3,
      });
    }

    this.callbacks.onClimbStep(delta, bonusType);
  }

  private spawnPopup(x: number, y: number, text: string, color: string, scale = 1): void {
    this.popups.push({ x, y, text, color, scale, life: 0, maxLife: 0.72 });
  }

  private loop(now: number): void {
    if (!this.active) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    this.clock += dt;
    this.visualMeters += (this.targetMeters - this.visualMeters) * Math.min(1, dt * 14);
    this.bounceOffset *= Math.pow(0.001, dt);
    this.climbAnim = Math.max(0, this.climbAnim - dt * 4);
    if (this.hydrantBoostTimer > 0) {
      this.hydrantBoostTimer = Math.max(0, this.hydrantBoostTimer - dt);
      if (Math.random() < dt * 14 && this.width > 0) {
        this.speedLines.push({
          x: this.width / 2 + (Math.random() - 0.5) * 160,
          y: Math.random() * this.height * 0.4,
          len: 28 + Math.random() * 36,
          speed: 480 + Math.random() * 180,
          color: Math.random() > 0.5 ? 'rgba(250, 204, 21, 0.6)' : 'rgba(56, 189, 248, 0.65)',
          life: 0,
          maxLife: 0.28,
        });
      }
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    this.popups = this.popups.filter((p) => {
      p.life += dt;
      p.y -= 50 * dt;
      return p.life < p.maxLife;
    });
    this.particles = this.particles.filter((p) => {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      return p.life < p.maxLife;
    });
    this.speedLines = this.speedLines.filter((l) => {
      l.life += dt;
      l.y += l.speed * dt;
      return l.life < l.maxLife;
    });
    this.shockwaves = this.shockwaves.filter((s) => {
      s.life += dt;
      const t = s.life / s.maxLife;
      s.radius = lerp(12, s.maxRadius, 1 - Math.pow(1 - t, 2));
      return s.life < s.maxLife;
    });

    this.draw();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private getSkyColors(m: number): [string, string] {
    // 0..35m Neighborhood -> 35..85m Treetops -> 85..160m Sunny Clouds -> 160..240m Twilight -> 240m+ Space
    if (m < 35) {
      const t = Math.max(0, m / 35);
      return [lerpHex('#38bdf8', '#0284c7', t), lerpHex('#bae6fd', '#7dd3fc', t)];
    }
    if (m < 85) {
      const t = (m - 35) / 50;
      return [lerpHex('#0284c7', '#0369a1', t), lerpHex('#7dd3fc', '#38bdf8', t)];
    }
    if (m < 160) {
      const t = (m - 85) / 75;
      return [lerpHex('#0369a1', '#1e3a8a', t), lerpHex('#38bdf8', '#7c3aed', t)];
    }
    if (m < 240) {
      const t = (m - 160) / 80;
      return [lerpHex('#1e3a8a', '#020617', t), lerpHex('#7c3aed', '#1e1b4b', t)];
    }
    return ['#020617', '#1e1b4b'];
  }

  private draw(): void {
    const { ctx, width, height } = this;
    if (width <= 0 || height <= 0) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const m = this.visualMeters;
    const offsetPx = m * this.pxPerMeter;
    const cx = width / 2;
    const dogY = height * 0.62 + this.bounceOffset;

    // 1. Dynamic Altitude Sky Gradient
    const [topColor, botColor] = this.getSkyColors(m);
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    skyGrad.addColorStop(0, topColor);
    skyGrad.addColorStop(1, botColor);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    // Warm horizon twilight glow around 140..230m
    if (m > 120 && m < 250) {
      const twilightAlpha =
        m < 185 ? (m - 120) / 65 : Math.max(0, 1 - (m - 185) / 65);
      const glow = ctx.createLinearGradient(0, height * 0.45, 0, height);
      glow.addColorStop(0, 'rgba(244, 114, 182, 0)');
      glow.addColorStop(1, `rgba(249, 115, 22, ${0.42 * twilightAlpha})`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Sunny glow in lower altitudes (0..160m)
    if (m < 170) {
      const sunAlpha = Math.max(0, 1 - Math.max(0, m - 90) / 80);
      const sunX = width * 0.82;
      const sunY = height * 0.16 + Math.min(height * 0.5, offsetPx * 0.08);
      const sunHalo = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, 75);
      sunHalo.addColorStop(0, `rgba(254, 240, 138, ${0.85 * sunAlpha})`);
      sunHalo.addColorStop(0.35, `rgba(253, 224, 71, ${0.35 * sunAlpha})`);
      sunHalo.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = sunHalo;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 75, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Stars & Space Aurora (155m+)
    if (m > 145) {
      const starAlpha = Math.min(1, (m - 145) / 65);
      for (let i = 0; i < 36; i++) {
        const sx = ((i * 97 + 29) % Math.max(80, width - 20)) + 10;
        const sy = ((i * 149 + offsetPx * 0.18) % (height + 40)) - 20;
        const twinkle = 0.45 + 0.55 * Math.sin(this.clock * (2 + (i % 4)) + i);
        ctx.fillStyle = `rgba(248, 250, 252, ${starAlpha * twinkle})`;
        const r = i % 5 === 0 ? 2.2 : 1.3;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (m > 215) {
        const auroraAlpha = Math.min(0.28, ((m - 215) / 80) * 0.28);
        const aurora = ctx.createLinearGradient(0, height * 0.1, width, height * 0.45);
        aurora.addColorStop(0, `rgba(56, 189, 248, ${auroraAlpha})`);
        aurora.addColorStop(0.5, `rgba(45, 212, 191, ${auroraAlpha * 0.85})`);
        aurora.addColorStop(1, `rgba(168, 85, 247, ${auroraAlpha})`);
        ctx.fillStyle = aurora;
        ctx.beginPath();
        ctx.moveTo(0, height * 0.18);
        ctx.quadraticCurveTo(
          width * 0.5,
          height * (0.08 + Math.sin(this.clock * 0.8) * 0.05),
          width,
          height * 0.24
        );
        ctx.lineTo(width, height * 0.42);
        ctx.quadraticCurveTo(
          width * 0.5,
          height * (0.28 + Math.cos(this.clock * 0.7) * 0.05),
          0,
          height * 0.36
        );
        ctx.closePath();
        ctx.fill();
      }
    }

    // 4. Fluffy Parallax Clouds (30m..210m)
    if (m > 20 && m < 220) {
      const cloudVis =
        m < 50 ? (m - 20) / 30 : m > 165 ? Math.max(0, 1 - (m - 165) / 55) : 1;
      for (let i = 0; i < 7; i++) {
        const cy = ((i * 135 + offsetPx * 0.26) % (height + 120)) - 60;
        const cxCloud =
          ((i * 157 + this.clock * (6 + (i % 3) * 3)) % (width + 100)) - 50;
        this.drawCloud(ctx, cxCloud, cy, 0.75 + (i % 3) * 0.22, cloudVis * 0.65);
      }
    }

    // 5. Treetop Foliage Clusters (22m..92m)
    if (m > 12 && m < 95) {
      const treeVis =
        m < 32 ? (m - 12) / 20 : m > 68 ? Math.max(0, 1 - (m - 68) / 27) : 1;
      ctx.save();
      ctx.globalAlpha = treeVis * 0.85;
      for (let i = 0; i < 8; i++) {
        const side = i % 2 === 0 ? 0 : 1;
        const ty = ((i * 125 + offsetPx * 0.55) % (height + 140)) - 70;
        const tx = side === 0 ? 18 + (i % 3) * 16 : width - 18 - (i % 3) * 16;
        ctx.fillStyle = i % 2 === 0 ? '#15803d' : '#16a34a';
        ctx.beginPath();
        ctx.arc(tx, ty, 28 + (i % 3) * 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.arc(tx - 6, ty - 7, 14 + (i % 2) * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 6. Neighborhood Backyard Ground & Picket Fence (0m..28m)
    const groundY = height * 0.78 + offsetPx;
    if (groundY < height + 160) {
      // Rolling backyard lawn
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.moveTo(0, groundY - 22);
      ctx.quadraticCurveTo(width * 0.5, groundY - 46, width, groundY - 20);
      ctx.lineTo(width, height + 200);
      ctx.lineTo(0, height + 200);
      ctx.closePath();
      ctx.fill();

      // White neighborhood picket fence
      const fenceTop = groundY - 56;
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.fillRect(0, fenceTop + 14, width, 6);
      ctx.fillRect(0, fenceTop + 34, width, 6);
      for (let fx = 6; fx < width; fx += 24) {
        ctx.beginPath();
        ctx.moveTo(fx, fenceTop + 46);
        ctx.lineTo(fx, fenceTop + 10);
        ctx.lineTo(fx + 7, fenceTop);
        ctx.lineTo(fx + 14, fenceTop + 10);
        ctx.lineTo(fx + 14, fenceTop + 46);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Bushes along the fence
      ctx.fillStyle = '#15803d';
      for (let bx = 18; bx < width; bx += 72) {
        ctx.beginPath();
        ctx.arc(bx, groundY - 8, 18, 0, Math.PI * 2);
        ctx.arc(bx + 18, groundY - 5, 14, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 7. Upward Speed Trails (behind ladder/dog)
    for (const l of this.speedLines) {
      const alpha = 1 - l.life / l.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x, l.y + l.len);
      ctx.stroke();
      ctx.restore();
    }

    // 8. Sleek Sky-Blue Energy Ladder
    const poleW = 56;
    const boostPulse =
      this.hydrantBoostTimer > 0
        ? 0.55 + 0.35 * Math.sin(this.clock * 14)
        : this.combo >= 8
          ? 0.35
          : 0.18;

    // Inner ladder track
    const trackGrad = ctx.createLinearGradient(cx - poleW / 2, 0, cx + poleW / 2, 0);
    trackGrad.addColorStop(0, 'rgba(15, 23, 42, 0.65)');
    trackGrad.addColorStop(0.5, `rgba(14, 165, 233, ${boostPulse})`);
    trackGrad.addColorStop(1, 'rgba(15, 23, 42, 0.65)');
    ctx.fillStyle = trackGrad;
    ctx.fillRect(cx - poleW / 2, 0, poleW, height);

    // Outer wooden/bronze rails
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(cx - poleW / 2, 0);
    ctx.lineTo(cx - poleW / 2, height);
    ctx.moveTo(cx + poleW / 2, 0);
    ctx.lineTo(cx + poleW / 2, height);
    ctx.stroke();

    // Sleek sky-blue energy highlight strips along rails
    ctx.strokeStyle = this.hydrantBoostTimer > 0 ? '#7dd3fc' : '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - poleW / 2 + 1.5, 0);
    ctx.lineTo(cx - poleW / 2 + 1.5, height);
    ctx.moveTo(cx + poleW / 2 - 1.5, 0);
    ctx.lineTo(cx + poleW / 2 - 1.5, height);
    ctx.stroke();

    // Ladder rungs with energy joints
    const rungSpacing = 38;
    const shift = offsetPx % rungSpacing;
    for (let y = -rungSpacing + shift; y < height + rungSpacing; y += rungSpacing) {
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx - poleW / 2 + 2, y);
      ctx.lineTo(cx + poleW / 2 - 2, y);
      ctx.stroke();

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - poleW / 2 + 3, y - 1);
      ctx.lineTo(cx + poleW / 2 - 3, y - 1);
      ctx.stroke();

      // Sky-blue rail caps
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(cx - poleW / 2, y, 3.2, 0, Math.PI * 2);
      ctx.arc(cx + poleW / 2, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 9. Collectibles
    const boneDistPx = (this.nextBoneMeter - m) * this.pxPerMeter;
    const boneY = height * 0.62 - boneDistPx;
    if (boneY > -50 && boneY < height + 50) {
      const bob = Math.sin(this.clock * 4.2) * 3;
      this.drawBoneCollectible(ctx, cx + 52, boneY + bob);
    }

    const hydrantDistPx = (this.nextHydrantMeter - m) * this.pxPerMeter;
    const hydrantY = height * 0.62 - hydrantDistPx;
    if (hydrantY > -60 && hydrantY < height + 60) {
      const bob = Math.sin(this.clock * 3.6) * 2.5;
      this.drawFireHydrant(ctx, cx - 54, hydrantY + bob);
    }

    // 10. Best height marker
    if (this.bestMeters > 0) {
      const bestDistPx = (this.bestMeters - m) * this.pxPerMeter;
      const bestY = height * 0.62 - bestDistPx;
      if (bestY > 10 && bestY < height - 10) {
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)';
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(16, bestY);
        ctx.lineTo(width - 16, bestY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#facc15';
        ctx.font = '800 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`BEST ${this.bestMeters.toFixed(1)}m`, 20, bestY - 6);
      }
    }

    // 11. Shockwave Rings
    for (const s of this.shockwaves) {
      const alpha = 1 - s.life / s.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 4 * alpha + 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 12. Super-Boost Golden Aura behind Dog
    const boostLevel =
      this.hydrantBoostTimer > 0
        ? Math.min(1, 0.65 + 0.35 * Math.sin(this.clock * 16))
        : this.combo >= 10
          ? 0.4
          : 0;
    if (boostLevel > 0) {
      const auraR = 54 + Math.sin(this.clock * 14) * 6;
      const auraGrad = ctx.createRadialGradient(cx, dogY + 8, 8, cx, dogY + 8, auraR);
      auraGrad.addColorStop(
        0,
        this.hydrantBoostTimer > 0
          ? 'rgba(250, 204, 21, 0.65)'
          : 'rgba(56, 189, 248, 0.45)'
      );
      auraGrad.addColorStop(
        0.55,
        this.hydrantBoostTimer > 0
          ? 'rgba(56, 189, 248, 0.32)'
          : 'rgba(56, 189, 248, 0.16)'
      );
      auraGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(cx, dogY + 8, auraR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 13. Cartoon Dog
    drawCartoonDog(ctx, cx, dogY, 32, {
      breed: this.breed,
      collarColor: this.collarColor,
      accessory: this.accessory,
      pose: 'climb',
      animPhase: this.clock,
      stepDir: this.climbStepDir,
      boostLevel,
    });

    // 14. Bouncy Cloud/Leaf/Spark Particles (in front of paws)
    for (const p of this.particles) {
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.kind === 'leaf') {
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 1.15, p.size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'spark') {
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.45, 0);
        ctx.lineTo(0, p.size);
        ctx.lineTo(-p.size * 0.45, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size * (0.7 + 0.5 * (p.life / p.maxLife)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 15. Combo badge
    if (this.combo >= 4) {
      ctx.save();
      const pulse = 1 + Math.sin(this.clock * 12) * 0.04;
      ctx.translate(width - 20, 26);
      ctx.scale(pulse, pulse);
      ctx.fillStyle =
        this.combo >= 10 ? 'rgba(250, 204, 21, 0.92)' : 'rgba(56, 189, 248, 0.88)';
      ctx.beginPath();
      ctx.roundRect(-84, -14, 84, 26, 13);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        this.combo >= 10 ? `TURBO x${this.combo}` : `COMBO x${this.combo}`,
        -42,
        3
      );
      ctx.restore();
    }

    // 16. Floating popups
    for (const pop of this.popups) {
      const alpha = Math.max(0, 1 - pop.life / pop.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(pop.x, pop.y);
      ctx.scale(pop.scale, pop.scale);
      ctx.font = '900 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeText(pop.text, 0, 0);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, 0, 0);
      ctx.restore();
    }
  }

  private drawCloud(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    alpha: number
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(-18, 4, 14, 0, Math.PI * 2);
    ctx.arc(0, -4, 18, 0, Math.PI * 2);
    ctx.arc(19, 4, 13, 0, Math.PI * 2);
    ctx.arc(0, 8, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawBoneCollectible(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    ctx.translate(x, y);

    // Golden sparkle halo
    const haloR = 23 + Math.sin(this.clock * 6) * 2.5;
    const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, haloR);
    halo.addColorStop(0, 'rgba(250, 204, 21, 0.55)');
    halo.addColorStop(0.6, 'rgba(251, 191, 36, 0.22)');
    halo.addColorStop(1, 'rgba(250, 204, 21, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, haloR, 0, Math.PI * 2);
    ctx.fill();

    // Orbiting mini sparkles
    for (let i = 0; i < 3; i++) {
      const ang = this.clock * 2.8 + (i * Math.PI * 2) / 3;
      const sx = Math.cos(ang) * 20;
      const sy = Math.sin(ang) * 14;
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crisp glossy two-knob golden bone
    const boneGrad = ctx.createLinearGradient(0, -10, 0, 10);
    boneGrad.addColorStop(0, '#fef9c3');
    boneGrad.addColorStop(0.45, '#fde047');
    boneGrad.addColorStop(1, '#d97706');

    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2.2;
    ctx.fillStyle = boneGrad;

    const knobs: [number, number][] = [
      [-12, -4.5],
      [-12, 4.5],
      [12, -4.5],
      [12, 4.5],
    ];
    for (const [kx, ky] of knobs) {
      ctx.beginPath();
      ctx.arc(kx, ky, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillRect(-11, -4, 22, 8);
    ctx.beginPath();
    ctx.moveTo(-9, -4);
    ctx.lineTo(9, -4);
    ctx.moveTo(-9, 4);
    ctx.lineTo(9, 4);
    ctx.stroke();

    // Glossy specular shine on shaft & top knobs
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.beginPath();
    ctx.roundRect(-8, -2.5, 16, 2.2, 1);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-13, -5.8, 1.8, 0, Math.PI * 2);
    ctx.arc(11, -5.8, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawFireHydrant(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    ctx.translate(x, y);

    // Beacon halo
    const haloR = 26 + Math.sin(this.clock * 5) * 2.5;
    const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, haloR);
    halo.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
    halo.addColorStop(0.55, 'rgba(239, 68, 68, 0.25)');
    halo.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, haloR, 0, Math.PI * 2);
    ctx.fill();

    // Wooden bracket attaching hydrant toward ladder
    ctx.fillStyle = '#92400e';
    ctx.fillRect(-15, 13, 38, 5);
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-15, 13, 38, 5);

    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 2;

    // 3D cylindrical red body gradient
    const bodyGrad = ctx.createLinearGradient(-9, 0, 9, 0);
    bodyGrad.addColorStop(0, '#991b1b');
    bodyGrad.addColorStop(0.32, '#ef4444');
    bodyGrad.addColorStop(0.65, '#f87171');
    bodyGrad.addColorStop(1, '#b91c1c');

    // Base flange
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-12, 8, 24, 5.5, 2.5);
    ctx.fill();
    ctx.stroke();

    // Main cylinder body
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-8.5, -9, 17, 18, 2.5);
    ctx.fill();
    ctx.stroke();

    // Specular 3D shine strip
    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.beginPath();
    ctx.roundRect(-5, -7, 3.2, 14, 1.5);
    ctx.fill();

    // Metallic chrome side nozzles
    const chromeGrad = ctx.createLinearGradient(0, -4, 0, 4);
    chromeGrad.addColorStop(0, '#f8fafc');
    chromeGrad.addColorStop(0.5, '#cbd5e1');
    chromeGrad.addColorStop(1, '#64748b');
    ctx.fillStyle = chromeGrad;
    ctx.beginPath();
    ctx.roundRect(-14, -3.5, 5.5, 7, 1.5);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(8.5, -3.5, 5.5, 7, 1.5);
    ctx.fill();
    ctx.stroke();

    // Center front nozzle circle
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Domed cap
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, -9, 9, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Chrome top nut
    ctx.fillStyle = chromeGrad;
    ctx.beginPath();
    ctx.roundRect(-3.2, -21, 6.4, 4.5, 1.2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}
