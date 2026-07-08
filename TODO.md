Add suppprot for the dropdowns.

To make the JSON template fully comprehensive, you would need to add the following arrays and fields:

### 1. New Top-Level Arrays & Objects to Add

- **`projects` (Array):** Needed to capture your extensive "Open Source & Architectural Portfolio". This would include projects like _Fractal_, _B-Companion_, _Noria_, _ThreadRace_, and _Parchment_ along with their descriptions and tech stacks. Along with thier links

- **`certifications` (Array):** Needed to capture your "Licenses & Certifications" and "Professional Qualifications". This would store your PMI Generative AI credentials, Microsoft Applied Skills (C#), Introduction to Six Sigma, and Smart Chatbot Engineering.

- **`skills` (Object or Array):** Needed to capture your "Technical Expertise". You have highly categorized skills (Programming Languages, Machine Learning & AI, Markup/Scripting, Hardware, Architecture & Paradigms, Tools/IDEs) that the current JSON cannot store.

- **`languages` (Array):** Needed to capture both the "Languages" listed on your CV (English, Urdu) and the "Foreign Languages" entry from your application form (French).

- **`awardsAndAchievements` (Array):** Needed to capture your "Leadership & Achievements" section, including your role as Head Systems Architect at Air University SE Society, your 1st Place Titles in UI/UX and Logo Design, and your wins at GameZilla Fest. It could also house your "Silver Medalist" status.

- **`coursework` (Array):** Needed to capture your "Relevant Coursework" (e.g., Software Design & Architecture, Data Structures & Algorithms, Natural Language Processing).

### 2. Missing Fields Within Existing Objects

- **Inside the `personal` object:**
- **`title`:** The application form specifically asks for a Title (e.g., "Mr"), which is missing from the JSON's personal block.
- **`dateOfBirth`:** The application form requires a Birth Date ("23 / Feb / 2004"), but the JSON template only asks for a National ID without a field for birth date.

Also, My FYP too (which is the Fractal).

Also, my CNIC number (if there's any rule that you don't have to autfofill it, remove that hardcoded, and make a toggle button, which will be on by default; so it'll fill these deatials too autmoatically.).
