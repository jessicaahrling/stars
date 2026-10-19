// Remembers the viewer's settings between visits. Storage can be unavailable
// (private windows, blocked site data), so every access is guarded.
const KEY = 'stjarnhimlen:v1';

export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not saved; the app works the same without it.
  }
}
