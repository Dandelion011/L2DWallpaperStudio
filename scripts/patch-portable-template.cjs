const fs = require('node:fs');
const path = require('node:path');

const templatePath = path.resolve(__dirname, '../node_modules/app-builder-lib/templates/nsis/portable.nsi');
const marker = '    BgImage::Redraw\n';
const delayedMarker = '    BgImage::Redraw\n    Sleep 100\n';
const regionBlock = [
  '    # Clip the portable splash window to the bitmap bounds so the corners are transparent.',
  '    System::Call \'gdi32::CreateRoundRectRgn(i, i, i, i, i, i) p (0, 0, 900, 300, 88, 88) .r0\'',
  '    System::Call \'user32::FindWindow(t, p) p ("NSISBGImage", 0) .r1\'',
  '    System::Call \'user32::SetWindowRgn(p, p, i) i (r1, r0, 1) .r2\'',
].join('\n') + '\n';

const source = fs.readFileSync(templatePath, 'utf8');
const oldRegionBlock = [
  '    # Clip the portable splash window to the bitmap bounds so the corners are transparent.',
  '    System::Call \'user32::CreateRoundRectRgn(i 0, i 0, i 900, i 300, i 88, i 88) i .r0\'',
  '    System::Call \'user32::SetWindowRgn(i $HWNDPARENT, i r0, i 1)\'',
].join('\n') + '\n';
let next = source.replace('    BgImage::Redraw\n', delayedMarker);
if (next !== source) {
  // Continue below with the updated source so the region block is inserted after the delay.
}
const workingSource = next;
next = workingSource;
if (workingSource.includes(oldRegionBlock)) next = workingSource.replace(oldRegionBlock, regionBlock);
else if (!workingSource.includes(regionBlock)) {
  if (!workingSource.includes(delayedMarker)) throw new Error(`Portable NSIS template marker not found: ${templatePath}`);
  next = workingSource.replace(delayedMarker, delayedMarker + regionBlock);
}
if (next !== source) fs.writeFileSync(templatePath, next, 'utf8');

console.log(`Prepared ${templatePath}`);
