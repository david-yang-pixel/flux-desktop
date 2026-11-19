const test = require('node:test');
const assert = require('node:assert');
const u = require('../update-utils');

test('compareVersions', () => {
  assert.strictEqual(u.compareVersions('1.0.10', '1.0.9'), 1);
  assert.strictEqual(u.compareVersions('1.0.9', '1.0.10'), -1);
  assert.strictEqual(u.compareVersions('v1.1.0', '1.0.99'), 1);
  assert.strictEqual(u.compareVersions('1.0', '1.0.0'), 0);
});

test('parseRelease picks the DMG for the current arch', () => {
  const api = {
    tag_name: 'v1.0.7',
    body: '- fix\n',
    html_url: 'https://github.com/o/r/releases/tag/v1.0.7',
    assets: [
      { name: 'Flux-1.0.7-arm64.dmg', browser_download_url: 'https://x/arm' },
      { name: 'Flux-1.0.7-x64.dmg', browser_download_url: 'https://x/x64' },
      { name: 'Flux-1.0.7-arm64.dmg.blockmap', browser_download_url: 'https://x/bm' },
    ],
  };
  assert.deepStrictEqual(u.parseRelease(api, 'arm64'), {
    version: '1.0.7', notes: '- fix', dmgURL: 'https://x/arm', pageURL: api.html_url,
  });
  assert.strictEqual(u.parseRelease(api, 'x64').dmgURL, 'https://x/x64');
  assert.strictEqual(u.parseRelease({ tag_name: 'v1', assets: [] }, 'x64'), null);
});

test('appBundlePath', () => {
  assert.strictEqual(u.appBundlePath('/Applications/Flux.app/Contents/MacOS/Flux'), '/Applications/Flux.app');
  assert.strictEqual(u.appBundlePath('/usr/bin/node'), null);
});

test('designated requirement parsing and ad-hoc detection', () => {
  const signed = 'Executable=/A/Flux.app/Contents/MacOS/Flux\ndesignated => identifier "ai.langgenius.flux.desktop" and certificate root = H"abc"\n';
  const adhoc = 'Executable=/A/Flux.app/Contents/MacOS/Flux\ndesignated => cdhash H"0123"\n';
  const r = u.parseDesignatedRequirement(signed);
  assert.strictEqual(r, 'identifier "ai.langgenius.flux.desktop" and certificate root = H"abc"');
  assert.strictEqual(u.isAdHocRequirement(r), false);
  assert.strictEqual(u.isAdHocRequirement(u.parseDesignatedRequirement(adhoc)), true);
  assert.strictEqual(u.isAdHocRequirement(null), true);
});
