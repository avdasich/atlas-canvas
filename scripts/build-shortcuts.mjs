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
const table = (shortcuts) => {
  const rows = shortcuts.map(({ action, description, mac, other }) => {
    const macKeys =
      action === 'layer'
        ? 'Cmd+[ / Cmd+] · с Shift — в самый низ / верх'
        : mac.replaceAll('⌘', 'Cmd+').replaceAll('⇧', 'Shift+');
    const otherKeys = action === 'layer' ? 'Ctrl+[ / Ctrl+] · с Shift — в самый низ / верх' : other;
    return `| ${description} | ${macKeys} | ${otherKeys} |`;
  });
  return ['| Действие | macOS | Windows и Linux |', '| --- | --- | --- |', ...rows].join('\n');
};
const document = `# Горячие клавиши

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
