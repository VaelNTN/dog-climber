import { Device } from '@capacitor/device';
import { CollarColorId, DogAccessoryId } from '../data/dogs';

const SAVE_KEY = 'dog_climber_save_v1';
const DEVICE_KEY = 'dog_climber_device_id_v1';

export interface DogClimberHighscore {
  id: string;
  playerName: string;
  meters: number;
  breedId: number;
  collarColor: CollarColorId;
  accessory: DogAccessoryId;
  createdAt: string;
}

export interface DogClimberState {
  deviceId: string;
  apiBaseUrl: string;
  breedId: number;
  collarColor: CollarColorId;
  accessory: DogAccessoryId;
  playerName: string;
  soundEnabled: boolean;
  currentMeters: number;
  bestMeters: number;
  activeRunId: string;
  highscores: DogClimberHighscore[];
}

function makeRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function generateFallbackDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `dc-${crypto.randomUUID()}`;
  }
  return `dc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function resolveDeviceId(): Promise<string> {
  const cached = localStorage.getItem(DEVICE_KEY);
  try {
    const info = await Device.getId();
    if (info?.identifier && info.identifier.trim().length >= 4) {
      const id = `phone-${info.identifier.trim()}`;
      localStorage.setItem(DEVICE_KEY, id);
      return id;
    }
  } catch {
    // Web fallback
  }
  if (cached && cached.trim().length >= 4) return cached;
  const fresh = generateFallbackDeviceId();
  localStorage.setItem(DEVICE_KEY, fresh);
  return fresh;
}

export function loadDogClimberState(deviceId: string): DogClimberState {
  const defaultApi = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL || '')
    .trim()
    .replace(/\/+$/, '');

  const base: DogClimberState = {
    deviceId,
    apiBaseUrl: defaultApi,
    breedId: 0,
    collarColor: 'red',
    accessory: 'none',
    playerName: 'Player',
    soundEnabled: true,
    currentMeters: 0,
    bestMeters: 0,
    activeRunId: makeRunId(),
    highscores: [],
  };

  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<DogClimberState>;
    const currentMeters = Math.max(0, Number(parsed.currentMeters || 0));
    const bestMeters = Math.max(currentMeters, Number(parsed.bestMeters || 0));
    const rawName = typeof parsed.playerName === 'string' ? parsed.playerName.trim() : '';
    const resolvedName = rawName && rawName !== 'Hondenbaas' ? rawName : 'Player';
    return {
      deviceId,
      apiBaseUrl:
        typeof parsed.apiBaseUrl === 'string' && parsed.apiBaseUrl.trim()
          ? parsed.apiBaseUrl.trim().replace(/\/+$/, '')
          : defaultApi,
      breedId: typeof parsed.breedId === 'number' ? parsed.breedId : 0,
      collarColor: parsed.collarColor || 'red',
      accessory: parsed.accessory || 'none',
      playerName: resolvedName,
      soundEnabled: parsed.soundEnabled !== false,
      currentMeters,
      bestMeters,
      activeRunId: typeof parsed.activeRunId === 'string' && parsed.activeRunId ? parsed.activeRunId : makeRunId(),
      highscores: Array.isArray(parsed.highscores) ? parsed.highscores : [],
    };
  } catch {
    return base;
  }
}

export function saveDogClimberState(state: DogClimberState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage issues
  }
}

export function updateDogClimberHighscore(state: DogClimberState): void {
  const rounded = Math.round(state.currentMeters * 10) / 10;
  if (rounded <= 0) return;
  if (rounded > state.bestMeters) state.bestMeters = rounded;

  const idx = state.highscores.findIndex((h) => h.id === state.activeRunId);
  const entry: DogClimberHighscore = {
    id: state.activeRunId,
    playerName: state.playerName.trim() || 'Player',
    meters: rounded,
    breedId: state.breedId,
    collarColor: state.collarColor,
    accessory: state.accessory,
    createdAt: new Date().toISOString(),
  };

  if (idx >= 0) {
    if (rounded >= state.highscores[idx].meters) state.highscores[idx] = entry;
  } else {
    state.highscores.push(entry);
  }

  state.highscores = state.highscores.sort((a, b) => b.meters - a.meters).slice(0, 50);
  saveDogClimberState(state);
}

export function startNewDogClimberRun(state: DogClimberState): void {
  state.currentMeters = 0;
  state.activeRunId = makeRunId();
  saveDogClimberState(state);
}
