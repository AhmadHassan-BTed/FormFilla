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

// Step 2.5: Clean up source maps from dist (not needed for production)
console.log('\n🧹 Cleaning up source maps...');
function cleanupSourceMaps(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      cleanupSourceMaps(fullPath);
    } else if (file.endsWith('.map')) {
      fs.unlinkSync(fullPath);
      console.log(`  Removed: ${fullPath}`);
    }
  }
}
cleanupSourceMaps('dist');
console.log('✅ Source maps cleaned.');

// Step 3: Create store-ready zip
console.log('\n📦 Creating ZIP package...');
try {
  // On Windows, use PowerShell's Compress-Archive for clean paths
  if (process.platform === 'win32') {
    execSync(`powershell -Command "Compress-Archive -Path dist\\* -DestinationPath ${OUTPUT_ZIP} -Force"`, { stdio: 'inherit' });
    console.log(`\n✅ Package created: ${OUTPUT_ZIP}`);
  } else {
    // On Unix, use tar with -C to change directory first
    // Use --transform to strip ./ prefix if present
    execSync(`tar -a -cf ${OUTPUT_ZIP} -C dist . --transform 's|^\\./||'`, { stdio: 'inherit' });
    console.log(`\n✅ Package created: ${OUTPUT_ZIP}`);
  }
} catch (err) {
  console.error('❌ Failed to create ZIP:', err.message);
  process.exit(1);
}

console.log('\n🎉 Ready for Chrome Web Store upload!');