import { validCrop } from './crop';
import { validSections } from './disclosure';
import { supportsMaterial, validGlass } from './materials';
import type { RichRun } from './richText';
import type { Camera, CanvasItem, ItemKind, Scene, TableData, Theme } from './sceneTypes';
import { validShimmer } from './shimmer';
export type {
  Camera,
  CanvasItem,
  CellStyle,
  ItemKind,
  Scene,
  TableCell,
  TableData,
  Theme,
} from './sceneTypes';
export const initialCamera: Camera = { x: 0, y: 0, scale: 1 };
export const defaultTheme: Theme = { background: '#f8fafb', pattern: 'dots', fontFamily: 'Arial' };
export const emptyScene = (): Scene => ({
  schemaVersion: 5,
  items: [],
  camera: { ...initialCamera },
  theme: { ...defaultTheme },
});
const kinds: ItemKind[] = [
  'note',
  'rectangle',
  'square',
  'circle',
  'ellipse',
  'star',
  'arrow',
  'line',
  'stroke',
  'image',
  'table',
  'video',
  'audio',
  'link',
  'disclosure',
];
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const color = (value: unknown) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
export function validUrl(raw: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(raw).protocol);
  } catch {
    return false;
  }
}
export function validateTable(t: TableData) {
  if (
    !t ||
    !Array.isArray(t.cells) ||
    t.cells.length < 1 ||
    t.cells.length > 200 ||
    !Array.isArray(t.columnWidths) ||
    !t.columnWidths.length ||
    t.columnWidths.length > 50 ||
    !Array.isArray(t.rowHeights) ||
    t.rowHeights.length !== t.cells.length
  )
    throw new Error('Повреждена структура таблицы.');
  if (
    !t.columnWidths.every((n) => finite(n) && n >= 40 && n <= 2000) ||
    !t.rowHeights.every((n) => finite(n) && n >= 24 && n <= 2000)
  )
    throw new Error('Некорректные размеры ячеек.');
  for (const row of t.cells) {
    if (!Array.isArray(row) || row.length !== t.columnWidths.length)
      throw new Error('Не совпадает число столбцов таблицы.');
    for (const cell of row) {
      if (!cell || typeof cell.text !== 'string' || cell.text.length > 100000)
        throw new Error('Повреждено содержимое ячейки.');
      if (
        (cell.fill !== undefined && !color(cell.fill)) ||
        (cell.color !== undefined && !color(cell.color)) ||
        (cell.align !== undefined && !['left', 'center', 'right'].includes(cell.align))
      )
        throw new Error('Повреждено оформление ячейки.');
    }
  }
  if (t.headerFill !== undefined && !color(t.headerFill))
    throw new Error('Некорректный цвет заголовка.');
  if (t.merges !== undefined) {
    if (!Array.isArray(t.merges) || t.merges.length > 5000)
      throw new Error('Повреждены объединённые ячейки.');
    const occupied = new Set<string>();
    for (const m of t.merges) {
      if (
        !m ||
        ![m.row, m.column, m.rows, m.columns].every(Number.isInteger) ||
        m.row < 0 ||
        m.column < 0 ||
        m.rows < 1 ||
        m.columns < 1 ||
        m.row + m.rows > t.cells.length ||
        m.column + m.columns > t.columnWidths.length
      )
        throw new Error('Объединение за границами таблицы.');
      for (let r = m.row; r < m.row + m.rows; r++)
        for (let c = m.column; c < m.column + m.columns; c++) {
          const key = `${r}:${c}`;
          if (occupied.has(key)) throw new Error('Объединения ячеек пересекаются.');
          occupied.add(key);
        }
    }
  }
  if (
    ![t.background, t.borderColor, t.color].every(color) ||
    ![t.borderWidth, t.fontSize, t.padding, t.radius].every(finite) ||
    t.fontSize < 6 ||
    t.fontSize > 200 ||
    t.padding < 0 ||
    t.padding > 100 ||
    t.borderWidth < 0 ||
    t.borderWidth > 20 ||
    t.radius < 0 ||
    t.radius > 100 ||
    typeof t.header !== 'boolean'
  )
    throw new Error('Повреждено оформление таблицы.');
}
export function parseItems(value: unknown): CanvasItem[] {
  if (!Array.isArray(value))
    throw new Error('Список объектов повреждён. Исходные данные сохранены.');
  const ids = new Set<string>();
  for (const item of value) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id ||
      ids.has(item.id) ||
      !kinds.includes(item.kind) ||
      !finite(item.x) ||
      !finite(item.y)
    )
      throw new Error('Некорректный объект холста. Автосохранение заблокировано.');
    if (item.crop !== undefined && (item.kind !== 'image' || !validCrop(item.crop)))
      throw new Error('Повреждена область обрезки.');
    if (
      item.sections !== undefined &&
      (item.kind !== 'disclosure' || !validSections(item.sections))
    )
      throw new Error('Повреждены разделы сноски.');
    if (item.kind === 'disclosure' && !validSections(item.sections))
      throw new Error('Отсутствуют разделы сноски.');
    if (item.glass !== undefined && (!supportsMaterial(item) || !validGlass(item.glass)))
      throw new Error('Повреждён материал объекта.');
    if (item.shimmer !== undefined && (!supportsMaterial(item) || !validShimmer(item.shimmer)))
      throw new Error('Повреждены блестяшки объекта.');
    ids.add(item.id);
    for (const key of [
      'scaleX',
      'scaleY',
      'rotation',
      'width',
      'height',
      'fontSize',
      'opacity',
      'strokeWidth',
      'cornerRadius',
      'shadowBlur',
      'lineHeight',
    ])
      if (item[key] !== undefined && !finite(item[key]))
        throw new Error('Повреждена геометрия объекта.');
    for (const key of ['scaleX', 'scaleY', 'width', 'height', 'fontSize', 'lineHeight'])
      if (item[key] !== undefined && item[key] <= 0)
        throw new Error('Недопустимый размер объекта.');
    for (const key of [
      'content',
      'fontFamily',
      'fontStyle',
      'fill',
      'stroke',
      'assetId',
      'title',
      'url',
      'groupId',
      'updatedAt',
      'textDecoration',
    ])
      if (item[key] !== undefined && typeof item[key] !== 'string')
        throw new Error('Повреждены свойства объекта.');
    for (const key of ['locked', 'hidden'])
      if (item[key] !== undefined && typeof item[key] !== 'boolean')
        throw new Error('Повреждено состояние объекта.');
    if (item.opacity !== undefined && (item.opacity < 0 || item.opacity > 1))
      throw new Error('Некорректная прозрачность.');
    if (
      item.richText !== undefined &&
      (!Array.isArray(item.richText) ||
        item.richText.length > 100000 ||
        item.richText.some(
          (r: RichRun) =>
            !r ||
            typeof r.text !== 'string' ||
            [r.bold, r.italic, r.underline].some(
              (n) => n !== undefined && typeof n !== 'boolean',
            ) ||
            (r.href !== undefined && !validUrl(r.href)),
        ) ||
        item.richText.map((r: RichRun) => r.text).join('') !== item.content)
    )
      throw new Error('Повреждено форматирование заметки.');
    if (item.textBackground !== undefined && !color(item.textBackground))
      throw new Error('Некорректный фон заметки.');
    if (item.kind === 'note' && typeof item.content !== 'string')
      throw new Error('Повреждён текст заметки.');
    if (
      ['stroke', 'arrow', 'line'].includes(item.kind) &&
      (!Array.isArray(item.points) ||
        item.points.length < 2 ||
        item.points.length % 2 ||
        !item.points.every(finite))
    )
      throw new Error('Повреждены точки рисунка.');
    if (
      ['image', 'video', 'audio'].includes(item.kind) &&
      (typeof item.assetId !== 'string' || !/^[a-f\d-]{36}$/i.test(item.assetId))
    )
      throw new Error('Отсутствует корректная ссылка на медиа.');
    if (
      item.dash !== undefined &&
      (!Array.isArray(item.dash) ||
        item.dash.length > 8 ||
        !item.dash.every((n: number) => finite(n) && n >= 0 && n <= 100))
    )
      throw new Error('Некорректный тип линии.');
    if (
      item.tension !== undefined &&
      (!finite(item.tension) || item.tension < 0 || item.tension > 1)
    )
      throw new Error('Некорректное сглаживание.');
    if (item.kind === 'link' && !validUrl(item.url))
      throw new Error('Ссылка должна начинаться с https:// или http://.');
    if (item.kind === 'table') validateTable(item.table);
  }
  return value as CanvasItem[];
}
export function parseScene(value: unknown): Scene {
  if (!value || typeof value !== 'object') throw new Error('Повреждён формат холста.');
  const scene = value as Scene;
  if (![2, 3, 4, 5].includes(scene.schemaVersion))
    throw new Error('Версия холста не поддерживается. Обновите приложение.');
  parseItems(scene.items);
  if (
    !scene.camera ||
    ![scene.camera.x, scene.camera.y, scene.camera.scale].every(finite) ||
    scene.camera.scale <= 0
  )
    throw new Error('Повреждены настройки камеры.');
  const t = scene.theme;
  if (t?.glassPanels !== undefined && typeof t.glassPanels !== 'boolean')
    throw new Error('Некорректный материал панелей.');
  if (
    !t ||
    !color(t.background) ||
    !['dots', 'grid', 'lines', 'none'].includes(t.pattern) ||
    typeof t.fontFamily !== 'string'
  )
    throw new Error('Повреждены настройки оформления.');
  if (t.imageMode !== undefined && !['cover', 'contain', 'repeat', 'stretch'].includes(t.imageMode))
    throw new Error('Неизвестный режим изображения.');
  if (t.gridSize !== undefined && (!finite(t.gridSize) || t.gridSize < 4 || t.gridSize > 200))
    throw new Error('Некорректный шаг сетки.');
  if (t.backgroundAssetId !== undefined && !/^[a-f\d-]{36}$/i.test(t.backgroundAssetId))
    throw new Error('Некорректное фоновое изображение.');
  if (t.backgroundType !== undefined && !['solid', 'gradient', 'image'].includes(t.backgroundType))
    throw new Error('Неизвестный тип фона.');
  if (t.textColor !== undefined && !color(t.textColor))
    throw new Error('Некорректный цвет текста страны.');
  if (
    t.backgroundOpacity !== undefined &&
    (!finite(t.backgroundOpacity) || t.backgroundOpacity < 0 || t.backgroundOpacity > 1)
  )
    throw new Error('Некорректная прозрачность фона.');
  if (
    t.imageScale !== undefined &&
    (!finite(t.imageScale) || t.imageScale < 0.1 || t.imageScale > 10)
  )
    throw new Error('Некорректный масштаб фона.');
  if ([t.imageX, t.imageY].some((n) => n !== undefined && !finite(n)))
    throw new Error('Некорректное положение фона.');
  if (t.secondary !== undefined && !color(t.secondary))
    throw new Error('Некорректный цвет градиента.');
  if (t.patternColor !== undefined && !color(t.patternColor))
    throw new Error('Некорректный цвет узора.');
  if (t.angle !== undefined && !finite(t.angle)) throw new Error('Некорректный угол градиента.');
  if (
    t.patternOpacity !== undefined &&
    (!finite(t.patternOpacity) || t.patternOpacity < 0 || t.patternOpacity > 1)
  )
    throw new Error('Некорректная прозрачность узора.');
  if (
    t.guides !== undefined &&
    (!Array.isArray(t.guides) ||
      t.guides.length > 100 ||
      t.guides.some(
        (g) => !g || typeof g.id !== 'string' || !['x', 'y'].includes(g.axis) || !finite(g.value),
      ))
  )
    throw new Error('Повреждены направляющие.');
  if (
    t.bookmarks !== undefined &&
    (!Array.isArray(t.bookmarks) ||
      t.bookmarks.length > 100 ||
      t.bookmarks.some(
        (b) =>
          !b ||
          typeof b.id !== 'string' ||
          typeof b.name !== 'string' ||
          b.name.length > 80 ||
          !b.camera ||
          ![b.camera.x, b.camera.y, b.camera.scale].every(finite) ||
          b.camera.scale <= 0,
      ))
  )
    throw new Error('Повреждены закладки вида.');
  if (t.shimmer !== undefined && !validShimmer(t.shimmer))
    throw new Error('Повреждены настройки переливания.');
  return { ...scene, schemaVersion: 5 };
}
