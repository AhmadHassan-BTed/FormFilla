import { getSupportState } from './github-support.js';

export interface ActivationStatus {
  activated: boolean;
  label: string;
  detail: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return 'N/A';
  }
}

export async function getActivationStatus(): Promise<ActivationStatus> {
  const state = await getSupportState();
  const activated = !!state.supportCompleted;

  if (activated) {
    return {
      activated,
      label: 'Activated ✅',
      detail: `Last check: ${formatDate(state.lastVerificationDate)}`,
    };
  }

  return {
    activated,
    label: 'Not activated ⛔',
    detail: 'Complete the support requirement to activate.',
  };
}

