import { getProfile, saveProfile, saveFileBlob } from '../shared/storage/storage-client.js';
import { Profile, EducationEntry, ExperienceEntry, ReferenceEntry, DocumentFile, LanguageEntry, CertificationEntry, ProjectEntry, AwardEntry } from '../shared/types/index.js';
import EXTENSIVE_PROFILE_TEMPLATE from '../shared/dictionary/profile-template.json' with { type: 'json' };
import { getActivationStatus } from '../shared/storage/activation-status.js';
import { setupActivationStatusUI } from './activation-status.js';

import { buildNewIssueUrl } from '../shared/storage/feedback.js';


let currentProfile: Profile;
const uploadedFiles: Record<string, { file: File; buffer: ArrayBuffer }> = {};

document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupThemeSelection();
  await loadProfileData();
  setupDynamicLists();
  setupFilePickers();
  setupGithubVerification();
  setupGithubDeviceAuth();
  await setupActivationStatusUI();

  setupSupportFeedback();

  setupBackupRestore();


  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  saveBtn.addEventListener('click', saveAllProfileData);
  await renderDynamicCustomFields().catch(err => console.error('Failed to load dynamic custom fields', err));
});

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.content-section');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetSection = item.getAttribute('data-section');

      navItems.forEach(nav => nav.classList.remove('active'));
      sections.forEach(sec => sec.classList.remove('active'));

      item.classList.add('active');
      const activeSection = document.getElementById(`section-${targetSection}`);
      if (activeSection) {
        activeSection.classList.add('active');
      }
    });
  });
}

function applyTheme(theme: string) {
  let themeLink = document.getElementById('theme-link') as HTMLLinkElement;
  if (!themeLink) {
    themeLink = document.createElement('link');
    themeLink.id = 'theme-link';
    themeLink.rel = 'stylesheet';
    document.head.appendChild(themeLink);
  }
  themeLink.href = `../themes/theme-${theme}.css`;
}

function setupThemeSelection() {
  const themeSelect = document.getElementById('settings-theme') as HTMLSelectElement;
  if (!themeSelect) return;

  chrome.storage.local.get(['theme'], (result) => {
    const theme = (result as any).theme || 'brutalist-dark';
    themeSelect.value = theme as string;
  });

  themeSelect.addEventListener('change', () => {
    const selectedTheme = themeSelect.value;
    chrome.storage.local.set({ theme: selectedTheme }, () => {
      applyTheme(selectedTheme);
    });
  });
}

async function loadProfileData() {
  currentProfile = await getProfile();

  setInputValue('personal-firstName', currentProfile.personal.firstName);
  setInputValue('personal-lastName', currentProfile.personal.lastName);
  setInputValue('personal-middleName', currentProfile.personal.middleName);
  setInputValue('personal-email', currentProfile.personal.email);
  setInputValue('personal-phone', currentProfile.personal.phone);
  setInputValue('personal-nationalId', currentProfile.personal.nationalId);
  setInputValue('personal-namePrefix', currentProfile.personal.namePrefix);
  setInputValue('personal-dateOfBirth', currentProfile.personal.dateOfBirth);
  setInputValue('personal-cnicNumber', currentProfile.personal.cnicNumber);
  setInputValue('personal-passportNumber', currentProfile.personal.passportNumber);
  setInputValue('personal-summary', currentProfile.personal.summary);

  if (currentProfile.address) {
    setInputValue('address-street', currentProfile.address.street);
    setInputValue('address-city', currentProfile.address.city);
    setInputValue('address-state', currentProfile.address.state);
    setInputValue('address-postalCode', currentProfile.address.postalCode);
    setInputValue('address-country', currentProfile.address.country);
  }

  if (currentProfile.links) {
    setInputValue('links-linkedin', currentProfile.links.linkedin);
    setInputValue('links-github', currentProfile.links.github);
    setInputValue('links-portfolio', currentProfile.links.portfolio);
  }

  if (currentProfile.workAuthorization) {
    setCheckboxValue('work-authorized', currentProfile.workAuthorization.authorizedInUS);
    setCheckboxValue('work-sponsorship', currentProfile.workAuthorization.requiresSponsorship);
    setInputValue('work-visaType', currentProfile.workAuthorization.visaType);
  }

  if (currentProfile.academics) {
    setInputValue('academics-greVerbal', currentProfile.academics.greVerbal);
    setInputValue('academics-greQuant', currentProfile.academics.greQuant);
    setInputValue('academics-greWriting', currentProfile.academics.greWriting);
    setInputValue('academics-greTotal', currentProfile.academics.greTotal);
    setInputValue('academics-toeflTotal', currentProfile.academics.toeflTotal);
    setInputValue('academics-ieltsBand', currentProfile.academics.ieltsBand);
    setInputValue('academics-satTotal', currentProfile.academics.satTotal);
    setInputValue('academics-actTotal', currentProfile.academics.actTotal);
    setInputValue('academics-classRank', currentProfile.academics.classRank);
    setInputValue('academics-proposedAdvisor', currentProfile.academics.proposedAdvisor);
    setInputValue('academics-researchInterests', currentProfile.academics.researchInterests);
    setInputValue('academics-annualHouseholdIncome', currentProfile.academics.annualHouseholdIncome);
    setCheckboxValue('academics-fundingRequired', currentProfile.academics.fundingRequired);

    // GKS & Scholarship specific
    setInputValue('academics-applicationTrack', currentProfile.academics.applicationTrack);
    setInputValue('academics-recommendedEmbassy', currentProfile.academics.recommendedEmbassy);
    setInputValue('academics-applicationProgram', currentProfile.academics.applicationProgram);
    setInputValue('academics-degreeProgram', currentProfile.academics.degreeProgram);
    setInputValue('academics-desiredFieldOfStudy', currentProfile.academics.desiredFieldOfStudy);
    setInputValue('academics-koreanCitizenshipApplicant', currentProfile.academics.koreanCitizenshipApplicant);
    setInputValue('academics-koreanCitizenshipParent', currentProfile.academics.koreanCitizenshipParent);
    setInputValue('academics-topikLevel', currentProfile.academics.topikLevel);
    setInputValue('academics-topikTestHeld', currentProfile.academics.topikTestHeld);
    setInputValue('academics-topikTestDate', currentProfile.academics.topikTestDate);
    setInputValue('academics-highSchoolName', currentProfile.academics.highSchoolName);
    setInputValue('academics-highSchoolLocation', currentProfile.academics.highSchoolLocation);
    setInputValue('academics-highSchoolGraduationYear', currentProfile.academics.highSchoolGraduationYear);
    setInputValue('academics-bachelorsThesisTitle', currentProfile.academics.bachelorsThesisTitle);
    setInputValue('academics-bachelorsPublications', currentProfile.academics.bachelorsPublications);
    setInputValue('academics-mastersUniversityName', currentProfile.academics.mastersUniversityName);
    setInputValue('academics-mastersLocation', currentProfile.academics.mastersLocation);
    setInputValue('academics-mastersMajor', currentProfile.academics.mastersMajor);
    setInputValue('academics-mastersGraduationDate', currentProfile.academics.mastersGraduationDate);
    setInputValue('academics-mastersThesisTitle', currentProfile.academics.mastersThesisTitle);
    setInputValue('academics-mastersPublications', currentProfile.academics.mastersPublications);
    setInputValue('academics-doctoralUniversityName', currentProfile.academics.doctoralUniversityName);
    setInputValue('academics-doctoralLocation', currentProfile.academics.doctoralLocation);
    setInputValue('academics-doctoralMajor', currentProfile.academics.doctoralMajor);
    setInputValue('academics-doctoralGraduationDate', currentProfile.academics.doctoralGraduationDate);
    setInputValue('academics-doctoralDissertationTitle', currentProfile.academics.doctoralDissertationTitle);
    setInputValue('academics-doctoralPublications', currentProfile.academics.doctoralPublications);
    setInputValue('academics-cgpaScale', currentProfile.academics.cgpaScale);
    setInputValue('academics-scorePercentile', currentProfile.academics.scorePercentile);
    setInputValue('academics-personalStatement', currentProfile.academics.personalStatement);
    setInputValue('academics-studyPlan', currentProfile.academics.studyPlan);
    setInputValue('academics-futurePlanAfterStudy', currentProfile.academics.futurePlanAfterStudy);

    // Medical Evaluations
    setInputValue('academics-medicalInfectious', currentProfile.academics.medicalInfectious);
    setInputValue('academics-medicalAllergies', currentProfile.academics.medicalAllergies);
    setInputValue('academics-medicalHypertension', currentProfile.academics.medicalHypertension);
    setInputValue('academics-medicalDiabetes', currentProfile.academics.medicalDiabetes);
    setInputValue('academics-medicalHepatitis', currentProfile.academics.medicalHepatitis);
    setInputValue('academics-medicalMental', currentProfile.academics.medicalMental);
    setInputValue('academics-medicalAlcohol', currentProfile.academics.medicalAlcohol);
    setInputValue('academics-medicalNarcotics', currentProfile.academics.medicalNarcotics);
    setInputValue('academics-medicalHospitalized', currentProfile.academics.medicalHospitalized);
    setInputValue('academics-medicalSeriousInjury', currentProfile.academics.medicalSeriousInjury);
    setInputValue('academics-medicalVisualHearing', currentProfile.academics.medicalVisualHearing);
    setInputValue('academics-medicalPhysicalDisability', currentProfile.academics.medicalPhysicalDisability);
    setInputValue('academics-medicalCognitiveDisability', currentProfile.academics.medicalCognitiveDisability);
    setInputValue('academics-medicalPrescribedMedication', currentProfile.academics.medicalPrescribedMedication);
    setInputValue('academics-medicalSpecialDiet', currentProfile.academics.medicalSpecialDiet);
  }

  setCheckboxValue('settings-sensitiveEeo', currentProfile.optIns?.sensitiveEeo ?? true);
  setCheckboxValue('settings-autoFillCritical', currentProfile.optIns?.autoFillCritical ?? true);
  setCheckboxValue('settings-sensitiveFinancials', currentProfile.optIns?.sensitiveFinancials ?? true);
  setCheckboxValue('settings-sensitiveCompensation', currentProfile.optIns?.sensitiveCompensation ?? true);
  setCheckboxValue('settings-sensitiveMedical', currentProfile.optIns?.sensitiveMedical ?? true);

  renderFileDetails('resume', currentProfile.documents?.['documents.resume']);
  renderFileDetails('coverLetter', currentProfile.documents?.['documents.coverLetter']);
  renderFileDetails('photo', currentProfile.documents?.['documents.photo']);
  renderFileDetails('sop', currentProfile.documents?.['documents.sop']);
  renderFileDetails('researchProposal', currentProfile.documents?.['documents.researchProposal']);
  renderFileDetails('recommendationLetter', currentProfile.documents?.['documents.recommendationLetter']);
  // Load Portfolio & Skills tab fields
  const skillsText = Array.isArray(currentProfile.skills)
    ? currentProfile.skills.join(', ')
    : (currentProfile.skills ? JSON.stringify(currentProfile.skills) : '');
  setInputValue('portfolio-skills', skillsText);

  const courseworkText = Array.isArray(currentProfile.coursework)
    ? currentProfile.coursework.join(', ')
    : '';
  setInputValue('portfolio-coursework', courseworkText);
}

function setInputValue(id: string, value: any) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (el) el.value = value || '';
}

function setCheckboxValue(id: string, checked: any) {
  const el = document.getElementById(id) as HTMLInputElement;
  if (el) el.checked = !!checked;
}

function renderFileDetails(key: string, fileInfo: DocumentFile | undefined) {
  const detailsEl = document.getElementById(`${key}-details`);
  if (detailsEl) {
    if (fileInfo) {
      const sizeKB = Math.round(fileInfo.size / 1024);
      detailsEl.textContent = `Uploaded: ${fileInfo.name} (${sizeKB} KB)`;
      detailsEl.style.color = '#10b981';
    } else {
      detailsEl.textContent = 'No file uploaded';
      detailsEl.style.color = '';
    }
  }
}

function setupDynamicLists() {
  const eduContainer = document.getElementById('education-list')!;
  const addEduBtn = document.getElementById('add-education-btn')!;

  const expContainer = document.getElementById('experience-list')!;
  const addExpBtn = document.getElementById('add-experience-btn')!;

  const refContainer = document.getElementById('references-list')!;
  const addRefBtn = document.getElementById('add-reference-btn')!;

  const langContainer = document.getElementById('languages-list')!;
  const addLangBtn = document.getElementById('add-language-btn')!;

  const certContainer = document.getElementById('certifications-list')!;
  const addCertBtn = document.getElementById('add-certification-btn')!;

  const projContainer = document.getElementById('projects-list')!;
  const addProjBtn = document.getElementById('add-project-btn')!;

  const awardContainer = document.getElementById('awards-list')!;
  const addAwardBtn = document.getElementById('add-award-btn')!;

  if (currentProfile.education) {
    currentProfile.education.forEach(entry => addEducationRow(eduContainer, entry));
  }
  if (currentProfile.experience) {
    currentProfile.experience.forEach(entry => addExperienceRow(expContainer, entry));
  }
  if (currentProfile.references) {
    currentProfile.references.forEach(entry => addReferenceRow(refContainer, entry));
  }
  if (currentProfile.languages) {
    currentProfile.languages.forEach(entry => addLanguageRow(langContainer, entry));
  }
  if (currentProfile.certifications) {
    currentProfile.certifications.forEach(entry => addCertificationRow(certContainer, entry));
  }
  if (currentProfile.projects) {
    currentProfile.projects.forEach(entry => addProjectRow(projContainer, entry));
  }
  if (currentProfile.awardsAndAchievements) {
    currentProfile.awardsAndAchievements.forEach(entry => addAwardRow(awardContainer, entry));
  }

  addEduBtn.addEventListener('click', () => addEducationRow(eduContainer));
  addExpBtn.addEventListener('click', () => addExperienceRow(expContainer));
  addRefBtn.addEventListener('click', () => addReferenceRow(refContainer));
  addLangBtn.addEventListener('click', () => addLanguageRow(langContainer));
  addCertBtn.addEventListener('click', () => addCertificationRow(certContainer));
  addProjBtn.addEventListener('click', () => addProjectRow(projContainer));
  addAwardBtn.addEventListener('click', () => addAwardRow(awardContainer));
}

function addEducationRow(container: HTMLElement, data?: EducationEntry) {
  const card = document.createElement('div');
  card.className = 'card list-item-card grid-3';
  card.innerHTML = `
    <button type="button" class="remove-btn">Remove</button>
    <div class="form-group span-2">
      <label>School Name</label>
      <input type="text" class="edu-school" required placeholder="Harvard University" value="${data?.school || ''}">
    </div>
    <div class="form-group">
      <label>Degree</label>
      <input type="text" class="edu-degree" required placeholder="Bachelor of Science" value="${data?.degree || ''}">
    </div>
    <div class="form-group">
      <label>Field of Study (Major)</label>
      <input type="text" class="edu-major" required placeholder="Computer Science" value="${data?.fieldOfStudy || ''}">
    </div>
    <div class="form-group">
      <label>Start Date</label>
      <input type="text" class="edu-start" placeholder="yyyy-MM or Present" value="${data?.startDate || ''}">
    </div>
    <div class="form-group">
      <label>End/Graduation Date</label>
      <input type="text" class="edu-end" placeholder="yyyy-MM or Present" value="${data?.endDate || ''}">
    </div>
    <div class="form-group">
      <label>GPA</label>
      <input type="text" class="edu-gpa" placeholder="3.8 / 4.0" value="${data?.gpa || ''}">
    </div>
  `;
  card.querySelector('.remove-btn')!.addEventListener('click', () => card.remove());
  container.appendChild(card);
}

function addExperienceRow(container: HTMLElement, data?: ExperienceEntry) {
  const card = document.createElement('div');
  card.className = 'card list-item-card grid-3';
  card.innerHTML = `
    <button type="button" class="remove-btn">Remove</button>
    <div class="form-group">
      <label>Company / Employer</label>
      <input type="text" class="exp-company" required placeholder="Google" value="${data?.company || ''}">
    </div>
    <div class="form-group">
      <label>Job Title</label>
      <input type="text" class="exp-title" required placeholder="Software Engineer" value="${data?.title || ''}">
    </div>
    <div class="form-group">
      <label>Location</label>
      <input type="text" class="exp-location" placeholder="Mountain View, CA" value="${data?.location || ''}">
    </div>
    <div class="form-group">
      <label>Start Date</label>
      <input type="text" class="exp-start" placeholder="yyyy-MM or Present" value="${data?.startDate || ''}">
    </div>
    <div class="form-group">
      <label>End Date</label>
      <input type="text" class="exp-end" placeholder="yyyy-MM or Present" value="${data?.endDate || ''}">
    </div>
    <div class="form-group">
      <label>Role Description</label>
      <textarea class="exp-desc span-3" rows="3" placeholder="Designed and built scalable microservices...">${data?.description || ''}</textarea>
    </div>
  `;
  card.querySelector('.remove-btn')!.addEventListener('click', () => card.remove());
  container.appendChild(card);
}

function addReferenceRow(container: HTMLElement, data?: ReferenceEntry) {
  const card = document.createElement('div');
  card.className = 'card list-item-card grid-3';
  card.innerHTML = `
    <button type="button" class="remove-btn">Remove</button>
    <div class="form-group">
      <label>Full Name</label>
      <input type="text" class="ref-name" required placeholder="Alice Smith" value="${data?.name || ''}">
    </div>
    <div class="form-group">
      <label>Relationship</label>
      <input type="text" class="ref-relationship" required placeholder="Former Manager" value="${data?.relationship || ''}">
    </div>
    <div class="form-group">
      <label>Company</label>
      <input type="text" class="ref-company" placeholder="Acme Corp" value="${data?.company || ''}">
    </div>
    <div class="form-group">
      <label>Job Title</label>
      <input type="text" class="ref-title" placeholder="Engineering Director" value="${data?.title || ''}">
    </div>
    <div class="form-group">
      <label>Email Address</label>
      <input type="email" class="ref-email" placeholder="alice@acme.com" value="${data?.email || ''}">
    </div>
    <div class="form-group">
      <label>Phone Number</label>
      <input type="tel" class="ref-phone" placeholder="+1 (555) 012-3456" value="${data?.phone || ''}">
    </div>
  `;
  card.querySelector('.remove-btn')!.addEventListener('click', () => card.remove());
  container.appendChild(card);
}

function addLanguageRow(container: HTMLElement, data?: LanguageEntry) {
  const card = document.createElement('div');
  card.className = 'card list-item-card grid-2';
  card.innerHTML = `
    <button type="button" class="remove-btn">Remove</button>
    <div class="form-group">
      <label>Language</label>
      <input type="text" class="lang-name" required placeholder="English" value="${data?.language || ''}">
    </div>
    <div class="form-group">
      <label>Proficiency / Level</label>
      <input type="text" class="lang-proficiency" placeholder="e.g. Native, Professional Working, TOPIK Level 5" value="${data?.proficiency || ''}">
    </div>
  `;
  card.querySelector('.remove-btn')!.addEventListener('click', () => card.remove());
  container.appendChild(card);
}

function addCertificationRow(container: HTMLElement, data?: CertificationEntry) {
  const card = document.createElement('div');
  card.className = 'card list-item-card grid-3';
  card.innerHTML = `
    <button type="button" class="remove-btn">Remove</button>
    <div class="form-group span-2">
      <label>Certification Name</label>
      <input type="text" class="cert-name" required placeholder="e.g. PMI Generative AI Certified" value="${data?.name || ''}">
    </div>
    <div class="form-group">
      <label>Issuing Organization</label>
      <input type="text" class="cert-org" required placeholder="e.g. Project Management Institute" value="${data?.issuingOrganization || ''}">
    </div>
    <div class="form-group">
      <label>Issue Date</label>
      <input type="text" class="cert-issue-date" placeholder="e.g. 2024-05" value="${data?.issueDate || ''}">
    </div>
    <div class="form-group">
      <label>Expiration Date (if any)</label>
      <input type="text" class="cert-exp-date" placeholder="e.g. 2026-05" value="${data?.expirationDate || ''}">
    </div>
    <div class="form-group">
      <label>Credential ID</label>
      <input type="text" class="cert-id" placeholder="e.g. ID-123456" value="${data?.credentialId || ''}">
    </div>
  `;
  card.querySelector('.remove-btn')!.addEventListener('click', () => card.remove());
  container.appendChild(card);
}

function addProjectRow(container: HTMLElement, data?: ProjectEntry) {
  const card = document.createElement('div');
  card.className = 'card list-item-card grid-3';
  card.innerHTML = `
    <button type="button" class="remove-btn">Remove</button>
    <div class="form-group">
      <label>Project Name</label>
      <input type="text" class="proj-name" required placeholder="e.g. Fractal" value="${data?.name || ''}">
    </div>
    <div class="form-group">
      <label>Role</label>
      <input type="text" class="proj-role" placeholder="e.g. Head Architect" value="${data?.role || ''}">
    </div>
    <div class="form-group">
      <label>Project URL</label>
      <input type="text" class="proj-url" placeholder="e.g. https://github.com/..." value="${data?.url || ''}">
    </div>
    <div class="form-group span-3">
      <label>Description</label>
      <textarea class="proj-desc" rows="3" placeholder="Describe the project objective, tech stack, and architect details...">${data?.description || ''}</textarea>
    </div>
  `;
  card.querySelector('.remove-btn')!.addEventListener('click', () => card.remove());
  container.appendChild(card);
}

function addAwardRow(container: HTMLElement, data?: AwardEntry) {
  const card = document.createElement('div');
  card.className = 'card list-item-card grid-3';
  card.innerHTML = `
    <button type="button" class="remove-btn">Remove</button>
    <div class="form-group">
      <label>Award / Honor Title</label>
      <input type="text" class="award-title" required placeholder="e.g. 1st Place UI/UX Design" value="${data?.title || ''}">
    </div>
    <div class="form-group">
      <label>Issuing Organization</label>
      <input type="text" class="award-org" placeholder="e.g. Air University SE Society" value="${data?.organization || ''}">
    </div>
    <div class="form-group">
      <label>Date Awarded</label>
      <input type="text" class="award-date" placeholder="e.g. 2023-11" value="${data?.date || ''}">
    </div>
    <div class="form-group span-3">
      <label>Description / Details</label>
      <textarea class="award-desc" rows="2" placeholder="Provide extra detail about the achievement...">${data?.description || ''}</textarea>
    </div>
  `;
  card.querySelector('.remove-btn')!.addEventListener('click', () => card.remove());
  container.appendChild(card);
}


function setupFilePickers() {
  const filesList = ['resume', 'coverLetter', 'photo', 'sop', 'researchProposal', 'recommendationLetter', 'financialStatement'];
  filesList.forEach(key => {
    const picker = document.getElementById(`file-${key}`) as HTMLInputElement;
    if (picker) {
      picker.addEventListener('change', () => {
        const file = picker.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = async () => {
            if (reader.result instanceof ArrayBuffer) {
              uploadedFiles[`documents.${key}`] = {
                file,
                buffer: reader.result
              };
              renderFileDetails(key, {
                name: file.name,
                type: file.type,
                size: file.size,
                lastModified: file.lastModified
              });
            }
          };
          reader.readAsArrayBuffer(file);
        }
      });
    }
  });
}

async function saveAllProfileData() {
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const statusEl = document.getElementById('save-status')!;

  saveBtn.disabled = true;
  statusEl.textContent = 'Saving...';
  statusEl.style.color = '#f59e0b';

  try {
    const personal: any = {
      firstName: getInputValue('personal-firstName'),
      lastName: getInputValue('personal-lastName'),
      middleName: getInputValue('personal-middleName'),
      email: getInputValue('personal-email'),
      phone: getInputValue('personal-phone'),
      nationalId: getInputValue('personal-nationalId'),
      namePrefix: getInputValue('personal-namePrefix'),
      dateOfBirth: getInputValue('personal-dateOfBirth'),
      cnicNumber: getInputValue('personal-cnicNumber'),
      passportNumber: getInputValue('personal-passportNumber'),
      summary: getInputValue('personal-summary')
    };

    const address = {
      street: getInputValue('address-street'),
      city: getInputValue('address-city'),
      state: getInputValue('address-state'),
      postalCode: getInputValue('address-postalCode'),
      country: getInputValue('address-country')
    };

    const links = {
      linkedin: getInputValue('links-linkedin'),
      github: getInputValue('links-github'),
      portfolio: getInputValue('links-portfolio')
    };

    const workAuthorization = {
      authorizedInUS: getCheckboxValue('work-authorized'),
      requiresSponsorship: getCheckboxValue('work-sponsorship'),
      visaType: getInputValue('work-visaType')
    };

    const education: EducationEntry[] = [];
    const eduCards = document.querySelectorAll('#education-list .list-item-card');
    eduCards.forEach(card => {
      education.push({
        school: (card.querySelector('.edu-school') as HTMLInputElement).value,
        degree: (card.querySelector('.edu-degree') as HTMLInputElement).value,
        fieldOfStudy: (card.querySelector('.edu-major') as HTMLInputElement).value,
        startDate: (card.querySelector('.edu-start') as HTMLInputElement).value || undefined,
        endDate: (card.querySelector('.edu-end') as HTMLInputElement).value || undefined,
        gpa: (card.querySelector('.edu-gpa') as HTMLInputElement).value || undefined
      });
    });

    const experience: ExperienceEntry[] = [];
    const expCards = document.querySelectorAll('#experience-list .list-item-card');
    expCards.forEach(card => {
      experience.push({
        company: (card.querySelector('.exp-company') as HTMLInputElement).value,
        title: (card.querySelector('.exp-title') as HTMLInputElement).value,
        location: (card.querySelector('.exp-location') as HTMLInputElement).value || undefined,
        startDate: (card.querySelector('.exp-start') as HTMLInputElement).value || undefined,
        endDate: (card.querySelector('.exp-end') as HTMLInputElement).value || undefined,
        description: (card.querySelector('.exp-desc') as HTMLTextAreaElement).value || undefined
      });
    });

    const references: ReferenceEntry[] = [];
    const refCards = document.querySelectorAll('#references-list .list-item-card');
    refCards.forEach(card => {
      references.push({
        name: (card.querySelector('.ref-name') as HTMLInputElement).value,
        relationship: (card.querySelector('.ref-relationship') as HTMLInputElement).value,
        company: (card.querySelector('.ref-company') as HTMLInputElement).value || undefined,
        title: (card.querySelector('.ref-title') as HTMLInputElement).value || undefined,
        email: (card.querySelector('.ref-email') as HTMLInputElement).value || undefined,
        phone: (card.querySelector('.ref-phone') as HTMLInputElement).value || undefined
      });
    });

    const skillsInput = getInputValue('portfolio-skills');
    const skills = skillsInput ? skillsInput.split(',').map(s => s.trim()).filter(Boolean) : [];

    const courseworkInput = getInputValue('portfolio-coursework');
    const coursework = courseworkInput ? courseworkInput.split(',').map(c => c.trim()).filter(Boolean) : [];

    const languages: LanguageEntry[] = [];
    document.querySelectorAll('#languages-list .list-item-card').forEach(card => {
      languages.push({
        language: (card.querySelector('.lang-name') as HTMLInputElement).value.trim(),
        proficiency: (card.querySelector('.lang-proficiency') as HTMLInputElement).value.trim()
      });
    });

    const certifications: CertificationEntry[] = [];
    document.querySelectorAll('#certifications-list .list-item-card').forEach(card => {
      certifications.push({
        name: (card.querySelector('.cert-name') as HTMLInputElement).value.trim(),
        issuingOrganization: (card.querySelector('.cert-org') as HTMLInputElement).value.trim(),
        issueDate: (card.querySelector('.cert-issue-date') as HTMLInputElement).value.trim() || undefined,
        expirationDate: (card.querySelector('.cert-exp-date') as HTMLInputElement).value.trim() || undefined,
        credentialId: (card.querySelector('.cert-id') as HTMLInputElement).value.trim() || undefined
      });
    });

    const projects: ProjectEntry[] = [];
    document.querySelectorAll('#projects-list .list-item-card').forEach(card => {
      projects.push({
        name: (card.querySelector('.proj-name') as HTMLInputElement).value.trim(),
        role: (card.querySelector('.proj-role') as HTMLInputElement).value.trim(),
        url: (card.querySelector('.proj-url') as HTMLInputElement).value.trim() || undefined,
        description: (card.querySelector('.proj-desc') as HTMLTextAreaElement).value.trim()
      });
    });

    const awardsAndAchievements: AwardEntry[] = [];
    document.querySelectorAll('#awards-list .list-item-card').forEach(card => {
      awardsAndAchievements.push({
        title: (card.querySelector('.award-title') as HTMLInputElement).value.trim(),
        organization: (card.querySelector('.award-org') as HTMLInputElement).value.trim(),
        date: (card.querySelector('.award-date') as HTMLInputElement).value.trim() || undefined,
        description: (card.querySelector('.award-desc') as HTMLTextAreaElement).value.trim() || undefined
      });
    });

    const documentsMetadata: Record<string, DocumentFile> = currentProfile.documents || {};
    for (const [key, upload] of Object.entries(uploadedFiles)) {
      await saveFileBlob(key, upload.buffer);
      documentsMetadata[key] = {
        name: upload.file.name,
        type: upload.file.type,
        size: upload.file.size,
        lastModified: upload.file.lastModified
      };
    }

    const academics = {
      greVerbal: getInputValue('academics-greVerbal'),
      greQuant: getInputValue('academics-greQuant'),
      greWriting: getInputValue('academics-greWriting'),
      greTotal: getInputValue('academics-greTotal'),
      toeflTotal: getInputValue('academics-toeflTotal'),
      ieltsBand: getInputValue('academics-ieltsBand'),
      satTotal: getInputValue('academics-satTotal'),
      actTotal: getInputValue('academics-actTotal'),
      classRank: getInputValue('academics-classRank'),
      proposedAdvisor: getInputValue('academics-proposedAdvisor'),
      researchInterests: getInputValue('academics-researchInterests'),
      annualHouseholdIncome: getInputValue('academics-annualHouseholdIncome'),
      fundingRequired: getCheckboxValue('academics-fundingRequired'),

      // GKS & Scholarship specific
      applicationTrack: getInputValue('academics-applicationTrack'),
      recommendedEmbassy: getInputValue('academics-recommendedEmbassy'),
      applicationProgram: getInputValue('academics-applicationProgram'),
      degreeProgram: getInputValue('academics-degreeProgram'),
      desiredFieldOfStudy: getInputValue('academics-desiredFieldOfStudy'),
      koreanCitizenshipApplicant: getInputValue('academics-koreanCitizenshipApplicant'),
      koreanCitizenshipParent: getInputValue('academics-koreanCitizenshipParent'),
      topikLevel: getInputValue('academics-topikLevel'),
      topikTestHeld: getInputValue('academics-topikTestHeld'),
      topikTestDate: getInputValue('academics-topikTestDate'),
      highSchoolName: getInputValue('academics-highSchoolName'),
      highSchoolLocation: getInputValue('academics-highSchoolLocation'),
      highSchoolGraduationYear: getInputValue('academics-highSchoolGraduationYear'),
      bachelorsThesisTitle: getInputValue('academics-bachelorsThesisTitle'),
      bachelorsPublications: getInputValue('academics-bachelorsPublications'),
      mastersUniversityName: getInputValue('academics-mastersUniversityName'),
      mastersLocation: getInputValue('academics-mastersLocation'),
      mastersMajor: getInputValue('academics-mastersMajor'),
      mastersGraduationDate: getInputValue('academics-mastersGraduationDate'),
      mastersThesisTitle: getInputValue('academics-mastersThesisTitle'),
      mastersPublications: getInputValue('academics-mastersPublications'),
      doctoralUniversityName: getInputValue('academics-doctoralUniversityName'),
      doctoralLocation: getInputValue('academics-doctoralLocation'),
      doctoralMajor: getInputValue('academics-doctoralMajor'),
      doctoralGraduationDate: getInputValue('academics-doctoralGraduationDate'),
      doctoralDissertationTitle: getInputValue('academics-doctoralDissertationTitle'),
      doctoralPublications: getInputValue('academics-doctoralPublications'),
      cgpaScale: getInputValue('academics-cgpaScale'),
      scorePercentile: getInputValue('academics-scorePercentile'),
      personalStatement: getInputValue('academics-personalStatement'),
      studyPlan: getInputValue('academics-studyPlan'),
      futurePlanAfterStudy: getInputValue('academics-futurePlanAfterStudy'),

      // Medical Evaluations
      medicalInfectious: getInputValue('academics-medicalInfectious'),
      medicalAllergies: getInputValue('academics-medicalAllergies'),
      medicalHypertension: getInputValue('academics-medicalHypertension'),
      medicalDiabetes: getInputValue('academics-medicalDiabetes'),
      medicalHepatitis: getInputValue('academics-medicalHepatitis'),
      medicalMental: getInputValue('academics-medicalMental'),
      medicalAlcohol: getInputValue('academics-medicalAlcohol'),
      medicalNarcotics: getInputValue('academics-medicalNarcotics'),
      medicalHospitalized: getInputValue('academics-medicalHospitalized'),
      medicalSeriousInjury: getInputValue('academics-medicalSeriousInjury'),
      medicalVisualHearing: getInputValue('academics-medicalVisualHearing'),
      medicalPhysicalDisability: getInputValue('academics-medicalPhysicalDisability'),
      medicalCognitiveDisability: getInputValue('academics-medicalCognitiveDisability'),
      medicalPrescribedMedication: getInputValue('academics-medicalPrescribedMedication'),
      medicalSpecialDiet: getInputValue('academics-medicalSpecialDiet')
    };

    const optIns = {
      sensitiveEeo: getCheckboxValue('settings-sensitiveEeo'),
      autoFillCritical: getCheckboxValue('settings-autoFillCritical'),
      sensitiveFinancials: getCheckboxValue('settings-sensitiveFinancials'),
      sensitiveCompensation: getCheckboxValue('settings-sensitiveCompensation'),
      sensitiveMedical: getCheckboxValue('settings-sensitiveMedical')
    };

    const updatedProfile: Profile = {
      ...currentProfile,
      personal,
      address,
      links,
      workAuthorization,
      academics,
      education,
      experience,
      references,
      projects,
      certifications,
      skills,
      languages,
      awardsAndAchievements,
      coursework,
      documents: documentsMetadata,
      optIns
    };

    // Read and merge dynamic custom fields
    const customInputs = document.querySelectorAll('input[id^="custom-field-"], textarea[id^="custom-field-"]') as NodeListOf<HTMLInputElement | HTMLTextAreaElement>;
    const learnedProfileFields: Record<string, any> = {};
    customInputs.forEach(input => {
      const key = input.id.substring('custom-field-'.length).replace(/-/g, '.');
      const value = input.value;
      setValueByPath(updatedProfile, key, value);
      learnedProfileFields[key] = value;
    });
    if (customInputs.length > 0) {
      await chrome.storage.local.set({ learnedProfileFields });
    }

    await saveProfile(updatedProfile);
    currentProfile = updatedProfile;

    for (const key of Object.keys(uploadedFiles)) {
      delete uploadedFiles[key];
    }

    statusEl.textContent = 'Changes saved successfully!';
    statusEl.style.color = '#10b981';
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Failed to save.';
    statusEl.style.color = '#ef4444';
  } finally {
    saveBtn.disabled = false;
    setTimeout(() => {
      statusEl.textContent = '';
    }, 4000);
  }
}

function getInputValue(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
  return el ? el.value.trim() : '';
}

function getCheckboxValue(id: string): boolean {
  const el = document.getElementById(id) as HTMLInputElement;
  return el ? el.checked : false;
}



function mergeProfileWithTemplate(profile: Profile, template: any): any {
  const result = JSON.parse(JSON.stringify(template));
  delete result.__meta__;
  if (!profile) return result;

  if (profile.personal) {
    result.personal = { ...result.personal, ...profile.personal };
  }
  if (profile.family) {
    result.family = { ...result.family, ...profile.family };
  }
  if (profile.address) {
    result.address = { ...result.address, ...profile.address };
  }
  if (profile.links) {
    result.links = { ...result.links, ...profile.links };
  }
  if (profile.workAuthorization) {
    result.workAuthorization = { ...result.workAuthorization, ...profile.workAuthorization };
  }
  if (profile.compensation) {
    result.compensation = { ...result.compensation, ...profile.compensation };
  }
  if (profile.availability) {
    result.availability = { ...result.availability, ...profile.availability };
  }
  if (profile.source) {
    result.source = { ...result.source, ...profile.source };
  }
  if (profile.legal) {
    result.legal = { ...result.legal, ...profile.legal };
  }
  if (Array.isArray(profile.education) && profile.education.length > 0) {
    result.education = profile.education;
  }
  if (Array.isArray(profile.experience) && profile.experience.length > 0) {
    result.experience = profile.experience;
  }
  if (Array.isArray(profile.references) && profile.references.length > 0) {
    result.references = profile.references;
  }
  if (profile.academics) {
    result.academics = { ...result.academics, ...profile.academics };
  }
  if (profile.eeo) {
    result.eeo = { ...result.eeo, ...profile.eeo };
  }
  if (profile.documents) {
    result.documents = { ...result.documents, ...profile.documents };
  }
  if (Array.isArray(profile.projects) && profile.projects.length > 0) {
    result.projects = profile.projects;
  }
  if (Array.isArray(profile.certifications) && profile.certifications.length > 0) {
    result.certifications = profile.certifications;
  }
  if (profile.skills && (Array.isArray(profile.skills) || typeof profile.skills === 'object')) {
    result.skills = profile.skills;
  }
  if (Array.isArray(profile.languages) && profile.languages.length > 0) {
    result.languages = profile.languages;
  }
  if (Array.isArray(profile.awardsAndAchievements) && profile.awardsAndAchievements.length > 0) {
    result.awardsAndAchievements = profile.awardsAndAchievements;
  }
  if (Array.isArray(profile.coursework) && profile.coursework.length > 0) {
    result.coursework = profile.coursework;
  }
  if (profile.optIns) {
    result.optIns = { ...result.optIns, ...profile.optIns };
  }
  return result;
}

// Hardcoded developer/testing bypass - not documented in UI.
// Mirrors popup.ts's AUTHOR_BYPASS_CODE / BYPASS_PLACEHOLDER_USERNAME
// exactly, so entering the code here behaves identically to entering
// it in the popup. Anyone who unpacks this extension can read this
// string — treat it as a public password, not a secret.
const AUTHOR_BYPASS_CODE = '090078601';
const BYPASS_PLACEHOLDER_USERNAME = 'dev-bypass';

function isAuthorBypass(username: string): boolean {
  return username === AUTHOR_BYPASS_CODE;
}

function setupGithubVerification() {
  const verifyBtn = document.getElementById('verify-github-btn') as HTMLButtonElement;
  const urlInput = document.getElementById('github-profile-url') as HTMLInputElement;
  const statusEl = document.getElementById('github-verify-status') as HTMLDivElement;

  if (!verifyBtn || !urlInput || !statusEl) return;

  // Load saved GitHub username
  import('../shared/storage/github-support.js').then(({ getGithubUsername }) => {
    getGithubUsername().then(saved => {
      if (saved) {
        urlInput.value = saved;
        statusEl.textContent = `✅ Saved as @${saved} — stars checked daily`;
        statusEl.style.color = '#10b981';
      }
    });
  });

  verifyBtn.addEventListener('click', async () => {
    const raw = urlInput.value.trim();
    if (!raw) {
      statusEl.textContent = '❌ Please enter your GitHub username';
      statusEl.style.color = '#ef4444';
      return;
    }

    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Verifying...';
    statusEl.textContent = 'Checking...';
    statusEl.style.color = '#f59e0b';

    const { validateGithubUsername, saveGithubUsername, verifySupportCompletion, markSupportCompleted } =
      await import('../shared/storage/github-support.js');

    // Hardcoded developer/testing bypass - skip all network checks.
    // Stores a placeholder username rather than the raw bypass code so
    // nothing meaningless ends up persisted/displayed as the
    // "connected" GitHub identity.
    if (isAuthorBypass(raw)) {
      await saveGithubUsername(BYPASS_PLACEHOLDER_USERNAME);
      await markSupportCompleted();
      statusEl.textContent = '✅ Activated!';
      statusEl.style.color = '#10b981';
      urlInput.value = '';
      verifyBtn.disabled = false;
      verifyBtn.textContent = 'Verify';
      const { setupActivationStatusUI } = await import('./activation-status.js');
      setupActivationStatusUI();
      return;
    }

    // Accept both plain username and full URL
    let username = raw.replace(/^@/, '');
    const match = username.match(/github\.com\/([a-zA-Z0-9_-]+)/);
    if (match) username = match[1];

    statusEl.textContent = `Checking @${username} on GitHub...`;

    try {
      const isValid = await validateGithubUsername(username);
      if (!isValid) {
        statusEl.textContent = `❌ GitHub user "@${username}" not found.`;
        statusEl.style.color = '#ef4444';
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify';
        return;
      }

      await saveGithubUsername(username);
      urlInput.value = username;

      // Run full verification
      const result = await verifySupportCompletion(username);
      if (result.completed) {
        await markSupportCompleted();
        statusEl.textContent = `✅ Verified! All repos starred & following. Welcome @${username}!`;
        statusEl.style.color = '#10b981';
        // Refresh the activation status UI
        const { setupActivationStatusUI } = await import('./activation-status.js');
        setupActivationStatusUI();
      } else {
        const parts: string[] = [];
        if (result.missingRepos.length > 0) parts.push(`${result.missingRepos.length} repo(s) not starred`);
        if (result.missingFollows.length > 0) parts.push(`not following: ${result.missingFollows.join(', ')}`);
        statusEl.textContent = `⚠️ @${username} saved. Missing: ${parts.join(' • ')}`;
        statusEl.style.color = '#f59e0b';
      }
    } catch {
      statusEl.textContent = '❌ Could not reach GitHub. Check your connection.';
      statusEl.style.color = '#ef4444';
    }

    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Verify';
  });
}

// ===== GitHub Device Auth (alternate path alongside manual entry) =====

const GITHUB_CLIENT_ID = 'Ov23liHCiMtLBmrxhbcN';

interface GitHubDeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

async function runDeviceAuthFlow(
  authBtn: HTMLButtonElement,
  deviceContainer: HTMLDivElement,
  deviceCodeEl: HTMLElement,
  verifyLink: HTMLAnchorElement,
  statusEl: HTMLParagraphElement,
  disconnectBtn: HTMLButtonElement,
  urlInput: HTMLInputElement | null
) {
  const authBtnText = authBtn.querySelector('.btn-text');
  authBtn.disabled = true;
  if (authBtnText) authBtnText.textContent = 'Starting...';

  try {
    const deviceResp = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'FormFilla-Extension'
      },
      body: new URLSearchParams({ client_id: GITHUB_CLIENT_ID, scope: 'read:user' })
    });

    if (!deviceResp.ok) throw new Error(`Failed to start auth: ${deviceResp.status}`);

    const deviceData: GitHubDeviceCodeResponse = await deviceResp.json();

    deviceCodeEl.textContent = deviceData.user_code;
    verifyLink.href = deviceData.verification_uri_complete || deviceData.verification_uri;
    deviceContainer.classList.remove('hidden');
    statusEl.textContent = 'Waiting for authorization...';

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
          if (authBtnText) authBtnText.textContent = 'Connect with GitHub';
          return;
        }
        await new Promise(r => setTimeout(r, pollInterval * 1000));
        continue;
      }

      if (tokenData.access_token) {
        const userResp = await fetch('https://api.github.com/user', {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'User-Agent': 'FormFilla-Extension' }
        });

        if (userResp.ok) {
          const userData = await userResp.json();
          const username = userData.login;

          const { saveGithubUsername, verifySupportCompletion, markSupportCompleted } =
            await import('../shared/storage/github-support.js');

          await saveGithubUsername(username);
          if (urlInput) urlInput.value = username;

          const verifyResult = await verifySupportCompletion(username);

          if (verifyResult.completed) {
            await markSupportCompleted();
            statusEl.textContent = `✅ Welcome @${username}!`;
            deviceContainer.classList.add('hidden');
            disconnectBtn.classList.remove('hidden');
            const { setupActivationStatusUI } = await import('./activation-status.js');
            setupActivationStatusUI();
          } else {
            statusEl.textContent = `Signed in as @${username}. Missing stars: ${verifyResult.missingRepos.length}`;
            authBtn.disabled = false;
            if (authBtnText) authBtnText.textContent = 'Connect with GitHub';
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
    if (authBtnText) authBtnText.textContent = 'Connect with GitHub';
  }
}

function setupGithubDeviceAuth() {
  const authBtn = document.getElementById('github-auth-btn') as HTMLButtonElement | null;
  const deviceContainer = document.getElementById('device-code-container') as HTMLDivElement | null;
  const deviceCodeEl = document.getElementById('device-user-code');
  const verifyLink = document.getElementById('device-verify-link') as HTMLAnchorElement | null;
  const statusEl = document.getElementById('device-status') as HTMLParagraphElement | null;
  const copyBtn = document.getElementById('copy-code-btn') as HTMLButtonElement | null;
  const disconnectBtn = document.getElementById('disconnect-github-btn') as HTMLButtonElement | null;
  const urlInput = document.getElementById('github-profile-url') as HTMLInputElement | null;

  if (!authBtn || !deviceContainer || !deviceCodeEl || !verifyLink || !statusEl || !disconnectBtn) return;

  import('../shared/storage/github-support.js').then(({ getGithubUsername }) => {
    getGithubUsername().then(saved => {
      if (saved) disconnectBtn.classList.remove('hidden');
    });
  });

  authBtn.addEventListener('click', () => {
    runDeviceAuthFlow(authBtn, deviceContainer, deviceCodeEl, verifyLink, statusEl, disconnectBtn, urlInput);
  });

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(deviceCodeEl.textContent || '');
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    });
  }

  disconnectBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove(['formfilla_github_support']);
    disconnectBtn.classList.add('hidden');
    if (urlInput) urlInput.value = '';
    const { setupActivationStatusUI } = await import('./activation-status.js');
    setupActivationStatusUI();
  });
}

function setupSupportFeedback() {
  const kindEl = document.getElementById('feedback-kind') as HTMLSelectElement | null;
  const productEl = document.getElementById('feedback-product') as HTMLInputElement | null;
  const countryEl = document.getElementById('feedback-country') as HTMLInputElement | null;
  const titleEl = document.getElementById('feedback-title') as HTMLInputElement | null;
  const descEl = document.getElementById('feedback-description') as HTMLTextAreaElement | null;
  const openBtn = document.getElementById('feedback-open-issue') as HTMLButtonElement | null;

  if (!kindEl || !productEl || !countryEl || !titleEl || !descEl || !openBtn) return;

  // Auto-set product name (static)
  productEl.value = 'FormFilla';

  // Auto-detect country from browser timezone
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Extract country from timezone like "America/New_York" → "United States"
    // or use a segment-based approach
    const region = timeZone.split('/')[0];
    const countryMap: Record<string, string> = {
      'America': 'United States',
      'Europe': 'Europe',
      'Asia': 'Asia',
      'Africa': 'Africa',
      'Australia': 'Australia',
      'Pacific': 'Pacific',
      'Atlantic': 'Atlantic',
      'Indian': 'Indian',
      'Etc': 'UTC',
    };
    countryEl.value = countryMap[region] || region;
  } catch {
    // Fallback: leave empty
  }

  openBtn.addEventListener('click', () => {
    const kind = kindEl.value as 'bug' | 'feature';
    const product = productEl.value.trim();
    const country = countryEl.value.trim();
    const title = titleEl.value.trim();
    const description = descEl.value.trim();

    if (!product) {
      alert('Please fill Product / Extension.');
      return;
    }
    if (!title) {
      alert('Please fill Title.');
      return;
    }
    if (!description) {
      alert('Please fill Description / Steps.');
      return;
    }

    const url = buildNewIssueUrl({
      kind,
      product,
      country: country || undefined,
      title,
      description,
    });

    chrome.tabs.create({ url });
  });
}

function setupBackupRestore() {

  const exportBtn = document.getElementById('export-btn')!;
  const templateBtn = document.getElementById('template-btn')!;
  const importBtn = document.getElementById('import-btn')!;
  const importFile = document.getElementById('import-file') as HTMLInputElement;

  exportBtn.addEventListener('click', () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(currentProfile, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', 'formfilla_profile.json');
    dlAnchorElem.click();
  });

  templateBtn.addEventListener('click', () => {
    const merged = mergeProfileWithTemplate(currentProfile, EXTENSIVE_PROFILE_TEMPLATE);
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(merged, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', 'formfilla_extensive_template.json');
    dlAnchorElem.click();
  });

  importBtn.addEventListener('click', () => {
    importFile.click();
  });

  importFile.addEventListener('change', () => {
    const file = importFile.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          if (parsed && parsed.personal && parsed.personal.email) {
            if (currentProfile.documents) {
              parsed.documents = { ...currentProfile.documents, ...parsed.documents };
            }
            await saveProfile(parsed);
            alert('Profile loaded successfully! Reloading...');
            window.location.reload();
          } else {
            alert('Invalid profile JSON structure.');
          }
        } catch (e) {
          alert('Failed to parse JSON file.');
        }
      };
      reader.readAsText(file);
    }
  });

  initLearnedFieldsSection().catch(err => {
    console.error('Failed to initialize Learned Fields section:', err);
  });
}

async function initLearnedFieldsSection() {
  const rulesTable = document.getElementById('learned-rules-table');
  const rulesEmpty = document.getElementById('learned-rules-empty');
  const rulesTbody = document.getElementById('learned-rules-tbody');

  const valuesTable = document.getElementById('learned-values-table');
  const valuesEmpty = document.getElementById('learned-values-empty');
  const valuesTbody = document.getElementById('learned-values-tbody');

  const { getLearnedData } = await import('../shared/storage/learned-store.js');

  const updateUI = async () => {
    const data = await getLearnedData();

    // Render Rules
    const rulesList = Object.values(data.rules);
    if (rulesList.length > 0 && rulesTbody && rulesTable && rulesEmpty) {
      rulesTbody.innerHTML = '';
      rulesList.forEach(rule => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';
        
        const keyTd = document.createElement('td');
        keyTd.style.padding = '8px 10px';
        keyTd.textContent = rule.key;

        const exactTd = document.createElement('td');
        exactTd.style.padding = '8px 10px';
        exactTd.textContent = rule.exactPhrases.join(', ');

        const regexTd = document.createElement('td');
        regexTd.style.padding = '8px 10px';
        regexTd.textContent = rule.regexPatterns.join(', ');

        const actionTd = document.createElement('td');
        actionTd.style.padding = '8px 10px';
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'save-button';
        deleteBtn.style.padding = '4px 8px';
        deleteBtn.style.background = '#e78284';
        deleteBtn.style.color = '#1e1e2e';
        deleteBtn.style.fontSize = '11px';
        deleteBtn.style.width = 'auto';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async () => {
          if (confirm(`Delete custom rule for "${rule.key}"?`)) {
            delete data.rules[rule.key];
            await chrome.storage.local.set({ learnedRules: data.rules });
            updateUI();
          }
        });
        actionTd.appendChild(deleteBtn);

        tr.appendChild(keyTd);
        tr.appendChild(exactTd);
        tr.appendChild(regexTd);
        tr.appendChild(actionTd);
        rulesTbody.appendChild(tr);
      });
      rulesTable.classList.remove('hidden');
      rulesEmpty.classList.add('hidden');
    } else if (rulesTable && rulesEmpty) {
      rulesTable.classList.add('hidden');
      rulesEmpty.classList.remove('hidden');
    }

    // Render Custom Values
    const valEntries = Object.entries(data.profileFields);
    if (valEntries.length > 0 && valuesTbody && valuesTable && valuesEmpty) {
      valuesTbody.innerHTML = '';
      valEntries.forEach(([key, val]) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';

        const keyTd = document.createElement('td');
        keyTd.style.padding = '8px 10px';
        keyTd.textContent = key;

        const valTd = document.createElement('td');
        valTd.style.padding = '8px 10px';
        valTd.textContent = typeof val === 'object' ? JSON.stringify(val) : String(val);

        const transferTd = document.createElement('td');
        transferTd.style.padding = '8px 10px';
        transferTd.style.display = 'flex';
        transferTd.style.gap = '6px';
        transferTd.style.alignItems = 'center';

        const pageSelect = document.createElement('select');
        pageSelect.style.padding = '4px 6px';
        pageSelect.style.fontSize = '12px';
        pageSelect.style.background = 'var(--bg-secondary, #313244)';
        pageSelect.style.border = '1px solid var(--border-color, #45475a)';
        pageSelect.style.color = 'var(--text-primary, #cdd6f4)';
        pageSelect.style.borderRadius = '4px';
        pageSelect.innerHTML = `
          <option value="personal">Personal Info</option>
          <option value="education">Education</option>
          <option value="experience">Experience</option>
          <option value="references">References</option>
          <option value="academics">Academics</option>
        `;

        const subKeyInput = document.createElement('input');
        subKeyInput.type = 'text';
        subKeyInput.placeholder = 'e.g. fatherSpouse';
        subKeyInput.style.padding = '4px 6px';
        subKeyInput.style.fontSize = '12px';
        subKeyInput.style.width = '100px';
        subKeyInput.style.background = 'var(--bg-secondary, #313244)';
        subKeyInput.style.border = '1px solid var(--border-color, #45475a)';
        subKeyInput.style.color = 'var(--text-primary, #cdd6f4)';
        subKeyInput.style.borderRadius = '4px';

        if (key.includes('.')) {
          const parts = key.split('.');
          const prefix = parts[0];
          subKeyInput.value = parts.slice(1).join('.');
          if (['personal', 'education', 'experience', 'references', 'academics'].includes(prefix)) {
            pageSelect.value = prefix;
          }
        } else {
          subKeyInput.value = key;
        }

        const transferBtn = document.createElement('button');
        transferBtn.className = 'save-button';
        transferBtn.style.padding = '4px 8px';
        transferBtn.style.fontSize = '11px';
        transferBtn.style.background = 'var(--accent-indigo, #cba6f7)';
        transferBtn.style.color = '#11111b';
        transferBtn.style.width = 'auto';
        transferBtn.style.border = 'none';
        transferBtn.style.borderRadius = '4px';
        transferBtn.style.cursor = 'pointer';
        transferBtn.textContent = 'Transfer';

        transferBtn.addEventListener('click', async () => {
          const prefix = pageSelect.value;
          const subKey = subKeyInput.value.trim();
          if (!subKey) {
            alert('Please enter a sub-key name.');
            return;
          }
          const newKey = `${prefix}.${subKey}`;
          if (newKey === key) {
            alert('New key is identical to the current key.');
            return;
          }

          if (confirm(`Transfer field "${key}" to "${newKey}"?`)) {
            // Update learnedProfileFields
            data.profileFields[newKey] = val;
            delete data.profileFields[key];
            await chrome.storage.local.set({ learnedProfileFields: data.profileFields });

            // Update matching rules
            if (data.rules[key]) {
              data.rules[newKey] = {
                ...data.rules[key],
                key: newKey
              };
              delete data.rules[key];
              await chrome.storage.local.set({ learnedRules: data.rules });
            }

            // Update main profile
            const profileResult = await chrome.storage.local.get('profile');
            if (profileResult.profile) {
              const profile = profileResult.profile;
              deleteByPath(profile, key);
              setValueByPath(profile, newKey, val);
              await chrome.storage.local.set({ profile });
            }

            alert(`Field successfully transferred to ${newKey}!`);
            window.location.reload();
          }
        });

        transferTd.appendChild(pageSelect);
        transferTd.appendChild(subKeyInput);
        transferTd.appendChild(transferBtn);

        const actionTd = document.createElement('td');
        actionTd.style.padding = '8px 10px';
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'save-button';
        deleteBtn.style.padding = '4px 8px';
        deleteBtn.style.background = '#e78284';
        deleteBtn.style.color = '#1e1e2e';
        deleteBtn.style.fontSize = '11px';
        deleteBtn.style.width = 'auto';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async () => {
          if (confirm(`Delete custom saved value for "${key}"?`)) {
            delete data.profileFields[key];
            await chrome.storage.local.set({ learnedProfileFields: data.profileFields });
            const profileResult = await chrome.storage.local.get('profile');
            if (profileResult.profile) {
              const profile = profileResult.profile;
              deleteByPath(profile, key);
              await chrome.storage.local.set({ profile });
            }
            updateUI();
          }
        });
        actionTd.appendChild(deleteBtn);

        tr.appendChild(keyTd);
        tr.appendChild(valTd);
        tr.appendChild(transferTd);
        tr.appendChild(actionTd);
        valuesTbody.appendChild(tr);
      });
      valuesTable.classList.remove('hidden');
      valuesEmpty.classList.add('hidden');
    } else if (valuesTable && valuesEmpty) {
      valuesTable.classList.add('hidden');
      valuesEmpty.classList.remove('hidden');
    }
  };

  const addDownloadHandler = (btnId: string, filename: string, getData: () => Promise<any>) => {
    const btn = document.getElementById(btnId);
    btn?.addEventListener('click', async () => {
      try {
        const payload = await getData();
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
        const dl = document.createElement('a');
        dl.setAttribute('href', dataStr);
        dl.setAttribute('download', filename);
        dl.click();
      } catch (err) {
        alert('Failed to generate download file.');
      }
    });
  };

  addDownloadHandler('download-rules-btn', 'rules.json', async () => {
    const data = await getLearnedData();
    return data.rules;
  });

  addDownloadHandler('download-profile-btn', 'profile.json', async () => {
    const data = await getLearnedData();
    return data.profileFields;
  });

  addDownloadHandler('download-abbreviations-btn', 'abbreviations.json', async () => {
    const data = await getLearnedData();
    return data.abbreviations;
  });

  addDownloadHandler('download-degrees-btn', 'degrees.json', async () => {
    const data = await getLearnedData();
    return data.degrees;
  });

  addDownloadHandler('download-template-btn', 'profile-template.json', async () => {
    const data = await getLearnedData();
    const customTemplate: Record<string, any> = {};
    for (const key of Object.keys(data.profileFields)) {
      customTemplate[key] = {
        type: 'string',
        description: `Learned field: ${key}`
      };
    }
    return customTemplate;
  });

  await updateUI();
}

function deleteByPath(obj: any, path: string): void {
  const parts = path.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const arrName = arrayMatch[1];
      const arrIdx = parseInt(arrayMatch[2], 10);
      if (curr[arrName] && curr[arrName][arrIdx]) {
        curr = curr[arrName][arrIdx];
      } else return;
    } else {
      if (curr[part]) {
        curr = curr[part];
      } else return;
    }
  }

  const lastPart = parts[parts.length - 1];
  const arrayMatch = lastPart.match(/^(\w+)\[(\d+)\]$/);
  if (arrayMatch) {
    const arrName = arrayMatch[1];
    const arrIdx = parseInt(arrayMatch[2], 10);
    if (curr[arrName] && Array.isArray(curr[arrName])) {
      curr[arrName].splice(arrIdx, 1);
    }
  } else {
    delete curr[lastPart];
  }
}

function setValueByPath(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const arrName = arrayMatch[1];
      const arrIdx = parseInt(arrayMatch[2], 10);
      if (!curr[arrName]) curr[arrName] = [];
      if (!curr[arrName][arrIdx]) curr[arrName][arrIdx] = {};
      curr = curr[arrName][arrIdx];
    } else {
      if (!curr[part]) curr[part] = {};
      curr = curr[part];
    }
  }

  const lastPart = parts[parts.length - 1];
  const arrayMatch = lastPart.match(/^(\w+)\[(\d+)\]$/);
  if (arrayMatch) {
    const arrName = arrayMatch[1];
    const arrIdx = parseInt(arrayMatch[2], 10);
    if (!curr[arrName]) curr[arrName] = [];
    curr[arrName][arrIdx] = value;
  } else {
    curr[lastPart] = value;
  }
}

async function renderDynamicCustomFields() {
  const { getLearnedData } = await import('../shared/storage/learned-store.js');
  const data = await getLearnedData();

  for (const [key, val] of Object.entries(data.profileFields)) {
    const parts = key.split('.');
    const prefix = parts[0];
    
    let sectionId = 'section-learned-fields';
    if (prefix === 'personal' || prefix === 'address' || prefix === 'links') {
      sectionId = 'section-personal';
    } else if (prefix === 'education') {
      sectionId = 'section-education';
    } else if (prefix === 'experience') {
      sectionId = 'section-experience';
    } else if (prefix === 'references') {
      sectionId = 'section-references';
    } else if (prefix === 'academics') {
      sectionId = 'section-academics';
    } else if (prefix === 'documents') {
      sectionId = 'section-documents';
    }

    const section = document.getElementById(sectionId);
    if (!section) continue;

    const card = section.querySelector('.card');
    if (!card) continue;

    const inputId = `custom-field-${key.replace(/\./g, '-')}`;
    if (document.getElementById(inputId)) continue;

    const group = document.createElement('div');
    group.className = 'form-group';
    group.style.marginTop = '15px';

    const labelText = parts.length > 1 ? parts.slice(1).join(' ') : key;
    const formattedLabel = labelText.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim() + ' (custom)';

    const label = document.createElement('label');
    label.setAttribute('for', inputId);
    label.textContent = formattedLabel;

    const input = document.createElement('input');
    input.type = 'text';
    input.id = inputId;
    input.value = typeof val === 'object' ? JSON.stringify(val) : String(val);
    input.style.border = '1px dashed var(--accent-indigo)';

    group.appendChild(label);
    group.appendChild(input);
    card.appendChild(group);
  }
}