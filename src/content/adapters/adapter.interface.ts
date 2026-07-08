import { FieldSignals, ScoredField } from '../../shared/types/index.js';

export interface IPlatformAdapter {
  matches(): boolean;
  beforeScan?(): void;
  scoreOverride?(signals: FieldSignals): ScoredField | null;
}
