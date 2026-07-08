export const HIGH_THRESHOLD = 70;
export const LOW_THRESHOLD = 40;
export const DEBOUNCE_MS = 400;

export const CONFIRM_PATTERN = /confirm|repeat|verify/i;

export const ABBREVIATION_MAP: Record<string, string> = {
  fname: 'first name',
  lname: 'last name',
  mname: 'middle name',
  dob: 'date of birth',
  ssn: 'social security number',
  tel: 'phone number',
  phone: 'phone number',
  mobile: 'phone number',
  cell: 'phone number',
  addr: 'address',
  cv: 'curriculum vitae',
  resume: 'resume',
  gpa: 'grade point average',
  grad: 'graduation',
  univ: 'university',
  sch: 'school',
  deg: 'degree',
  loc: 'location',
  desc: 'description',
  pos: 'position',
  ref: 'reference',
  rel: 'relationship',
  pwd: 'password',
  passwd: 'password'
};

export const DEGREE_RANK: Record<string, number> = {
  'phd': 6,
  'doctorate': 6,
  'doctor': 6,
  'master': 5,
  'masters': 5,
  'msc': 5,
  'ms': 5,
  'mba': 5,
  'ma': 5,
  'bachelor': 4,
  'bachelors': 4,
  'bsc': 4,
  'bs': 4,
  'ba': 4,
  'associate': 3,
  'associates': 3,
  'undergraduate': 2,
  'high school': 1,
  'highschool': 1,
  'diploma': 1,
  'ged': 1
};
