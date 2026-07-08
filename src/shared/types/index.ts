export interface PersonalInfo {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  phone: string;
  summary?: string;
  nationalId?: string;
}

export interface AddressInfo {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface LinksInfo {
  linkedin?: string;
  github?: string;
  portfolio?: string;
  other?: string[];
}

export interface WorkAuthorizationInfo {
  requiresSponsorship: boolean;
  authorizedInUS: boolean;
  visaType?: string;
}

export interface EducationEntry {
  school: string;
  degree: string;
  fieldOfStudy: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
}

export interface ExperienceEntry {
  company: string;
  title: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
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
  veteranStatus?: string;
  disabilityStatus?: string;
}

export interface Profile {
  personal: PersonalInfo;
  address?: AddressInfo;
  links?: LinksInfo;
  workAuthorization?: WorkAuthorizationInfo;
  education?: EducationEntry[];
  experience?: ExperienceEntry[];
  references?: ReferenceEntry[];
  documents?: Record<string, DocumentFile>;
  eeo?: EeoInfo;
  optIns: {
    sensitiveEeo: boolean;
    [key: string]: boolean;
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
