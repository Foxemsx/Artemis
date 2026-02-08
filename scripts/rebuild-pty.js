const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ptyDir = path.join(__dirname, '..', 'node_modules', 'node-pty');

// Patch Spectre mitigation in all .gyp files (required when VS2022 Spectre libs are not installed)
const gypFiles = [
  path.join(ptyDir, 'binding.gyp'),
  path.join(ptyDir, 'deps', 'winpty', 'src', 'winpty.gyp'),
];

for (const file of gypFiles) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf-8');
    if (content.includes("'SpectreMitigation': 'Spectre'")) {
      content = content.replace(/'SpectreMitigation': 'Spectre'/g, "'SpectreMitigation': 'false'");
      fs.writeFileSync(file, content, 'utf-8');
      console.log(`Patched Spectre mitigation in ${path.relative(process.cwd(), file)}`);
    }
  }
}

// Rebuild node-pty for Electron
try {
  execSync('npx @electron/rebuild -f -w node-pty', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
} catch (e) {
  console.error('node-pty rebuild failed:', e.message);
  process.exit(0); // Don't fail the install
}
