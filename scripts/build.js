import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const isWatch = process.argv.includes('--watch');

const entryPoints = [
  'src/background/service-worker.ts',
  'src/content/index.ts',
  'src/popup/popup.ts',
  'src/options/options.ts'
];

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyAssets() {
  console.log('Copying static assets...');
  copyFile('manifest.json', 'dist/manifest.json');

  if (fs.existsSync('src/popup/popup.html')) copyFile('src/popup/popup.html', 'dist/popup/popup.html');
  if (fs.existsSync('src/popup/popup.css')) copyFile('src/popup/popup.css', 'dist/popup/popup.css');
  if (fs.existsSync('src/options/options.html')) copyFile('src/options/options.html', 'dist/options/options.html');
  if (fs.existsSync('src/options/options.css')) copyFile('src/options/options.css', 'dist/options/options.css');
  if (fs.existsSync('src/options/sections')) copyDir('src/options/sections', 'dist/options/sections');
  if (fs.existsSync('src/assets/logo.svg')) copyFile('src/assets/logo.svg', 'dist/assets/logo.svg');
  if (fs.existsSync('icon.svg')) copyFile('icon.svg', 'dist/icon.svg');
  if (fs.existsSync('src/popup/theme-loader.js')) copyFile('src/popup/theme-loader.js', 'dist/popup/theme-loader.js');
  if (fs.existsSync('src/options/theme-loader.js')) copyFile('src/options/theme-loader.js', 'dist/options/theme-loader.js');

  if (fs.existsSync('src/themes')) {
    try {
      const files = fs.readdirSync('src/themes');
      for (const file of files) {
        copyFile(path.join('src/themes', file), path.join('dist/themes', file));
      }
    } catch (e) {
      console.warn('Failed to copy themes:', e);
    }
  }

  if (fs.existsSync('icons')) {
    try {
      const files = fs.readdirSync('icons');
      for (const file of files) {
        copyFile(path.join('icons', file), path.join('dist/icons', file));
      }
    } catch (e) {
      console.warn('Failed to copy icons:', e);
    }
  }
}

function readDotEnv() {
  const env = {};
  if (fs.existsSync('.env')) {
    const content = fs.readFileSync('.env', 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index !== -1) {
        const key = trimmed.substring(0, index).trim();
        const val = trimmed.substring(index + 1).trim().replace(/^['"]|['"]$/g, '');
        env[key] = val;
      }
    }
  }
  return env;
}

const env = readDotEnv();

const buildOptions = {
  entryPoints,
  bundle: true,
  outdir: 'dist',
  platform: 'browser',
  target: 'chrome100',
  sourcemap: false,
  format: 'esm',
  logLevel: 'info',
  define: {
    'process.env.DEBUG_MODE': JSON.stringify(env.DEBUG_MODE || 'false'),
    'process.env.MOCK_STORAGE': JSON.stringify(env.MOCK_STORAGE || 'false'),
    'process.env.BYPASS_CONFIRMATIONS': JSON.stringify(env.BYPASS_CONFIRMATIONS || 'false'),
    'process.env.FIREBASE_API_KEY': JSON.stringify(env.FIREBASE_API_KEY || ''),
    'process.env.FIREBASE_AUTH_DOMAIN': JSON.stringify(env.FIREBASE_AUTH_DOMAIN || ''),
    'process.env.FIREBASE_PROJECT_ID': JSON.stringify(env.FIREBASE_PROJECT_ID || ''),
    'process.env.FIREBASE_STORAGE_BUCKET': JSON.stringify(env.FIREBASE_STORAGE_BUCKET || ''),
    'process.env.FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(env.FIREBASE_MESSAGING_SENDER_ID || ''),
    'process.env.FIREBASE_APP_ID': JSON.stringify(env.FIREBASE_APP_ID || '')
  }
};

function sanitizeBuildArtifacts() {
  console.log('Sanitizing build artifacts for Chrome Web Store MV3 compliance...');
  const targetFiles = [
    path.join('dist', 'background', 'service-worker.js'),
    path.join('dist', 'content', 'index.js'),
    path.join('dist', 'popup', 'popup.js'),
    path.join('dist', 'options', 'options.js')
  ];

  const remoteCodePatterns = [
    /https:\/\/apis\.google\.com\/js\/api\.js/g,
    /https:\/\/www\.google\.com\/recaptcha\/api\.js/g,
    /https:\/\/www\.google\.com\/recaptcha\/enterprise\.js\?render=/g
  ];

  for (const filePath of targetFiles) {
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf-8');
      let modified = false;
      for (const pattern of remoteCodePatterns) {
        if (pattern.test(content)) {
          content = content.replace(pattern, '');
          modified = true;
        }
      }
      if (modified) {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`  Sanitized remotely hosted code references in ${filePath}`);
      }
    }
  }
}

function verifyNoRemotelyHostedCode() {
  console.log('Verifying build output contains NO remotely hosted script URLs...');
  const remoteJsRegex = /https?:\/\/[^\s"']+\.js(\?[^\s"']*)?/g;
  let violationsFound = false;

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.js')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const matches = content.match(remoteJsRegex);
        if (matches && matches.length > 0) {
          console.error(`❌ Remotely hosted code URL detected in ${fullPath}:`);
          for (const match of matches) {
            console.error(`   - ${match}`);
          }
          violationsFound = true;
        }
      }
    }
  }

  scanDir('dist');

  if (violationsFound) {
    console.error('❌ Build failed: Remotely hosted script URLs found in dist output!');
    process.exit(1);
  } else {
    console.log('✅ Verification passed: 0 remotely hosted script URLs found in dist.');
  }
}

async function run() {
  if (isWatch) {
    let ctx = await esbuild.context({
      ...buildOptions,
      plugins: [{
        name: 'assets-copier',
        setup(build) {
          build.onEnd(() => {
            copyAssets();
            sanitizeBuildArtifacts();
            verifyNoRemotelyHostedCode();
          });
        }
      }]
    });
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    copyAssets();
    sanitizeBuildArtifacts();
    verifyNoRemotelyHostedCode();
    console.log('Build complete.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

