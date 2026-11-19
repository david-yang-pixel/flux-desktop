// Renders build/icon.png (1024x1024, macOS icon grid) with Playwright's Chromium.
// Usage: node scripts/make-icon.js build/icon.png
const { chromium } = require('playwright');
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef1f8"/>
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#0b1a3a" flood-opacity="0.22"/>
    </filter>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg)" filter="url(#sh)"/>
  <g transform="translate(100 100)" fill="none" stroke="#141a2a" stroke-width="92" stroke-linecap="round" stroke-linejoin="round">
    <path d="M330 650 V350 A140 140 0 0 1 470 210 H520"/>
    <path d="M205 410 H470"/>
  </g>
  <circle cx="${100 + 625}" cy="${100 + 610}" r="52" fill="#1f4ef5"/>
</svg>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await p.screenshot({ path: process.argv[2] || 'build/icon.png', omitBackground: true });
  await b.close();
})();
