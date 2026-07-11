import { getActivationStatus, deactivate } from '../shared/storage/activation-status.js';

export function setupActivationStatusUI() {
  const labelEl = document.getElementById('activation-status-label');
  const detailEl = document.getElementById('activation-status-detail');
  const deactivateBtn = document.getElementById('deactivate-btn') as HTMLButtonElement | null;

  if (!labelEl || !detailEl) return;

  async function render() {
    const activation = await getActivationStatus();
    labelEl!.textContent = activation.label;
    detailEl!.textContent = activation.detail;

    if (deactivateBtn) {
      deactivateBtn.classList.toggle('hidden', !activation.activated);
    }
  }

  render();

  // Previously missing: the button rendered but clicking it did nothing,
  // since nothing called deactivate().
  if (deactivateBtn) {
    deactivateBtn.addEventListener('click', async () => {
      deactivateBtn.disabled = true;
      await deactivate();
      await render();
      deactivateBtn.disabled = false;
    });
  }
}