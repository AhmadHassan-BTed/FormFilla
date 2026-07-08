import { SensitivityTier } from '../types/index.js';

export interface FieldRule {
  sensitivityTier: SensitivityTier;
  requiresOptIn?: boolean;
  optInKey?: string;
  typeCompatible(type: string, tagName: string): boolean;
  exactPhrases: string[];
  regexPatterns: RegExp[];
  autocompleteTokens: string[];
  negativePatterns?: RegExp[];
}

function defaultTypeCompatible(type: string, tagName: string, allowedTypes?: string[], allowedTags?: string[]): boolean {
  const normType = type.toLowerCase();
  const normTag = tagName.toUpperCase();
  
  if (normType === 'file') {
    return allowedTypes?.includes('file') || false;
  }
  
  if (allowedTypes && allowedTypes.includes('file') && normType !== 'file') {
    return false;
  }

  if (allowedTags && !allowedTags.includes(normTag)) {
    return false;
  }

  if (allowedTypes && !allowedTypes.includes(normType)) {
    const isTextLikeInput = ['text', 'email', 'tel', 'url', 'number', 'date', 'password'].includes(normType) && normTag === 'INPUT';
    const isTextLikeAllowed = allowedTypes.some(t => ['text', 'email', 'tel', 'url', 'number', 'date', 'password'].includes(t));
    if (isTextLikeInput && isTextLikeAllowed) {
      return true;
    }
    return false;
  }

  return true;
}

function createRule(options: {
  sensitivityTier?: SensitivityTier;
  requiresOptIn?: boolean;
  optInKey?: string;
  allowedTypes?: string[];
  allowedTags?: string[];
  exactPhrases?: string[];
  regexPatterns?: RegExp[];
  autocompleteTokens?: string[];
  negativePatterns?: RegExp[];
}): FieldRule {
  return {
    sensitivityTier: options.sensitivityTier || 'standard',
    requiresOptIn: options.requiresOptIn,
    optInKey: options.optInKey,
    typeCompatible: (type: string, tagName: string) => 
      defaultTypeCompatible(type, tagName, options.allowedTypes, options.allowedTags),
    exactPhrases: options.exactPhrases || [],
    regexPatterns: options.regexPatterns || [],
    autocompleteTokens: options.autocompleteTokens || [],
    negativePatterns: options.negativePatterns
  };
}

export const FIELD_RULES: Record<string, FieldRule> = {
  'personal.firstName': createRule({
    exactPhrases: ['first name', 'given name', 'forename'],
    regexPatterns: [/first\s*name/i, /given\s*name/i, /^forename/i, /^fname/i],
    autocompleteTokens: ['given-name', 'fname']
  }),
  'personal.lastName': createRule({
    exactPhrases: ['last name', 'family name', 'surname'],
    regexPatterns: [/last\s*name/i, /family\s*name/i, /^surname/i, /^lname/i],
    autocompleteTokens: ['family-name', 'lname']
  }),
  'personal.middleName': createRule({
    exactPhrases: ['middle name', 'middle initial'],
    regexPatterns: [/middle\s*name/i, /middle\s*initial/i, /^mname/i],
    autocompleteTokens: ['additional-name']
  }),
  'personal.email': createRule({
    allowedTypes: ['email', 'text'],
    exactPhrases: ['email', 'email address'],
    regexPatterns: [/email/i, /e-mail/i],
    autocompleteTokens: ['email']
  }),
  'personal.phone': createRule({
    allowedTypes: ['tel', 'text'],
    exactPhrases: ['phone', 'phone number', 'mobile', 'cell', 'telephone'],
    regexPatterns: [/phone/i, /mobile/i, /tel\b/i, /telephone/i],
    autocompleteTokens: ['tel', 'phone']
  }),
  'personal.summary': createRule({
    allowedTags: ['TEXTAREA'],
    exactPhrases: ['summary', 'about you', 'personal statement', 'introduce yourself', 'bio'],
    regexPatterns: [/summary/i, /about\s*(me|you)/i, /statement/i, /bio/i]
  }),
  'personal.nationalId': createRule({
    sensitivityTier: 'critical',
    exactPhrases: ['national id', 'social security number', 'ssn', 'national identification', 'national identity number'],
    regexPatterns: [/ssn/i, /social\s*security/i, /national\s*id/i, /national\s*identification/i]
  }),
  'address.street': createRule({
    exactPhrases: ['street address', 'address line 1', 'address'],
    regexPatterns: [/street/i, /address/i, /^addr\b/i],
    autocompleteTokens: ['address-line1', 'street-address']
  }),
  'address.city': createRule({
    exactPhrases: ['city', 'town'],
    regexPatterns: [/city/i, /town/i],
    autocompleteTokens: ['address-level2']
  }),
  'address.state': createRule({
    exactPhrases: ['state', 'province', 'region'],
    regexPatterns: [/state/i, /province/i, /region/i],
    autocompleteTokens: ['address-level1']
  }),
  'address.postalCode': createRule({
    exactPhrases: ['zip', 'zip code', 'postal code', 'postcode'],
    regexPatterns: [/zip/i, /postal/i, /postcode/i],
    autocompleteTokens: ['postal-code']
  }),
  'address.country': createRule({
    exactPhrases: ['country', 'nation'],
    regexPatterns: [/country/i, /nation/i],
    autocompleteTokens: ['country']
  }),
  'links.linkedin': createRule({
    exactPhrases: ['linkedin', 'linkedin profile', 'linkedin url'],
    regexPatterns: [/linkedin/i]
  }),
  'links.github': createRule({
    exactPhrases: ['github', 'github profile', 'github url'],
    regexPatterns: [/github/i]
  }),
  'links.portfolio': createRule({
    exactPhrases: ['portfolio', 'portfolio website', 'website', 'personal website'],
    regexPatterns: [/portfolio/i, /website/i]
  }),
  'workAuthorization.requiresSponsorship': createRule({
    allowedTypes: ['radio', 'checkbox', 'select'],
    exactPhrases: ['require sponsorship', 'will you now or in the future require visa sponsorship'],
    regexPatterns: [/sponsorship/i, /sponsor/i, /require\s*visa/i]
  }),
  'workAuthorization.authorizedInUS': createRule({
    allowedTypes: ['radio', 'checkbox', 'select'],
    exactPhrases: ['legally authorized to work', 'authorized to work in the us'],
    regexPatterns: [/authorized/i, /legally\s*work/i]
  }),
  'education[].school': createRule({
    exactPhrases: ['school', 'university', 'college', 'institution'],
    regexPatterns: [/school/i, /university/i, /college/i, /institution/i]
  }),
  'education[].degree': createRule({
    exactPhrases: ['degree', 'qualification', 'level of education'],
    regexPatterns: [/degree/i, /qualification/i]
  }),
  'education[].fieldOfStudy': createRule({
    exactPhrases: ['field of study', 'major', 'discipline', 'subject'],
    regexPatterns: [/major/i, /field\s*of\s*study/i, /discipline/i, /specialization/i]
  }),
  'education[].startDate': createRule({
    exactPhrases: ['start date', 'from date', 'from year', 'started'],
    regexPatterns: [/start\s*date/i, /from/i, /start/i]
  }),
  'education[].endDate': createRule({
    exactPhrases: ['end date', 'to date', 'graduation date', 'graduated', 'to year'],
    regexPatterns: [/end\s*date/i, /to/i, /grad/i]
  }),
  'education[].gpa': createRule({
    exactPhrases: ['gpa', 'grade point average', 'grades'],
    regexPatterns: [/gpa/i, /grade/i]
  }),
  'education.highest.school': createRule({
    exactPhrases: ['highest school', 'highest university', 'highest level school'],
    regexPatterns: [/highest\s*school/i, /highest\s*university/i]
  }),
  'education.highest.degree': createRule({
    exactPhrases: ['highest degree', 'highest qualification', 'highest level of education'],
    regexPatterns: [/highest\s*degree/i, /highest\s*qualification/i, /level\s*of\s*education/i]
  }),
  'experience[].company': createRule({
    exactPhrases: ['company', 'employer', 'organization'],
    regexPatterns: [/company/i, /employer/i, /organization/i]
  }),
  'experience[].title': createRule({
    exactPhrases: ['title', 'job title', 'role', 'position'],
    regexPatterns: [/title/i, /role/i, /position/i]
  }),
  'experience[].location': createRule({
    exactPhrases: ['location', 'city', 'job location'],
    regexPatterns: [/location/i]
  }),
  'experience[].startDate': createRule({
    exactPhrases: ['start date', 'from date', 'started'],
    regexPatterns: [/start\s*date/i, /from/i, /start/i]
  }),
  'experience[].endDate': createRule({
    exactPhrases: ['end date', 'to date', 'currently work here'],
    regexPatterns: [/end\s*date/i, /to/i]
  }),
  'experience[].description': createRule({
    exactPhrases: ['description', 'duties', 'responsibilities', 'summary of experience'],
    regexPatterns: [/description/i, /duties/i, /responsibilities/i]
  }),
  'references[].name': createRule({
    sensitivityTier: 'sensitive',
    exactPhrases: ['reference name', 'contact name', 'ref name'],
    regexPatterns: [/reference\s*name/i, /ref\s*name/i]
  }),
  'references[].relationship': createRule({
    sensitivityTier: 'sensitive',
    exactPhrases: ['relationship', 'how do you know this person'],
    regexPatterns: [/relationship/i, /relation/i]
  }),
  'references[].company': createRule({
    sensitivityTier: 'sensitive',
    exactPhrases: ['reference company', 'ref company'],
    regexPatterns: [/reference\s*company/i, /ref\s*company/i]
  }),
  'references[].title': createRule({
    sensitivityTier: 'sensitive',
    exactPhrases: ['reference title', 'ref title'],
    regexPatterns: [/reference\s*title/i, /ref\s*title/i]
  }),
  'references[].email': createRule({
    allowedTypes: ['email', 'text'],
    sensitivityTier: 'sensitive',
    exactPhrases: ['reference email', 'ref email'],
    regexPatterns: [/reference\s*email/i, /ref\s*email/i]
  }),
  'references[].phone': createRule({
    allowedTypes: ['tel', 'text'],
    sensitivityTier: 'sensitive',
    exactPhrases: ['reference phone', 'ref phone'],
    regexPatterns: [/reference\s*phone/i, /ref\s*phone/i]
  }),
  'family.fatherName': createRule({
    sensitivityTier: 'sensitive',
    exactPhrases: ['father name', 'fathers name', 'father\'s name', 'father'],
    regexPatterns: [/father/i]
  }),
  'family.motherName': createRule({
    sensitivityTier: 'sensitive',
    exactPhrases: ['mother name', 'mothers name', 'mother\'s name', 'mother'],
    regexPatterns: [/mother/i]
  }),
  'documents.resume': createRule({
    allowedTypes: ['file'],
    exactPhrases: ['resume', 'cv', 'curriculum vitae', 'upload resume', 'upload cv'],
    regexPatterns: [/resume/i, /cv/i, /curriculum/i]
  }),
  'documents.cv': createRule({
    allowedTypes: ['file'],
    exactPhrases: ['cv', 'curriculum vitae', 'upload cv'],
    regexPatterns: [/cv/i, /curriculum/i]
  }),
  'documents.coverLetter': createRule({
    allowedTypes: ['file'],
    exactPhrases: ['cover letter', 'upload cover letter', 'upload letter'],
    regexPatterns: [/cover\s*letter/i, /letter/i]
  }),
  'documents.photo': createRule({
    allowedTypes: ['file'],
    exactPhrases: ['photo', 'headshot', 'picture', 'upload photo', 'upload picture'],
    regexPatterns: [/photo/i, /headshot/i, /picture/i, /image/i]
  }),
  'eeo.gender': createRule({
    sensitivityTier: 'sensitive',
    requiresOptIn: true,
    optInKey: 'sensitiveEeo',
    exactPhrases: ['gender', 'sex'],
    regexPatterns: [/gender/i, /sex/i]
  }),
  'eeo.race': createRule({
    sensitivityTier: 'sensitive',
    requiresOptIn: true,
    optInKey: 'sensitiveEeo',
    exactPhrases: ['race', 'ethnicity', 'racial group'],
    regexPatterns: [/race/i, /ethnicity/i]
  }),
  'eeo.veteranStatus': createRule({
    sensitivityTier: 'sensitive',
    requiresOptIn: true,
    optInKey: 'sensitiveEeo',
    exactPhrases: ['veteran', 'veteran status', 'military service'],
    regexPatterns: [/veteran/i, /military/i]
  }),
  'eeo.disabilityStatus': createRule({
    sensitivityTier: 'sensitive',
    requiresOptIn: true,
    optInKey: 'sensitiveEeo',
    exactPhrases: ['disability', 'disability status', 'handicap'],
    regexPatterns: [/disability/i, /handicap/i]
  })
};

export const arrayShapeSignatures = {
  education: ['school', 'degree', 'major', 'date', 'gpa', 'university', 'college'],
  experience: ['company', 'title', 'location', 'date', 'description', 'employer'],
  references: ['name', 'relationship', 'company', 'email', 'phone', 'relation']
};
