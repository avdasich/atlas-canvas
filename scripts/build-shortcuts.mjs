import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

const sourceUrl = new URL('../src/domain/shortcuts.ts', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { shortcutCatalog } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
const commonActions = new Set([
  'undo',
  'redo',
  'text',
  'copy',
  'remove',
  'search',
  'fit',
  'actualSize',
  'pan',
  'finishText',
  'escape',
]);
const english = {
  select: 'Select objects',
  pen: 'Pencil',
  eraser: 'Erase a stroke',
  text: 'Add text',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  pan: 'Pan the canvas',
  fit: 'Fit everything',
  actualSize: 'Zoom to 100%',
  undo: 'Undo',
  redo: 'Redo',
  selectAll: 'Select all',
  duplicate: 'Duplicate',
  copy: 'Copy / cut / paste between countries',
  group: 'Group / ungroup',
  search: 'Search notes, cells and expandable sections',
  save: 'Finish saving',
  archive: 'Archive and restore',
  export: 'Export canvas to PNG',
  layer: 'Lower / raise; Shift sends to back / front',
  lock: 'Lock / unlock selection',
  hide: 'Hide / show selection',
  presentation: 'View mode',
  properties: 'Show / hide properties',
  move: 'Move by 1 / 10 canvas units',
  remove: 'Delete selection',
  finishText: 'Finish text input',
  escape: 'Clear selection / cancel input / leave View mode',
};
const table = (shortcuts, en = false) => {
  const rows = shortcuts.map(({ action, description, mac, other }) => {
    const macKeys =
      action === 'layer'
        ? 'Cmd+[ / Cmd+] · с Shift — в самый низ / верх'
        : mac.replaceAll('⌘', 'Cmd+').replaceAll('⇧', 'Shift+');
    const otherKeys = action === 'layer' ? 'Ctrl+[ / Ctrl+] · с Shift — в самый низ / верх' : other;
    if (en && !english[action]) throw new Error(`Missing English shortcut: ${action}`);
    const keys = (value) =>
      !en
        ? value
        : action === 'pan'
          ? 'Space + drag / middle mouse'
          : action === 'move'
            ? 'Arrows / Shift+arrows'
            : value.replace('с Shift — в самый низ / верх', 'Shift: back / front');
    return `| ${en ? english[action] : description} | ${keys(macKeys)} | ${keys(otherKeys)} |`;
  });
  return [
    en ? '| Action | macOS | Windows and Linux |' : '| Действие | macOS | Windows и Linux |',
    '| --- | --- | --- |',
    ...rows,
  ].join('\n');
};
const document = `[English](en/SHORTCUTS.md)

# Горячие клавиши

[Главная](../README.md) · [Руководство](USER_GUIDE.md)

На Mac используйте **Cmd**, на Windows и Linux — **Ctrl**.
Например, отмена действия: Cmd+Z на Mac или Ctrl+Z на Windows/Linux.

## Самое нужное

${table(shortcutCatalog.filter(({ action }) => commonActions.has(action)))}

## Инструменты и другие команды

${table(shortcutCatalog.filter(({ action }) => !commonActions.has(action)))}

## Мышь

- **Клик** — выбрать объект.
- **Shift+клик** — добавить объект или группу к выбору либо исключить их.
- **Shift+перетаскивание по пустому месту** — выбрать несколько объектов рамкой.
- **Колесо** — приблизить или отдалить холст.
- **Перетаскивание пустого места** — переместиться по холсту.
- **Двойной клик по заметке** — редактировать текст.
- **Правая кнопка** — открыть меню действий.

Буквенные команды работают и в русской раскладке: например, выбор V доступен на клавише **М**.
Когда вы пишете заметку или вводите текст в ячейку, сочетания управляют текстом, а не объектами холста.
В режиме просмотра нажмите **Esc**, чтобы вернуться к редактированию.

Тот же список есть в приложении: **Свойства → Горячие клавиши · все ОС**.

<!-- Список команд берётся из src/domain/shortcuts.ts. Обновление: npm run docs:shortcuts. -->
`;
await writeFile(new URL('../docs/SHORTCUTS.md', import.meta.url), document);

const englishDocument = `[Русский](../SHORTCUTS.md) · [Main page](../../README.en.md) · [User guide](USER_GUIDE.md)

# Keyboard shortcuts

Use **Cmd** on macOS and **Ctrl** on Windows/Linux. For example, Undo is Cmd+Z on Mac and Ctrl+Z on Windows/Linux.

## Essentials

${table(
  shortcutCatalog.filter(({ action }) => commonActions.has(action)),
  true,
)}

## Tools and other commands

${table(
  shortcutCatalog.filter(({ action }) => !commonActions.has(action)),
  true,
)}

## Mouse

- **Click** selects an object.
- **Shift+click** adds/removes an object or group from the selection.
- **Shift+drag on empty space** selects with a rectangle.
- **Wheel** zooms the canvas.
- **Drag empty space** pans.
- **Double-click a note** edits its text.
- **Right-click** opens the action menu.

Letter commands follow physical keys and also work with a Cyrillic keyboard layout. While typing in a note or cell, shortcuts affect text rather than canvas objects. Press Esc to leave View mode.

The same catalog appears in the app under **Свойства → Горячие клавиши · все ОС** (Properties → Shortcuts · all operating systems).

<!-- Generated from src/domain/shortcuts.ts. Update: npm run docs:shortcuts. -->
`;
await writeFile(new URL('../docs/en/SHORTCUTS.md', import.meta.url), englishDocument);
