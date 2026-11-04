import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyImageCrop,
  cropToAspect,
  fullImage,
  moveCrop,
  resizeCrop,
  sourceCrop,
  validCrop,
} from '../src/domain/crop.ts';
import { disclosureSize, validSections } from '../src/domain/disclosure.ts';
import { applyContentDrafts } from '../src/domain/drafts.ts';
import { defaultGlass } from '../src/domain/materials.ts';
import { canvasRuns, isDomItem } from '../src/domain/layers.ts';
import { searchItems } from '../src/domain/search.ts';
import { emptyScene, parseScene } from '../src/domain/scene.ts';
import { createHistory, commit, undo } from '../src/state/history.ts';

const section = {
  id: 'details',
  title: 'Источники',
  content: 'Скрытый текст о снеге',
  collapsed: true,
  height: 140,
};
const note = { id: 'details-card', kind: 'disclosure', x: 0, y: 0, sections: [section] };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('image cropping keeps world pixels fixed through rotation, scaling, reset and Undo', () => {
  const image = {
    id: 'photo',
    kind: 'image',
    assetId: 'original',
    x: 30,
    y: -20,
    width: 800,
    height: 600,
    scaleX: 1.8,
    scaleY: 0.7,
    rotation: 37,
  };
  const snapshot = structuredClone(image);
  const cropped = applyImageCrop(image, { x: 0.2, y: 0.1, width: 0.5, height: 0.6 });
  assert.equal(cropped.assetId, image.assetId);
  assert.deepEqual(sourceCrop(cropped.crop, 4000, 3000), {
    x: 800,
    y: 300,
    width: 2000,
    height: 1800,
  });
  assert.deepEqual(sourceCrop(cropped.crop, 800, 600), { x: 160, y: 60, width: 400, height: 360 });
  const pixel = (item, x, y) => {
    const c = item.crop ?? fullImage,
      a = (item.rotation * Math.PI) / 180;
    const dx = ((x - c.x) / c.width) * item.width * item.scaleX,
      dy = ((y - c.y) / c.height) * item.height * item.scaleY;
    return [
      item.x + dx * Math.cos(a) - dy * Math.sin(a),
      item.y + dx * Math.sin(a) + dy * Math.cos(a),
    ];
  };
  pixel(image, 0.45, 0.3).forEach((v, i) => near(v, pixel(cropped, 0.45, 0.3)[i]));
  const restored = applyImageCrop(cropped, fullImage);
  for (const key of ['x', 'y', 'width', 'height']) near(restored[key], image[key]);
  assert.equal(restored.crop, undefined);
  const history = commit(createHistory([image]), [cropped]);
  assert.deepEqual(undo(history).present, [image]);
  assert.deepEqual(image, snapshot);
});

test('crop gestures and presets stay inside source bounds and reject malformed regions', () => {
  for (const crop of [
    { ...fullImage, x: 0.1 },
    { ...fullImage, width: 0 },
    { ...fullImage, y: NaN },
    { ...fullImage, height: 0.0001 },
  ])
    assert.equal(validCrop(crop), false);
  const c = { x: 0.2, y: 0.3, width: 0.5, height: 0.4 };
  assert.deepEqual(moveCrop(c, 999, -999), { ...c, x: 0.5, y: 0 });
  for (const corner of ['nw', 'ne', 'sw', 'se'])
    for (const dx of [-10, 0, 10])
      for (const dy of [-10, 0, 10])
        for (const ratio of [undefined, 0.1, 1, 10])
          assert.ok(validCrop(resizeCrop(c, corner, dx, dy, ratio)));
  const square = cropToAspect(fullImage, 0.75);
  near(square.width / square.height, 0.75);
  assert.ok(validCrop(cropToAspect(fullImage, 1e10)));
});

test('folded text is searchable, expands with known bounds, and drafts save without mutating history', () => {
  assert.equal(disclosureSize(note).height, 72);
  const opened = { ...note, sections: [{ ...section, collapsed: false }] };
  assert.equal(disclosureSize(opened).height, 212);
  assert.equal(searchItems([note], 'СНЕГ')[0].sectionId, 'details');
  const saved = applyContentDrafts([note], null, null, {
    id: note.id,
    sectionId: 'details',
    text: 'Не потерять при выходе',
  });
  assert.equal(saved[0].sections[0].content, 'Не потерять при выходе');
  assert.equal(note.sections[0].content, section.content);
  assert.ok(validSections(note.sections));
  assert.equal(validSections([section, section]), false);
});

test('format 5 preserves new features and rejects invalid crop, disclosures and materials', () => {
  const scene = {
    ...emptyScene(),
    theme: { ...emptyScene().theme, glassPanels: true },
    items: [
      note,
      {
        id: 'glass',
        kind: 'star',
        x: 0,
        y: 0,
        glass: { ...defaultGlass, enabled: true },
        shimmer: { enabled: true, color: '#ffffff', intensity: 0.7, speed: 0.5 },
      },
      {
        id: 'photo',
        kind: 'image',
        x: 0,
        y: 0,
        assetId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        crop: { x: 0.1, y: 0, width: 0.5, height: 1 },
      },
    ],
  };
  assert.deepEqual(parseScene(structuredClone(scene)), scene);
  for (const version of [2, 3, 4])
    assert.equal(parseScene({ ...emptyScene(), schemaVersion: version }).schemaVersion, 5);
  for (const modify of [
    (s) => (s.items[2].crop.width = 2),
    (s) => s.items[0].sections.push({ ...section }),
    (s) => (s.items[1].glass.blur = 100),
    (s) => (s.items[2].glass = defaultGlass),
    (s) => (s.theme.glassPanels = 'yes'),
  ]) {
    const broken = structuredClone(scene);
    modify(broken);
    assert.throws(() => parseScene(broken));
  }
});

test('material and HTML proxies share hit layers while visible vector runs preserve depth', () => {
  const items = [
    { id: 'a', kind: 'circle' },
    note,
    { id: 'g', kind: 'rectangle', glass: { ...defaultGlass, enabled: true } },
    { id: 's', kind: 'note', shimmer: { enabled: true } },
    { id: 'b', kind: 'star' },
  ];
  const runs = canvasRuns(items);
  assert.deepEqual(
    runs.map((r) => r.items.map((i) => i.id)),
    [['a'], ['details-card', 'g', 's'], ['b']],
  );
  assert.deepEqual(
    runs.map((r) => r.zIndex),
    [1, 7, 9],
  );
  assert.equal(isDomItem(items[2]), false); // Material shapes retain Konva hit/drag routing.
});
