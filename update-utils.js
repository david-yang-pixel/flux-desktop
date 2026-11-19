// Pure helpers for the updater (no Electron imports, so they can be unit tested).

/** Compare "1.2.3"-style versions. Returns 1 if a > b, -1 if a < b, 0 if equal. */
function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/**
 * Turn a GitHub "latest release" API payload into what the updater needs,
 * picking the DMG built for this CPU architecture ("arm64" or "x64").
 */
function parseRelease(api, arch) {
  const tag = String(api.tag_name || '');
  const version = tag.startsWith('v') ? tag.slice(1) : tag;
  const dmgs = (api.assets || []).filter((a) => a.name.toLowerCase().endsWith('.dmg'));
  const archDmg = dmgs.find((a) => a.name.toLowerCase().includes(`-${arch}.dmg`));
  const asset = archDmg || (dmgs.length === 1 ? dmgs[0] : null);
  if (!version || !asset) return null;
  return {
    version,
    notes: String(api.body || '').trim(),
    dmgURL: asset.browser_download_url,
    pageURL: api.html_url,
  };
}

/** The .app bundle containing an executable path, e.g. /Applications/Flux.app */
function appBundlePath(execPath) {
  const m = String(execPath).match(/^(.*?\.app)\/Contents\/MacOS\//);
  return m ? m[1] : null;
}

/** Extract the designated requirement from `codesign -d -r-` output. */
function parseDesignatedRequirement(output) {
  const line = String(output).split('\n').find((l) => l.startsWith('designated =>'));
  return line ? line.slice('designated =>'.length).trim() : null;
}

/** Ad-hoc signatures pin a cdhash that changes with every build. */
function isAdHocRequirement(req) {
  return !req || req.includes('cdhash');
}

module.exports = { compareVersions, parseRelease, appBundlePath, parseDesignatedRequirement, isAdHocRequirement };
