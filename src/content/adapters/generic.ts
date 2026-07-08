import { IPlatformAdapter } from './adapter.interface.js';

export class GenericAdapter implements IPlatformAdapter {
  matches(): boolean {
    return true;
  }
}
