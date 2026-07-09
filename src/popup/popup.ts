import { FillResult } from '../shared/types/index.js';
import {
  initSupportState,
  shouldShowSupport,
  markStarred,
  markFollowed,
  dismissSupport,
  recordReminderShown,
} from '../shared/storage/github-support.js';

document.addEventListener('DOMContentLoaded', async () => {
  const fillBtn = document.getElementById('fill-btn') as HTMLButtonElement;
  const optionsBtn = document.getElementById('options-btn') as HTMLButtonElement | null;
  const resultsPanel = document.getElementById('results-panel') as HTMLDivElement;
  const statusDot = document.querySelector('.status-dot') as HTMLSpanElement;
  const statusText = document.getElementById('status-text') as HTMLSpanElement;

  const countConfident = document.getElementById('count-confident') as HTMLSpanElement;
  const countReview = document.getElementById('count-review') as HTMLSpanElement;
  const countConfirm = document.getElementById('count-confirm') as HTMLSpanElement;
  const countUnmapped = document.getElementById('count-unmapped') as HTMLSpanElement;

  // GitHub support panel
  const supportPanel = document.getElementById('support-panel') as HTMLDivElement;
  const starBtn = document.getElementById('star-btn') as HTMLAnchorElement;
  const followBtn = document.getElementById('follow-btn') as HTMLAnchorElement;
  const dismissBtn = document.getElementById('support-dismiss-btn') as HTMLButtonElement;

  // Initialize support state and show prompt if needed
  await initSupportState();
  const showSupport = await shouldShowSupport();
  if (showSupport) {
    supportPanel.classList.remove('hidden');
    await recordReminderShown();
  }

  // Star button — mark as starred when clicked
  starBtn.addEventListener('click', async () => {
    await markStarred();
    starBtn.style.opacity = '0.5';
    starBtn.style.pointerEvents = 'none';
    checkSupportComplete();
  });

  // Follow button — mark as followed when clicked
  followBtn.addEventListener('click', async () => {
    await markFollowed();
    followBtn.style.opacity = '0.5';
    followBtn.style.pointerEvents = 'none';
    checkSupportComplete();
  });

  // Dismiss button
  dismissBtn.addEventListener('click', async () => {
    await dismissSupport();
    supportPanel.classList.add('hidden');
  });

  // Check if both actions completed and auto-dismiss
  async function checkSupportComplete() {
    const state = await shouldShowSupport();
    if (!state) {
      // Both done or dismissed — hide with a brief delay for visual feedback
      setTimeout(() => {
        supportPanel.classList.add('hidden');
      }, 600);
    }
  }

  if (optionsBtn) {
    optionsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

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
