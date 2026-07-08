import { IPlatformAdapter } from './adapter.interface.js';

export class WorkdayAdapter implements IPlatformAdapter {
  matches(): boolean {
    return (
      window.location.hostname.includes('workday') ||
      document.querySelector('[data-automation-id="workdayLogo"]') !== null ||
      document.querySelector('[data-metadata-id]') !== null
    );
  }

  beforeScan(): void {
    console.log('WorkdayAdapter matched and preparing layout...');
  }
}
