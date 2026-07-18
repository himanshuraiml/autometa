const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  const args = process.argv.slice(2);
  const ifMissing = args.includes('--if-missing');

  console.log('Detecting host target triple...');
  const rustcOutput = execSync('rustc -vV').toString();
  const hostLine = rustcOutput.split('\n').find(line => line.startsWith('host:'));
  if (!hostLine) {
    throw new Error('Could not find host line in rustc -vV output');
  }
  const targetTriple = hostLine.split(':')[1].trim();
  console.log(`Host target triple: ${targetTriple}`);

  const isWindows = process.platform === 'win32';
  const ext = isWindows ? '.exe' : '';
  const binaryName = `autometa-backend-${targetTriple}${ext}`;

  const backendDir = path.resolve(__dirname, '../../../services/backend');
  const desktopDir = path.resolve(__dirname, '..');
  const binariesDir = path.join(desktopDir, 'src-tauri/binaries');
  const destPath = path.join(binariesDir, binaryName);

  // If running in dev mode with --if-missing, check if the binary already exists
  if (ifMissing && fs.existsSync(destPath)) {
    console.log(`Backend sidecar already exists at ${destPath}. Skipping compilation.`);
    console.log('To force rebuild, run: npm run build:backend');
    process.exit(0);
  }

  // Ensure binaries directory exists
  if (!fs.existsSync(binariesDir)) {
    fs.mkdirSync(binariesDir, { recursive: true });
  }

  // Find python/pyinstaller executable
  const venvBinDir = isWindows ? 'Scripts' : 'bin';
  const pyinstallerPath = path.join(backendDir, 'venv', venvBinDir, `pyinstaller${ext}`);

  if (!fs.existsSync(pyinstallerPath)) {
    console.error(`Error: PyInstaller not found at "${pyinstallerPath}".`);
    console.error('Please make sure you have created the python virtual environment and installed dependencies:');
    console.error('  cd services/backend');
    console.error('  python -m venv venv');
    console.error('  source venv/bin/activate  # or venv\\Scripts\\activate on Windows');
    console.error('  pip install -r requirements.txt');
    process.exit(1);
  }

  console.log('Compiling Python backend with PyInstaller...');
  // We run pyinstaller inside apps/desktop so dist/autometa-backend is created there
  execSync(`"${pyinstallerPath}" --onefile --clean --name autometa-backend ../../services/backend/main.py`, {
    cwd: desktopDir,
    stdio: 'inherit'
  });

  const srcPath = path.join(desktopDir, 'dist', `autometa-backend${ext}`);

  console.log(`Copying compiled backend to Tauri binaries folder...`);
  console.log(`  Source: ${srcPath}`);
  console.log(`  Destination: ${destPath}`);

  if (!fs.existsSync(srcPath)) {
    throw new Error(`Compiled backend binary not found at "${srcPath}"`);
  }

  fs.copyFileSync(srcPath, destPath);
  // Ensure it's executable on unix
  if (!isWindows) {
    fs.chmodSync(destPath, '755');
  }
  console.log('Backend sidecar compiled and bundled successfully!');
} catch (error) {
  console.error('Failed to compile backend sidecar:', error.message || error);
  process.exit(1);
}
