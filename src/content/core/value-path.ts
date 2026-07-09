import { DEGREE_RANK } from '../../shared/constants/constants.js';

export function getDegreeRank(degreeName: string): number {
  if (!degreeName) return 0;
  const norm = degreeName.toLowerCase().trim();

  if ((DEGREE_RANK as Record<string, number>)[norm] !== undefined) {
    return (DEGREE_RANK as Record<string, number>)[norm];
  }

  for (const [key, val] of Object.entries(DEGREE_RANK)) {
    if (norm.includes(key)) {
      return val;
    }
  }

  return 1;
}

export function getValueByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;

  if (path.startsWith('education.highest.')) {
    const field = path.substring('education.highest.'.length);
    const educationList = obj.education;
    if (!Array.isArray(educationList) || educationList.length === 0) {
      return undefined;
    }

    const sorted = [...educationList].sort((a, b) => {
      const rankA = getDegreeRank(a.degree);
      const rankB = getDegreeRank(b.degree);
      return rankB - rankA;
    });

    return sorted[0][field as keyof typeof sorted[0]];
  }

  if (path.startsWith('documents.')) {
    return obj.documents?.[path];
  }

  const parts = path.replace(/\]/g, '').split(/[.\[]/);
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

