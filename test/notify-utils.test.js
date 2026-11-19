const test = require('node:test');
const assert = require('node:assert');
const n = require('../notify-utils');

test('normalizeGroups cleans names, counts and duplicates', () => {
  assert.deepStrictEqual(
    n.normalizeGroups([
      { name: ' 待处理 ', count: 2 },
      { name: 'Support', count: 1, shared: true },
      { name: 'Support', count: 9 },
      { name: '', count: 3 },
      { name: 'Business' },
      { name: 'x', count: -4 },
    ]),
    [
      { name: '待处理', count: 2, shared: false },
      { name: 'Support', count: 1, shared: true },
      { name: 'Business', count: 0, shared: false },
      { name: 'x', count: 0, shared: false },
    ],
  );
  assert.deepStrictEqual(n.normalizeGroups(null), []);
});

test('mergeGroupSettings adds new groups with defaults and keeps user choices', () => {
  const groups = n.normalizeGroups([{ name: '待处理' }, { name: 'Marketing', shared: true }, { name: 'Support', shared: true }]);
  const first = n.mergeGroupSettings({}, groups);
  assert.strictEqual(first.changed, true);
  assert.deepStrictEqual(first.settings, { enabled: true, groups: { 待处理: true, Marketing: false, Support: false } });

  const user = { enabled: true, groups: { 待处理: false, Marketing: false, Support: true } };
  const again = n.mergeGroupSettings(user, groups);
  assert.strictEqual(again.changed, false);
  assert.deepStrictEqual(again.settings.groups, user.groups);
});

test('newMailNotifications only fires for enabled groups whose count went up', () => {
  const settings = { enabled: true, groups: { 待处理: true, Support: true, Marketing: false } };
  const prev = { 待处理: 2, Support: 1, Marketing: 132 };
  const now = n.normalizeGroups([
    { name: '待处理', count: 3 },
    { name: 'Support', count: 0 },
    { name: 'Marketing', count: 140 },
    { name: 'Cloud', count: 7 },
  ]);
  assert.deepStrictEqual(n.newMailNotifications(prev, now, settings), [{ name: '待处理', delta: 1, count: 3 }]);
  assert.deepStrictEqual(n.newMailNotifications(null, now, settings), []);
  assert.deepStrictEqual(n.newMailNotifications(prev, now, { ...settings, enabled: false }), []);
});

test('updateCounts keeps groups missing from a scan', () => {
  assert.deepStrictEqual(
    n.updateCounts({ 待处理: 2, Support: 1 }, [{ name: '待处理', count: 5 }]),
    { 待处理: 5, Support: 1 },
  );
});
