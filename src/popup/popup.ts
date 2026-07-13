import { FillResult } from '../shared/types/index.js';
import {
  initSupportState,
  shouldShowSupport,
  incrementFormFill,
  markSupportCompleted,
  dismissSupport,
  recordReminderShown,
  verifySupportCompletion,
  saveGithubUsername,
  getGithubUsername,
  validateGithubUsername,
} from '../shared/storage/github-support.js';

// GitHub OAuth App Client ID (for Device Authorization Flow)
const GITHUB_CLIENT_ID = 'Ov23liHCiMtLBmrxhbcN';

// Hardcoded developer/testing bypass - not documented in UI.
// NOTE: this is a real bypass on a real restriction now that the
// fill button gets blocked after 3 uses until verification succeeds.
// Anyone who unpacks this extension can read this string. Treat it
// as equivalent to a public password, not a secret.
const AUTHOR_BYPASS_CODE = '090078601';

// Placeholder username stored when the bypass is used. Distinct from
// GITHUB_CLIENT_ID (which is a public OAuth app identifier and has no
// business being stored as a "username") and distinct from the raw
// bypass code (so the bypass code itself never ends up persisted to
// storage or rendered in the UI as "@090078601").
const BYPASS_PLACEHOLDER_USERNAME = 'dev-bypass';

interface GitHubDeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return 'N/A';
  }
}

// Check if username is the author bypass code
function isAuthorBypass(username: string): boolean {
  return username === AUTHOR_BYPASS_CODE;
}

async function startDeviceAuth(
  authBtn: HTMLButtonElement,
  deviceContainer: HTMLDivElement,
  deviceCodeEl: HTMLElement,
  verifyLink: HTMLAnchorElement,
  statusEl: HTMLParagraphElement
) {
  authBtn.disabled = true;
  authBtn.querySelector('.btn-text')!.textContent = 'Starting...';

  try {
    const deviceResp = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'FormFilla-Extension'
      },
      body: new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        scope: 'read:user'
      })
    });

    if (!deviceResp.ok) {
      throw new Error(`Failed to start auth: ${deviceResp.status}`);
    }

    const deviceData: GitHubDeviceCodeResponse = await deviceResp.json();

    deviceCodeEl.textContent = deviceData.user_code;
    verifyLink.href = deviceData.verification_uri_complete || deviceData.verification_uri;
    deviceContainer.classList.remove('hidden');
    statusEl.textContent = 'Waiting for authorization...';

    // GitHub returns interval in seconds; back off if told slow_down.
    let pollInterval = deviceData.interval || 5;
    const expiresAt = Date.now() + (deviceData.expires_in * 1000);

    while (Date.now() < expiresAt) {
      const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'FormFilla-Extension'
        },
        body: new URLSearchParams({
          client_id: GITHUB_CLIENT_ID,
          device_code: deviceData.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        })
      });

      const tokenData = await tokenResp.json();

      if (tokenData.error) {
        if (tokenData.error === 'authorization_pending') {
          statusEl.textContent = 'Waiting for you to authorize...';
        } else if (tokenData.error === 'slow_down') {
          // GitHub requires a longer interval — it typically also
          // returns a new `interval` value; prefer that if present,
          // otherwise pad the current interval by 5s per the spec.
          pollInterval = tokenData.interval || pollInterval + 5;
          statusEl.textContent = 'Waiting for you to authorize...';
        } else if (tokenData.error === 'expired_token') {
          statusEl.textContent = 'Authorization expired. Please try again.';
          deviceContainer.classList.add('hidden');
          return;
        } else if (tokenData.error === 'access_denied') {
          statusEl.textContent = 'Authorization denied.';
          deviceContainer.classList.add('hidden');
          authBtn.disabled = false;
          authBtn.querySelector('.btn-text')!.textContent = 'Connect with GitHub';
          return;
        }
        await new Promise(r => setTimeout(r, pollInterval * 1000));
        continue;
      }

      if (tokenData.access_token) {
        const userResp = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'User-Agent': 'FormFilla-Extension'
          }
        });

        if (userResp.ok) {
          const userData = await userResp.json();
          const username = userData.login;
          await saveGithubUsername(username);
          const verifyResult = await verifySupportCompletion(username);

          if (verifyResult.completed) {
            await markSupportCompleted();
            statusEl.textContent = `✅ Welcome @${username}!`;
            deviceContainer.classList.add('hidden');
          } else {
            statusEl.textContent = `Signed in as @${username}. Missing stars: ${verifyResult.missingRepos.length}`;
            // Leave deviceContainer visible but reset the button so the
            // user isn't stuck in a permanently-disabled "waiting" state.
            authBtn.disabled = false;
            authBtn.querySelector('.btn-text')!.textContent = 'Connect with GitHub';
          }
        } else {
          statusEl.textContent = 'Could not fetch your GitHub profile. Please try again.';
        }
        return;
      }

      await new Promise(r => setTimeout(r, pollInterval * 1000));
    }

    statusEl.textContent = 'Authorization expired. Please try again.';
    deviceContainer.classList.add('hidden');
  } catch (err) {
    statusEl.textContent = err instanceof Error ? err.message : 'Auth failed';
  } finally {
    authBtn.disabled = false;
    authBtn.querySelector('.btn-text')!.textContent = 'Connect with GitHub';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const fillBtn = document.getElementById('fill-btn') as HTMLButtonElement;
  const optionsBtn = document.getElementById('options-btn') as HTMLButtonElement | null;
  const mainContent = document.getElementById('main-content') as HTMLDivElement;
  const resultsPanel = document.getElementById('results-panel') as HTMLDivElement;
  const statusDot = document.querySelector('.status-dot') as HTMLSpanElement;
  const statusText = document.getElementById('status-text') as HTMLSpanElement;

  const countTotal = document.getElementById('count-total') as HTMLSpanElement;
  const countConfident = document.getElementById('count-confident') as HTMLSpanElement;
  const countReview = document.getElementById('count-review') as HTMLSpanElement;
  const countConfirm = document.getElementById('count-confirm') as HTMLSpanElement;
  const countUnmapped = document.getElementById('count-unmapped') as HTMLSpanElement;

  const gentlePanel = document.getElementById('support-gentle-panel') as HTMLDivElement;
  const requiredPanel = document.getElementById('support-required-panel') as HTMLDivElement;
  const dailyPanel = document.getElementById('support-daily-panel') as HTMLDivElement;

  const gentleStarBtn = document.getElementById('gentle-star-btn') as HTMLAnchorElement;
  const gentleFollowBtn = document.getElementById('gentle-follow-btn') as HTMLAnchorElement;
  const gentleDismissBtn = document.getElementById('gentle-dismiss-btn') as HTMLButtonElement;

  const supportVerifyBtn = document.getElementById('support-verify-btn') as HTMLButtonElement;
  const supportFillsCount = document.getElementById('support-fills-count') as HTMLSpanElement;
  const newReposContainer = document.getElementById('new-repos-container') as HTMLDivElement;
  const usernameInput = document.getElementById('support-github-username-manual') as HTMLInputElement;
  const usernameError = document.getElementById('support-username-error') as HTMLParagraphElement;

  const dailyConfirmBtn = document.getElementById('daily-confirm-btn') as HTMLButtonElement;
  const dailyNewReposContainer = document.getElementById('daily-new-repos-container') as HTMLDivElement;
  const dailyReposList = document.getElementById('daily-repos-list') as HTMLDivElement;
  const dailyFollowMissing = document.getElementById('daily-follow-missing') as HTMLDivElement;
  const dailyFollowList = document.getElementById('daily-follow-list') as HTMLDivElement;

  const githubAuthBtn = document.getElementById('github-auth-btn') as HTMLButtonElement;
  const deviceContainer = document.getElementById('device-code-container') as HTMLDivElement;
  const deviceCodeEl = document.getElementById('device-user-code') as HTMLElement;
  const verifyLink = document.getElementById('device-verify-link') as HTMLAnchorElement;
  const statusEl = document.getElementById('device-status') as HTMLParagraphElement;
  const copyBtn = document.getElementById('copy-code-btn') as HTMLButtonElement;
  const disconnectBtn = document.getElementById('disconnect-github-btn') as HTMLButtonElement;

  await initSupportState();

  const savedUsername = await getGithubUsername();
  if (savedUsername && usernameInput) {
    usernameInput.value = savedUsername;
    disconnectBtn.classList.remove('hidden');
  }

  // ===== GitHub Device Auth =====
  if (githubAuthBtn) {
    githubAuthBtn.addEventListener('click', () => {
      startDeviceAuth(githubAuthBtn, deviceContainer, deviceCodeEl, verifyLink, statusEl);
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(deviceCodeEl.textContent || '');
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy', 2000);
    });
  }

  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', async () => {
      await chrome.storage.local.remove(['formfilla_github_support']);
      location.reload();
    });
  }

  // ===== Activation status =====
  const { getActivationStatus } = await import('../shared/storage/activation-status.js');
  const activation = await getActivationStatus();

  if (activation.activated) {
    // statusText.textContent = `✅ Activated • Last check: ${formatDate(activation.lastCheckDate)}`;
    disconnectBtn.classList.remove('hidden');
  } else {
    statusDot.classList.add('not-activated');
    statusText.textContent = '⛔ Not activated • Go to Settings to activate.';
  }

  const supportStatus = await shouldShowSupport();

  if (supportStatus.show) {
    if (supportStatus.reason === 'required') {
      mainContent.classList.add('hidden');
      requiredPanel.classList.remove('hidden');
      supportFillsCount.textContent = '3+';
    } else if (supportStatus.reason === 'daily-verification') {
      mainContent.classList.add('hidden');
      dailyPanel.classList.remove('hidden');
    } else {
      gentlePanel.classList.remove('hidden');
    }
    await recordReminderShown();
  }

  // ===== GENTLE PANEL =====
  gentleDismissBtn.addEventListener('click', async () => {
    await dismissSupport();
    gentlePanel.classList.add('hidden');
  });

  // ===== REQUIRED PANEL - Manual username verification =====
  supportVerifyBtn.addEventListener('click', async () => {
    const rawUsername = usernameInput.value.trim();

    if (!rawUsername) {
      usernameError.textContent = 'Please enter your GitHub username first.';
      usernameError.classList.remove('hidden');
      usernameInput.focus();
      return;
    }

    usernameError.classList.add('hidden');
    supportVerifyBtn.classList.add('loading');
    const btnText = supportVerifyBtn.querySelector('.btn-text');
    if (btnText) btnText.textContent = 'Verifying...';

    // Hardcoded developer/testing bypass - skip all network checks.
    // Stores a placeholder username rather than the raw bypass code or
    // the OAuth client ID, so nothing meaningless or misleading ends up
    // persisted/displayed as the "connected" GitHub identity.
    if (isAuthorBypass(rawUsername)) {
      await saveGithubUsername(BYPASS_PLACEHOLDER_USERNAME);
      await markSupportCompleted();
      supportVerifyBtn.classList.remove('loading');
      supportVerifyBtn.classList.add('success');
      if (btnText) btnText.textContent = '✓ Activated!';
      disconnectBtn.classList.remove('hidden');
      setTimeout(() => {
        requiredPanel.classList.add('hidden');
        mainContent.classList.remove('hidden');
      }, 1200);
      return;
    }

    // Remove @ prefix if present
    const username = rawUsername.replace(/^@/, '');

    try {
      const isValid = await validateGithubUsername(username);
      if (!isValid) {
        supportVerifyBtn.classList.remove('loading');
        usernameError.textContent = `GitHub user "@${username}" not found.`;
        usernameError.classList.remove('hidden');
        if (btnText) btnText.textContent = "✓ I've starred & followed — verify me";
        return;
      }

      await saveGithubUsername(username);
      const verification = await verifySupportCompletion(username);

      if (verification.completed) {
        await markSupportCompleted();
        supportVerifyBtn.classList.remove('loading');
        supportVerifyBtn.classList.add('success');
        if (btnText) btnText.textContent = '✓ Verified! Thank you, @' + username + '!';
        disconnectBtn.classList.remove('hidden');
        setTimeout(() => {
          requiredPanel.classList.add('hidden');
          mainContent.classList.remove('hidden');
        }, 1200);
      } else {
        supportVerifyBtn.classList.remove('loading');
        usernameError.textContent = verification.error || `Missing: ${verification.missingRepos.length} repos`;
        usernameError.classList.remove('hidden');
        if (btnText) btnText.textContent = "✓ I've starred & followed — verify me";
      }
    } catch (err) {
      supportVerifyBtn.classList.remove('loading');
      usernameError.textContent = 'Could not reach GitHub.';
      usernameError.classList.remove('hidden');
      if (btnText) btnText.textContent = "✓ I've starred & followed — verify me";
    }
  });

  // ===== DAILY PANEL =====
  dailyConfirmBtn.addEventListener('click', async () => {
    const verification = await verifySupportCompletion();
    if (verification.completed) {
      await markSupportCompleted();
      mainContent.classList.remove('hidden');
      dailyPanel.classList.add('hidden');
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
    if (btnText) btnText.textContent = 'Analyzing Page...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) throw new Error('No active tab');

      chrome.tabs.sendMessage(tab.id, { type: 'START_FILL', tabId: tab.id }, async (response) => {
        if (chrome.runtime.lastError) {
          fillBtn.disabled = false;
          if (btnText) btnText.textContent = 'Fill this page';
          statusText.textContent = 'Cannot connect to this page (ensure it is loaded and not a chrome:// or new tab page).';
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

          const totalFills = await incrementFormFill();
          if (totalFills >= 3) {
            const supportStatus = await shouldShowSupport();
            if (supportStatus.show && supportStatus.reason === 'required') {
              mainContent.classList.add('hidden');
              requiredPanel.classList.remove('hidden');
            }
          }
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