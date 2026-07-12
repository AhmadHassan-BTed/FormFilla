import { FieldSignals, ScoredField, Candidate, Profile, SensitivityTier, GateType, ArrayBlockType } from '../../shared/types/index.js';
import { IPlatformAdapter } from '../adapters/adapter.interface.js';
import { FIELD_RULES, FieldRule } from '../../shared/dictionary/rules.js';
import { tokenize } from './normalizer.js';
import { diceCoefficient, jaroWinkler } from './fuzzy.js';
import { hungarianMaxWeightMatching, FieldCandidates } from './assignment.js';
import { HIGH_THRESHOLD, LOW_THRESHOLD, CONFIRM_PATTERN } from '../../shared/constants/constants.js';

export function scoreField(
  signals: FieldSignals,
  profile: Profile,
  customRules?: Record<string, FieldRule>
): Candidate[] {
  const candidates: Candidate[] = [];

  const sources = [
    { text: signals.label || '', weight: 1.0 },
    { text: signals.placeholder || '', weight: 0.9 },
    { text: signals.name || '', weight: 0.8 },
    { text: signals.id || '', weight: 0.7 },
    { text: signals.legend || '', weight: 0.6 }
  ].filter(s => s.text.trim() !== '');

  const rulesToEvaluate = customRules
    ? { ...FIELD_RULES, ...customRules }
    : FIELD_RULES;

  for (const [candidateKey, rule] of Object.entries(rulesToEvaluate)) {
    if (rule.sensitivityTier === 'sensitive' && rule.requiresOptIn) {
      const optInKey = rule.optInKey || 'sensitiveEeo';
      const isOptInAllowed = !profile.optIns || profile.optIns[optInKey] !== false;
      if (!isOptInAllowed) {
        continue;
      }
    }

    if (!rule.typeCompatible(signals.type, signals.tagName)) {
      continue;
    }

    const isDobIdentifier = /dob|birth/i.test(signals.id || '') || /dob|birth/i.test(signals.name || '');
    if (isDobIdentifier && candidateKey !== 'personal.dateOfBirth') {
      continue;
    }

    if (candidateKey.includes('[]')) {
      const expectedBlockType = candidateKey.split('[')[0];
      if (signals.blockType !== expectedBlockType) {
        continue;
      }
    }

    let autocompleteBonus = 0;
    if (signals.autocomplete && rule.autocompleteTokens.includes(signals.autocomplete.toLowerCase())) {
      autocompleteBonus = 45;
    }

    let bestSourceScore = 0;

    for (const source of sources) {
      const tokens = tokenize(source.text);
      const tokensStr = tokens.join(' ');
      if (!tokensStr) continue;

      let score = 0;

      const exactMatch = rule.exactPhrases.some(phrase => phrase.toLowerCase() === tokensStr);
      if (exactMatch) {
        score += 35;
      }

      const regexMatch = rule.regexPatterns.some(pattern => pattern.test(tokensStr));
      if (regexMatch) {
        score += 20;
      }

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
  blockType: ArrayBlockType | undefined,
  candidateKey: string
): number {
  if (blockIndex !== undefined && blockType !== undefined) {
    const prefix = `${blockType}[]`;
    if (candidateKey.startsWith(prefix)) {
      return 15;
    }
  }
  return 0;
}

export function resolveAllFields(
  fieldsWithSignals: { element: Element; signals: FieldSignals }[],
  profile: Profile,
  activeAdapter?: IPlatformAdapter,
  customRules?: Record<string, FieldRule>
): ScoredField[] {
  const scoredFields: ScoredField[] = [];
  const preAssignedIndices = new Set<number>();
  const preAssignedKeys = new Set<string>();

  for (let i = 0; i < fieldsWithSignals.length; i++) {
    const { element, signals } = fieldsWithSignals[i];
    let override: ScoredField | null = null;
    if (activeAdapter?.scoreOverride) {
      try {
        override = activeAdapter.scoreOverride(signals);
      } catch (err) {
        console.error('FormFilla: adapter scoreOverride failed', err);
      }
    }

    if (override) {
      scoredFields.push(override);
      preAssignedIndices.add(i);
      preAssignedKeys.add(override.key);
    }
  }

  const graphInputs: FieldCandidates[] = [];

  for (let i = 0; i < fieldsWithSignals.length; i++) {
    if (preAssignedIndices.has(i)) continue;

    const { signals } = fieldsWithSignals[i];
    const rawCandidates = scoreField(signals, profile, customRules);

    const concreteCandidates = rawCandidates
      .map(c => {
        let concreteKey = c.key;
        if (signals.blockIndex !== undefined && signals.blockType !== undefined) {
          concreteKey = c.key.replace('[]', `[${signals.blockIndex}]`);
        }
        return {
          key: concreteKey,
          score: c.score
        };
      })
      .filter(c => !preAssignedKeys.has(c.key));

    graphInputs.push({
      fieldIndex: i,
      candidates: concreteCandidates
    });
  }

  const assignments = hungarianMaxWeightMatching(graphInputs);

  for (const assign of assignments) {
    const fieldItem = fieldsWithSignals[assign.fieldIndex];
    const originalCand = FIELD_RULES[assign.key.replace(/\[\d+\]/g, '[]')];

    if (!originalCand) continue;

    const confidence = assign.score >= HIGH_THRESHOLD ? 'high' : 'medium';
    
    let gate: GateType = 'unmapped';
    const autoFillCritical = profile.optIns?.autoFillCritical !== false;

    if (originalCand.sensitivityTier === 'critical') {
      if (autoFillCritical) {
        gate = confidence === 'high' ? 'confident' : 'review';
      } else {
        gate = 'needs-confirm';
      }
    } else if (originalCand.sensitivityTier === 'sensitive') {
      gate = confidence === 'high' ? 'confident' : 'review';
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
