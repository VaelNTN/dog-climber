import { CollarColorId, DogAccessoryId } from '../data/dogs';

export interface GlobalDogClimberEntry {
  rank: number;
  deviceId: string;
  playerName: string;
  meters: number;
  breedId: number;
  collarColor: CollarColorId;
  accessory: DogAccessoryId;
  updatedAt: string;
}

export interface GlobalDogClimberResponse {
  ok: boolean;
  entries: GlobalDogClimberEntry[];
  player: GlobalDogClimberEntry | null;
}

function cleanUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export async function fetchGlobalDogClimberHighscores(
  baseUrl: string,
  deviceId: string,
  limit = 50
): Promise<GlobalDogClimberResponse> {
  const base = cleanUrl(baseUrl);
  if (!base) throw new Error('NO_BACKEND_URL');
  const res = await fetch(
    `${base}/api/dog-climber/highscores?limit=${limit}&deviceId=${encodeURIComponent(deviceId)}`,
    { method: 'GET' }
  );
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return (await res.json()) as GlobalDogClimberResponse;
}

export async function submitGlobalDogClimberScore(
  baseUrl: string,
  payload: {
    deviceId: string;
    playerName: string;
    meters: number;
    breedId: number;
    collarColor: CollarColorId;
    accessory: DogAccessoryId;
  }
): Promise<void> {
  const base = cleanUrl(baseUrl);
  if (!base || payload.meters <= 0) return;

  try {
    await fetch(`${base}/api/dog-climber/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: payload.deviceId,
        playerName: payload.playerName.trim() || 'Player',
        meters: payload.meters,
        breedId: payload.breedId,
        collarColor: payload.collarColor,
        accessory: payload.accessory,
      }),
    });
  } catch {
    // Offline fallback stays silent
  }
}
