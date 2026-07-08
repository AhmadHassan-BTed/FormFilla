import { GateType } from '../../shared/types.js';

export function tagField(
  el: Element,
  gate: GateType,
  onConfirm?: () => void
): void {
  const htmlEl = el as HTMLElement;

  // Clear existing tags/outlines on this element
  removeExistingTags(htmlEl);

  // Setup styles based on gate status
  let color = '';
  switch (gate) {
    case 'confident':
      color = '#22c55e'; // Green
      break;
    case 'review':
      color = '#f59e0b'; // Amber
      break;
    case 'unmapped':
      color = '#9ca3af'; // Gray
      break;
    case 'needs-confirm':
      color = '#e11d48'; // Rose/Red for attention
      break;
  }

  if (gate === 'needs-confirm') {
    createConfirmBadge(htmlEl, onConfirm);
    return;
  }

  // Draw outline/glow
  const originalOutline = htmlEl.style.outline;
  const originalBoxShadow = htmlEl.style.boxShadow;
  const originalTransition = htmlEl.style.transition;

  htmlEl.style.transition = 'outline 0.3s ease, box-shadow 0.3s ease';
  htmlEl.style.outline = `3px solid ${color}`;
  htmlEl.style.boxShadow = `0 0 8px ${color}`;

  // Fade out effect after 6 seconds
  const fadeTimeout = setTimeout(() => {
    htmlEl.style.transition = 'outline 6s ease-out, box-shadow 6s ease-out';
    htmlEl.style.outline = '3px solid transparent';
    htmlEl.style.boxShadow = '0 0 8px transparent';
    
    // Clean up inline styles once faded
    setTimeout(() => {
      htmlEl.style.outline = originalOutline;
      htmlEl.style.boxShadow = originalBoxShadow;
      htmlEl.style.transition = originalTransition;
    }, 6000);
  }, 1000);

  // Instantly clear outline on user focus
  const focusHandler = () => {
    clearTimeout(fadeTimeout);
    htmlEl.style.outline = originalOutline;
    htmlEl.style.boxShadow = originalBoxShadow;
    htmlEl.style.transition = originalTransition;
    htmlEl.removeEventListener('focus', focusHandler);
  };
  htmlEl.addEventListener('focus', focusHandler);
}

function createConfirmBadge(el: HTMLElement, onConfirm?: () => void) {
  const doc = el.ownerDocument || document;
  const rect = el.getBoundingClientRect();
  const badgeId = `applyengine-badge-${Math.random().toString(36).substr(2, 9)}`;

  // Create badge wrapper
  const badge = doc.createElement('div');
  badge.id = badgeId;
  badge.setAttribute('data-applyengine-element', 'true');
  
  // Exclude from scanning/interfering with page layout
  Object.assign(badge.style, {
    position: 'absolute',
    top: `${window.scrollY + rect.top}px`,
    left: `${window.scrollX + rect.right - 100}px`,
    zIndex: '2147483647',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#1e1e2e',
    border: '1px solid #f59e0b',
    borderRadius: '6px',
    padding: '4px 8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
    fontSize: '11px',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: '#f59e0b',
    userSelect: 'none',
    pointerEvents: 'auto',
    animation: 'applyengine-bounce 1s infinite alternate'
  });

  // Inject animation keyframes if not present
  if (!doc.getElementById('applyengine-styles')) {
    const style = doc.createElement('style');
    style.id = 'applyengine-styles';
    style.textContent = `
      @keyframes applyengine-bounce {
        from { transform: translateY(0); }
        to { transform: translateY(-4px); }
      }
    `;
    doc.head.appendChild(style);
  }

  // Set element outline
  el.style.outline = '2px dashed #f59e0b';
  el.setAttribute('data-applyengine-badge-id', badgeId);

  // Text label
  const text = doc.createElement('span');
  text.textContent = '🔒 National ID';
  text.style.fontWeight = '600';
  badge.appendChild(text);

  // Confirm Button
  const btn = doc.createElement('button');
  btn.textContent = 'Confirm';
  Object.assign(btn.style, {
    backgroundColor: '#f59e0b',
    border: 'none',
    borderRadius: '4px',
    color: '#111116',
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: 'bold',
    padding: '2px 6px',
    transition: 'background-color 0.2s'
  });
  
  btn.onmouseover = () => btn.style.backgroundColor = '#fbbf24';
  btn.onmouseout = () => btn.style.backgroundColor = '#f59e0b';
  
  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (onConfirm) onConfirm();
    
    // Success feedback
    el.style.outline = '2px solid #22c55e';
    setTimeout(() => {
      el.style.outline = '';
    }, 2000);
    
    badge.remove();
    el.removeAttribute('data-applyengine-badge-id');
  };
  
  badge.appendChild(btn);
  doc.body.appendChild(badge);

  // Update badge position on window resize/scroll
  const reposition = () => {
    const freshRect = el.getBoundingClientRect();
    badge.style.top = `${window.scrollY + freshRect.top}px`;
    badge.style.left = `${window.scrollX + freshRect.right - 100}px`;
  };
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition);

  // Clean up reposition handlers when badge is removed
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (Array.from(m.removedNodes).includes(badge)) {
        window.removeEventListener('resize', reposition);
        window.removeEventListener('scroll', reposition);
        observer.disconnect();
      }
    }
  });
  observer.observe(doc.body, { childList: true });
}

function removeExistingTags(el: HTMLElement) {
  const badgeId = el.getAttribute('data-applyengine-badge-id');
  if (badgeId) {
    const doc = el.ownerDocument || document;
    const badge = doc.getElementById(badgeId);
    if (badge) badge.remove();
    el.removeAttribute('data-applyengine-badge-id');
  }
}
