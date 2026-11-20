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

interface BranchBone {
  side: -1 | 1;
  meterPos: number;
  collected: boolean;
}

interface FallingPinecone {
  side: -1 | 1;
  y: number;
  vy: number;
  telegraph: number;
  rot: number;
  resolved: boolean;
}

export interface DogClimberCallbacks {
  onClimbStep: (deltaMeters: number, bonusType?: 'bone' | 'hydrant' | 'turbo' | 'dodge' | 'bonk') => void;
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
  private paused = false;
  private rafId: number | null = null;
  private lastTime = 0;

  private targetMeters = 0;
  private visualMeters = 0;
  private bestMeters = 0;
  private climbStepDir = 1;
  private climbAnim = 0;
  private bounceOffset = 0;
  private bonkShake = 0;
  private clock = 0;
  private nextHydrantMeter = 25;
  private combo = 0;
  private comboTimer = 0;
  private hydrantBoostTimer = 0;
  private turboBoostTimer = 0;

  private dogLane: -1 | 1 = 1;
  private dogOffsetX = 0;
  private branchBones: BranchBone[] = [];
  private nextBranchBoneMeter = 6;
  private pinecones: FallingPinecone[] = [];
  private nextPineconeIn = 4.2;

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
    this.nextHydrantMeter = Math.floor(opts.initialMeters / 25 + 1) * 25;
    this.nextBranchBoneMeter = Math.floor(opts.initialMeters / 7 + 1) * 7;
    this.callbacks = callbacks;

    this.handleResize = this.handleResize.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
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

  public isPaused(): boolean {
    return this.paused;
  }

  public setPaused(next: boolean): void {
    if (this.paused === next) return;
    this.paused = next;
    if (!next) this.lastTime = performance.now();
  }

  public setMeters(meters: number, bestMeters: number): void {
    this.targetMeters = meters;
    this.visualMeters = meters;
    this.bestMeters = bestMeters;
    this.nextHydrantMeter = Math.floor(meters / 25 + 1) * 25;
    this.nextBranchBoneMeter = Math.floor(meters / 7 + 1) * 7;
    this.combo = 0;
    this.comboTimer = 0;
    this.hydrantBoostTimer = 0;
    this.turboBoostTimer = 0;
    this.climbAnim = 0;
    this.bounceOffset = 0;
    this.bonkShake = 0;
    this.dogLane = 1;
    this.dogOffsetX = 0;
    this.branchBones = [];
    this.pinecones = [];
    this.nextPineconeIn = 4.2;
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
    window.addEventListener('keydown', this.onKeyDown);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.active = false;
    this.paused = false;
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('keydown', this.onKeyDown);
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

  private getBranchBoneScreenPos(b: BranchBone): { x: number; y: number } {
    const cx = this.width / 2;
    const distPx = (b.meterPos - this.visualMeters) * this.pxPerMeter;
    const y = this.height * 0.62 - distPx;
    const x = cx + b.side * 66;
    return { x, y };
  }

  private collectBranchBone(b: BranchBone, x: number, y: number): void {
    if (b.collected) return;
    b.collected = true;
    this.turboBoostTimer = 3.2;
    this.combo = Math.min(25, this.combo + 4);
    this.comboTimer = 1.6;
    const bonusM = 1.8;
    this.targetMeters += bonusM;
    this.spawnPopup(x, Math.max(58, y - 10), 'GOLDEN BONE TURBO! +1.8m', '#fde047', 1.12);
    this.shockwaves.push({
      x,
      y,
      radius: 14,
      maxRadius: 88,
      color: '#fde047',
      life: 0,
      maxLife: 0.36,
    });
    for (let i = 0; i < 14; i++) {
      const ang = (Math.PI * 2 * i) / 14;
      const spd = 80 + Math.random() * 130;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: 4 + Math.random() * 3,
        color: i % 2 === 0 ? '#fef08a' : '#f59e0b',
        kind: 'spark',
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 10,
        life: 0,
        maxLife: 0.52,
      });
    }
    this.callbacks.onClimbStep(bonusM, 'turbo');
  }

  private onKeyDown(ev: KeyboardEvent): void {
    if (this.paused) return;
    if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') {
      ev.preventDefault();
      this.triggerClimbTap(-1);
    } else if (ev.code === 'ArrowRight' || ev.code === 'KeyD') {
      ev.preventDefault();
      this.triggerClimbTap(1);
    } else if (ev.code === 'Space' || ev.code === 'ArrowUp' || ev.code === 'KeyW') {
      ev.preventDefault();
      this.triggerClimbTap(this.dogLane);
    }
  }

  private onPointerDown(ev: PointerEvent): void {
    if (this.paused) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;

    // 1. Check direct tap on a glowing Branch Golden Bone
    for (const b of this.branchBones) {
      if (b.collected) continue;
      const pos = this.getBranchBoneScreenPos(b);
      if (Math.hypot(px - pos.x, py - pos.y) <= 58) {
        this.dogLane = b.side;
        this.collectBranchBone(b, pos.x, pos.y);
        return;
      }
    }

    // 2. Check direct tap to swat a falling pinecone away
    const cx = this.width / 2;
    for (const pc of this.pinecones) {
      if (pc.resolved || pc.telegraph > 0) continue;
      const pcX = cx + pc.side * 24;
      if (Math.hypot(px - pcX, py - pc.y) <= 54) {
        pc.resolved = true;
        this.combo = Math.min(25, this.combo + 2);
        this.comboTimer = 1.4;
        const swatBonus = 0.8;
        this.targetMeters += swatBonus;
        this.spawnPopup(pcX, pc.y - 10, 'SWATTED! +0.8m', '#4ade80', 1.05);
        for (let i = 0; i < 8; i++) {
          this.particles.push({
            x: pcX,
            y: pc.y,
            vx: (Math.random() - 0.5) * 160,
            vy: -40 + Math.random() * 110,
            size: 4 + Math.random() * 3,
            color: i % 2 === 0 ? '#a16207' : '#4ade80',
            kind: 'leaf',
            rot: Math.random() * Math.PI,
            vrot: (Math.random() - 0.5) * 10,
            life: 0,
            maxLife: 0.45,
          });
        }
        this.callbacks.onClimbStep(swatBonus, 'dodge');
        return;
      }
    }

    const tapSide: -1 | 1 = px < this.width / 2 ? -1 : 1;
    this.triggerClimbTap(tapSide);
  }

  private triggerClimbTap(lane: -1 | 1): void {
    this.dogLane = lane;
    this.combo = Math.min(25, this.combo + 1);
    this.comboTimer = 1.25;

    const turboMult = this.turboBoostTimer > 0 ? 1.65 : 1;
    const baseStep = (this.combo >= 10 ? 0.5 : 0.35) * turboMult;
    let delta = baseStep;
    let bonusType: 'bone' | 'hydrant' | 'turbo' | 'dodge' | 'bonk' | undefined;

    const cx = this.width / 2;
    const dogX = cx + this.dogOffsetX;
    const dogY = this.height * 0.62;

    this.targetMeters += baseStep;

    // Auto-collect branch bone if dog climbs past it on the matching side
    for (const b of this.branchBones) {
      if (!b.collected && b.side === this.dogLane && Math.abs(this.targetMeters - b.meterPos) <= 1.2) {
        const pos = this.getBranchBoneScreenPos(b);
        this.collectBranchBone(b, pos.x, pos.y);
      }
    }

    if (this.targetMeters >= this.nextHydrantMeter) {
      this.nextHydrantMeter += 25;
      delta += 3.5;
      this.targetMeters += 3.5;
      this.hydrantBoostTimer = 2.6;
      bonusType = 'hydrant';
      this.spawnPopup(cx, this.height * 0.43, 'SUPER HYDRANT +3.5m!', '#38bdf8', 1.18);
      this.shockwaves.push({
        x: dogX,
        y: dogY,
        radius: 18,
        maxRadius: 120,
        color: '#facc15',
        life: 0,
        maxLife: 0.45,
      });
      this.shockwaves.push({
        x: dogX,
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
          x: dogX + (Math.random() - 0.5) * 32,
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
    } else {
      this.spawnPopup(
        dogX + (Math.random() - 0.5) * 44,
        this.height * 0.52,
        `+${delta.toFixed(1)}m`,
        this.turboBoostTimer > 0 ? '#fde047' : this.hydrantBoostTimer > 0 ? '#7dd3fc' : '#fde68a',
        this.turboBoostTimer > 0 ? 1.08 : 1
      );
    }

    this.climbStepDir *= -1;
    this.climbAnim = 1;
    this.bounceOffset = -11;

    const inLeafZone = this.visualMeters < 95;
    for (let i = 0; i < 6; i++) {
      const isLeaf = inLeafZone && i < 2;
      this.particles.push({
        x: dogX + (Math.random() - 0.5) * 40,
        y: dogY + 18 + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 95,
        vy: 55 + Math.random() * 85,
        size: isLeaf ? 5 + Math.random() * 3 : 5 + Math.random() * 4.5,
        color: isLeaf
          ? i % 2 === 0
            ? '#4ade80'
            : '#86efac'
          : this.turboBoostTimer > 0
            ? '#fde047'
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

    const lineCount = this.combo >= 8 || this.hydrantBoostTimer > 0 || this.turboBoostTimer > 0 ? 4 : 2;
    for (let i = 0; i < lineCount; i++) {
      this.speedLines.push({
        x: cx + (Math.random() - 0.5) * Math.min(220, this.width * 0.72),
        y: Math.random() * this.height * 0.45,
        len: 26 + Math.random() * 34,
        speed: 420 + Math.random() * 200,
        color:
          this.turboBoostTimer > 0 || this.hydrantBoostTimer > 0
            ? 'rgba(250, 204, 21, 0.72)'
            : 'rgba(125, 211, 252, 0.58)',
        life: 0,
        maxLife: 0.3,
      });
    }

    this.callbacks.onClimbStep(delta, bonusType);
  }

  private spawnPopup(x: number, y: number, text: string, color: string, scale = 1): void {
    this.popups.push({ x, y, text, color, scale, life: 0, maxLife: 0.78 });
  }

  private loop(now: number): void {
    if (!this.active) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    if (!this.paused) {
      this.clock += dt;
      this.visualMeters += (this.targetMeters - this.visualMeters) * Math.min(1, dt * 14);
      this.bounceOffset *= Math.pow(0.001, dt);
      this.climbAnim = Math.max(0, this.climbAnim - dt * 4);
      this.bonkShake = Math.max(0, this.bonkShake - dt * 2.5);

      const targetOffsetX = this.dogLane * 19;
      this.dogOffsetX += (targetOffsetX - this.dogOffsetX) * Math.min(1, dt * 15);

      // Spawn upcoming glowing Golden Bones on side branches
      while (this.nextBranchBoneMeter <= this.visualMeters + 14) {
        const side: -1 | 1 = Math.random() > 0.5 ? 1 : -1;
        this.branchBones.push({
          side,
          meterPos: this.nextBranchBoneMeter,
          collected: false,
        });
        this.nextBranchBoneMeter += 7 + Math.floor(Math.random() * 4);
      }
      this.branchBones = this.branchBones.filter(
        (b) => !b.collected && b.meterPos >= this.visualMeters - 8
      );

      // Occasional falling pinecones telegraphing a lane nudge
      if (this.targetMeters >= 4 && this.height > 0) {
        this.nextPineconeIn -= dt;
        if (this.nextPineconeIn <= 0) {
          this.nextPineconeIn = Math.max(3.4, 5.6 - Math.min(2, this.targetMeters * 0.008)) + Math.random() * 1.4;
          const side: -1 | 1 = Math.random() > 0.45 ? this.dogLane : ((this.dogLane * -1) as -1 | 1);
          this.pinecones.push({
            side,
            y: 30,
            vy: 215 + Math.min(95, this.targetMeters * 0.35),
            telegraph: 0.9,
            rot: 0,
            resolved: false,
          });
        }
      }

      const dogY = this.height * 0.62;
      for (const pc of this.pinecones) {
        if (pc.resolved) continue;
        if (pc.telegraph > 0) {
          pc.telegraph = Math.max(0, pc.telegraph - dt);
        } else {
          pc.y += pc.vy * dt;
          pc.rot += dt * 6 * pc.side;
          if (Math.abs(pc.y - dogY) < 34) {
            if (pc.side === this.dogLane) {
              pc.resolved = true;
              this.combo = Math.floor(this.combo / 2);
              this.bonkShake = 1;
              this.spawnPopup(this.width / 2 + pc.side * 24, dogY - 26, 'BONK! Dodge lanes!', '#fb7185', 1.05);
              this.callbacks.onClimbStep(0, 'bonk');
            }
          } else if (pc.y > dogY + 38) {
            pc.resolved = true;
            this.combo = Math.min(25, this.combo + 2);
            this.comboTimer = 1.4;
            const dodgeBonus = 0.6;
            this.targetMeters += dodgeBonus;
            this.spawnPopup(this.width / 2 + this.dogOffsetX, dogY - 34, 'DODGED! +0.6m', '#4ade80', 1.04);
            this.callbacks.onClimbStep(dodgeBonus, 'dodge');
          }
        }
      }
      this.pinecones = this.pinecones.filter((pc) => !pc.resolved && pc.y < this.height + 50);

      if (this.hydrantBoostTimer > 0) {
        this.hydrantBoostTimer = Math.max(0, this.hydrantBoostTimer - dt);
      }
      if (this.turboBoostTimer > 0) {
        this.turboBoostTimer = Math.max(0, this.turboBoostTimer - dt);
      }
      if ((this.hydrantBoostTimer > 0 || this.turboBoostTimer > 0) && Math.random() < dt * 14 && this.width > 0) {
        this.speedLines.push({
          x: this.width / 2 + (Math.random() - 0.5) * 160,
          y: Math.random() * this.height * 0.4,
          len: 28 + Math.random() * 36,
          speed: 480 + Math.random() * 180,
          color: Math.random() > 0.5 ? 'rgba(250, 204, 21, 0.65)' : 'rgba(56, 189, 248, 0.65)',
          life: 0,
          maxLife: 0.28,
        });
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
    }

    this.draw();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private getSkyColors(m: number): [string, string] {
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
    const shakeX = this.bonkShake > 0 ? Math.sin(this.clock * 60) * 6 * this.bonkShake : 0;
    const dogX = cx + this.dogOffsetX + shakeX;
    const dogY = height * 0.62 + this.bounceOffset;

    // 1. Dynamic Altitude Sky Gradient
    const [topColor, botColor] = this.getSkyColors(m);
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    skyGrad.addColorStop(0, topColor);
    skyGrad.addColorStop(1, botColor);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    if (m > 120 && m < 250) {
      const twilightAlpha =
        m < 185 ? (m - 120) / 65 : Math.max(0, 1 - (m - 185) / 65);
      const glow = ctx.createLinearGradient(0, height * 0.45, 0, height);
      glow.addColorStop(0, 'rgba(244, 114, 182, 0)');
      glow.addColorStop(1, `rgba(249, 115, 22, ${0.42 * twilightAlpha})`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    }

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

    const groundY = height * 0.78 + offsetPx;
    if (groundY < height + 160) {
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.moveTo(0, groundY - 22);
      ctx.quadraticCurveTo(width * 0.5, groundY - 46, width, groundY - 20);
      ctx.lineTo(width, height + 200);
      ctx.lineTo(0, height + 200);
      ctx.closePath();
      ctx.fill();

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

      ctx.fillStyle = '#15803d';
      for (let bx = 18; bx < width; bx += 72) {
        ctx.beginPath();
        ctx.arc(bx, groundY - 8, 18, 0, Math.PI * 2);
        ctx.arc(bx + 18, groundY - 5, 14, 0, Math.PI * 2);
        ctx.fill();
      }
    }

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

    // Sleek Sky-Blue Energy Ladder
    const poleW = 68;
    const boostPulse =
      this.turboBoostTimer > 0 || this.hydrantBoostTimer > 0
        ? 0.55 + 0.35 * Math.sin(this.clock * 14)
        : this.combo >= 8
          ? 0.35
          : 0.18;

    const trackGrad = ctx.createLinearGradient(cx - poleW / 2, 0, cx + poleW / 2, 0);
    trackGrad.addColorStop(0, 'rgba(15, 23, 42, 0.65)');
    trackGrad.addColorStop(0.5, this.turboBoostTimer > 0 ? `rgba(250, 204, 21, ${boostPulse})` : `rgba(14, 165, 233, ${boostPulse})`);
    trackGrad.addColorStop(1, 'rgba(15, 23, 42, 0.65)');
    ctx.fillStyle = trackGrad;
    ctx.fillRect(cx - poleW / 2, 0, poleW, height);

    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(cx - poleW / 2, 0);
    ctx.lineTo(cx - poleW / 2, height);
    ctx.moveTo(cx + poleW / 2, 0);
    ctx.lineTo(cx + poleW / 2, height);
    ctx.stroke();

    ctx.strokeStyle = this.turboBoostTimer > 0 ? '#fde047' : this.hydrantBoostTimer > 0 ? '#7dd3fc' : '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - poleW / 2 + 1.5, 0);
    ctx.lineTo(cx - poleW / 2 + 1.5, height);
    ctx.moveTo(cx + poleW / 2 - 1.5, 0);
    ctx.lineTo(cx + poleW / 2 - 1.5, height);
    ctx.stroke();

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

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(cx - poleW / 2, y, 3.2, 0, Math.PI * 2);
      ctx.arc(cx + poleW / 2, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Glowing Golden Bones perched on wooden side branches
    for (const b of this.branchBones) {
      if (b.collected) continue;
      const pos = this.getBranchBoneScreenPos(b);
      if (pos.y < -50 || pos.y > height + 50) continue;
      const railX = cx + b.side * (poleW / 2);
      // Wooden branch
      ctx.save();
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(railX, pos.y + 12);
      ctx.lineTo(pos.x + b.side * 12, pos.y + 12);
      ctx.stroke();
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.restore();

      const bob = Math.sin(this.clock * 5 + b.meterPos) * 3.5;
      this.drawBoneCollectible(ctx, pos.x, pos.y + bob);
    }

    const hydrantDistPx = (this.nextHydrantMeter - m) * this.pxPerMeter;
    const hydrantY = height * 0.62 - hydrantDistPx;
    if (hydrantY > -60 && hydrantY < height + 60) {
      const bob = Math.sin(this.clock * 3.6) * 2.5;
      this.drawFireHydrant(ctx, cx - 60, hydrantY + bob);
    }

    // Best height marker
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

    // Telegraphed & Falling Pinecones
    for (const pc of this.pinecones) {
      if (pc.resolved) continue;
      const pcX = cx + pc.side * 24;
      if (pc.telegraph > 0) {
        const flash = 0.5 + 0.5 * Math.sin(this.clock * 22);
        ctx.save();
        ctx.strokeStyle = `rgba(251, 146, 60, ${0.3 + flash * 0.45})`;
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(pcX, 34);
        ctx.lineTo(pcX, dogY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = `rgba(234, 88, 12, ${0.8 + flash * 0.2})`;
        ctx.beginPath();
        ctx.roundRect(pcX - 28, 12, 56, 22, 11);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '900 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚠️ 🌰', pcX, 23);
        ctx.restore();
      } else {
        this.drawPinecone(ctx, pcX, pc.y, pc.rot);
      }
    }

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

    const boostLevel =
      this.turboBoostTimer > 0 || this.hydrantBoostTimer > 0
        ? Math.min(1, 0.7 + 0.3 * Math.sin(this.clock * 16))
        : this.combo >= 10
          ? 0.4
          : 0;
    if (boostLevel > 0) {
      const auraR = 54 + Math.sin(this.clock * 14) * 6;
      const auraGrad = ctx.createRadialGradient(dogX, dogY + 8, 8, dogX, dogY + 8, auraR);
      auraGrad.addColorStop(
        0,
        this.turboBoostTimer > 0 || this.hydrantBoostTimer > 0
          ? 'rgba(250, 204, 21, 0.65)'
          : 'rgba(56, 189, 248, 0.45)'
      );
      auraGrad.addColorStop(
        0.55,
        this.turboBoostTimer > 0
          ? 'rgba(245, 158, 11, 0.32)'
          : 'rgba(56, 189, 248, 0.16)'
      );
      auraGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(dogX, dogY + 8, auraR, 0, Math.PI * 2);
      ctx.fill();
    }

    const dogSize = Math.max(25, Math.min(32, height * 0.065));
    drawCartoonDog(ctx, dogX, dogY, dogSize, {
      breed: this.breed,
      collarColor: this.collarColor,
      accessory: this.accessory,
      pose: 'climb',
      animPhase: this.clock,
      stepDir: this.climbStepDir,
      boostLevel,
    });

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

    // Turbo badge (top-left of canvas, strictly below HUD bar)
    if (this.turboBoostTimer > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(250, 204, 21, 0.94)';
      ctx.beginPath();
      ctx.roundRect(14, 12, 114, 26, 13);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`⚡ TURBO ${this.turboBoostTimer.toFixed(1)}s`, 71, 25);
      ctx.restore();
    }

    // Combo badge (top-right of canvas, strictly below HUD bar — zero overlap!)
    if (this.combo >= 4) {
      ctx.save();
      const pulse = 1 + Math.sin(this.clock * 12) * 0.04;
      ctx.translate(width - 14, 25);
      ctx.scale(pulse, pulse);
      ctx.fillStyle =
        this.combo >= 10 ? 'rgba(250, 204, 21, 0.94)' : 'rgba(56, 189, 248, 0.9)';
      ctx.beginPath();
      ctx.roundRect(-94, -13, 94, 26, 13);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        this.combo >= 10 ? `TURBO x${this.combo}` : `COMBO x${this.combo}`,
        -47,
        0
      );
      ctx.restore();
    }

    // Subtle control hint at start
    if (this.visualMeters < 3) {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.beginPath();
      ctx.roundRect(cx - 125, height - 42, 250, 28, 14);
      ctx.fill();
      ctx.fillStyle = '#e0f2fe';
      ctx.font = '700 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Tap Left/Right to climb & dodge • Grab Bones!', cx, height - 28);
      ctx.restore();
    }

    for (const pop of this.popups) {
      const alpha = Math.max(0, 1 - pop.life / pop.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(pop.x, pop.y);
      ctx.scale(pop.scale, pop.scale);
      ctx.font = '900 17px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeText(pop.text, 0, 0);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, 0, 0);
      ctx.restore();
    }
  }

  private drawPinecone(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = '#78350f';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Pinecone scales
    ctx.fillStyle = '#b45309';
    for (const [sx, sy] of [
      [-5, -6], [5, -6], [0, -1], [-6, 4], [6, 4], [0, 8],
    ]) {
      ctx.beginPath();
      ctx.ellipse(sx, sy, 4.2, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Top stem
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(0, -21);
    ctx.stroke();
    ctx.restore();
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

    const haloR = 25 + Math.sin(this.clock * 6) * 3;
    const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, haloR);
    halo.addColorStop(0, 'rgba(250, 204, 21, 0.72)');
    halo.addColorStop(0.6, 'rgba(251, 191, 36, 0.28)');
    halo.addColorStop(1, 'rgba(250, 204, 21, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, haloR, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 3; i++) {
      const ang = this.clock * 3.2 + (i * Math.PI * 2) / 3;
      const sx = Math.cos(ang) * 21;
      const sy = Math.sin(ang) * 15;
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

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

    const haloR = 26 + Math.sin(this.clock * 5) * 2.5;
    const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, haloR);
    halo.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
    halo.addColorStop(0.55, 'rgba(239, 68, 68, 0.25)');
    halo.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, haloR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#92400e';
    ctx.fillRect(-15, 13, 38, 5);
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-15, 13, 38, 5);

    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 2;

    const bodyGrad = ctx.createLinearGradient(-9, 0, 9, 0);
    bodyGrad.addColorStop(0, '#991b1b');
    bodyGrad.addColorStop(0.32, '#ef4444');
    bodyGrad.addColorStop(0.65, '#f87171');
    bodyGrad.addColorStop(1, '#b91c1c');

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-12, 8, 24, 5.5, 2.5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-8.5, -9, 17, 18, 2.5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.beginPath();
    ctx.roundRect(-5, -7, 3.2, 14, 1.5);
    ctx.fill();

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

    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, -9, 9, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = chromeGrad;
    ctx.beginPath();
    ctx.roundRect(-3.2, -21, 6.4, 4.5, 1.2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}
