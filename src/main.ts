import './style.css';
import {
  GlobalDogClimberEntry,
  fetchGlobalDogClimberHighscores,
  submitGlobalDogClimberScore,
} from './api/highscores';
import {
  COLLAR_COLORS,
  DOG_ACCESSORIES,
  DOG_BREEDS,
  getDogBreed,
} from './data/dogs';
import { drawCartoonDog } from './game/dogRenderer';
import { DogClimberStage } from './game/DogClimberStage';
import { soundFX } from './game/SoundFX';
import {
  DogClimberState,
  loadDogClimberState,
  resolveDeviceId,
  saveDogClimberState,
  startNewDogClimberRun,
  updateDogClimberHighscore,
} from './storage/state';

type ScreenName = 'home' | 'options' | 'game' | 'highscores';
type HsMode = 'global' | 'local';

let state: DogClimberState;
let hsMode: HsMode = 'global';
let optionsFromPlay = false;
let stage: DogClimberStage | null = null;
let homeAnimId: number | null = null;
let syncTimeout: number | null = null;
let hsPollInterval: number | null = null;
let hsHeadingTapCount = 0;
let hsHeadingTapTimer: number | null = null;

function renderDogThumb(
  canvas: HTMLCanvasElement,
  breedId: number,
  size: number,
  collarColor = state.collarColor,
  accessory = state.accessory
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  drawCartoonDog(ctx, size / 2, size * 0.44, size * 0.24, {
    breed: getDogBreed(breedId),
    collarColor,
    accessory,
    pose: 'portrait',
  });
}

function buildApp(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <section id="screen-home" class="screen home-screen">
      <div class="home-hero">
        <canvas id="home-dog-canvas" class="dog-preview-canvas"></canvas>
        <h1 class="game-title">Dog Climber</h1>
        <p class="game-subtitle">Tap fast to climb higher!</p>
        <div id="home-best-pill" class="best-pill hidden"></div>
      </div>
      <div class="home-actions">
        <button id="btn-home-play" class="btn btn-primary">Play</button>
        <button id="btn-home-options" class="btn btn-secondary">Dog Style</button>
        <button id="btn-home-highscores" class="btn btn-secondary">Leaderboard</button>
      </div>
    </section>

    <section id="screen-options" class="screen hidden">
      <div class="top-nav">
        <button id="btn-options-back" class="btn btn-small">← Back</button>
        <h2 class="screen-heading">Dog Style</h2>
        <span style="width:60px"></span>
      </div>
      <div class="options-scroll">
        <div>
          <p class="section-label">Player Name</p>
          <input id="player-name-input" class="name-input" type="text" maxlength="20" placeholder="Player" />
        </div>
        <div>
          <p class="section-label">Dog Breed</p>
          <div id="dog-breed-grid" class="breed-grid"></div>
        </div>
        <div>
          <p class="section-label">Collar Color</p>
          <div id="collar-chips" class="chip-row"></div>
        </div>
        <div>
          <p class="section-label">Accessory</p>
          <div id="acc-chips" class="chip-row"></div>
        </div>
        <button id="btn-options-start" class="btn btn-primary">Play Now</button>
      </div>
    </section>

    <section id="screen-game" class="screen game-screen hidden">
      <div class="game-top-bar">
        <button id="btn-game-menu" class="btn btn-small">← Menu</button>
        <div class="game-top-actions">
          <button id="btn-game-new" class="btn btn-small">New</button>
          <button id="btn-game-options" class="btn btn-small">Dog</button>
          <button id="btn-game-sound" class="btn btn-small" aria-label="Toggle sound">🔊</button>
        </div>
      </div>
      <div class="meters-hud">
        <div id="meters-value" class="meters-value">0.0 m</div>
        <div id="meters-best" class="meters-sub">Best: 0.0 m</div>
      </div>
      <canvas id="game-canvas" class="game-canvas"></canvas>
    </section>

    <section id="screen-highscores" class="screen hidden">
      <div class="top-nav">
        <button id="btn-hs-back" class="btn btn-small">← Back</button>
        <h2 id="hs-heading" class="screen-heading">Leaderboard</h2>
        <button id="btn-hs-refresh" class="btn btn-small">Refresh</button>
      </div>
      <div class="hs-tabs">
        <button id="tab-hs-global" class="hs-tab active">🌐 Global</button>
        <button id="tab-hs-local" class="hs-tab">📱 Local</button>
      </div>
      <div class="hs-status-bar">
        <span id="hs-status-text">Connecting...</span>
      </div>
      <div id="server-box" class="server-box hidden">
        <p class="section-label" style="margin:0;">Developer Endpoint URL</p>
        <div style="display:flex;gap:8px;">
          <input id="server-url-input" class="name-input" type="url" placeholder="https://example.com" />
          <button id="btn-save-server" class="btn btn-small">Save</button>
        </div>
      </div>
      <div id="hs-list" class="hs-list"></div>
    </section>
  `;
}

function showScreen(name: ScreenName): void {
  document.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
  document.getElementById(`screen-${name}`)?.classList.remove('hidden');

  if (name === 'game') {
    startStage();
  } else {
    stopStage();
  }

  if (name === 'home') startHomePreview();
  else stopHomePreview();

  if (hsPollInterval !== null) {
    clearInterval(hsPollInterval);
    hsPollInterval = null;
  }
  if (name === 'highscores') {
    document.getElementById('server-box')?.classList.add('hidden');
    refreshHighscoresView();
    hsPollInterval = window.setInterval(() => refreshHighscoresView(), 12000);
  }
}

function startHomePreview(): void {
  stopHomePreview();
  const canvas = document.getElementById('home-dog-canvas') as HTMLCanvasElement;
  const pill = document.getElementById('home-best-pill')!;
  if (state.bestMeters > 0) {
    pill.textContent = `Best Climb: ${state.bestMeters.toFixed(1)} m`;
    pill.classList.remove('hidden');
  } else {
    pill.classList.add('hidden');
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = 150 * dpr;
  canvas.height = 150 * dpr;

  let phase = 0;
  let lastTime = performance.now();
  const draw = (now: number) => {
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    phase += dt * 1.8;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, 150, 150);
      drawCartoonDog(ctx, 75, 68 + Math.sin(phase * 2) * 4, 34, {
        breed: getDogBreed(state.breedId),
        collarColor: state.collarColor,
        accessory: state.accessory,
        pose: 'portrait',
        animPhase: phase,
      });
    }
    homeAnimId = requestAnimationFrame(draw);
  };
  homeAnimId = requestAnimationFrame(draw);
}

function stopHomePreview(): void {
  if (homeAnimId !== null) {
    cancelAnimationFrame(homeAnimId);
    homeAnimId = null;
  }
}

function renderOptions(): void {
  const nameInput = document.getElementById('player-name-input') as HTMLInputElement;
  nameInput.value = state.playerName;

  const grid = document.getElementById('dog-breed-grid')!;
  grid.innerHTML = '';
  for (const b of DOG_BREEDS) {
    const btn = document.createElement('button');
    btn.className = `breed-card ${state.breedId === b.id ? 'selected' : ''}`;
    const cvs = document.createElement('canvas');
    cvs.width = 48;
    cvs.height = 48;
    renderDogThumb(cvs, b.id, 48);
    const label = document.createElement('span');
    label.style.fontWeight = '700';
    label.style.fontSize = '0.9rem';
    label.textContent = b.name;
    btn.appendChild(cvs);
    btn.appendChild(label);
    btn.onclick = () => {
      state.breedId = b.id;
      saveDogClimberState(state);
      renderOptions();
    };
    grid.appendChild(btn);
  }

  const collars = document.getElementById('collar-chips')!;
  collars.innerHTML = '';
  for (const c of COLLAR_COLORS) {
    const chip = document.createElement('button');
    chip.className = `chip ${state.collarColor === c.id ? 'selected' : ''}`;
    chip.textContent = c.label;
    chip.onclick = () => {
      state.collarColor = c.id;
      saveDogClimberState(state);
      renderOptions();
    };
    collars.appendChild(chip);
  }

  const acc = document.getElementById('acc-chips')!;
  acc.innerHTML = '';
  for (const a of DOG_ACCESSORIES) {
    const chip = document.createElement('button');
    chip.className = `chip ${state.accessory === a.id ? 'selected' : ''}`;
    chip.textContent = a.label;
    chip.onclick = () => {
      state.accessory = a.id;
      saveDogClimberState(state);
      renderOptions();
    };
    acc.appendChild(chip);
  }
}

function updateGameHud(): void {
  document.getElementById('meters-value')!.textContent = `${state.currentMeters.toFixed(1)} m`;
  document.getElementById('meters-best')!.textContent = `Best: ${state.bestMeters.toFixed(1)} m`;
  document.getElementById('btn-game-sound')!.textContent = state.soundEnabled ? '🔊' : '🔇';
}

function scheduleSync(): void {
  if (syncTimeout !== null) clearTimeout(syncTimeout);
  syncTimeout = window.setTimeout(() => {
    if (state.apiBaseUrl) {
      submitGlobalDogClimberScore(state.apiBaseUrl, {
        deviceId: state.deviceId,
        playerName: state.playerName.trim() || 'Player',
        meters: state.bestMeters,
        breedId: state.breedId,
        collarColor: state.collarColor,
        accessory: state.accessory,
      });
    }
  }, 1500);
}

function startStage(): void {
  updateGameHud();
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!stage) {
    stage = new DogClimberStage(
      canvas,
      {
        breed: getDogBreed(state.breedId),
        collarColor: state.collarColor,
        accessory: state.accessory,
        initialMeters: state.currentMeters,
        bestMeters: state.bestMeters,
      },
      {
        onClimbStep: (delta, bonusType) => {
          state.currentMeters += delta;
          if (bonusType === 'hydrant') soundFX.playBoost();
          else if (bonusType === 'bone') soundFX.playBark();
          else soundFX.playClimb(state.currentMeters % 12);
          updateDogClimberHighscore(state);
          updateGameHud();
          scheduleSync();
        },
      }
    );
  } else {
    stage.setAppearance({
      breed: getDogBreed(state.breedId),
      collarColor: state.collarColor,
      accessory: state.accessory,
    });
    stage.setMeters(state.currentMeters, state.bestMeters);
  }
  stage.start();
}

function stopStage(): void {
  stage?.stop();
}

function appendDogHighscoreRow(
  list: HTMLElement,
  opts: {
    rankText: string;
    playerName: string;
    breedId: number;
    collarColor: DogClimberState['collarColor'];
    accessory: DogClimberState['accessory'];
    meters: number;
    isMe?: boolean;
  }
): void {
  const row = document.createElement('div');
  row.className = `hs-row${opts.isMe ? ' me' : ''}`;

  const left = document.createElement('div');
  left.className = 'hs-left';

  const rank = document.createElement('span');
  rank.className = 'hs-rank';
  rank.textContent = opts.rankText;

  const icon = document.createElement('canvas');
  icon.className = 'hs-icon';
  renderDogThumb(icon, opts.breedId, 38, opts.collarColor, opts.accessory);

  const info = document.createElement('div');
  info.style.minWidth = '0';
  const name = document.createElement('div');
  name.className = 'hs-name';
  name.textContent = opts.isMe ? `${opts.playerName} (You)` : opts.playerName;
  const meta = document.createElement('div');
  meta.className = 'hs-meta';
  meta.textContent = getDogBreed(opts.breedId).name;
  info.appendChild(name);
  info.appendChild(meta);

  left.appendChild(rank);
  left.appendChild(icon);
  left.appendChild(info);

  const score = document.createElement('div');
  score.className = 'hs-score';
  score.textContent = `${opts.meters.toFixed(1)} m`;

  row.appendChild(left);
  row.appendChild(score);
  list.appendChild(row);
}

function renderLocalHighscoresList(list: HTMLElement): void {
  if (state.highscores.length === 0) {
    list.innerHTML = `<p style="text-align:center;color:var(--muted);margin-top:30px;">No climbs yet! Tap Play to start climbing.</p>`;
    return;
  }
  list.innerHTML = '';
  state.highscores.forEach((h, i) => {
    appendDogHighscoreRow(list, {
      rankText: `#${i + 1}`,
      playerName: h.playerName,
      breedId: h.breedId,
      collarColor: h.collarColor,
      accessory: h.accessory,
      meters: h.meters,
    });
  });
}

async function refreshHighscoresView(): Promise<void> {
  const list = document.getElementById('hs-list')!;
  const statusEl = document.getElementById('hs-status-text')!;
  const serverInput = document.getElementById('server-url-input') as HTMLInputElement;
  serverInput.value = state.apiBaseUrl;

  document.getElementById('tab-hs-global')?.classList.toggle('active', hsMode === 'global');
  document.getElementById('tab-hs-local')?.classList.toggle('active', hsMode === 'local');

  if (hsMode === 'local') {
    statusEl.textContent = `Local History (${state.highscores.length} climbs)`;
    renderLocalHighscoresList(list);
    return;
  }

  if (!state.apiBaseUrl) {
    statusEl.textContent = 'Offline Mode — Local Records';
    renderLocalHighscoresList(list);
    return;
  }

  statusEl.textContent = 'Connecting...';
  try {
    const res = await fetchGlobalDogClimberHighscores(state.apiBaseUrl, state.deviceId, 50);
    const entries: GlobalDogClimberEntry[] = res.entries || [];
    statusEl.textContent = `Live • ${entries.length} players worldwide`;
    if (entries.length === 0) {
      list.innerHTML = `<p style="text-align:center;color:var(--muted);margin-top:30px;">No global climbs yet! You can be #1.</p>`;
      return;
    }
    list.innerHTML = '';
    entries.forEach((e) => {
      appendDogHighscoreRow(list, {
        rankText: `#${e.rank}`,
        playerName: e.playerName,
        breedId: e.breedId,
        collarColor: e.collarColor,
        accessory: e.accessory,
        meters: e.meters,
        isMe: e.deviceId === state.deviceId,
      });
    });
  } catch {
    statusEl.textContent = 'Offline Mode — Local Records';
    renderLocalHighscoresList(list);
  }
}

async function init(): Promise<void> {
  const deviceId = await resolveDeviceId();
  state = loadDogClimberState(deviceId);
  soundFX.enabled = state.soundEnabled;
  buildApp();
  renderOptions();

  document.getElementById('btn-home-play')!.onclick = () => showScreen('game');
  document.getElementById('btn-home-options')!.onclick = () => {
    optionsFromPlay = false;
    renderOptions();
    showScreen('options');
  };
  document.getElementById('btn-home-highscores')!.onclick = () => showScreen('highscores');

  document.getElementById('btn-options-back')!.onclick = () => showScreen(optionsFromPlay ? 'game' : 'home');
  document.getElementById('btn-options-start')!.onclick = () => showScreen('game');
  document.getElementById('player-name-input')!.addEventListener('input', (e) => {
    state.playerName = (e.target as HTMLInputElement).value.slice(0, 20);
    saveDogClimberState(state);
  });

  document.getElementById('btn-game-menu')!.onclick = () => showScreen('home');
  document.getElementById('btn-game-options')!.onclick = () => {
    optionsFromPlay = true;
    renderOptions();
    showScreen('options');
  };
  document.getElementById('btn-game-new')!.onclick = () => {
    startNewDogClimberRun(state);
    stage?.setMeters(0, state.bestMeters);
    updateGameHud();
  };
  document.getElementById('btn-game-sound')!.onclick = () => {
    state.soundEnabled = !state.soundEnabled;
    soundFX.enabled = state.soundEnabled;
    saveDogClimberState(state);
    updateGameHud();
  };

  document.getElementById('btn-hs-back')!.onclick = () => showScreen('home');
  document.getElementById('btn-hs-refresh')!.onclick = () => refreshHighscoresView();
  document.getElementById('tab-hs-global')!.onclick = () => {
    hsMode = 'global';
    refreshHighscoresView();
  };
  document.getElementById('tab-hs-local')!.onclick = () => {
    hsMode = 'local';
    refreshHighscoresView();
  };
  document.getElementById('hs-heading')!.onclick = () => {
    hsHeadingTapCount += 1;
    if (hsHeadingTapTimer !== null) {
      window.clearTimeout(hsHeadingTapTimer);
    }
    if (hsHeadingTapCount >= 5) {
      hsHeadingTapCount = 0;
      document.getElementById('server-box')!.classList.toggle('hidden');
    } else {
      hsHeadingTapTimer = window.setTimeout(() => {
        hsHeadingTapCount = 0;
      }, 1500);
    }
  };
  document.getElementById('btn-save-server')!.onclick = () => {
    const val = (document.getElementById('server-url-input') as HTMLInputElement).value.trim().replace(/\/+$/, '');
    state.apiBaseUrl = val;
    saveDogClimberState(state);
    document.getElementById('server-box')!.classList.add('hidden');
    refreshHighscoresView();
  };

  showScreen('home');
}

init();
