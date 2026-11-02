const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const name = 'ubersicht-only-system-monitor';
const folder = `${name}.widget`;
const archive = `${folder}.zip`;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ubersicht-monitor-package-'));

try {
  const destination = path.join(temporary, folder);
  fs.mkdirSync(destination);
  for (const file of ['index.jsx', 'collect.cjs', 'config.json', 'LICENSE', 'widget.json']) {
    const target = path.join(destination, file);
    if (file === 'index.jsx') {
      const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
      const originalPath = `${name}/collect.cjs`;
      if (!source.includes(originalPath)) throw new Error('Cannot find the collector path.');
      // Gallery archives install into a .widget folder; source installs use the project name.
      fs.writeFileSync(target, source.replace(originalPath, `${folder}/collect.cjs`));
    } else {
      fs.copyFileSync(path.join(__dirname, file), target);
    }
    fs.chmodSync(target, 0o644);
  }
  const output = path.join(temporary, archive);
  execFileSync('/usr/bin/zip', ['-X', '-q', '-r', output, folder], { cwd: temporary });
  execFileSync('/usr/bin/unzip', ['-tq', output], { stdio: 'pipe' });
  fs.copyFileSync(output, path.join(__dirname, archive));
  console.log(`Created ${archive}`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
