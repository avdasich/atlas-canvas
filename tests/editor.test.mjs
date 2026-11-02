import test from 'node:test';
import assert from 'node:assert/strict';
const { itemBounds, overlaps, placeItem, fitCamera, zoomAt, arrangeItems } = await import('../src/domain/geometry.ts');
const { createHistory, commit, undo, redo } = await import('../src/state/history.ts');
const { emptyScene, parseItems, parseScene } = await import('../src/domain/scene.ts');
const { normalizeCountryId, makeCountry } = await import('../src/domain/countries.ts');
class Storage {
  entries = new Map();
  get length() { return this.entries.size; }
  getItem(key) { return this.entries.get(key) ?? null; }
  setItem(key, value) { this.entries.set(key, String(value)); }
  removeItem(key) { this.entries.delete(key); }
  key(index) { return [...this.entries.keys()][index] ?? null; }
}
globalThis.window = { localStorage: new Storage() };
const { LocalSceneRepository, readLegacy, sceneKey } = await import('../src/services/SceneRepository.ts');
const circle = (id, x = 0, y = 0) => ({ id, kind: 'circle', x, y });
const viewport = { left: -400, top: -300, right: 400, bottom: 300 };

test('rotated rectangle bounds include its actual corners at negative coordinates', () => {
  const b = itemBounds({ id: 'r', kind: 'rectangle', x: -500, y: -800, scaleX: 2, rotation: 90 });
  assert.ok(Math.abs(b.right - b.left - 114) < .001);
  assert.ok(Math.abs(b.bottom - b.top - 364) < .001);
});
test('star bounds use transformed vertices; ellipse bounds handle rotation', () => {
  const b = itemBounds({ id: 'star', kind: 'star', x: 0, y: 0, scaleX: 3, scaleY: 2, rotation: 22 });
  assert.ok(b.right - b.left > 300); assert.ok(b.bottom - b.top > 200);
  const e = itemBounds({ ...circle('c'), scaleX: 3, scaleY: 1, rotation: 90 });
  assert.ok(Math.abs(e.right - e.left - 132) < .001);
});
test('text uses measured multiline width and height, including object scale', () => {
  const b = itemBounds({ id: 't', kind: 'note', content: 'текст\nна двух строках', x: 10, y: 20, scaleX: 2, scaleY: 3 }, () => ({ width: 300, height: 90 }));
  assert.deepEqual(b, { left: 10, right: 610, top: 20, bottom: 290 });
});
test('new objects never overlap existing items, including objects outside the viewport', () => {
  let items = [{ ...circle('old', -700, -500), scaleX: 3, scaleY: 4 }];
  for (let i = 0; i < 35; i++) {
    const next = placeItem({ id: String(i), kind: i % 2 ? 'star' : 'rectangle', x: 0, y: 0, scaleX: 1.2, rotation: i * 17 }, items, viewport);
    assert.ok(items.every(item => !overlaps(itemBounds(item), itemBounds(next))));
    items.push(next);
  }
});
test('placement prefers visible free space and never moves existing items', () => {
  const existing = [circle('a')], snapshot = structuredClone(existing);
  const next = placeItem(circle('b'), existing, viewport);
  const b = itemBounds(next); assert.ok(b.left >= viewport.left && b.right <= viewport.right && b.top >= viewport.top && b.bottom <= viewport.bottom);
  assert.deepEqual(existing, snapshot);
});
test('fit includes distant rotated objects even below the interactive zoom limit', () => {
  const bs = [itemBounds(circle('a', -1e6, -1e6)), itemBounds({ ...circle('b', 1e6, 1e6), scaleX: 8, rotation: 45 })];
  const c = fitCamera(bs, { width: 900, height: 700 });
  for (const b of bs) { assert.ok(b.left * c.scale + c.x >= 49); assert.ok(b.right * c.scale + c.x <= 851); assert.ok(b.top * c.scale + c.y >= 49); assert.ok(b.bottom * c.scale + c.y <= 651); }
  assert.deepEqual(fitCamera([], { width: 900, height: 700 }), { x: 0, y: 0, scale: 1 });
});
test('zoom preserves the world point under the cursor', () => {
  const c = { x: -430, y: 245, scale: .7 }, p = { x: 234, y: 432 }, next = zoomAt(c, p, 1.5);
  assert.ok(Math.abs((p.x - c.x) / c.scale - (p.x - next.x) / next.scale) < 1e-9);
  assert.ok(Math.abs((p.y - c.y) / c.scale - (p.y - next.y) / next.scale) < 1e-9);
});
test('explicit arrangement has no overlaps and is one reversible history step', () => {
  const items = [circle('a'), { id: 'b', kind: 'rectangle', x: 0, y: 0, rotation: 47, scaleX: 4 }, circle('c')];
  const next = arrangeItems(items, viewport);
  for (let i = 0; i < next.length; i++) for (let j = i + 1; j < next.length; j++) assert.ok(!overlaps(itemBounds(next[i]), itemBounds(next[j])));
  const h = commit(createHistory(items), next); assert.deepEqual(undo(h).present, items); assert.deepEqual(redo(undo(h)).present, next);
});
test('history retains 100 actions and invalidates redo on a new edit', () => {
  let h = createHistory(0); for (let i = 1; i <= 120; i++) h = commit(h, i);
  assert.equal(h.past.length, 100); h = undo(h); assert.equal(h.present, 119); assert.equal(redo(h).present, 120);
  h = commit(h, 200); assert.equal(h.future.length, 0); assert.equal(commit(h, 200), h);
});
test('numeric country IDs remain stable across localization', () => {
  assert.equal(normalizeCountryId(4), '004'); assert.equal(makeCountry('398', 'Kazakhstan').nameRu, 'Казахстан');
  assert.equal(makeCountry(392, 'Japan').id, '392'); assert.throws(() => normalizeCountryId('Japan'));
});
test('legacy migration preserves source bytes and can be reopened by country ID', async () => {
  const storage = new Storage(), country = makeCountry('398', 'Kazakhstan');
  const raw = JSON.stringify([{ id: 'a', kind: 'note', x: -40, y: 55, scaleX: 1.7, content: 'Моя заметка' }]);
  storage.setItem('atlas-canvas:scene:Kazakhstan', raw);
  const repo = new LocalSceneRepository(storage, false), loaded = await repo.load(country);
  assert.equal(loaded.legacyKey, 'atlas-canvas:scene:Kazakhstan'); await repo.migrate(country, loaded);
  assert.equal(storage.getItem(loaded.legacyKey), raw); assert.deepEqual((await repo.load(country)).scene.items, JSON.parse(raw));
  assert.ok(storage.getItem(sceneKey(country.id)));
});
test('corrupt legacy and new scenes fail closed without writing an empty scene', async () => {
  const storage = new Storage(), country = makeCountry('398', 'Kazakhstan'), repo = new LocalSceneRepository(storage, false);
  storage.setItem('atlas-canvas:scene:Kazakhstan', '{broken');
  await assert.rejects(repo.load(country)); assert.equal(storage.getItem(sceneKey(country.id)), null);
  storage.setItem(sceneKey(country.id), '{broken'); await assert.rejects(repo.load(country)); assert.equal(storage.getItem(sceneKey(country.id)), '{broken');
});
test('conflicting legacy names are preserved and require explicit resolution', () => {
  const storage = new Storage(), country = makeCountry('398', 'Kazakhstan');
  storage.setItem('atlas-canvas:scene:Kazakhstan', JSON.stringify([circle('a')]));
  storage.setItem('atlas-canvas:scene:Казахстан', JSON.stringify([circle('b')]));
  assert.throws(() => readLegacy(storage, country)); assert.equal(storage.length, 2);
});
test('save queue serializes native writes and recovers after a failed write', async () => {
  const writes = [], saved = new Map(); let fail = true;
  window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
    assert.equal(command, 'save_scene'); writes.push(args.sceneJson);
    if (fail) { fail = false; throw new Error('disk full'); }
    saved.set(args.countryId, args.sceneJson);
  }};
  const repo = new LocalSceneRepository(new Storage(), true), first = emptyScene(), second = { ...emptyScene(), items: [circle('new')] };
  const p1 = repo.save('398', first), p2 = repo.save('398', second);
  await assert.rejects(p1, /disk full/); await p2; assert.equal(writes.length, 2); assert.deepEqual(JSON.parse(saved.get('398')), second);
  delete window.__TAURI_INTERNALS__;
});
test('scene validator rejects unsafe dimensions, duplicated IDs and unknown formats', () => {
  assert.throws(() => parseItems([{ ...circle('a'), scaleX: -1 }])); assert.throws(() => parseItems([circle('a'), circle('a')]));
  assert.throws(() => parseScene({ ...emptyScene(), schemaVersion: 99 }));
  assert.throws(() => parseItems([{ id: 'x', kind: 'stroke', x: 0, y: 0, points: [1, 2, 3] }]));
});

const { SceneWriter } = await import('../src/services/SceneWriter.ts');
test('Undo during a pending write is persisted before flush completes', async () => {
  let release;
  const writes = [], original = emptyScene(), changed = { ...emptyScene(), items: [circle('change')] };
  const writer = new SceneWriter(async scene => { writes.push(structuredClone(scene)); if (writes.length === 1) await new Promise(resolve => { release = resolve; }); });
  writer.reset(original); writer.update(changed); const flush = writer.flush();
  writer.update(original); release(); await flush;
  assert.equal(writes.length, 2); assert.deepEqual(writes[1], original); assert.equal(writer.dirty, false);
});
test('failed flush retains unsaved state and retry persists it', async () => {
  let fail = true, written;
  const writer = new SceneWriter(async scene => { if (fail) { fail = false; throw new Error('disk full'); } written = scene; });
  writer.reset(emptyScene()); const changed = { ...emptyScene(), items: [circle('a')] }; writer.update(changed);
  await assert.rejects(writer.flush()); assert.equal(writer.dirty, true); await writer.flush();
  assert.deepEqual(written, changed); assert.equal(writer.dirty, false);
});
