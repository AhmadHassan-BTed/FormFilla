import rawRules from '../dictionary/rules.json' with { type: 'json' };

export type ArrayBlockType = keyof typeof rawRules.__arrayShapeSignatures__;

export interface PersonalInfo {
  firstName: string;
  lastName: string;
  middleName?: string;
  namePrefix?: string;
  nameSuffix?: string;
  fullName?: string;
  preferredName?: string;
  pronouns?: string;
  email: string;
  phone: string;
  mobilePhone?: string;
  summary?: string;
  otherQualifications?: string;
  nationalId?: string;
  nationalIdType?: string;
  dateOfBirth?: string;
  cnicNumber?: string;
  passportNumber?: string;
  languages?: string[] | string;
}

export interface AddressInfo {
  street?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  county?: string;
}

export interface FamilyInfo {
  fatherName?: string;
  motherName?: string;
}

export interface LinksInfo {
  linkedin?: string;
  github?: string;
  portfolio?: string;
  twitter?: string;
  other?: string[];
}

export interface WorkAuthorizationInfo {
  requiresSponsorship: boolean;
  authorizedInUS: boolean;
  visaType?: string;
  willingToRelocate?: boolean;
  willingToTravel?: boolean;
}

export interface EducationEntry {
  school: string;
  degree: string;
  fieldOfStudy: string;
  minor?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  gpa?: string;
  honors?: string;
}

export interface ExperienceEntry {
  company: string;
  title: string;
  location?: string;
  employmentType?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  reasonForLeaving?: string;
  supervisorName?: string;
}

export interface ReferenceEntry {
  name: string;
  relationship: string;
  company?: string;
  title?: string;
  email?: string;
  phone?: string;
}

export interface DocumentFile {
  name: string;
  type: string;
  size: number;
  lastModified: number;
}

export interface EeoInfo {
  gender?: string;
  race?: string;
  hispanicOrLatino?: string;
  veteranStatus?: string;
  disabilityStatus?: string;
  sexualOrientation?: string;
}

export interface ProjectEntry {
  name: string;
  role: string;
  description: string;
  technologies?: string[];
  url?: string;
}

export interface CertificationEntry {
  name: string;
  issuingOrganization: string;
  issueDate?: string;
  expirationDate?: string;
  credentialId?: string;
}

export interface LanguageEntry {
  language: string;
  proficiency: string;
}

export interface AwardEntry {
  title: string;
  organization: string;
  date?: string;
  description?: string;
}

export interface CompensationInfo {
  currentSalary?: string;
  desiredSalary?: string;
}

export interface AvailabilityInfo {
  startDate?: string;
  noticePeriod?: string;
}

export interface SourceInfo {
  howDidYouHear?: string;
  referredByName?: string;
}

export interface LegalInfo {
  isOver18?: boolean;
  criminalHistory?: string;
  nonCompeteAgreement?: string;
  backgroundCheckConsent?: boolean;
  certifyInformation?: boolean;
  eSignature?: string;
}

export interface AcademicsInfo {
  classRank?: string;
  greVerbal?: string;
  greQuant?: string;
  greWriting?: string;
  greTotal?: string;
  toeflTotal?: string;
  ieltsBand?: string;
  satTotal?: string;
  actTotal?: string;
  researchInterests?: string;
  proposedAdvisor?: string;
  fundingRequired?: boolean;
  annualHouseholdIncome?: string;

  // GKS & Scholarship specific
  applicationTrack?: string;
  recommendedEmbassy?: string;
  applicationProgram?: string;
  degreeProgram?: string;
  desiredFieldOfStudy?: string;
  koreanCitizenshipApplicant?: string;
  koreanCitizenshipParent?: string;
  topikLevel?: string;
  topikTestHeld?: string;
  topikTestDate?: string;
  highSchoolName?: string;
  highSchoolLocation?: string;
  highSchoolGraduationYear?: string;
  bachelorsThesisTitle?: string;
  bachelorsPublications?: string;
  mastersUniversityName?: string;
  mastersLocation?: string;
  mastersMajor?: string;
  mastersGraduationDate?: string;
  mastersThesisTitle?: string;
  mastersPublications?: string;
  doctoralUniversityName?: string;
  doctoralLocation?: string;
  doctoralMajor?: string;
  doctoralGraduationDate?: string;
  doctoralDissertationTitle?: string;
  doctoralPublications?: string;
  cgpaScale?: string;
  scorePercentile?: string;
  personalStatement?: string;
  studyPlan?: string;
  futurePlanAfterStudy?: string;

  // Medical Evaluations
  medicalInfectious?: string;
  medicalAllergies?: string;
  medicalHypertension?: string;
  medicalDiabetes?: string;
  medicalHepatitis?: string;
  medicalMental?: string;
  medicalAlcohol?: string;
  medicalNarcotics?: string;
  medicalHospitalized?: string;
  medicalSeriousInjury?: string;
  medicalVisualHearing?: string;
  medicalPhysicalDisability?: string;
  medicalCognitiveDisability?: string;
  medicalPrescribedMedication?: string;
  medicalSpecialDiet?: string;
}

export interface Profile {
  personal: PersonalInfo;
  family?: FamilyInfo;
  address?: AddressInfo;
  links?: LinksInfo;
  workAuthorization?: WorkAuthorizationInfo;
  compensation?: CompensationInfo;
  availability?: AvailabilityInfo;
  source?: SourceInfo;
  legal?: LegalInfo;
  academics?: AcademicsInfo;
  education?: EducationEntry[];
  experience?: ExperienceEntry[];
  references?: ReferenceEntry[];
  projects?: ProjectEntry[];
  certifications?: CertificationEntry[];
  skills?: Record<string, string[]> | string[];
  languages?: LanguageEntry[];
  awardsAndAchievements?: AwardEntry[];
  coursework?: string[];
  documents?: Record<string, DocumentFile>;
  eeo?: EeoInfo;
  optIns: {
    sensitiveEeo: boolean;
    autoFillCritical?: boolean;
    sensitiveFinancials?: boolean;
    sensitiveCompensation?: boolean;
    sensitiveMedical?: boolean;
    [key: string]: boolean | undefined;
  };
}

export interface FieldSignals {
  id?: string;
  name?: string;
  placeholder?: string;
  autocomplete?: string;
  type: string;
  tagName: string;
  label?: string;
  legend?: string;
  options?: string[];
  blockIndex?: number;
  blockType?: ArrayBlockType;
}

export interface Candidate {
  key: string;
  score: number;
  tier: 'standard' | 'sensitive' | 'critical';
}

export type SensitivityTier = 'standard' | 'sensitive' | 'critical';
export type GateType = 'confident' | 'review' | 'unmapped' | 'needs-confirm';

export interface ScoredField {
  element: Element;
  key: string;
  score: number;
  tier: SensitivityTier;
  confidence: 'high' | 'medium';
  gate: GateType;
}

export interface RepeatedBlock {
  index: number;
  arrayKey: ArrayBlockType;
  container: Element;
  fields: Element[];
}

export interface ScannedFieldDetail {
  label: string;
  name: string;
  id: string;
  type: string;
  key: string;
  gate: string;
}

export interface FillResult {
  confident: number;
  review: number;
  unmapped: number;
  needsConfirm: number;
  details?: ScannedFieldDetail[];
}

export interface DateFieldGroup {
  type: 'date-group';
  monthEl: HTMLSelectElement | HTMLInputElement;
  dayEl: HTMLSelectElement | HTMLInputElement;
  yearEl: HTMLSelectElement | HTMLInputElement;
  container: Element;
}

export interface PlatformAdapter {
  matches(): boolean;
  beforeScan?(): void;
  scoreOverride?(signals: FieldSignals): ScoredField | null;
}
