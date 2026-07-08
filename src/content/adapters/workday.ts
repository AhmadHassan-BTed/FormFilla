import { PlatformAdapter } from '../../shared/types.js';

export class WorkdayAdapter implements PlatformAdapter {
  matches(): boolean {
    return (
      window.location.hostname.includes('workday') ||
      document.querySelector('[data-automation-id="workdayLogo"]') !== null ||
      document.querySelector('[data-metadata-id]') !== null
    );
  }

  beforeScan(): void {
    // Workday sometimes wraps inputs in shadow DOMs or frames.
    // Ensure styles are set so our overlays draw nicely.
    console.log('WorkdayAdapter matched and preparing layout...');
  }
}
