import { extractSignals } from '../dom/signal-extractor.js';
import { detectRepeatedBlocks } from '../dom/repeated-block.js';
import { saveLearnedRule, saveLearnedProfileValue } from '../../shared/storage/learned-store.js';
import { setNativeValue } from '../fill/native-setter.js';
import { fillSelect } from '../fill/select-filler.js';

let isMappingActive = false;
let hoverTarget: HTMLElement | null = null;

const MAPPER_STYLE_ID = 'formfilla-mapper-styles';
const PANEL_ID = 'formfilla-learning-panel';

function injectStyles() {
  if (document.getElementById(MAPPER_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = MAPPER_STYLE_ID;
  style.textContent = `
    .formfilla-hover-target {
      outline: 2px dashed #6366f1 !important;
      outline-offset: 2px !important;
      cursor: crosshair !important;
      box-shadow: 0 0 8px rgba(99, 102, 241, 0.4) !important;
      transition: outline 0.1s ease, box-shadow 0.1s ease !important;
    }

    #${PANEL_ID} {
      position: absolute;
      z-index: 10000000;
      background: #1e1e2e;
      color: #cdd6f4;
      border: 1px solid #45475a;
      border-radius: 12px;
      padding: 16px;
      width: 320px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
    }

    #${PANEL_ID} h4 {
      margin: 0 0 12px 0;
      color: #f5c2e7;
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    #${PANEL_ID} .signal-row {
      font-size: 12px;
      color: #a6adc8;
      background: #313244;
      padding: 6px 10px;
      border-radius: 6px;
      margin-bottom: 12px;
      word-break: break-all;
    }

    #${PANEL_ID} .input-group {
      margin-bottom: 12px;
    }

    #${PANEL_ID} label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      color: #bac2de;
    }

    #${PANEL_ID} input, #${PANEL_ID} select {
      width: 100%;
      box-sizing: border-box;
      background: #313244;
      border: 1px solid #45475a;
      color: #cdd6f4;
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s ease;
    }

    #${PANEL_ID} input:focus, #${PANEL_ID} select:focus {
      border-color: #cba6f7;
    }

    #${PANEL_ID} .actions-row {
      display: flex;
      gap: 10px;
      margin-top: 16px;
    }

    #${PANEL_ID} button {
      flex: 1;
      padding: 10px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 13px;
      border: none;
      cursor: pointer;
      transition: opacity 0.2s ease;
    }

    #${PANEL_ID} button:hover {
      opacity: 0.9;
    }

    #${PANEL_ID} .btn-save {
      background: #cba6f7;
      color: #11111b;
    }

    #${PANEL_ID} .btn-cancel {
      background: #313244;
      color: #cdd6f4;
      border: 1px solid #45475a;
    }
  `;
  document.head.appendChild(style);
}

export function startInteractiveMapping() {
  if (isMappingActive) return;
  isMappingActive = true;
  injectStyles();

  document.body.addEventListener('mouseover', handleMouseOver, true);
  document.body.addEventListener('mouseout', handleMouseOut, true);
  document.body.addEventListener('click', handleClick, true);
}

function stopInteractiveMapping() {
  isMappingActive = false;
  document.body.removeEventListener('mouseover', handleMouseOver, true);
  document.body.removeEventListener('mouseout', handleMouseOut, true);
  document.body.removeEventListener('click', handleClick, true);

  if (hoverTarget) {
    hoverTarget.classList.remove('formfilla-hover-target');
    hoverTarget = null;
  }
}

function handleMouseOver(e: MouseEvent) {
  if (!isMappingActive) return;
  const target = e.target as HTMLElement;
  if (
    target &&
    (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.hasAttribute('contenteditable')) &&
    !target.closest(`#${PANEL_ID}`)
  ) {
    if (hoverTarget && hoverTarget !== target) {
      hoverTarget.classList.remove('formfilla-hover-target');
    }
    hoverTarget = target;
    hoverTarget.classList.add('formfilla-hover-target');
  }
}

function handleMouseOut(e: MouseEvent) {
  if (!isMappingActive) return;
  const target = e.target as HTMLElement;
  if (hoverTarget === target) {
    hoverTarget.classList.remove('formfilla-hover-target');
    hoverTarget = null;
  }
}

async function handleClick(e: MouseEvent) {
  if (!isMappingActive) return;
  const target = e.target as HTMLElement;
  if (
    target &&
    (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.hasAttribute('contenteditable')) &&
    !target.closest(`#${PANEL_ID}`)
  ) {
    e.preventDefault();
    e.stopPropagation();
    stopInteractiveMapping();

    const rect = target.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollX = window.scrollX || window.pageXOffset;

    createLearningPanel(target, rect.left + scrollX, rect.bottom + scrollY + 8);
  }
}

function createLearningPanel(target: HTMLElement, x: number, y: number) {
  removeLearningPanel();

  const blocks = detectRepeatedBlocks(document.body);
  const signals = extractSignals(target, blocks);

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.left = `${x}px`;
  panel.style.top = `${y}px`;

  const labelText = signals.label || signals.placeholder || signals.name || signals.id || 'Field';

  panel.innerHTML = `
    <h4>
      <span>Learn Field</span>
      <span style="font-size: 11px; background: #eba0ac; color: #11111b; padding: 2px 6px; border-radius: 4px;">Dynamic Map</span>
    </h4>
    <div class="signal-row">
      <strong>Detected:</strong> "${labelText}"<br/>
      <strong>TagName:</strong> ${target.tagName} (${target.getAttribute('type') || 'text'})
    </div>
    
    <div class="input-group">
      <label for="formfilla-map-key-select">Choose Profile Destination:</label>
      <select id="formfilla-map-key-select">
        <option value="">-- Select Key or Choose Learned --</option>
        <optgroup label="Personal Info">
          <option value="personal.firstName">First Name</option>
          <option value="personal.lastName">Last Name</option>
          <option value="personal.middleName">Middle Name</option>
          <option value="personal.mobilePhone">Mobile Phone</option>
          <option value="personal.phone">Phone</option>
          <option value="personal.email">Email</option>
          <option value="personal.dateOfBirth">Birth Date</option>
          <option value="personal.nationalId">ID Number (CNIC)</option>
          <option value="personal.nationalIdType">ID Type</option>
          <option value="personal.otherQualifications">Other Qualifications</option>
        </optgroup>
        <optgroup label="Repeated Arrays (Use index like [0])">
          <option value="experience[0].company">Experience 1 - Company</option>
          <option value="experience[0].title">Experience 1 - Title</option>
          <option value="education[0].school">Education 1 - School</option>
          <option value="references[0].name">Reference 1 - Name</option>
        </optgroup>
        <optgroup label="Learned / Custom Section">
          <option value="personal.customField">Learned Fields Tab</option>
        </optgroup>
      </select>
    </div>

    <div class="input-group">
      <label for="formfilla-map-key-custom">Or enter custom Profile Key:</label>
      <input type="text" id="formfilla-map-key-custom" placeholder="e.g. personal.fatherSpouse" value=""/>
    </div>

    <div class="input-group">
      <label for="formfilla-map-value">Enter Value to fill &amp; save:</label>
      <input type="text" id="formfilla-map-value" placeholder="Value to fill..." value=""/>
    </div>

    <div class="actions-row">
      <button class="btn-cancel" id="formfilla-btn-cancel">Cancel</button>
      <button class="btn-save" id="formfilla-btn-save">Learn &amp; Fill</button>
    </div>
  `;

  document.body.appendChild(panel);

  const select = panel.querySelector('#formfilla-map-key-select') as HTMLSelectElement;
  const customInput = panel.querySelector('#formfilla-map-key-custom') as HTMLInputElement;
  const valueInput = panel.querySelector('#formfilla-map-value') as HTMLInputElement;

  select.addEventListener('change', () => {
    if (select.value) {
      customInput.value = select.value;
    }
  });

  panel.querySelector('#formfilla-btn-cancel')?.addEventListener('click', removeLearningPanel);

  panel.querySelector('#formfilla-btn-save')?.addEventListener('click', async () => {
    const finalKey = customInput.value.trim();
    const finalVal = valueInput.value;

    if (!finalKey) {
      alert('Please select or enter a profile key path.');
      return;
    }

    try {
      // 1. Save the custom learned matching rule
      await saveLearnedRule(finalKey, signals.label || '', signals.name || '', signals.id || '');
      
      // 2. Save the value to the profile in storage
      await saveLearnedProfileValue(finalKey, finalVal);

      // 3. Fill the element on the page immediately!
      if (target.tagName === 'SELECT') {
        fillSelect(target as HTMLSelectElement, finalVal);
      } else if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        setNativeValue(target as HTMLInputElement | HTMLTextAreaElement, finalVal);
      }

      // Send telemetry/sync info experimentally (anonymized signals only!)
      sendExperimentalTelemetry(finalKey, signals);

      removeLearningPanel();
    } catch (err) {
      console.error('FormFilla: error saving learned mapping', err);
      alert('Failed to save learning mapping.');
    }
  });
}

function removeLearningPanel() {
  const panel = document.getElementById(PANEL_ID);
  if (panel) {
    panel.remove();
  }
}

function sendExperimentalTelemetry(key: string, signals: any) {
  // Anonymized signals metadata only (no user values!)
  try {
    const telemetryData = {
      key,
      tagName: signals.tagName,
      type: signals.type,
      label: signals.label,
      name: signals.name,
      id: signals.id,
      timestamp: new Date().toISOString()
    };
    // Experimental post to simple public endpoint
    fetch('https://httpbin.org/post', {
      method: 'POST',
      body: JSON.stringify(telemetryData),
      headers: { 'Content-Type': 'application/json' }
    }).catch(() => {});
  } catch {
    // Graceful telemetry fallback
  }
}
