/* Keep GitHub Pages caches from mixing new HTML with older styles, scripts, or faces. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const index = path.join(root, 'index.html');
const html = fs.readFileSync(index, 'utf8');
let count = 0;
const versioned = html.replace(
  /((?:href|src)=")(assets\/(?:css\/[^"?]+\.css|js\/[^"?]+\.js|images\/[^"?]+\.webp))(?:\?v=[a-f0-9]+)?(")/g,
  (_, prefix, asset, suffix) => {
    const digest = crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(root, asset))).digest('hex').slice(0, 12);
    count++;
    return prefix + asset + '?v=' + digest + suffix;
  }
);

if (!count) throw new Error('No local asset references found.');
if (process.argv.includes('--check')) {
  if (versioned !== html) {
    console.error('Asset versions are outdated. Run: node scripts/version-assets.cjs');
    process.exitCode = 1;
  } else console.log('All ' + count + ' local asset versions match their contents.');
} else {
  fs.writeFileSync(index, versioned);
  console.log('Updated ' + count + ' local asset versions.');
}
