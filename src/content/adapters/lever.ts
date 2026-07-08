import { IPlatformAdapter } from './adapter.interface.js';

export class LeverAdapter implements IPlatformAdapter {
  matches(): boolean {
    return (
      window.location.hostname.includes('lever.co') ||
      document.querySelector('.application-form') !== null ||
      document.getElementById('lever-application-form') !== null
    );
  }
}
