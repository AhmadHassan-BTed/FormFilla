import { FillResult } from '../shared/types/index.js';

document.addEventListener('DOMContentLoaded', () => {
  const fillBtn = document.getElementById('fill-btn') as HTMLButtonElement;
  const optionsBtn = document.getElementById('options-btn') as HTMLButtonElement;
  const resultsPanel = document.getElementById('results-panel') as HTMLDivElement;
  const statusDot = document.querySelector('.status-dot') as HTMLSpanElement;
  const statusText = document.getElementById('status-text') as HTMLSpanElement;

  const countConfident = document.getElementById('count-confident') as HTMLSpanElement;
  const countReview = document.getElementById('count-review') as HTMLSpanElement;
  const countConfirm = document.getElementById('count-confirm') as HTMLSpanElement;
  const countUnmapped = document.getElementById('count-unmapped') as HTMLSpanElement;

  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  fillBtn.addEventListener('click', async () => {
    fillBtn.disabled = true;
    const btnText = fillBtn.querySelector('.btn-text');
    const originalText = btnText ? btnText.textContent : 'Fill this page';
    
    if (btnText) btnText.textContent = 'Analyzing Page...';
    statusDot.className = 'status-dot loading';
    statusText.textContent = 'Finding and scoring elements...';
    resultsPanel.classList.add('hidden');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        throw new Error('No active browser tab detected.');
      }

      if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
        throw new Error('Cannot fill forms on system pages.');
      }

      chrome.tabs.sendMessage(tab.id, { type: 'START_FILL', tabId: tab.id }, (response) => {
        fillBtn.disabled = false;
        if (btnText) btnText.textContent = originalText;
        statusDot.className = 'status-dot';

        if (chrome.runtime.lastError) {
          statusText.textContent = 'Make sure to reload this page first!';
          console.warn('Communication error:', chrome.runtime.lastError);
          return;
        }

        if (response && response.type === 'FILL_RESULT') {
          const res = response.result as FillResult;
          
          countConfident.textContent = String(res.confident);
          countReview.textContent = String(res.review);
          countConfirm.textContent = String(res.needsConfirm);
          countUnmapped.textContent = String(res.unmapped);

          resultsPanel.classList.remove('hidden');
          statusText.textContent = 'Fill process completed!';
        } else {
          statusText.textContent = 'Error: Fill operation did not complete.';
        }
      });
    } catch (err) {
      fillBtn.disabled = false;
      if (btnText) btnText.textContent = originalText;
      statusDot.className = 'status-dot';
      statusText.textContent = err instanceof Error ? err.message : 'Unknown error occurred.';
    }
  });
});
