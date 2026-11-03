import { FillResult } from '../shared/types/index.js';

document.addEventListener('DOMContentLoaded', async () => {
  const fillBtn = document.getElementById('fill-btn') as HTMLButtonElement;
  const optionsBtn = document.getElementById('options-btn') as HTMLButtonElement | null;
  const resultsPanel = document.getElementById('results-panel') as HTMLDivElement;
  const statusText = document.getElementById('status-text') as HTMLSpanElement;

  const countTotal = document.getElementById('count-total') as HTMLSpanElement;
  const countConfident = document.getElementById('count-confident') as HTMLSpanElement;
  const countReview = document.getElementById('count-review') as HTMLSpanElement;
  const countConfirm = document.getElementById('count-confirm') as HTMLSpanElement;
  const countUnmapped = document.getElementById('count-unmapped') as HTMLSpanElement;

  // ===== OPTIONS BUTTON =====
  if (optionsBtn) {
    optionsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // Listen for progress updates from the content script fill process
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'FILL_PROGRESS') {
      const btnTextText = fillBtn.querySelector('.btn-text');
      if (btnTextText) {
        btnTextText.textContent = `Analyzing Page (${message.progress}%)...`;
      }
      statusText.textContent = message.message;
    }
  });

  // ===== FILL BUTTON =====
  fillBtn.addEventListener('click', async () => {
    fillBtn.disabled = true;
    const btnText = fillBtn.querySelector('.btn-text');
    if (btnText) btnText.textContent = 'Analyzing Page (0%)...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) throw new Error('No active tab');

      chrome.tabs.sendMessage(tab.id, { type: 'START_FILL', tabId: tab.id }, async (response) => {
        if (chrome.runtime.lastError) {
          fillBtn.disabled = false;
          if (btnText) btnText.textContent = 'Fill this page';
          statusText.textContent = 'Cannot connect to this page. Please refresh the page or restart the browser.';
          return;
        }

        fillBtn.disabled = false;
        if (btnText) btnText.textContent = 'Fill this page';

        if (response?.type === 'FILL_RESULT') {
          const res = response.result as FillResult;
          const total = res.confident + res.review + res.needsConfirm + res.unmapped;
          if (countTotal) countTotal.textContent = String(total);
          countConfident.textContent = String(res.confident);
          countReview.textContent = String(res.review);
          countConfirm.textContent = String(res.needsConfirm);
          countUnmapped.textContent = String(res.unmapped);
          renderScannedFields(res.details);
          resultsPanel.classList.remove('hidden');
          statusText.textContent = 'Fill completed!';
        }
      });
    } catch (err) {
      fillBtn.disabled = false;
      statusText.textContent = err instanceof Error ? err.message : 'Error';
    }
  });

  // ===== TARGET MAP BUTTON =====
  const targetMapBtn = document.getElementById('target-map-btn');
  if (targetMapBtn) {
    targetMapBtn.addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) return;
        chrome.tabs.sendMessage(tab.id, { type: 'START_INTERACTIVE_MAP' }, () => {
          if (chrome.runtime.lastError) {
            statusText.textContent = 'Cannot start mapper. Ensure page is loaded.';
          } else {
            window.close(); // close popup so user can click
          }
        });
      } catch (err) {
        console.error(err);
      }
    });
  }

  // ===== TOGGLE FIELDS BUTTON =====
  const scannedFieldsList = document.getElementById('scanned-fields-list');
  const toggleFieldsBtn = document.getElementById('toggle-fields-btn');
  const chevronIcon = document.getElementById('chevron-icon');

  if (toggleFieldsBtn && scannedFieldsList && chevronIcon) {
    toggleFieldsBtn.addEventListener('click', () => {
      const isHidden = scannedFieldsList.classList.contains('hidden');
      if (isHidden) {
        scannedFieldsList.classList.remove('hidden');
        (chevronIcon as HTMLElement).style.transform = 'rotate(180deg)';
      } else {
        scannedFieldsList.classList.add('hidden');
        (chevronIcon as HTMLElement).style.transform = 'rotate(0deg)';
      }
    });
  }

  function renderScannedFields(details: any[] | undefined) {
    if (!scannedFieldsList) return;
    scannedFieldsList.innerHTML = '';
    if (!details || details.length === 0) {
      scannedFieldsList.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 10px; width: 100%;">No fields scanned yet.</div>';
      return;
    }

    details.forEach(field => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.alignItems = 'center';
      item.style.padding = '6px 8px';
      item.style.background = 'rgba(255, 255, 255, 0.03)';
      item.style.borderRadius = '4px';
      item.style.border = '1px solid var(--border-color)';

      const textDiv = document.createElement('div');
      textDiv.style.flex = '1';
      textDiv.style.marginRight = '8px';
      textDiv.style.overflow = 'hidden';
      textDiv.style.textOverflow = 'ellipsis';
      textDiv.style.whiteSpace = 'nowrap';
      
      const labelText = field.label || 'Field';
      const keyText = field.key || 'unmapped';
      textDiv.innerHTML = `<span style="font-weight: 600; color: var(--text-primary);">${labelText}</span><br/><span style="color: var(--text-secondary); font-size: 9px;">${keyText}</span>`;

      const badge = document.createElement('span');
      badge.style.fontSize = '9px';
      badge.style.padding = '2px 6px';
      badge.style.borderRadius = '4px';
      badge.style.fontWeight = 'bold';
      
      let gateText = field.gate || 'unmapped';
      if (gateText === 'confident') {
        badge.style.background = 'rgba(40, 167, 69, 0.15)';
        badge.style.color = '#28a745';
        gateText = 'Confident';
      } else if (gateText === 'review') {
        badge.style.background = 'rgba(255, 193, 7, 0.15)';
        badge.style.color = '#ffc107';
        gateText = 'Review';
      } else if (gateText === 'needs-confirm') {
        badge.style.background = 'rgba(23, 162, 184, 0.15)';
        badge.style.color = '#17a2b8';
        gateText = 'Confirm';
      } else {
        badge.style.background = 'rgba(220, 53, 69, 0.15)';
        badge.style.color = '#dc3545';
        gateText = 'Unmapped';
      }
      badge.textContent = gateText;

      item.appendChild(textDiv);
      item.appendChild(badge);
      scannedFieldsList.appendChild(item);
    });
  }
});
