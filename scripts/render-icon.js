// Renders build/icon.svg to build/icon.png (1024x1024) for electron-builder.
// Usage: node scripts/render-icon.js
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const dir = path.join(__dirname, '..', 'build');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng();
fs.writeFileSync(path.join(dir, 'icon.png'), png);
console.log(`build/icon.png written (${png.length} bytes)`);
