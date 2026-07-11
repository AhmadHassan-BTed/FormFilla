// FormFilla Store Packer
// Builds the extension and creates a ZIP package for Chrome Web Store submission.

import { execSync } from 'child_process';

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

// Step 2: Clean up old zip
console.log('\n🧹 Removing old package if exists...');
try {
  execSync(`powershell -Command "Remove-Item -Path ${OUTPUT_ZIP} -ErrorAction SilentlyContinue"`);
} catch {
  // Ignore if file doesn't exist
}

// Step 3: Create store-ready zip using PowerShell
console.log('\n📦 Creating ZIP package...');
try {
  execSync(`powershell -Command "Compress-Archive -Path dist\\* -DestinationPath ${OUTPUT_ZIP} -Force"`);
  console.log(`✅ Package created: ${OUTPUT_ZIP}`);
} catch (err) {
  console.error('❌ Failed to create ZIP:', err);
  process.exit(1);
}

console.log('\n🎉 Ready for Chrome Web Store upload!');