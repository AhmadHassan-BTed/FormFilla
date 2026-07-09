# Google Chrome Web Store Listing Fields - FormFilla

Use the fields below to fill out the Chrome Extension Store listing on the Google Chrome Web Store Developer Console.

---

##  Product Details

### Title
```text
FormFilla
```
*(From manifest.json/package.json, max 45 characters)*

### Summary
```text
Fills job application forms from local JSON profile data. No AI, no network calls.
```
*(From manifest.json/package.json, max 132 characters)*

### Description
```text
FormFilla fills job application forms from locally stored profile data—fast, privacy-respecting, and designed to reduce copy/paste fatigue for every modern job seeker.

It runs entirely in your browser: no trackers, no external APIs, and no data leaves your device.

How it works (high level):
1) Scans the page DOM to detect relevant inputs/selects and repeated form blocks.
2) Normalizes field signals (labels/attributes) and matches them against your local profile.
3) Uses a globally optimal bipartite matching engine (Hungarian/Kuhn-Munkres) to reduce field misalignment.
4) Writes values using framework-safe native setter handling + bubbling events so modern sites update reliably.
5) Highlights filled fields for quick human review and confidence.

Key Features:
- Local-first by design: Uses chrome.storage.local (and in-browser storage) only.
- Globally optimal field matching: reduces mis-filled fields vs greedy heuristics.
- Framework-safe input injection: works on React/Vue/Angular-style controlled components.
- Repeated block detection: handles repeated sections like multiple jobs, degrees, or certifications.
- File transfer simulation: supports resume/cover-letter style transfers via synthetic DataTransfer (where supported by the target site).
- Sensitivity gating: avoids auto-filling critical fields unless explicitly enabled/confirmed in settings.

Why install:
Stop wasting hours retyping your experience. Keep your data on-device and improve accuracy across ATS-style forms.
```
*(Focuses on what the item does and why users should install it. Max 16,000 characters)*

### Category
```text
Productivity > Tools
```
*(Suggested primary choice for form automation. If you prefer a user-experience/assistance category, you can also consider Accessibility.)*

### Language
```text
English
```
*(Primary language of the extension listing)*

---

##  Graphic Assets

All graphic assets below have been prepared to meet the Chrome Web Store format requirements. They are saved in the [store_assets](./store_assets) folder.

### Screenshot / Promo Asset Check
If any of the required screenshots or tiles are missing in your `store_assets` folder, you must create them first and place them into the folder, using these exact filenames:

- `store_assets/screenshots/screenshot1.png`
- `store_assets/screenshots/screenshot2.png`
- `store_assets/screenshots/screenshot3.png`

If you cannot make multiple, provide at least `screenshot1.png`.

> Requirement recap (Chrome Web Store):
- **Screenshots**: 1280x800 or 640x400 (JPEG or 24-bit PNG without alpha channel). Up to 5 screenshots. At least 1 is required.
- **Store Icon**: 128x128 pixels (PNG/JPEG)
- **Small Promo Tile**: 440x280 Canvas (JPEG or 24-bit PNG without alpha channel)
- **Marquee Promo Tile**: 1400x560 Canvas (JPEG or 24-bit PNG without alpha channel)

### Store Icon
- **Requirement**: 128x128 pixels (PNG/JPEG)
- **Path to upload**: [store_assets/store_icon.png](./store_assets/store_icon.png)
- **Properties**: 128x128, 32-bit PNG (with transparency support)

### Global Promo Video
- **Requirement**: YouTube URL (Optional)
- **Value**: *None* (Leave empty)

### Screenshots
- **Requirement**: 1280x800 or 640x400 (JPEG or 24-bit PNG without alpha channel). Up to 5 screenshots. At least 1 is required.
- **Paths to upload**:
  1. [store_assets/screenshots/screenshot1.png](./store_assets/screenshots/screenshot1.png) (1280x800, 24-bit RGB PNG)
  2. [store_assets/screenshots/screenshot2.png](./store_assets/screenshots/screenshot2.png) (1280x800, 24-bit RGB PNG)
  3. [store_assets/screenshots/screenshot3.png](./store_assets/screenshots/screenshot3.png) (1280x800, 24-bit RGB PNG)

### Small Promo Tile
- **Requirement**: 440x280 Canvas (JPEG or 24-bit PNG without alpha channel)
- **Path to upload**: [store_assets/small_promo_tile.png](./store_assets/small_promo_tile.png)
- **Properties**: 440x280, 24-bit RGB PNG

### Marquee Promo Tile
- **Requirement**: 1400x560 Canvas (JPEG or 24-bit PNG without alpha channel)
- **Path to upload**: [store_assets/marquee_promo_tile.png](./store_assets/marquee_promo_tile.png)
- **Properties**: 1400x560, 24-bit RGB PNG

---

##  Additional Fields

### Official URL
- **Value**: *None* (Leave empty unless associated with a verified website in your Google Search Console)

### Homepage URL
- **Value**: `https://github.com/AhmadHassan-BTed/FormFilla`
- **Link**: [GitHub Repository](https://github.com/AhmadHassan-BTed/FormFilla)

### Support URL
- **Value**: `https://github.com/AhmadHassan-BTed/FormFilla/issues`
- **Link**: [Issues Tracker](https://github.com/AhmadHassan-BTed/FormFilla/issues)

### Mature Content
- **Value**: `No`
*(Does not contain mature, violent, or suggestive content)*

### Item Support
- **Value**: `Turn On`
*(Allows users to ask questions and report bugs directly on your store listing)*

---

##  Privacy Practices & Permissions Justifications

Go to the **Privacy practices** tab in the Chrome Web Store Developer Console to fill in these fields:

### 1. Single Purpose Description
```text
The single purpose of FormFilla is to help users accurately fill job application forms using locally stored profile data, reducing copy/paste effort while keeping all processing on-device.
```

### 2. Permission Justifications
Provide these reasons in the text boxes next to each declared permission.

- **`activeTab`**:
  ```text
  Required to temporarily access the active page context only when the user clicks the extension UI to apply their profile data to the current form.
  ```

- **`storage`**:
  ```text
  Required to store the user’s profile JSON and extension settings locally in the browser (chrome.storage.local / in-extension storage).
  ```

- **`scripting`**:
  ```text
  Required to inject the content script and run the form scanning/matching/injection logic on the current page when the user initiates autofill.
  ```

- **`host_permissions` / `<all_urls>`** (optional, if declared):
  ```text
  Required to allow FormFilla to run on all job/applicant form pages the user chooses, so the extension can scan and fill inputs on the active site.
  ```

### 3. Remote Code Use Justification
- **Question**: "Are you using remote code?"
- **Answer**: Select **No, I am not using Remote code**.
- **Justification / Explanation** *(if prompted)*:
  ```text
  The extension runs 100% locally. All scripts, stylesheets, and assets are packaged within the extension, and no external code is loaded at runtime.
  ```

### 4. Data Usage Disclosures
- **Question**: "What user data do you plan to collect from users now or in the future?"
- **Answer**: **DO NOT check any boxes**. Leave all categories (Personally identifiable information, Health, Financial, etc.) completely **UNCHECKED**, as the extension operates strictly locally and does not collect or transmit user data.

- **Data Compliance Certifications**:
  Check **all three** boxes at the bottom:
  1. `[x]` *I do not sell or transfer user data to third parties, outside of the approved use cases*
  2. `[x]` *I do not use or transfer user data for purposes that are unrelated to my item's single purpose*
  3. `[x]` *I do not use or transfer user data to determine creditworthiness or for lending purposes*

### 5. Privacy Policy URL
- **Field**: `Privacy policy URL*`
- **Value**:
  ```text
  https://github.com/AhmadHassan-BTed/FormFilla/blob/main/PRIVACY.md
  ```
*(Update username/default branch if your repo differs.)*

---

##  Settings Page Setup

Go to the **Settings** tab in the developer console and complete the following steps to resolve contact email and trader verification errors:

### 1. Developer Communication (Email)
1. Find the **Publisher email** text box.
2. Enter your public publisher/contact email address.
3. Click **Save** at the top right.
4. Go to your email inbox, find the verification email sent by Google Chrome Web Store Developer Support, and click the confirmation link.

### 2. Trader Declaration (EEA Consumer Laws)
- **Field**: `Declare if your publisher account is considered a trader or non-trader...`
- **Value**: Select **This is a non-trader account**.
- **Reason**: Since FormFilla is a free, open-source tool built as a student project with no monetization, ads, or commercial services, you are legally considered a **non-trader**.


