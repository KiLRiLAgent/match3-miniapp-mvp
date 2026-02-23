const STORAGE_KEY = "match3_audio";

let muted = false;
let volume = 0.5;

export function loadAudioSettings(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      muted = parsed.muted ?? false;
      volume = parsed.volume ?? 0.5;
    }
  } catch {
    // ignore
  }
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted, volume }));
  } catch {
    // ignore
  }
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  save();
  return muted;
}

export function getVolume(): number {
  return muted ? 0 : volume;
}
