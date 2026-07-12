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
 Fills job application forms from local JSON profile data. No AI, local-first.
 ```
 *(From manifest.json/package.json, max 132 characters)*
 
 ### Description
 ```text
 FormFilla is a local-first form engine that fills **all major application forms** (job applications, scholarships, admissions, internships, and other multi-section enrollment forms) from your **locally stored profile data**—fast, accurate, and designed to reduce copy/paste fatigue.
 
 It runs entirely in your browser: **no trackers, and your profile data never leaves your device**. The extension only makes public GitHub API calls for optional project support verification.
 
 How it works (high level):
1) Scans the page DOM to detect relevant inputs/selects and repeated form blocks (experience history, education entries, certifications, references, achievements, etc.).
2) Normalizes field signals (labels/attributes/IDs) and matches them against your local profile.
3) Uses a globally optimal field-mapping engine (Hungarian/Kuhn-Munkres) to reduce misalignment across complex forms.
4) Writes values using **framework-safe** native setter handling + bubbling events so modern sites update reliably (React/Vue/Angular-style controlled components).
5) Highlights what was filled so you can quickly review and confirm.

Key Features:
- **Local-first privacy**: stores your profile + settings locally (chrome.storage.local / in-extension storage) only.
- **Advanced matching**: globally optimal mapping (not greedy heuristics) to keep fields aligned across long forms.
- **Framework-safe injection**: updates controlled inputs correctly on modern web UIs.
- **Repeated-section support**: handles multiple entries (e.g., multiple jobs, degrees, coursework, certifications, awards, languages).
- **Sensitive-field protections**: avoids auto-filling critical identifiers unless your settings explicitly allow/confirm it.
- **File upload support (where available)**: simulates file selection via synthetic DataTransfer streams for sites that accept it.

Why install:
FormFilla helps you submit applications faster while keeping your data on-device—so you spend time on your story, not retyping the same details.


```
*(Focuses on what the item does and why users should install it. Max 16,000 characters)*

### Category
```text
Productivity > Tools
```
*(Suggested primary choice for form automation. If you prefer, you can also consider Accessibility.)*

### Language
```text
English
```
*(Primary language of the extension listing)*

---

## Graphic Assets

All graphic assets below have been prepared to meet the Chrome Web Store format requirements. They are saved in the [store_assets](./store_assets) folder.

###  Screenshot / Promo Asset Check (YOU must provide these files)
The repository currently includes only the extension icons (e.g., `icons/icon-16.png`, `icons/icon-32.png`, ...). If your `store_assets/` folder does not already contain the required store media, you must create them.

Create and place them into `store_assets/` using these exact filenames:

- `store_assets/store_icon.png` (128x128 PNG/JPG)
- `store_assets/screenshots/screenshot1.png` (1280x800 or 640x400)
- `store_assets/screenshots/screenshot2.png` (same size rule)
- `store_assets/screenshots/screenshot3.png` (same size rule)
- `store_assets/small_promo_tile.png` (440x280 PNG/JPG)
  - Use the provided `store_assets/small_promo_tile.png` (small_promo_tile.png) placed in the store listing assets.
- `store_assets/marquee_promo_tile.png` (1400x560 PNG/JPG)


> Requirement recap (Chrome Web Store):
- **Screenshots**: 1280x800 or 640x400 (JPEG or 24-bit PNG without alpha). Up to 5 screenshots. **At least 1 is required.**
- **Store Icon**: 128x128 pixels (PNG/JPEG)
- **Small Promo Tile**: 440x280 canvas (24-bit PNG without alpha)
- **Marquee Promo Tile**: 1400x560 canvas (24-bit PNG without alpha)

---

##  Additional Fields

### Official URL
- **Value**: *None*

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

- **`activeTab`**
  ```text
  Required to temporarily access the active page context only when the user clicks the extension UI to apply their profile data to the current form.
  ```

- **`storage`**
  ```text
  Required to store the user’s profile JSON and extension settings locally in the browser (chrome.storage.local / in-extension storage).
  ```

- **`scripting`**
  ```text
  Required to run the content script logic that scans the current page, matches fields, and injects user profile values when the user initiates autofill.
  ```

- **`host_permissions` / `https://api.github.com/*`**
  ```text
  Required for the optional GitHub support verification feature: checks if the user has starred all required repositories and follows the project accounts. Uses only public GitHub API endpoints with no user data transmitted.
  ```

- **`host_permissions` / `https://*.googleapis.com/*` & `https://*.firebaseio.com/*`**
  ```text
  Required to anonymously connect to the crowdsourced rules sync Firestore database. Allows fetching dynamic matching rules and uploading custom learned element mapping rules in the background.
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
- **Answer**: Leave all categories completely **UNCHECKED**, since the extension operates locally. The only outbound sync is user-contributed form rules (anonymized tag names, field names, and regex patterns), which contains no personal, identifying, or profile details.

- **Data Compliance Certifications**:
  Check **all three** boxes at the bottom:
  1. `[x]` I do not sell or transfer user data to third parties, outside of the approved use cases
  2. `[x]` I do not use or transfer user data for purposes that are unrelated to my item's single purpose
  3. `[x]` I do not use or transfer user data to determine creditworthiness or for lending purposes

### 5. Privacy Policy URL
- **Field**: `Privacy policy URL*`
- **Value**:
  ```text
  https://github.com/AhmadHassan-BTed/FormFilla/blob/main/PRIVACY.md
  ```
*(If `PRIVACY.md` is not in your repo yet, create it and link to the correct branch.)*

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
- **Reason**: Since FormFilla is a free, open-source tool built as a student/side project with no monetization, ads, or commercial services, you are legally considered a **non-trader**.

