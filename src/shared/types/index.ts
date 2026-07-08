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
  summary?: string;
  nationalId?: string;
  dateOfBirth?: string;
  cnicNumber?: string;
  passportNumber?: string;
}

export interface AddressInfo {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  county?: string;
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

export interface Profile {
  personal: PersonalInfo;
  address?: AddressInfo;
  links?: LinksInfo;
  workAuthorization?: WorkAuthorizationInfo;
  compensation?: CompensationInfo;
  availability?: AvailabilityInfo;
  source?: SourceInfo;
  legal?: LegalInfo;
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
  blockType?: 'education' | 'experience' | 'references';
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
  arrayKey: 'education' | 'experience' | 'references';
  container: Element;
  fields: Element[];
}

export interface FillResult {
  confident: number;
  review: number;
  unmapped: number;
  needsConfirm: number;
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
