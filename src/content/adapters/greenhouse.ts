import { IPlatformAdapter } from './adapter.interface.js';

export class GreenhouseAdapter implements IPlatformAdapter {
  matches(): boolean {
    return (
      window.location.hostname.includes('greenhouse.io') ||
      document.getElementById('main-fields') !== null ||
      document.querySelector('form[action*="greenhouse"]') !== null
    );
  }
}
