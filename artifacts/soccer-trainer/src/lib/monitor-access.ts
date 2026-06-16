// Private-access gate for the Monitor page. No real login — just a secret code
// the owner knows. Once entered, this device is remembered (localStorage), so
// the owner sees the Monitor section and everyone else stays locked out.
const KEY = "panna-monitor-unlocked";

// The secret code (compared loosely: case- and space-insensitive).
const CODE = "lamineyamal";

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function isMonitorUnlocked(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Returns true and remembers this device if the code is correct. */
export function tryUnlockMonitor(input: string): boolean {
  if (normalize(input) === CODE) {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    return true;
  }
  return false;
}

export function lockMonitor(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
