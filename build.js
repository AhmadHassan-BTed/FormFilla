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

function copyAssets() {
  console.log('Copying static assets...');
  copyFile('manifest.json', 'dist/manifest.json');
  
  if (fs.existsSync('src/popup/popup.html')) copyFile('src/popup/popup.html', 'dist/popup/popup.html');
  if (fs.existsSync('src/popup/popup.css')) copyFile('src/popup/popup.css', 'dist/popup/popup.css');
  if (fs.existsSync('src/options/options.html')) copyFile('src/options/options.html', 'dist/options/options.html');
  if (fs.existsSync('src/options/options.css')) copyFile('src/options/options.css', 'dist/options/options.css');
  if (fs.existsSync('src/assets/logo.svg')) copyFile('src/assets/logo.svg', 'dist/assets/logo.svg');
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
  sourcemap: true,
  format: 'esm',
  logLevel: 'info',
  define: {
    'process.env.DEBUG_MODE': JSON.stringify(env.DEBUG_MODE || 'false'),
    'process.env.MOCK_STORAGE': JSON.stringify(env.MOCK_STORAGE || 'false'),
    'process.env.BYPASS_CONFIRMATIONS': JSON.stringify(env.BYPASS_CONFIRMATIONS || 'false')
  }
};

async function run() {
  if (isWatch) {
    let ctx = await esbuild.context({
      ...buildOptions,
      plugins: [{
        name: 'assets-copier',
        setup(build) {
          build.onEnd(() => {
            copyAssets();
          });
        }
      }]
    });
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    copyAssets();
    console.log('Build complete.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
