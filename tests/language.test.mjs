import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import ts from 'typescript';
import { english } from '../src/i18n/en.ts';
import {
  countryName,
  getLanguage,
  isLanguage,
  setLanguage,
  subscribeLanguage,
  t,
  translate,
  translateMessage,
} from '../src/i18n/index.ts';
import { makeCountry } from '../src/domain/countries.ts';

const slots = (text) => [...text.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();
test('English catalog covers UI calls and preserves every interpolation slot', async () => {
  for (const [ru, en] of Object.entries(english)) {
    assert.ok(en.trim());
    assert.doesNotMatch(en, /[А-Яа-яЁё]/u, ru);
    assert.deepEqual(slots(en), slots(ru), ru);
  }
  const inspect = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) {
        if (entry.name !== 'i18n') await inspect(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const source = await readFile(path, 'utf8');
      const file = ts.createSourceFile(entry.name, source, ts.ScriptTarget.Latest, true);
      const visit = (node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          ['tr', 't'].includes(node.expression.text) &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          assert.ok(english[node.arguments[0].text], `${path}: ${node.arguments[0].text}`);
        }
        if (ts.isJsxText(node) && /[А-Яа-яЁё]/u.test(node.text))
          assert.equal(node.text.trim(), 'Русский', `${path}: untranslated UI text`);
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
  };
  await inspect(new URL('../src/', import.meta.url));
});
test('switching languages updates subscribers without changing country IDs or user text', () => {
  setLanguage('ru');
  const country = makeCountry('392', 'Japan');
  const original = JSON.stringify(country);
  const userText = 'Снег — my own title {0}';
  let updates = 0;
  const stop = subscribeLanguage(() => updates++);
  setLanguage('en');
  assert.equal(getLanguage(), 'en');
  assert.equal(t('Сохранено'), 'Saved');
  assert.equal(countryName(country), 'Japan');
  assert.equal(JSON.stringify(country), original);
  assert.equal(translate('Архив сохранён: {0}', 'en', userText), `Backup saved: ${userText}`);
  setLanguage('en');
  assert.equal(updates, 1);
  stop();
  setLanguage('ru');
  assert.equal(countryName(country), country.nameRu);
  assert.equal(isLanguage('fr'), false);
  assert.equal(isLanguage('en'), true);
});
test('queued and native errors translate only known messages and preserve paths', () => {
  setLanguage('en');
  assert.equal(
    translateMessage('Error: Вложение не найдено. Восстановите его из архива.'),
    'Error: Attachment not found. Restore it from a backup.',
  );
  assert.equal(
    translateMessage('Архив сохранён: /tmp/Мой атлас.atlas'),
    'Backup saved: /tmp/Мой атлас.atlas',
  );
  assert.equal(
    t(
      'Автокопия не создана: {0}',
      translateMessage('Не удалось определить время последнего изменения холста.'),
    ),
    'Automatic backup failed: Could not determine when the canvas last changed.',
  );
  assert.equal(translateMessage('/tmp/Сохранено.png'), '/tmp/Сохранено.png');
  setLanguage('ru');
  assert.equal(translateMessage('Saved'), 'Сохранено');
});

test('language changes enter the exit save queue before awaiting the native menu update', async () => {
  const { changeLanguage } = await import('../src/i18n/useLanguage.ts');
  const { flushPreferences } = await import('../src/services/preferenceWrites.ts');
  const previousTauri = Object.getOwnPropertyDescriptor(globalThis, 'isTauri');
  Object.defineProperty(globalThis, 'isTauri', { configurable: true, value: true });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const saved = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let first = true;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { documentElement: { lang: 'ru' } },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __TAURI_INTERNALS__: {
        invoke: async (command, args) => {
          if (command === 'set_ui_language' && first) {
            first = false;
            await gate;
          }
          if (command === 'save_preferences') saved.push(JSON.parse(args.json));
        },
      },
    },
  });
  try {
    const changes = [changeLanguage('en'), changeLanguage('ru'), changeLanguage('en')];
    let exited = false;
    const exit = flushPreferences().then(() => {
      exited = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(exited, false, 'exit must wait for the pending language save');
    release();
    await Promise.all([...changes, exit]);
    assert.deepEqual(saved, ['en', 'ru', 'en']);
    assert.equal(getLanguage(), 'en');
  } finally {
    release();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
    if (previousTauri) Object.defineProperty(globalThis, 'isTauri', previousTauri);
    else delete globalThis.isTauri;
    setLanguage('ru');
  }
});
