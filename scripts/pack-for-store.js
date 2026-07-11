// FormFilla Store Packer
// Builds the extension and creates a ZIP package for Chrome Web Store submission.
// Fully cross-platform: uses native Node FS APIs for cleanup and standard tar for zipping.

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const OUTPUT_ZIP = 'formfilla-store.zip';

console.log('📦 FormFilla Store Packer');
console.log('========================');

// Step 1: Build the extension
console.log('\n📝 Building extension...');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Build complete.');
} catch (err) {
  console.error('❌ Build failed.');
  process.exit(1);
}

// Step 2: Clean up old zip natively
console.log('\n🧹 Removing old package if exists...');
try {
  if (fs.existsSync(OUTPUT_ZIP)) {
    fs.unlinkSync(OUTPUT_ZIP);
    console.log('✅ Old package removed.');
  } else {
    console.log('ℹ️ No old package to remove.');
  }
} catch (err) {
  console.warn('⚠️ Warning: Failed to clean up old ZIP natively:', err.message);
}

// Step 3: Create store-ready zip using cross-platform tar
console.log('\n📦 Creating ZIP package...');
try {
  // tar -a detects target extension (.zip) and compresses using the zip format.
  // -C dist tells tar to change to the dist directory first, zipping its contents at the root level.
  execSync(`tar -a -cf ${OUTPUT_ZIP} -C dist .`, { stdio: 'inherit' });
  console.log(`\n✅ Package created: ${OUTPUT_ZIP}`);
} catch (err) {
  console.error('❌ Failed to create ZIP using tar:', err.message);
  console.log('🔄 Attempting fallback zipping method...');
  
  // Fallback to powershell Compress-Archive only on Windows if tar failed
  if (process.platform === 'win32') {
    try {
      execSync(`powershell -Command "Compress-Archive -Path dist\\* -DestinationPath ${OUTPUT_ZIP} -Force"`, { stdio: 'inherit' });
      console.log(`✅ Fallback Package created: ${OUTPUT_ZIP}`);
    } catch (fallbackErr) {
      console.error('❌ Fallback zipping also failed:', fallbackErr.message);
      process.exit(1);
    }
  } else {
    process.exit(1);
  }
}

console.log('\n🎉 Ready for Chrome Web Store upload!');