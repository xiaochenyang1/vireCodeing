import { readJsonStorage, writeJsonStorage } from './storage';

const ONBOARDING_STATE_VERSION = 1;
const ONBOARDING_STATE_STORAGE_KEY = '@vireCodeing/onboarding-state';

type OnboardingStateSnapshot = {
  version: number;
  completedAt: number;
};

function isValidSnapshot(
  snapshot: OnboardingStateSnapshot | undefined,
): snapshot is OnboardingStateSnapshot {
  return (
    Boolean(snapshot) &&
    snapshot?.version === ONBOARDING_STATE_VERSION &&
    typeof snapshot.completedAt === 'number'
  );
}

export async function hasCompletedOnboarding() {
  const snapshot = await readJsonStorage<OnboardingStateSnapshot>(
    ONBOARDING_STATE_STORAGE_KEY,
  );

  return isValidSnapshot(snapshot);
}

export function saveOnboardingCompleted(now = Date.now()) {
  return writeJsonStorage(ONBOARDING_STATE_STORAGE_KEY, {
    version: ONBOARDING_STATE_VERSION,
    completedAt: now,
  });
}
