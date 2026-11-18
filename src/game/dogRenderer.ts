import {
  CollarColorId,
  DogAccessoryId,
  DogBreed,
  getCollarHex,
} from '../data/dogs';

function shadeHex(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const num = parseInt(clean, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (num & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function drawDogPawPads(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  angle = 0
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = '#fda4af';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.14, r * 0.34, r * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [bx, by] of [
    [-0.3, -0.24],
    [0, -0.34],
    [0.3, -0.24],
  ]) {
    ctx.beginPath();
    ctx.ellipse(r * bx, r * by, r * 0.13, r * 0.15, bx * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawCartoonDog(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  opts: {
    breed: DogBreed;
    collarColor: CollarColorId;
    accessory: DogAccessoryId;
    pose: 'portrait' | 'climb' | 'hang';
    animPhase?: number;
    stepDir?: number;
    boostLevel?: number;
  }
): void {
  const {
    breed,
    collarColor,
    accessory,
    pose,
    animPhase = 0,
    stepDir = 1,
    boostLevel = 0,
  } = opts;
  const collarHex = getCollarHex(collarColor);
  const s = size;
  const lineW = Math.max(2, s * 0.07);
  const wag = Math.sin(animPhase * (12 + boostLevel * 8)) * (0.35 + boostLevel * 0.25);

  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Tail with shaded fur gradient & lighter fluffy tip
  ctx.save();
  ctx.translate(-s * 0.45, s * 0.45);
  ctx.rotate(-0.6 + wag);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = s * 0.29;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-s * 0.4, -s * 0.35, -s * 0.25, -s * 0.72);
  ctx.stroke();

  const tailGrad = ctx.createLinearGradient(0, 0, -s * 0.25, -s * 0.72);
  tailGrad.addColorStop(0, shadeHex(breed.fur, -14));
  tailGrad.addColorStop(0.68, breed.fur);
  tailGrad.addColorStop(1, breed.belly);
  ctx.strokeStyle = tailGrad;
  ctx.lineWidth = s * 0.21;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = Math.max(1, s * 0.045);
  ctx.beginPath();
  ctx.moveTo(-s * 0.04, -s * 0.05);
  ctx.quadraticCurveTo(-s * 0.33, -s * 0.34, -s * 0.22, -s * 0.66);
  ctx.stroke();
  ctx.restore();

  // Body with radial fur shading
  const bodyGrad = ctx.createRadialGradient(-s * 0.16, s * 0.28, s * 0.08, 0, s * 0.52, s * 0.76);
  bodyGrad.addColorStop(0, shadeHex(breed.fur, 24));
  bodyGrad.addColorStop(0.62, breed.fur);
  bodyGrad.addColorStop(1, shadeHex(breed.fur, -24));
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.5, s * 0.56, s * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = lineW;
  ctx.strokeStyle = '#0f172a';
  ctx.stroke();

  // Belly patch & chest fluff
  const bellyGrad = ctx.createRadialGradient(0, s * 0.42, s * 0.05, 0, s * 0.56, s * 0.46);
  bellyGrad.addColorStop(0, shadeHex(breed.belly, 12));
  bellyGrad.addColorStop(1, breed.belly);
  ctx.fillStyle = bellyGrad;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.56, s * 0.35, s * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = breed.belly;
  ctx.beginPath();
  ctx.moveTo(-s * 0.14, s * 0.18);
  ctx.lineTo(-s * 0.06, s * 0.31);
  ctx.lineTo(0, s * 0.21);
  ctx.lineTo(s * 0.06, s * 0.31);
  ctx.lineTo(s * 0.14, s * 0.18);
  ctx.closePath();
  ctx.fill();

  // Spots for Dalmatian
  if (breed.spotted) {
    ctx.fillStyle = '#1e293b';
    for (const [sx, sy, sr] of [
      [-0.25, 0.35, 0.1],
      [0.24, 0.62, 0.11],
      [-0.18, 0.78, 0.08],
      [0.32, 0.3, 0.075],
    ]) {
      ctx.beginPath();
      ctx.arc(s * sx, s * sy, s * sr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Arms / Paws with shading & paw pads
  const leftArmY = pose === 'hang' ? -s * 0.92 : pose === 'climb' ? s * (0.04 - stepDir * 0.28) : s * 0.35;
  const rightArmY = pose === 'hang' ? -s * 0.92 : pose === 'climb' ? s * (0.04 + stepDir * 0.28) : s * 0.35;
  for (const [px, py] of [
    [-s * 0.58, leftArmY],
    [s * 0.58, rightArmY],
  ]) {
    const pawGrad = ctx.createRadialGradient(px - s * 0.05, py - s * 0.06, s * 0.02, px, py, s * 0.21);
    pawGrad.addColorStop(0, shadeHex(breed.fur, 20));
    pawGrad.addColorStop(1, shadeHex(breed.fur, -20));
    ctx.fillStyle = pawGrad;
    ctx.beginPath();
    ctx.arc(px, py, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = lineW;
    ctx.stroke();

    drawDogPawPads(ctx, px, py + s * 0.02, s * 0.16, 0);
  }

  // Feet with paw pads
  const leftLegY = pose === 'climb' ? s * (1.02 + stepDir * 0.18) : s * 1.04;
  const rightLegY = pose === 'climb' ? s * (1.02 - stepDir * 0.18) : s * 1.04;
  for (const [lx, ly] of [
    [-s * 0.28, leftLegY],
    [s * 0.28, rightLegY],
  ]) {
    const footGrad = ctx.createRadialGradient(lx - s * 0.04, ly - s * 0.04, s * 0.02, lx, ly, s * 0.22);
    footGrad.addColorStop(0, shadeHex(breed.fur, 18));
    footGrad.addColorStop(1, shadeHex(breed.fur, -20));
    ctx.fillStyle = footGrad;
    ctx.beginPath();
    ctx.ellipse(lx, ly, s * 0.22, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = lineW;
    ctx.stroke();

    drawDogPawPads(ctx, lx, ly + s * 0.01, s * 0.14, 0);
  }

  // Studded / Tagged Collar or Stitched Bandana
  if (accessory === 'bandana') {
    const bandGrad = ctx.createLinearGradient(0, s * 0.06, 0, s * 0.46);
    bandGrad.addColorStop(0, shadeHex(collarHex, 18));
    bandGrad.addColorStop(1, shadeHex(collarHex, -24));
    ctx.fillStyle = bandGrad;
    ctx.beginPath();
    ctx.moveTo(-s * 0.44, s * 0.06);
    ctx.lineTo(s * 0.44, s * 0.06);
    ctx.lineTo(0, s * 0.48);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = lineW;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = Math.max(1, s * 0.024);
    ctx.setLineDash([s * 0.05, s * 0.04]);
    ctx.beginPath();
    ctx.moveTo(-s * 0.34, s * 0.12);
    ctx.lineTo(0, s * 0.41);
    ctx.lineTo(s * 0.34, s * 0.12);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    const colGrad = ctx.createLinearGradient(0, s * 0.02, 0, s * 0.17);
    colGrad.addColorStop(0, shadeHex(collarHex, 24));
    colGrad.addColorStop(1, shadeHex(collarHex, -26));
    ctx.fillStyle = colGrad;
    ctx.beginPath();
    ctx.roundRect(-s * 0.38, s * 0.02, s * 0.76, s * 0.15, s * 0.07);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = lineW;
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    for (const sx of [-0.26, -0.13, 0.13, 0.26]) {
      ctx.beginPath();
      ctx.arc(s * sx, s * 0.095, s * 0.024, 0, Math.PI * 2);
      ctx.fill();
    }

    const tagGrad = ctx.createRadialGradient(-s * 0.03, s * 0.17, s * 0.01, 0, s * 0.21, s * 0.12);
    tagGrad.addColorStop(0, '#fef9c3');
    tagGrad.addColorStop(0.55, '#facc15');
    tagGrad.addColorStop(1, '#b45309');
    ctx.fillStyle = tagGrad;
    ctx.beginPath();
    ctx.arc(0, s * 0.21, s * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(-s * 0.035, s * 0.175, s * 0.026, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle head tilt with climb step
  ctx.save();
  if (pose === 'climb') {
    ctx.rotate(stepDir * 0.06);
  }

  // Ears with shaded inner ear & fold depth
  if (breed.earStyle === 'pointy') {
    for (const side of [-1, 1]) {
      const earGrad = ctx.createLinearGradient(side * s * 0.3, -s * 1.05, side * s * 0.68, -s * 0.4);
      earGrad.addColorStop(0, shadeHex(breed.ear, 20));
      earGrad.addColorStop(1, shadeHex(breed.ear, -18));
      ctx.fillStyle = earGrad;
      ctx.beginPath();
      ctx.moveTo(side * s * 0.25, -s * 0.62);
      ctx.lineTo(side * s * 0.68, -s * 1.08);
      ctx.lineTo(side * s * 0.66, -s * 0.38);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = lineW;
      ctx.stroke();

      ctx.fillStyle = breed.id === 1 ? '#e2e8f0' : '#fda4af';
      ctx.beginPath();
      ctx.moveTo(side * s * 0.34, -s * 0.62);
      ctx.lineTo(side * s * 0.61, -s * 0.94);
      ctx.lineTo(side * s * 0.59, -s * 0.44);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * s * 0.56, -s * 0.36);
      ctx.rotate(side * 0.28 + (pose === 'climb' ? stepDir * 0.1 : 0));
      const earGrad = ctx.createRadialGradient(-s * 0.05, s * 0.06, s * 0.04, 0, s * 0.18, s * 0.38);
      earGrad.addColorStop(0, shadeHex(breed.ear, 24));
      earGrad.addColorStop(0.65, breed.ear);
      earGrad.addColorStop(1, shadeHex(breed.ear, -22));
      ctx.fillStyle = earGrad;
      ctx.beginPath();
      ctx.ellipse(0, s * 0.18, s * 0.21, s * 0.37, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = lineW;
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
      ctx.beginPath();
      ctx.ellipse(-side * s * 0.05, s * 0.22, s * 0.09, s * 0.23, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.beginPath();
      ctx.ellipse(side * s * 0.05, s * 0.06, s * 0.05, s * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Head with 3D fur gradient
  const headGrad = ctx.createRadialGradient(-s * 0.16, -s * 0.54, s * 0.08, 0, -s * 0.36, s * 0.62);
  headGrad.addColorStop(0, shadeHex(breed.fur, 26));
  headGrad.addColorStop(0.62, breed.fur);
  headGrad.addColorStop(1, shadeHex(breed.fur, -24));
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.arc(0, -s * 0.36, s * 0.54, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = lineW;
  ctx.stroke();

  // Breed face markings
  if (breed.id === 1 || breed.id === 2) {
    ctx.fillStyle = breed.snout;
    ctx.beginPath();
    ctx.ellipse(-s * 0.24, -s * 0.22, s * 0.24, s * 0.18, -0.35, 0, Math.PI * 2);
    ctx.ellipse(s * 0.24, -s * 0.22, s * 0.24, s * 0.18, 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  if (breed.id === 1 || breed.id === 5) {
    ctx.fillStyle = breed.belly;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * s * 0.2, -s * 0.58, s * 0.09, s * 0.045, side * -0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Head highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.15, -s * 0.64, s * 0.22, s * 0.1, -0.35, 0, Math.PI * 2);
  ctx.fill();

  // Dalmatian head spots
  if (breed.spotted) {
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(-s * 0.22, -s * 0.47, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.3, -s * 0.62, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  // Snout with radial highlight
  const snoutGrad = ctx.createRadialGradient(-s * 0.05, -s * 0.28, s * 0.03, 0, -s * 0.22, s * 0.3);
  snoutGrad.addColorStop(0, shadeHex(breed.snout, 16));
  snoutGrad.addColorStop(1, shadeHex(breed.snout, -12));
  ctx.fillStyle = snoutGrad;
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.22, s * 0.28, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tongue
  ctx.fillStyle = '#fb7185';
  ctx.strokeStyle = '#9f1239';
  ctx.lineWidth = Math.max(1, lineW * 0.45);
  ctx.beginPath();
  ctx.ellipse(s * 0.05, -s * 0.05, s * 0.085, s * (0.115 + boostLevel * 0.04), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(s * 0.05, -s * 0.12);
  ctx.lineTo(s * 0.05, -s * 0.01);
  ctx.stroke();

  // Cute muzzle smile curve
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(1.2, lineW * 0.6);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.22);
  ctx.quadraticCurveTo(-s * 0.08, -s * 0.13, -s * 0.15, -s * 0.17);
  ctx.moveTo(0, -s * 0.22);
  ctx.quadraticCurveTo(s * 0.08, -s * 0.13, s * 0.15, -s * 0.17);
  ctx.stroke();

  // Glossy wet nose highlight
  const noseGrad = ctx.createRadialGradient(-s * 0.04, -s * 0.31, s * 0.01, 0, -s * 0.28, s * 0.13);
  noseGrad.addColorStop(0, '#334155');
  noseGrad.addColorStop(0.55, '#0f172a');
  noseGrad.addColorStop(1, '#020617');
  ctx.fillStyle = noseGrad;
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.28, s * 0.125, s * 0.085, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.04, -s * 0.305, s * 0.042, s * 0.02, -0.35, 0, Math.PI * 2);
  ctx.fill();

  // Layered glossy eyes
  const eyeR = s * 0.095;
  for (const side of [-1, 1]) {
    const ex = side * s * 0.2;
    const ey = -s * 0.45;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, ey, eyeR * 1.15, 0, Math.PI * 2);
    ctx.fill();

    const eyeGrad = ctx.createRadialGradient(ex - eyeR * 0.2, ey - eyeR * 0.2, eyeR * 0.1, ex, ey, eyeR);
    eyeGrad.addColorStop(0, '#451a03');
    eyeGrad.addColorStop(0.65, '#0f172a');
    eyeGrad.addColorStop(1, '#020617');
    ctx.fillStyle = eyeGrad;
    ctx.beginPath();
    ctx.arc(ex, ey, eyeR * 0.92, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex + eyeR * 0.26, ey - eyeR * 0.28, eyeR * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex - eyeR * 0.24, ey + eyeR * 0.26, eyeR * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }

  // Accessories
  if (accessory === 'bril' || accessory === 'vlieger') {
    const lensColor = accessory === 'vlieger' ? '#0284c7' : '#0f172a';
    ctx.strokeStyle = accessory === 'vlieger' ? '#e2e8f0' : '#facc15';
    ctx.lineWidth = Math.max(2, s * 0.05);
    for (const side of [-1, 1]) {
      const lx = side * s * 0.2 - s * 0.14;
      const ly = -s * 0.55;
      const lw = s * 0.28;
      const lh = s * 0.19;
      const lensGrad = ctx.createLinearGradient(lx, ly, lx + lw, ly + lh);
      lensGrad.addColorStop(0, shadeHex(lensColor, 36));
      lensGrad.addColorStop(1, shadeHex(lensColor, -28));
      ctx.fillStyle = lensGrad;
      ctx.beginPath();
      ctx.roundRect(lx, ly, lw, lh, s * 0.06);
      ctx.fill();
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(lx, ly, lw, lh, s * 0.06);
      ctx.clip();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
      ctx.beginPath();
      ctx.moveTo(lx + lw * 0.18, ly);
      ctx.lineTo(lx + lw * 0.42, ly);
      ctx.lineTo(lx + lw * 0.14, ly + lh);
      ctx.lineTo(lx - lw * 0.06, ly + lh);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(-s * 0.06, -s * 0.46);
    ctx.lineTo(s * 0.06, -s * 0.46);
    ctx.stroke();
  } else if (accessory === 'kroon') {
    const crownGrad = ctx.createLinearGradient(0, -s * 1.18, 0, -s * 0.84);
    crownGrad.addColorStop(0, '#fef08a');
    crownGrad.addColorStop(0.55, '#facc15');
    crownGrad.addColorStop(1, '#d97706');
    ctx.fillStyle = crownGrad;
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = Math.max(1.5, s * 0.045);
    ctx.beginPath();
    ctx.moveTo(-s * 0.24, -s * 0.84);
    ctx.lineTo(-s * 0.28, -s * 1.12);
    ctx.lineTo(-s * 0.08, -s * 0.96);
    ctx.lineTo(0, -s * 1.18);
    ctx.lineTo(s * 0.08, -s * 0.96);
    ctx.lineTo(s * 0.28, -s * 1.12);
    ctx.lineTo(s * 0.24, -s * 0.84);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    for (const [jx, jy, jc] of [
      [-0.14, -0.9, '#38bdf8'],
      [0, -0.94, '#ef4444'],
      [0.14, -0.9, '#10b981'],
    ] as const) {
      ctx.fillStyle = jc;
      ctx.beginPath();
      ctx.arc(s * jx, s * jy, s * 0.032, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (accessory === 'botje') {
    ctx.save();
    ctx.translate(s * 0.18, -s * 0.13);
    ctx.rotate(0.25);
    ctx.fillStyle = '#fef3c7';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = Math.max(1.5, s * 0.04);
    ctx.beginPath();
    ctx.roundRect(-s * 0.24, -s * 0.05, s * 0.48, s * 0.1, s * 0.04);
    ctx.fill();
    ctx.stroke();
    for (const [bx, by] of [
      [-0.24, -0.05],
      [-0.24, 0.05],
      [0.24, -0.05],
      [0.24, 0.05],
    ]) {
      ctx.beginPath();
      ctx.arc(s * bx, s * by, s * 0.065, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();
  ctx.restore();
}
