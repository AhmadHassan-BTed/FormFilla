import { FillResult } from '../shared/types/index.js';
import {
  initSupportState,
  shouldShowSupport,
  incrementFormFill,
  markSupportCompleted,
  dismissSupport,
  recordReminderShown,
  verifySupportCompletion,
  getSupportTargets,
  needsDailyVerification,
} from '../shared/storage/github-support.js';

document.addEventListener('DOMContentLoaded', async () => {
  const fillBtn = document.getElementById('fill-btn') as HTMLButtonElement;
  const optionsBtn = document.getElementById('options-btn') as HTMLButtonElement | null;
  const mainContent = document.getElementById('main-content') as HTMLDivElement;
  const resultsPanel = document.getElementById('results-panel') as HTMLDivElement;
  const statusDot = document.querySelector('.status-dot') as HTMLSpanElement;
  const statusText = document.getElementById('status-text') as HTMLSpanElement;

  const countConfident = document.getElementById('count-confident') as HTMLSpanElement;
  const countReview = document.getElementById('count-review') as HTMLSpanElement;
  const countConfirm = document.getElementById('count-confirm') as HTMLSpanElement;
  const countUnmapped = document.getElementById('count-unmapped') as HTMLSpanElement;

  // Panels
  const gentlePanel = document.getElementById('support-gentle-panel') as HTMLDivElement;
  const requiredPanel = document.getElementById('support-required-panel') as HTMLDivElement;
  const dailyPanel = document.getElementById('support-daily-panel') as HTMLDivElement;

  // Gentle panel elements
  const gentleStarBtn = document.getElementById('gentle-star-btn') as HTMLAnchorElement;
  const gentleFollowBtn = document.getElementById('gentle-follow-btn') as HTMLAnchorElement;
  const gentleDismissBtn = document.getElementById('gentle-dismiss-btn') as HTMLButtonElement;

  // Required panel elements
  const supportVerifyBtn = document.getElementById('support-verify-btn') as HTMLButtonElement;
  const supportFillsCount = document.getElementById('support-fills-count') as HTMLSpanElement;
  const newReposContainer = document.getElementById('new-repos-container') as HTMLDivElement;

  // Daily panel elements
  const dailyConfirmBtn = document.getElementById('daily-confirm-btn') as HTMLButtonElement;
  const dailyNewReposContainer = document.getElementById('daily-new-repos-container') as HTMLDivElement;
  const dailyReposList = document.getElementById('daily-repos-list') as HTMLDivElement;

  // Initialize support state
  await initSupportState();

  // Determine which panel to show
  const supportStatus = await shouldShowSupport();

  if (supportStatus.show) {
    if (supportStatus.reason === 'required') {
      // Blocking: show required panel, hide main content
      mainContent.classList.add('hidden');
      requiredPanel.classList.remove('hidden');
      supportFillsCount.textContent = '3+';
    } else if (supportStatus.reason === 'daily-verification') {
      // Daily check: show daily panel, hide main content
      mainContent.classList.add('hidden');
      dailyPanel.classList.remove('hidden');
      // Check for new repos
      try {
        const verification = await verifySupportCompletion();
        if (verification.missingRepos.length > 0) {
          dailyNewReposContainer.classList.remove('hidden');
          dailyReposList.innerHTML = verification.missingRepos
            .map(repo => `<a href="https://github.com/${repo}" target="_blank" class="support-target-link">
              <svg viewBox="0 0 16 16" class="support-icon" aria-hidden="true"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.612L7.327.668A.75.75 0 0 1 8 .25z"/></svg>
              ${repo}
            </a>`)
            .join('');
        }
      } catch {
        // Silently handle verification errors
      }
    } else {
      // Gentle prompt: show gentle panel, keep main content visible
      gentlePanel.classList.remove('hidden');
    }
    await recordReminderShown();
  }

  // ===== GENTLE PANEL HANDLERS =====

  gentleStarBtn.addEventListener('click', () => {
    // Just opens the link, no tracking needed for gentle prompt
  });

  gentleFollowBtn.addEventListener('click', () => {
    // Just opens the link, no tracking needed for gentle prompt
  });

  gentleDismissBtn.addEventListener('click', async () => {
    await dismissSupport();
    gentlePanel.classList.add('hidden');
  });

  // ===== REQUIRED PANEL HANDLERS =====

  supportVerifyBtn.addEventListener('click', async () => {
    supportVerifyBtn.classList.add('loading');
    const btnText = supportVerifyBtn.querySelector('.btn-text');
    if (btnText) btnText.textContent = 'Verifying...';

    try {
      const verification = await verifySupportCompletion();

      if (verification.completed) {
        await markSupportCompleted();
        supportVerifyBtn.classList.remove('loading');
        supportVerifyBtn.classList.add('success');
        if (btnText) btnText.textContent = '✓ Verified! Thank you!';

        // Show main content after brief delay
        setTimeout(() => {
          requiredPanel.classList.add('hidden');
          mainContent.classList.remove('hidden');
        }, 1200);
      } else {
        supportVerifyBtn.classList.remove('loading');
        if (btnText) btnText.textContent = "✗ Not yet — please star & follow all repos above";

        // Show which repos are missing
        if (verification.missingRepos.length > 0) {
          newReposContainer.classList.remove('hidden');
          newReposContainer.innerHTML = verification.missingRepos
            .map(repo => `<a href="https://github.com/${repo}" target="_blank" class="support-target-link" style="color:var(--warning)">
              <svg viewBox="0 0 16 16" class="support-icon" aria-hidden="true"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.612L7.327.668A.75.75 0 0 1 8 .25z"/></svg>
              ${repo}
            </a>`)
            .join('');
        }

        // Reset button text after 3 seconds
        setTimeout(() => {
          if (btnText) btnText.textContent = "✓ I've starred & followed all";
        }, 3000);
      }
    } catch (err) {
      supportVerifyBtn.classList.remove('loading');
      if (btnText) btnText.textContent = 'Verification failed — try again';
      setTimeout(() => {
        if (btnText) btnText.textContent = "✓ I've starred & followed all";
      }, 3000);
    }
  });

  // ===== DAILY PANEL HANDLERS =====

  dailyConfirmBtn.addEventListener('click', async () => {
    dailyConfirmBtn.classList.add('loading');
    const btnText = dailyConfirmBtn.querySelector('.btn-text');
    if (btnText) btnText.textContent = 'Verifying...';

    try {
      const verification = await verifySupportCompletion();

      if (verification.completed) {
        await markSupportCompleted();
        dailyConfirmBtn.classList.remove('loading');
        dailyConfirmBtn.classList.add('success');
        if (btnText) btnText.textContent = '✓ All good!';

        setTimeout(() => {
          dailyPanel.classList.add('hidden');
          mainContent.classList.remove('hidden');
        }, 1000);
      } else {
        dailyConfirmBtn.classList.remove('loading');
        if (btnText) btnText.textContent = 'Please star the new repos first';

        if (verification.missingRepos.length > 0) {
          dailyNewReposContainer.classList.remove('hidden');
          dailyReposList.innerHTML = verification.missingRepos
            .map(repo => `<a href="https://github.com/${repo}" target="_blank" class="support-target-link" style="color:var(--warning)">
              <svg viewBox="0 0 16 16" class="support-icon" aria-hidden="true"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.612L7.327.668A.75.75 0 0 1 8 .25z"/></svg>
              ${repo}
            </a>`)
            .join('');
        }

        setTimeout(() => {
          if (btnText) btnText.textContent = "✓ I'm all caught up";
        }, 3000);
      }
    } catch {
      dailyConfirmBtn.classList.remove('loading');
      if (btnText) btnText.textContent = 'Verification failed — try again';
      setTimeout(() => {
        if (btnText) btnText.textContent = "✓ I'm all caught up";
      }, 3000);
    }
  });

  // ===== OPTIONS BUTTON =====

  if (optionsBtn) {
    optionsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // ===== FILL BUTTON =====

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

      chrome.tabs.sendMessage(tab.id, { type: 'START_FILL', tabId: tab.id }, async (response) => {
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

          // Increment form fill counter and check if support is now required
          const totalFills = await incrementFormFill();
          if (totalFills >= 3) {
            const supportStatus = await shouldShowSupport();
            if (supportStatus.show && supportStatus.reason === 'required') {
              mainContent.classList.add('hidden');
              requiredPanel.classList.remove('hidden');
              supportFillsCount.textContent = '3+';
            }
          }
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