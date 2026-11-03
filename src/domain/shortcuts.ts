export type ShortcutAction =
  | 'select'
  | 'pen'
  | 'eraser'
  | 'text'
  | 'rectangle'
  | 'ellipse'
  | 'fit'
  | 'actualSize'
  | 'undo'
  | 'redo'
  | 'selectAll'
  | 'duplicate'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'group'
  | 'ungroup'
  | 'search'
  | 'remove'
  | 'escape'
  | 'save'
  | 'archive'
  | 'export'
  | 'presentation'
  | 'properties'
  | 'raise'
  | 'lower'
  | 'front'
  | 'back'
  | 'lock'
  | 'hide'
  | 'left'
  | 'right'
  | 'up'
  | 'down';
export type KeyStroke = {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};
export const shortcutCatalog: {
  action: string;
  mac: string;
  other: string;
  description: string;
}[] = [
  { action: 'select', mac: 'V', other: 'V', description: 'Выбор объектов' },
  { action: 'pen', mac: 'P / B', other: 'P / B', description: 'Карандаш' },
  { action: 'eraser', mac: 'E', other: 'E', description: 'Ластик для штрихов' },
  { action: 'text', mac: 'T', other: 'T', description: 'Добавить текст' },
  { action: 'rectangle', mac: 'R', other: 'R', description: 'Прямоугольник' },
  { action: 'ellipse', mac: 'O', other: 'O', description: 'Эллипс' },
  {
    action: 'pan',
    mac: 'Пробел + мышь / средняя кнопка',
    other: 'Пробел + мышь / средняя кнопка',
    description: 'Перемещение холста',
  },
  { action: 'fit', mac: 'F', other: 'F', description: 'Показать всё' },
  { action: 'actualSize', mac: '1', other: '1', description: 'Масштаб 100%' },
  { action: 'undo', mac: '⌘Z', other: 'Ctrl+Z', description: 'Отменить' },
  { action: 'redo', mac: '⌘⇧Z / ⌘Y', other: 'Ctrl+Shift+Z / Ctrl+Y', description: 'Повторить' },
  { action: 'selectAll', mac: '⌘A', other: 'Ctrl+A', description: 'Выделить всё' },
  { action: 'duplicate', mac: '⌘D', other: 'Ctrl+D', description: 'Дублировать' },
  {
    action: 'copy',
    mac: '⌘C / ⌘X / ⌘V',
    other: 'Ctrl+C / Ctrl+X / Ctrl+V',
    description: 'Копировать / вырезать / вставить между странами',
  },
  {
    action: 'group',
    mac: '⌘G / ⌘⇧G',
    other: 'Ctrl+G / Ctrl+Shift+G',
    description: 'Группировать / разгруппировать',
  },
  { action: 'search', mac: '⌘F', other: 'Ctrl+F', description: 'Поиск по заметкам и ячейкам' },
  { action: 'save', mac: '⌘S', other: 'Ctrl+S', description: 'Завершить сохранение' },
  { action: 'archive', mac: '⌘⇧S', other: 'Ctrl+Shift+S', description: 'Архив и восстановление' },
  { action: 'export', mac: '⌘⇧E', other: 'Ctrl+Shift+E', description: 'Экспорт холста в PNG' },
  {
    action: 'layer',
    mac: '⌘[ / ⌘] / +⇧',
    other: 'Ctrl+[ / Ctrl+] / +Shift',
    description: 'Ниже / выше; с Shift — на задний / передний план',
  },
  {
    action: 'lock',
    mac: '⌘⇧L',
    other: 'Ctrl+Shift+L',
    description: 'Блокировать / разблокировать выбранное',
  },
  { action: 'hide', mac: '⌘⇧H', other: 'Ctrl+Shift+H', description: 'Скрыть / показать выбранное' },
  { action: 'presentation', mac: 'Shift+P', other: 'Shift+P', description: 'Режим просмотра' },
  {
    action: 'properties',
    mac: 'Shift+I',
    other: 'Shift+I',
    description: 'Показать / скрыть свойства',
  },
  {
    action: 'move',
    mac: 'Стрелки / Shift+стрелки',
    other: 'Стрелки / Shift+стрелки',
    description: 'Сдвиг на 1 / 10 единиц холста',
  },
  {
    action: 'remove',
    mac: 'Delete / Backspace',
    other: 'Delete / Backspace',
    description: 'Удалить выбранное',
  },
  {
    action: 'finishText',
    mac: '⌘Enter',
    other: 'Ctrl+Enter',
    description: 'Завершить ввод заметки',
  },
  {
    action: 'escape',
    mac: 'Esc',
    other: 'Esc',
    description: 'Снять выбор / отменить ввод / выйти из просмотра',
  },
];
const modifiedBindings: Partial<Record<string, ShortcutAction>> = {
  z: 'undo',
  y: 'redo',
  a: 'selectAll',
  d: 'duplicate',
  c: 'copy',
  x: 'cut',
  v: 'paste',
  g: 'group',
  f: 'search',
  s: 'save',
  '[': 'lower',
  ']': 'raise',
};
const shiftedBindings: Partial<Record<string, ShortcutAction>> = {
  z: 'redo',
  g: 'ungroup',
  s: 'archive',
  e: 'export',
  l: 'lock',
  h: 'hide',
  '[': 'back',
  ']': 'front',
};
const plainBindings: Partial<Record<string, ShortcutAction>> = {
  v: 'select',
  p: 'pen',
  b: 'pen',
  e: 'eraser',
  t: 'text',
  r: 'rectangle',
  o: 'ellipse',
  f: 'fit',
  '1': 'actualSize',
  delete: 'remove',
  backspace: 'remove',
  escape: 'escape',
  arrowleft: 'left',
  arrowright: 'right',
  arrowup: 'up',
  arrowdown: 'down',
};
function physicalKey(event: KeyStroke): string {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3).toLowerCase();
  if (event.code === 'Digit1') return '1';
  if (event.code === 'BracketLeft') return '[';
  if (event.code === 'BracketRight') return ']';
  return event.key.toLowerCase();
}
/** Physical codes keep the editor shortcuts usable with Russian and other keyboard layouts. */
export function shortcutAction(event: KeyStroke): ShortcutAction | null {
  if (event.altKey) return null;
  const key = physicalKey(event);
  if (event.metaKey || event.ctrlKey)
    return (event.shiftKey ? shiftedBindings : modifiedBindings)[key] ?? null;
  if (event.shiftKey && key === 'p') return 'presentation';
  if (event.shiftKey && key === 'i') return 'properties';
  return plainBindings[key] ?? null;
}
export function editableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.matches('input,textarea,select,audio,video') ||
      target.isContentEditable ||
      !!target.closest('[role="dialog"]'))
  );
}
