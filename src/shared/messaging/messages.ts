import { FillResult } from '../types/index.js';

export type MessageType = 'START_FILL' | 'FILL_RESULT' | 'PERMISSION_NEEDED' | 'CONFIRM_FIELD';

export interface StartFillMessage {
  type: 'START_FILL';
  tabId: number;
}

export interface FillResultMessage {
  type: 'FILL_RESULT';
  result: FillResult;
}

export interface PermissionNeededMessage {
  type: 'PERMISSION_NEEDED';
  origin: string;
}

export interface ConfirmFieldMessage {
  type: 'CONFIRM_FIELD';
  fieldKey: string;
}

export type ExtensionMessage =
  | StartFillMessage
  | FillResultMessage
  | PermissionNeededMessage
  | ConfirmFieldMessage;

export function createStartFillMessage(tabId: number): StartFillMessage {
  return { type: 'START_FILL', tabId };
}

export function createFillResultMessage(result: FillResult): FillResultMessage {
  return { type: 'FILL_RESULT', result };
}

export function createPermissionNeededMessage(origin: string): PermissionNeededMessage {
  return { type: 'PERMISSION_NEEDED', origin };
}

export function createConfirmFieldMessage(fieldKey: string): ConfirmFieldMessage {
  return { type: 'CONFIRM_FIELD', fieldKey };
}
