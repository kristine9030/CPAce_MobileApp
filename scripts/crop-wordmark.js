// Crops surrounding whitespace from a PNG.
// Usage: node scripts/crop-wordmark.js [input] [output]
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.join(__dirname, '..');
const inArg = process.argv[2] || 'assets/images/wordmark.png';
const outArg = process.argv[3] || 'assets/images/wordmark-cropped.png';
const src = path.join(root, inArg);
const png = PNG.sync.read(fs.readFileSync(src));
const { width, height, data } = png;

let minX = width, minY = height, maxX = 0, maxY = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    const isContent = a > 20 && (r < 235 || g < 235 || b < 235);
    if (isContent) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
const pad = 8;
minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
const cw = maxX - minX + 1, ch = maxY - minY + 1;
const out = new PNG({ width: cw, height: ch });
for (let y = 0; y < ch; y++) {
  for (let x = 0; x < cw; x++) {
    const si = ((y + minY) * width + (x + minX)) * 4;
    const di = (y * cw + x) * 4;
    out.data[di] = data[si];
    out.data[di + 1] = data[si + 1];
    out.data[di + 2] = data[si + 2];
    out.data[di + 3] = data[si + 3];
  }
}
fs.writeFileSync(path.join(root, outArg), PNG.sync.write(out));
console.log(JSON.stringify({ in: inArg, out: outArg, cw, ch, ratio: +(cw / ch).toFixed(3) }));
