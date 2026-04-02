const STORAGE_KEY = "match3_haptic";

let enabled = true;

export function loadHapticSettings(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      enabled = JSON.parse(saved);
    }
  } catch {
    // ignore
  }
}

function vibrate(pattern: number | number[]): void {
  if (!enabled) return;
  try {
    navigator?.vibrate?.(pattern);
  } catch {
    // ignore — not all browsers support vibrate
  }
}

export function hapticLight(): void {
  vibrate(10);
}

export function hapticMedium(): void {
  vibrate(25);
}

export function hapticHeavy(): void {
  vibrate(50);
}

export function hapticVictory(): void {
  vibrate([50, 100, 50, 100, 50]);
}

export function hapticDefeat(): void {
  vibrate([100, 50, 200]);
}
