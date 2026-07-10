import { getActivationStatus as getActivationStatusImpl } from '../shared/storage/activation-status.js';

export async function setupActivationStatusUI() {
  const labelEl = document.getElementById('activation-status-label');
  const detailEl = document.getElementById('activation-status-detail');
  if (!labelEl || !detailEl) return;

  const activation = await getActivationStatusImpl();
  labelEl.textContent = activation.label;
  detailEl.textContent = activation.detail;
}


