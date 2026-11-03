import test from 'node:test';
import assert from 'node:assert/strict';
const { itemBounds, overlaps, placeItem, fitCamera, zoomAt, arrangeItems } =
  await import('../src/domain/geometry.ts');
const { createHistory, commit, undo, redo } = await import('../src/state/history.ts');
const { emptyScene, parseItems, parseScene } = await import('../src/domain/scene.ts');
const { normalizeCountryId, makeCountry } = await import('../src/domain/countries.ts');
class Storage {
  entries = new Map();
  get length() {
    return this.entries.size;
  }
  getItem(key) {
    return this.entries.get(key) ?? null;
  }
  setItem(key, value) {
    this.entries.set(key, String(value));
  }
  removeItem(key) {
    this.entries.delete(key);
  }
  key(index) {
    return [...this.entries.keys()][index] ?? null;
  }
}
globalThis.window = { localStorage: new Storage() };
const { LocalSceneRepository, readLegacy, sceneKey } =
  await import('../src/services/SceneRepository.ts');
const circle = (id, x = 0, y = 0) => ({ id, kind: 'circle', x, y });
const viewport = { left: -400, top: -300, right: 400, bottom: 300 };

test('rotated rectangle bounds include its actual corners at negative coordinates', () => {
  const b = itemBounds({ id: 'r', kind: 'rectangle', x: -500, y: -800, scaleX: 2, rotation: 90 });
  assert.ok(Math.abs(b.right - b.left - 114) < 0.001);
  assert.ok(Math.abs(b.bottom - b.top - 364) < 0.001);
});
test('star bounds use transformed vertices; ellipse bounds handle rotation', () => {
  const b = itemBounds({
    id: 'star',
    kind: 'star',
    x: 0,
    y: 0,
    scaleX: 3,
    scaleY: 2,
    rotation: 22,
  });
  assert.ok(b.right - b.left > 300);
  assert.ok(b.bottom - b.top > 200);
  const e = itemBounds({ ...circle('c'), scaleX: 3, scaleY: 1, rotation: 90 });
  assert.ok(Math.abs(e.right - e.left - 132) < 0.001);
});
test('text uses measured multiline width and height, including object scale', () => {
  const b = itemBounds(
    {
      id: 't',
      kind: 'note',
      content: 'текст\nна двух строках',
      x: 10,
      y: 20,
      scaleX: 2,
      scaleY: 3,
    },
    () => ({ width: 300, height: 90 }),
  );
  assert.deepEqual(b, { left: 10, right: 610, top: 20, bottom: 290 });
});
test('new objects never overlap existing items, including objects outside the viewport', () => {
  let items = [{ ...circle('old', -700, -500), scaleX: 3, scaleY: 4 }];
  for (let i = 0; i < 35; i++) {
    const next = placeItem(
      {
        id: String(i),
        kind: i % 2 ? 'star' : 'rectangle',
        x: 0,
        y: 0,
        scaleX: 1.2,
        rotation: i * 17,
      },
      items,
      viewport,
    );
    assert.ok(items.every((item) => !overlaps(itemBounds(item), itemBounds(next))));
    items.push(next);
  }
});
test('placement prefers visible free space and never moves existing items', () => {
  const existing = [circle('a')],
    snapshot = structuredClone(existing);
  const next = placeItem(circle('b'), existing, viewport);
  const b = itemBounds(next);
  assert.ok(
    b.left >= viewport.left &&
      b.right <= viewport.right &&
      b.top >= viewport.top &&
      b.bottom <= viewport.bottom,
  );
  assert.deepEqual(existing, snapshot);
});
test('fit includes distant rotated objects even below the interactive zoom limit', () => {
  const bs = [
    itemBounds(circle('a', -1e6, -1e6)),
    itemBounds({ ...circle('b', 1e6, 1e6), scaleX: 8, rotation: 45 }),
  ];
  const c = fitCamera(bs, { width: 900, height: 700 });
  for (const b of bs) {
    assert.ok(b.left * c.scale + c.x >= 49);
    assert.ok(b.right * c.scale + c.x <= 851);
    assert.ok(b.top * c.scale + c.y >= 49);
    assert.ok(b.bottom * c.scale + c.y <= 651);
  }
  assert.deepEqual(fitCamera([], { width: 900, height: 700 }), { x: 0, y: 0, scale: 1 });
});
test('zoom preserves the world point under the cursor', () => {
  const c = { x: -430, y: 245, scale: 0.7 },
    p = { x: 234, y: 432 },
    next = zoomAt(c, p, 1.5);
  assert.ok(Math.abs((p.x - c.x) / c.scale - (p.x - next.x) / next.scale) < 1e-9);
  assert.ok(Math.abs((p.y - c.y) / c.scale - (p.y - next.y) / next.scale) < 1e-9);
});
test('explicit arrangement has no overlaps and is one reversible history step', () => {
  const items = [
    circle('a'),
    { id: 'b', kind: 'rectangle', x: 0, y: 0, rotation: 47, scaleX: 4 },
    circle('c'),
  ];
  const next = arrangeItems(items, viewport);
  for (let i = 0; i < next.length; i++)
    for (let j = i + 1; j < next.length; j++)
      assert.ok(!overlaps(itemBounds(next[i]), itemBounds(next[j])));
  const h = commit(createHistory(items), next);
  assert.deepEqual(undo(h).present, items);
  assert.deepEqual(redo(undo(h)).present, next);
});
test('history retains 100 actions and invalidates redo on a new edit', () => {
  let h = createHistory(0);
  for (let i = 1; i <= 120; i++) h = commit(h, i);
  assert.equal(h.past.length, 100);
  h = undo(h);
  assert.equal(h.present, 119);
  assert.equal(redo(h).present, 120);
  h = commit(h, 200);
  assert.equal(h.future.length, 0);
  assert.equal(commit(h, 200), h);
});
test('numeric country IDs remain stable across localization', () => {
  assert.equal(normalizeCountryId(4), '004');
  assert.equal(makeCountry('398', 'Kazakhstan').nameRu, 'Казахстан');
  assert.equal(makeCountry(392, 'Japan').id, '392');
  assert.throws(() => normalizeCountryId('Japan'));
});
test('legacy migration preserves source bytes and can be reopened by country ID', async () => {
  const storage = new Storage(),
    country = makeCountry('398', 'Kazakhstan');
  const raw = JSON.stringify([
    { id: 'a', kind: 'note', x: -40, y: 55, scaleX: 1.7, content: 'Моя заметка' },
  ]);
  storage.setItem('atlas-canvas:scene:Kazakhstan', raw);
  const repo = new LocalSceneRepository(storage, false),
    loaded = await repo.load(country);
  assert.equal(loaded.legacyKey, 'atlas-canvas:scene:Kazakhstan');
  await repo.migrate(country, loaded);
  assert.equal(storage.getItem(loaded.legacyKey), raw);
  assert.deepEqual((await repo.load(country)).scene.items, JSON.parse(raw));
  assert.ok(storage.getItem(sceneKey(country.id)));
});
test('corrupt legacy and new scenes fail closed without writing an empty scene', async () => {
  const storage = new Storage(),
    country = makeCountry('398', 'Kazakhstan'),
    repo = new LocalSceneRepository(storage, false);
  storage.setItem('atlas-canvas:scene:Kazakhstan', '{broken');
  await assert.rejects(repo.load(country));
  assert.equal(storage.getItem(sceneKey(country.id)), null);
  storage.setItem(sceneKey(country.id), '{broken');
  await assert.rejects(repo.load(country));
  assert.equal(storage.getItem(sceneKey(country.id)), '{broken');
});
test('conflicting legacy names are preserved and require explicit resolution', () => {
  const storage = new Storage(),
    country = makeCountry('398', 'Kazakhstan');
  storage.setItem('atlas-canvas:scene:Kazakhstan', JSON.stringify([circle('a')]));
  storage.setItem('atlas-canvas:scene:Казахстан', JSON.stringify([circle('b')]));
  assert.throws(() => readLegacy(storage, country));
  assert.equal(storage.length, 2);
});
test('save queue serializes native writes and recovers after a failed write', async () => {
  const writes = [],
    saved = new Map();
  let fail = true;
  window.__TAURI_INTERNALS__ = {
    invoke: async (command, args) => {
      assert.equal(command, 'save_scene');
      writes.push(args.sceneJson);
      if (fail) {
        fail = false;
        throw new Error('disk full');
      }
      saved.set(args.countryId, args.sceneJson);
    },
  };
  const repo = new LocalSceneRepository(new Storage(), true),
    first = emptyScene(),
    second = { ...emptyScene(), items: [circle('new')] };
  const p1 = repo.save('398', first),
    p2 = repo.save('398', second);
  await assert.rejects(p1, /disk full/);
  await p2;
  assert.equal(writes.length, 2);
  assert.deepEqual(JSON.parse(saved.get('398')), second);
  delete window.__TAURI_INTERNALS__;
});
test('scene validator rejects unsafe dimensions, duplicated IDs and unknown formats', () => {
  assert.throws(() => parseItems([{ ...circle('a'), scaleX: -1 }]));
  assert.throws(() => parseItems([circle('a'), circle('a')]));
  assert.throws(() => parseScene({ ...emptyScene(), schemaVersion: 99 }));
  assert.throws(() => parseItems([{ id: 'x', kind: 'stroke', x: 0, y: 0, points: [1, 2, 3] }]));
});

const { SceneWriter } = await import('../src/services/SceneWriter.ts');
test('Undo during a pending write is persisted before flush completes', async () => {
  let release;
  const writes = [],
    original = emptyScene(),
    changed = { ...emptyScene(), items: [circle('change')] };
  const writer = new SceneWriter(async (scene) => {
    writes.push(structuredClone(scene));
    if (writes.length === 1)
      await new Promise((resolve) => {
        release = resolve;
      });
  });
  writer.reset(original);
  writer.update(changed);
  const flush = writer.flush();
  writer.update(original);
  release();
  await flush;
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1], original);
  assert.equal(writer.dirty, false);
});
test('failed flush retains unsaved state and retry persists it', async () => {
  let fail = true,
    written;
  const writer = new SceneWriter(async (scene) => {
    if (fail) {
      fail = false;
      throw new Error('disk full');
    }
    written = scene;
  });
  writer.reset(emptyScene());
  const changed = { ...emptyScene(), items: [circle('a')] };
  writer.update(changed);
  await assert.rejects(writer.flush());
  assert.equal(writer.dirty, true);
  await writer.flush();
  assert.deepEqual(written, changed);
  assert.equal(writer.dirty, false);
});

const { createTable, addRow, addColumn, removeRow, removeColumn, tableSize } =
  await import('../src/domain/table.ts');
const { searchItems } = await import('../src/domain/search.ts');
const { pdfFromJpeg } = await import('../src/domain/pdf.ts');
const { canvasClipboard } = await import('../src/services/clipboard.ts');
test('version 2 scenes migrate in memory without mutating the original record', () => {
  const old = { ...emptyScene(), schemaVersion: 2 };
  const raw = JSON.stringify(old);
  const parsed = parseScene(old);
  assert.equal(parsed.schemaVersion, 4);
  assert.equal(JSON.stringify(old), raw);
});
test('table structure operations preserve cells, sizes, and editable content', () => {
  let t = createTable(2, 2);
  t.cells[0][0].text = 'Население';
  t.cells[1][1] = { text: '20 млн', fill: '#ffeeaa', bold: true };
  t = addColumn(addRow(t));
  assert.equal(t.cells.length, 3);
  assert.equal(t.cells[0].length, 3);
  assert.equal(t.cells[1][1].text, '20 млн');
  t = removeColumn(removeRow(t, 2), 2);
  assert.deepEqual(tableSize(t), { width: 300, height: 116 });
  const parsed = parseScene({
    ...emptyScene(),
    items: [{ id: 't', kind: 'table', x: -40, y: 50, table: t }],
  });
  assert.equal(parsed.items[0].table.cells[1][1].fill, '#ffeeaa');
});
test('malformed tables and unsafe links are rejected before saving', () => {
  const t = createTable();
  t.cells[0].pop();
  assert.throws(() => parseItems([{ id: 't', kind: 'table', x: 0, y: 0, table: t }]));
  assert.throws(() =>
    parseItems([{ id: 'l', kind: 'link', x: 0, y: 0, url: 'javascript:alert(1)' }]),
  );
});
test('search finds Cyrillic text and table cells including hidden objects', () => {
  const t = createTable();
  t.cells[1][1].text = 'Буддизм';
  const result = searchItems(
    [
      { id: 't', kind: 'table', table: t, x: 0, y: 0, hidden: true },
      { id: 'n', kind: 'note', content: 'Буддизм в Японии', x: 5, y: 7 },
    ],
    'БУДДИЗМ',
  );
  assert.equal(result.length, 2);
  assert.ok(result[0].excerpt.includes('Буддизм'));
  assert.deepEqual(searchItems([], ' '), []);
});
test('cross-canvas clipboard isolates mutations and preserves media references', () => {
  const source = [
    { id: 'photo', kind: 'image', assetId: '00000000-0000-0000-0000-000000000001', x: 1, y: 2 },
  ];
  canvasClipboard.write(source);
  source[0].x = 900;
  const pasted = canvasClipboard.read();
  assert.equal(pasted[0].x, 1);
  assert.equal(pasted[0].assetId, source[0].assetId);
  pasted[0].y = -50;
  assert.equal(canvasClipboard.read()[0].y, 2);
});
test('PDF byte offsets point to objects even with binary JPEG data', () => {
  const pdf = pdfFromJpeg(new Uint8Array([255, 216, 255, 0, 128, 255, 217]), 400, 300);
  const text = new TextDecoder('latin1').decode(pdf);
  assert.ok(text.startsWith('%PDF-1.4'));
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(new TextDecoder().decode(pdf.slice(xref, xref + 4)), 'xref');
  const entries = text.slice(text.indexOf('xref\n')).split('\n').slice(3, 8);
  entries.forEach((line, i) => {
    const offset = Number(line.slice(0, 10));
    assert.ok(
      new TextDecoder().decode(pdf.slice(offset, offset + 10)).startsWith(`${i + 1} 0 obj`),
    );
  });
});
const { installExitGuard, flushBeforeExit } = await import('../src/services/exitGuard.ts');
test('exit waits for the current input task before draining saves', async () => {
  let value = 'old',
    saved;
  const off = installExitGuard(async () => {
    saved = value;
  });
  const pending = flushBeforeExit();
  Promise.resolve().then(() => {
    value = 'current draft';
  });
  await pending;
  assert.equal(saved, 'current draft');
  off();
});
test('an obsolete editor cleanup cannot remove the current exit guard', async () => {
  let current = false;
  const old = installExitGuard(async () => {});
  const off = installExitGuard(async () => {
    current = true;
  });
  old();
  await flushBeforeExit();
  assert.equal(current, true);
  off();
});
const { moveOneLayer } = await import('../src/domain/layers.ts');
test('moving selected layers one step preserves order within the selection', () => {
  const list = ['a', 'b', 'c', 'd', 'e'].map((id) => circle(id));
  assert.deepEqual(
    moveOneLayer(list, ['b', 'c'], 1).map((i) => i.id),
    ['a', 'd', 'b', 'c', 'e'],
  );
  assert.deepEqual(
    moveOneLayer(list, ['b', 'c'], -1).map((i) => i.id),
    ['b', 'c', 'a', 'd', 'e'],
  );
  assert.deepEqual(
    list.map((i) => i.id),
    ['a', 'b', 'c', 'd', 'e'],
  );
});

const { defaultShimmer, snowCrystals, crystalLight } = await import('../src/domain/shimmer.ts');
const { mergeCells, splitCell, coveredCell, tableStyles } = await import('../src/domain/table.ts');
const { layoutRichText } = await import('../src/domain/richText.ts');
const { snapPosition } = await import('../src/domain/snapping.ts');
const { canvasRuns } = await import('../src/domain/layers.ts');
const { pdfFromJpegs } = await import('../src/domain/pdf.ts');
const { writePreference, flushPreferences } = await import('../src/services/preferenceWrites.ts');
test('shimmer is optional, bounded, and survives scene serialization independently of base background', () => {
  const scene = emptyScene();
  scene.theme.shimmer = { ...defaultShimmer, enabled: true, color: '#eaf8ff' };
  scene.theme.background = '#63717f';
  assert.deepEqual(parseScene(JSON.parse(JSON.stringify(scene))).theme, scene.theme);
  assert.equal(emptyScene().theme.shimmer, undefined);
  for (const settings of [
    { intensity: 2 },
    { speed: 0 },
    { color: 'url(http://bad)' },
    { enabled: 'yes' },
  ])
    assert.throws(() =>
      parseScene({
        ...scene,
        theme: { ...scene.theme, shimmer: { ...defaultShimmer, ...settings } },
      }),
    );
});
test('snow crystals stay stationary while their individual brightness changes; count is capped', () => {
  const crystals = snowCrystals(900, 600),
    before = structuredClone(crystals);
  assert.deepEqual(crystals, snowCrystals(900, 600));
  assert.ok(crystals.some((c) => Math.abs(crystalLight(c, 0, 1) - crystalLight(c, 2, 1)) > 0.2));
  assert.ok(crystals.every((c) => crystalLight(c, 0, 1) >= 0 && crystalLight(c, 0, 1) <= 1));
  assert.deepEqual(crystals, before);
  assert.ok(snowCrystals(10000, 10000).length <= 2400);
});
test('merged cells preserve all original text, expand existing merges, and split without data loss', () => {
  const t = createTable(3, 3);
  t.cells[0][0].text = 'Название';
  t.cells[0][1].text = 'Скрытый текст';
  const merged = mergeCells(mergeCells(t, 0, 0, 1, 2), 0, 1, 2, 2);
  assert.deepEqual(merged.merges, [{ row: 0, column: 0, rows: 2, columns: 3 }]);
  assert.ok(coveredCell(merged, 1, 2));
  const split = splitCell(merged, 0, 0);
  assert.deepEqual(split.cells, t.cells);
  assert.deepEqual(split.merges, []);
  const parsed = parseScene({
    ...emptyScene(),
    items: [{ id: 'table', kind: 'table', x: 0, y: 0, table: merged }],
  });
  assert.equal(parsed.items[0].table.cells[0][1].text, 'Скрытый текст');
});
test('removing merged rows or columns adjusts spans and invalid overlapping spans are rejected', () => {
  const t = mergeCells(createTable(), 0, 0, 2, 2);
  assert.deepEqual(removeColumn(removeRow(t, 0), 0).merges, []);
  assert.throws(() =>
    parseItems([
      {
        id: 't',
        kind: 'table',
        x: 0,
        y: 0,
        table: { ...t, merges: [...t.merges, { row: 1, column: 1, rows: 2, columns: 1 }] },
      },
    ]),
  );
  assert.equal(tableStyles.length, 5);
});
test('rich text wraps Unicode and preserves mixed styles and link metadata', () => {
  const runs = [
    { text: 'Привет ', bold: true },
    { text: 'мир\n', href: 'https://example.org' },
    { text: '• Тема' },
  ];
  const layout = layoutRichText(runs, 60, 10, 1.5, 'left', (s) => Array.from(s).length * 10);
  assert.equal(
    layout.segments
      .map((s) => s.text)
      .join('')
      .replace(/\n/g, ''),
    runs
      .map((s) => s.text)
      .join('')
      .replace(/\n/g, ''),
  );
  assert.ok(layout.height >= 45);
  assert.ok(layout.segments.some((s) => s.href));
  const item = {
    id: 'n',
    kind: 'note',
    x: -50,
    y: 2,
    content: runs.map((r) => r.text).join(''),
    richText: runs,
  };
  assert.deepEqual(parseItems([item])[0].richText, runs);
  assert.throws(() => parseItems([{ ...item, content: 'mismatch' }]));
});
test('guides take priority near the cursor and grid snapping remains optional', () => {
  const theme = { ...emptyScene().theme, guides: [{ id: 'g', axis: 'x', value: -100 }] };
  assert.deepEqual(snapPosition(-97, 13, theme, 1), { x: -100, y: 13 });
  assert.deepEqual(
    snapPosition(-97, 13, { ...theme, snapGuides: false, snap: true, gridSize: 10 }, 1),
    { x: -100, y: 10 },
  );
  assert.equal(snapPosition(-97, 13, theme, 8).x, -97);
});
test('interleaved canvas runs retain every object in original depth order', () => {
  const items = [
    circle('a'),
    { id: 't', kind: 'table' },
    circle('b'),
    { id: 'v', kind: 'video' },
    circle('c'),
  ];
  assert.deepEqual(
    canvasRuns(items).flatMap((r) => r.items.map((i) => i.id)),
    items.map((i) => i.id),
  );
  assert.deepEqual(
    canvasRuns(items).map((r) => r.items.map((i) => i.id)),
    [['a', 't'], ['b', 'v'], ['c']],
  );
});
test('multi-page PDF has valid byte offsets for every page and image', () => {
  const pdf = pdfFromJpegs(
    [1, 2, 3].map((i) => ({
      jpeg: new Uint8Array([255, 216, i, 255, 217]),
      width: 400,
      height: 565,
    })),
  );
  const text = new TextDecoder('latin1').decode(pdf);
  assert.ok(text.includes('/Count 3'));
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(new TextDecoder().decode(pdf.slice(xref, xref + 4)), 'xref');
  text
    .slice(text.indexOf('xref\n'))
    .split('\n')
    .slice(3, 14)
    .forEach((line, i) =>
      assert.ok(
        new TextDecoder()
          .decode(pdf.slice(Number(line.slice(0, 10)), Number(line.slice(0, 10)) + 15))
          .startsWith(`${i + 1} 0 obj`),
      ),
    );
});
test('exit drains preference writes and retries a failed write without dropping the last value', async () => {
  let attempts = 0,
    result;
  await assert.rejects(
    writePreference('test', async () => {
      if (++attempts === 1) throw Error('disk');
      result = 'saved';
    }),
  );
  await flushPreferences();
  assert.equal(attempts, 2);
  assert.equal(result, 'saved');
});

test('version 3 scenes upgrade to format 4 so older editors cannot silently rewrite merged or rich content', () => {
  const old = { ...emptyScene(), schemaVersion: 3 };
  const raw = JSON.stringify(old);
  assert.equal(parseScene(JSON.parse(raw)).schemaVersion, 4);
  assert.equal(JSON.stringify(old), raw);
});
test('bounds include thick outlines and conservative control points for smoothed strokes', () => {
  const thick = itemBounds({ ...circle('thick'), strokeWidth: 40 });
  assert.equal(thick.left, -85);
  assert.equal(thick.right, 85);
  const curved = itemBounds({
    id: 'curve',
    kind: 'stroke',
    x: 0,
    y: 0,
    points: [0, 0, 100, 100, 200, 100],
    tension: 1,
    strokeWidth: 2,
  });
  assert.ok(curved.left < 0 && curved.right > 200 && curved.bottom > 120);
});

const { shortcutAction } = await import('../src/domain/shortcuts.ts');
const keyStroke = (code, extra = {}) => ({
  code,
  key: code.startsWith('Key') ? code.slice(3) : code,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...extra,
});
test('macOS, Windows, and Linux share the same editor actions through their modifier keys', () => {
  for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
    assert.equal(shortcutAction(keyStroke('KeyZ', modifier)), 'undo');
    assert.equal(shortcutAction(keyStroke('KeyZ', { ...modifier, shiftKey: true })), 'redo');
    assert.equal(shortcutAction(keyStroke('KeyS', modifier)), 'save');
    assert.equal(shortcutAction(keyStroke('KeyS', { ...modifier, shiftKey: true })), 'archive');
    assert.equal(shortcutAction(keyStroke('KeyE', { ...modifier, shiftKey: true })), 'export');
    assert.equal(shortcutAction(keyStroke('BracketRight', modifier)), 'raise');
  }
});
test('physical shortcut codes work with Cyrillic layout and avoid Alt system combinations', () => {
  assert.equal(shortcutAction(keyStroke('KeyT', { key: 'е' })), 'text');
  assert.equal(shortcutAction(keyStroke('KeyF', { key: 'а', ctrlKey: true })), 'search');
  assert.equal(shortcutAction(keyStroke('KeyP', { key: 'з', shiftKey: true })), 'presentation');
  assert.equal(shortcutAction(keyStroke('KeyI', { shiftKey: true })), 'properties');
  assert.equal(shortcutAction(keyStroke('KeyQ', { altKey: true })), null);
  assert.equal(
    shortcutAction(keyStroke('ArrowLeft', { key: 'ArrowLeft', shiftKey: true })),
    'left',
  );
});

test('canvas selection adds and removes a visible group as a unit', async () => {
  const { selectItem } = await import('../src/domain/selection.ts');
  const first = { ...circle('a'), groupId: 'g' };
  const items = [
    first,
    { ...circle('b'), groupId: 'g' },
    { ...circle('hidden'), groupId: 'g', hidden: true },
    circle('c'),
  ];
  assert.deepEqual(selectItem(items, ['c'], first), ['a', 'b']);
  assert.deepEqual(selectItem(items, ['c'], first, true), ['c', 'a', 'b']);
  assert.deepEqual(selectItem(items, ['c', 'a', 'b'], first, true), ['c']);
});
