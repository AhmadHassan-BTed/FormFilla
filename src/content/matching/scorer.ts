import { FieldSignals, ScoredField, Candidate, Profile, SensitivityTier, GateType } from '../../shared/types.js';
import { FIELD_RULES } from './dictionary.js';
import { tokenize } from './normalizer.js';
import { diceCoefficient, jaroWinkler } from './fuzzy.js';
import { hungarianMaxWeightMatching, FieldCandidates } from './assignment.js';
import { HIGH_THRESHOLD, LOW_THRESHOLD, CONFIRM_PATTERN } from '../../shared/constants.js';

export function scoreField(signals: FieldSignals, profile: Profile): Candidate[] {
  const candidates: Candidate[] = [];

  // Group candidate signal text fields with their relevance weights
  const sources = [
    { text: signals.label || '', weight: 1.0 },
    { text: signals.placeholder || '', weight: 0.9 },
    { text: signals.name || '', weight: 0.8 },
    { text: signals.id || '', weight: 0.7 },
    { text: signals.legend || '', weight: 0.6 }
  ].filter(s => s.text.trim() !== '');

  for (const [candidateKey, rule] of Object.entries(FIELD_RULES)) {
    // 1. Sensitivity tier check
    if (rule.sensitivityTier === 'sensitive' && rule.requiresOptIn) {
      const optInKey = rule.optInKey || 'sensitiveEeo';
      if (!profile.optIns || !profile.optIns[optInKey]) {
        continue;
      }
    }

    // 2. Type compatibility check
    if (!rule.typeCompatible(signals.type, signals.tagName)) {
      continue;
    }

    // 3. Autocomplete match (direct field-level check)
    let autocompleteBonus = 0;
    if (signals.autocomplete && rule.autocompleteTokens.includes(signals.autocomplete.toLowerCase())) {
      autocompleteBonus = 45;
    }

    let bestSourceScore = 0;

    // Score each text source and take the maximum weighted score
    for (const source of sources) {
      const tokens = tokenize(source.text);
      const tokensStr = tokens.join(' ');
      if (!tokensStr) continue;

      let score = 0;

      // A. Exact phrase matches
      const exactMatch = rule.exactPhrases.some(phrase => phrase.toLowerCase() === tokensStr);
      if (exactMatch) {
        score += 35;
      }

      // B. Regex pattern matches
      const regexMatch = rule.regexPatterns.some(pattern => pattern.test(tokensStr));
      if (regexMatch) {
        score += 20;
      }

      // C. Fuzzy string similarity
      let maxSimilarity = 0;
      for (const phrase of rule.exactPhrases) {
        const dice = diceCoefficient(tokensStr, phrase);
        const jw = jaroWinkler(tokensStr, phrase);
        const sim = Math.max(dice, jw);
        if (sim > maxSimilarity) {
          maxSimilarity = sim;
        }
      }
      if (maxSimilarity > 0.6) {
        score += maxSimilarity * 15;
      }

      // D. Negative patterns penalty
      if (rule.negativePatterns) {
        const negativeMatch = rule.negativePatterns.some(pattern => pattern.test(tokensStr));
        if (negativeMatch) {
          score -= 40;
        }
      }

      const weightedScore = score * source.weight;
      if (weightedScore > bestSourceScore) {
        bestSourceScore = weightedScore;
      }
    }

    let totalScore = bestSourceScore + autocompleteBonus;

    // E. Context bonus
    totalScore += blockContextBonus(signals.blockIndex, signals.blockType, candidateKey);

    if (totalScore >= LOW_THRESHOLD) {
      candidates.push({
        key: candidateKey,
        score: totalScore,
        tier: rule.sensitivityTier
      });
    }
  }

  return candidates;
}

function blockContextBonus(
  blockIndex: number | undefined,
  blockType: 'education' | 'experience' | 'references' | undefined,
  candidateKey: string
): number {
  if (blockIndex !== undefined && blockType !== undefined) {
    const prefix = `${blockType}[]`;
    if (candidateKey.startsWith(prefix)) {
      return 15;
    }
  } else {
    if (candidateKey.includes('.highest.')) {
      return 15;
    }
  }
  return 0;
}

export function resolveAllFields(
  fieldsWithSignals: { element: Element; signals: FieldSignals }[],
  profile: Profile
): ScoredField[] {
  const graphInputs: FieldCandidates[] = [];

  for (let i = 0; i < fieldsWithSignals.length; i++) {
    const { signals } = fieldsWithSignals[i];
    const rawCandidates = scoreField(signals, profile);

    const concreteCandidates = rawCandidates.map(c => {
      let concreteKey = c.key;
      if (signals.blockIndex !== undefined && signals.blockType !== undefined) {
        concreteKey = c.key.replace('[]', `[${signals.blockIndex}]`);
      }
      return {
        key: concreteKey,
        score: c.score
      };
    });

    graphInputs.push({
      fieldIndex: i,
      candidates: concreteCandidates
    });
  }

  const assignments = hungarianMaxWeightMatching(graphInputs);
  const scoredFields: ScoredField[] = [];

  for (const assign of assignments) {
    const fieldItem = fieldsWithSignals[assign.fieldIndex];
    const originalCand = FIELD_RULES[assign.key.replace(/\[\d+\]/g, '[]')];

    if (!originalCand) continue;

    const confidence = assign.score >= HIGH_THRESHOLD ? 'high' : 'medium';
    
    let gate: GateType = 'unmapped';
    if (originalCand.sensitivityTier === 'critical') {
      gate = 'needs-confirm';
    } else if (originalCand.sensitivityTier === 'sensitive') {
      gate = confidence === 'high' ? 'confident' : 'unmapped';
    } else {
      gate = confidence === 'high' ? 'confident' : 'review';
    }

    scoredFields.push({
      element: fieldItem.element,
      key: assign.key,
      score: assign.score,
      tier: originalCand.sensitivityTier,
      confidence,
      gate
    });
  }

  // Handle email confirm patterns
  for (let i = 0; i < scoredFields.length; i++) {
    const f1 = scoredFields[i];
    if (f1.key === 'personal.email' && f1.gate === 'confident') {
      for (let j = 0; j < fieldsWithSignals.length; j++) {
        const alreadyAssigned = scoredFields.some(sf => sf.element === fieldsWithSignals[j].element && sf.gate !== 'unmapped');
        if (alreadyAssigned) continue;

        const signals = fieldsWithSignals[j].signals;
        const textToTest = [signals.label || '', signals.name || '', signals.id || ''].join(' ');
        if (CONFIRM_PATTERN.test(textToTest) && /email/i.test(textToTest)) {
          scoredFields.push({
            element: fieldsWithSignals[j].element,
            key: 'personal.email',
            score: f1.score,
            tier: f1.tier,
            confidence: f1.confidence,
            gate: f1.gate
          });
        }
      }
    }
  }

  return scoredFields;
}
