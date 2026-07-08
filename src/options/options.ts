import { getProfile, saveProfile, saveFileBlob } from '../shared/storage/storage-client.js';
import { Profile, EducationEntry, ExperienceEntry, ReferenceEntry, DocumentFile } from '../shared/types/index.js';
import EXTENSIVE_PROFILE_TEMPLATE from '../shared/dictionary/profile-template.json' with { type: 'json' };

let currentProfile: Profile;
const uploadedFiles: Record<string, { file: File; buffer: ArrayBuffer }> = {};

document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  await loadProfileData();
  setupDynamicLists();
  setupFilePickers();
  setupBackupRestore();

  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  saveBtn.addEventListener('click', saveAllProfileData);
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

async function loadProfileData() {
  currentProfile = await getProfile();

  setInputValue('personal-firstName', currentProfile.personal.firstName);
  setInputValue('personal-lastName', currentProfile.personal.lastName);
  setInputValue('personal-middleName', currentProfile.personal.middleName);
  setInputValue('personal-email', currentProfile.personal.email);
  setInputValue('personal-phone', currentProfile.personal.phone);
  setInputValue('personal-nationalId', currentProfile.personal.nationalId);
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

  setCheckboxValue('settings-sensitiveEeo', currentProfile.optIns?.sensitiveEeo);
  setCheckboxValue('settings-autoFillCritical', currentProfile.optIns?.autoFillCritical ?? true);

  renderFileDetails('resume', currentProfile.documents?.['documents.resume']);
  renderFileDetails('coverLetter', currentProfile.documents?.['documents.coverLetter']);
  renderFileDetails('photo', currentProfile.documents?.['documents.photo']);
}

function setInputValue(id: string, value: any) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
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

  if (currentProfile.education) {
    currentProfile.education.forEach(entry => addEducationRow(eduContainer, entry));
  }
  if (currentProfile.experience) {
    currentProfile.experience.forEach(entry => addExperienceRow(expContainer, entry));
  }
  if (currentProfile.references) {
    currentProfile.references.forEach(entry => addReferenceRow(refContainer, entry));
  }

  addEduBtn.addEventListener('click', () => addEducationRow(eduContainer));
  addExpBtn.addEventListener('click', () => addExperienceRow(expContainer));
  addRefBtn.addEventListener('click', () => addReferenceRow(refContainer));
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
      <input type="month" class="edu-start" value="${data?.startDate || ''}">
    </div>
    <div class="form-group">
      <label>End/Graduation Date</label>
      <input type="month" class="edu-end" value="${data?.endDate || ''}">
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
      <input type="month" class="exp-start" value="${data?.startDate || ''}">
    </div>
    <div class="form-group">
      <label>End Date</label>
      <input type="month" class="exp-end" value="${data?.endDate || ''}">
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

function setupFilePickers() {
  const filesList = ['resume', 'coverLetter', 'photo'];
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

    const optIns = {
      sensitiveEeo: getCheckboxValue('settings-sensitiveEeo'),
      autoFillCritical: getCheckboxValue('settings-autoFillCritical')
    };

    const updatedProfile: Profile = {
      ...currentProfile,
      personal,
      address,
      links,
      workAuthorization,
      education,
      experience,
      references,
      documents: documentsMetadata,
      optIns
    };

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
  if ((profile as any).family) {
    result.family = { ...result.family, ...(profile as any).family };
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
  if (Array.isArray(profile.education) && profile.education.length > 0) {
    result.education = profile.education;
  }
  if (Array.isArray(profile.experience) && profile.experience.length > 0) {
    result.experience = profile.experience;
  }
  if (Array.isArray(profile.references) && profile.references.length > 0) {
    result.references = profile.references;
  }
  if (profile.eeo) {
    result.eeo = { ...result.eeo, ...profile.eeo };
  }
  if (profile.documents) {
    result.documents = { ...result.documents, ...profile.documents };
  }
  if (profile.optIns) {
    result.optIns = { ...result.optIns, ...profile.optIns };
  }
  return result;
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
    dlAnchorElem.setAttribute('download', 'hired_profile.json');
    dlAnchorElem.click();
  });

  templateBtn.addEventListener('click', () => {
    const merged = mergeProfileWithTemplate(currentProfile, EXTENSIVE_PROFILE_TEMPLATE);
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(merged, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', 'hired_extensive_template.json');
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
}
