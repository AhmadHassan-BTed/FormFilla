import { PlatformAdapter } from '../../shared/types.js';

export class LeverAdapter implements PlatformAdapter {
  matches(): boolean {
    return (
      window.location.hostname.includes('lever.co') ||
      document.querySelector('.application-form') !== null ||
      document.getElementById('lever-application-form') !== null
    );
  }
}
