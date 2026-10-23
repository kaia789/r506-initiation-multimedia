// localStorage can be missing, full or blocked (private browsing, disabled cookies):
// every access is guarded and the game keeps working, just without saving.
const STORAGE_KEY = 'globe-des-danses:progress';

export function loadProgress() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      unlocked: Array.isArray(data?.unlocked) ? data.unlocked : [],
      bestScores: data?.bestScores && typeof data.bestScores === 'object' ? data.bestScores : {},
    };
  } catch {
    return { unlocked: [], bestScores: {} };
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export function clearProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
