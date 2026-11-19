// Pure helpers for group notifications (no Electron imports, so they can be unit tested).

// Groups that notify by default the first time they are seen; everything else starts off.
const DEFAULT_ON = ['待处理', '分配给我的', '提及我的', '已订阅'];

/** Clean up the group list reported by the page: valid names, integer counts, no duplicates. */
function normalizeGroups(list) {
  const seen = new Set();
  const out = [];
  for (const g of Array.isArray(list) ? list : []) {
    const name = typeof g?.name === 'string' ? g.name.trim() : '';
    if (!name || name.length > 60 || seen.has(name)) continue;
    seen.add(name);
    const count = Number.isFinite(g.count) && g.count > 0 ? Math.floor(g.count) : 0;
    out.push({ name, count, shared: !!g.shared });
  }
  return out;
}

/** Add newly seen groups to the settings with their default on/off state. */
function mergeGroupSettings(settings, groups) {
  const next = { enabled: settings.enabled !== false, groups: { ...(settings.groups || {}) } };
  let changed = false;
  for (const g of groups) {
    if (!(g.name in next.groups)) {
      next.groups[g.name] = DEFAULT_ON.includes(g.name);
      changed = true;
    }
  }
  return { settings: next, changed };
}

/** Groups whose count went up since the last scan and that the user wants notifications for. */
function newMailNotifications(prevCounts, groups, settings) {
  if (!prevCounts || settings.enabled === false) return [];
  const out = [];
  for (const g of groups) {
    const before = prevCounts[g.name];
    if (settings.groups?.[g.name] && before !== undefined && g.count > before) {
      out.push({ name: g.name, delta: g.count - before, count: g.count });
    }
  }
  return out;
}

/** Remember the latest count per group (groups missing from this scan keep their old value). */
function updateCounts(prevCounts, groups) {
  const next = { ...(prevCounts || {}) };
  for (const g of groups) next[g.name] = g.count;
  return next;
}

module.exports = { DEFAULT_ON, normalizeGroups, mergeGroupSettings, newMailNotifications, updateCounts };
