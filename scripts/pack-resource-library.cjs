const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

const projectRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(projectRoot, 'resource-library');
const outputPath = path.join(projectRoot, 'dist', 'V7.Wallpaper.Studio.Resources.asar');

fs.rmSync(sourceRoot, { recursive: true, force: true });
fs.mkdirSync(sourceRoot, { recursive: true });

for (const name of ['models', 'wallpapers']) {
  fs.cpSync(path.join(projectRoot, 'public', name), path.join(sourceRoot, name), { recursive: true });
}
for (const name of ['set-desktop-parent.ps1', 'watch-desktop-focus.ps1', 'open-desktop-context-menu.ps1']) {
  fs.copyFileSync(path.join(projectRoot, 'native', name), path.join(sourceRoot, name));
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.rmSync(outputPath, { force: true });
asar.createPackage(sourceRoot, outputPath).then(() => {
  fs.rmSync(sourceRoot, { recursive: true, force: true });
  console.log(`Created ${outputPath}`);
}).catch((error) => {
  fs.rmSync(sourceRoot, { recursive: true, force: true });
  console.error(error);
  process.exitCode = 1;
});
