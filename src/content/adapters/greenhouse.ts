import { PlatformAdapter } from '../../shared/types.js';

export class GreenhouseAdapter implements PlatformAdapter {
  matches(): boolean {
    return (
      window.location.hostname.includes('greenhouse.io') ||
      document.getElementById('main-fields') !== null ||
      document.querySelector('form[action*="greenhouse"]') !== null
    );
  }
}
