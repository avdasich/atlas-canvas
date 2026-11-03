export type Camera = { x: number; y: number; scale: number };
export type ItemKind = 'note' | 'rectangle' | 'square' | 'circle' | 'ellipse' | 'star' | 'arrow' | 'line' | 'stroke' | 'image' | 'table' | 'video' | 'audio' | 'link';
export type CellStyle = { fill?: string; color?: string; bold?: boolean; align?: 'left' | 'center' | 'right' };
export type TableCell = CellStyle & { text: string };
export type TableData = { cells: TableCell[][]; columnWidths: number[]; rowHeights: number[]; header: boolean; borderColor: string; background: string; color: string; borderWidth: number; fontSize: number; padding: number; radius: number };
export type CanvasItem = {
  id: string; kind: ItemKind; x: number; y: number;
  scaleX?: number; scaleY?: number; rotation?: number;
  width?: number; height?: number; content?: string; fontSize?: number;
  fontFamily?: string; fontStyle?: string; textDecoration?: string; align?: 'left' | 'center' | 'right'; lineHeight?: number;
  fill?: string; stroke?: string; strokeWidth?: number; cornerRadius?: number; shadowBlur?: number;
  opacity?: number; locked?: boolean; hidden?: boolean; groupId?: string; updatedAt?: string;
  points?: number[]; assetId?: string; title?: string; url?: string; table?: TableData;
};
export type Theme = { background: string; pattern: 'dots' | 'grid' | 'lines' | 'none'; fontFamily: string; backgroundType?: 'solid' | 'gradient' | 'image'; secondary?: string; angle?: number; backgroundAssetId?: string; imageMode?: 'cover' | 'contain' | 'repeat'; patternColor?: string; patternOpacity?: number; gridSize?: number; snap?: boolean };
export type Scene = { schemaVersion: 3; items: CanvasItem[]; camera: Camera; theme: Theme };
export const initialCamera: Camera = { x: 0, y: 0, scale: 1 };
export const defaultTheme: Theme = { background: '#f8fafb', pattern: 'dots', fontFamily: 'Arial' };
export const emptyScene = (): Scene => ({ schemaVersion: 3, items: [], camera: { ...initialCamera }, theme: { ...defaultTheme } });
const kinds: ItemKind[] = ['note', 'rectangle', 'square', 'circle', 'ellipse', 'star', 'arrow', 'line', 'stroke', 'image', 'table', 'video', 'audio', 'link'];
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const color = (value: unknown) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
export function validUrl(raw: string): boolean { try { return ['http:', 'https:'].includes(new URL(raw).protocol); } catch { return false; } }
export function validateTable(t: TableData) {
  if (!t || !Array.isArray(t.cells) || t.cells.length < 1 || t.cells.length > 200 || !Array.isArray(t.columnWidths) || !t.columnWidths.length || t.columnWidths.length > 50 || !Array.isArray(t.rowHeights) || t.rowHeights.length !== t.cells.length) throw new Error('Повреждена структура таблицы.');
  if (!t.columnWidths.every(n => finite(n) && n >= 40 && n <= 2000) || !t.rowHeights.every(n => finite(n) && n >= 24 && n <= 2000)) throw new Error('Некорректные размеры ячеек.');
  for (const row of t.cells) {
    if (!Array.isArray(row) || row.length !== t.columnWidths.length) throw new Error('Не совпадает число столбцов таблицы.');
    for (const cell of row) {
      if (!cell || typeof cell.text !== 'string' || cell.text.length > 100000) throw new Error('Повреждено содержимое ячейки.');
      if ((cell.fill !== undefined && !color(cell.fill)) || (cell.color !== undefined && !color(cell.color)) || (cell.align !== undefined && !['left', 'center', 'right'].includes(cell.align))) throw new Error('Повреждено оформление ячейки.');
    }
  }
  if (![t.background, t.borderColor, t.color].every(color) || ![t.borderWidth, t.fontSize, t.padding, t.radius].every(finite) || t.fontSize < 6 || t.fontSize > 200 || t.padding < 0 || t.padding > 100 || t.borderWidth < 0 || t.borderWidth > 20 || t.radius < 0 || t.radius > 100 || typeof t.header !== 'boolean') throw new Error('Повреждено оформление таблицы.');
}
export function parseItems(value: unknown): CanvasItem[] {
  if (!Array.isArray(value)) throw new Error('Список объектов повреждён. Исходные данные сохранены.');
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || !kinds.includes(item.kind) || !finite(item.x) || !finite(item.y)) throw new Error('Некорректный объект холста. Автосохранение заблокировано.');
    ids.add(item.id);
    for (const key of ['scaleX', 'scaleY', 'rotation', 'width', 'height', 'fontSize', 'opacity', 'strokeWidth', 'cornerRadius', 'shadowBlur', 'lineHeight']) if (item[key] !== undefined && !finite(item[key])) throw new Error('Повреждена геометрия объекта.');
    for (const key of ['scaleX', 'scaleY', 'width', 'height', 'fontSize', 'lineHeight']) if (item[key] !== undefined && item[key] <= 0) throw new Error('Недопустимый размер объекта.');
    for (const key of ['content', 'fontFamily', 'fontStyle', 'fill', 'stroke', 'assetId', 'title', 'url', 'groupId', 'updatedAt', 'textDecoration']) if (item[key] !== undefined && typeof item[key] !== 'string') throw new Error('Повреждены свойства объекта.');
    for (const key of ['locked', 'hidden']) if (item[key] !== undefined && typeof item[key] !== 'boolean') throw new Error('Повреждено состояние объекта.');
    if (item.opacity !== undefined && (item.opacity < 0 || item.opacity > 1)) throw new Error('Некорректная прозрачность.');
    if (item.kind === 'note' && typeof item.content !== 'string') throw new Error('Повреждён текст заметки.');
    if (['stroke', 'arrow', 'line'].includes(item.kind) && (!Array.isArray(item.points) || item.points.length < 2 || item.points.length % 2 || !item.points.every(finite))) throw new Error('Повреждены точки рисунка.');
    if (['image', 'video', 'audio'].includes(item.kind) && (typeof item.assetId !== 'string' || !/^[a-f\d-]{36}$/i.test(item.assetId))) throw new Error('Отсутствует корректная ссылка на медиа.');
    if (item.kind === 'link' && !validUrl(item.url)) throw new Error('Ссылка должна начинаться с https:// или http://.');
    if (item.kind === 'table') validateTable(item.table);
  }
  return value as CanvasItem[];
}
export function parseScene(value: unknown): Scene {
  if (!value || typeof value !== 'object') throw new Error('Повреждён формат холста.');
  const scene = value as Scene;
  if (![2, 3].includes(scene.schemaVersion)) throw new Error('Версия холста не поддерживается. Обновите приложение.');
  parseItems(scene.items);
  if (!scene.camera || ![scene.camera.x, scene.camera.y, scene.camera.scale].every(finite) || scene.camera.scale <= 0) throw new Error('Повреждены настройки камеры.');
  const t = scene.theme;
  if (!t || !color(t.background) || !['dots', 'grid', 'lines', 'none'].includes(t.pattern) || typeof t.fontFamily !== 'string') throw new Error('Повреждены настройки оформления.');
  if (t.backgroundType !== undefined && !['solid', 'gradient', 'image'].includes(t.backgroundType)) throw new Error('Неизвестный тип фона.');
  if (t.secondary !== undefined && !color(t.secondary)) throw new Error('Некорректный цвет градиента.');
  if (t.patternColor !== undefined && !color(t.patternColor)) throw new Error('Некорректный цвет узора.');
  if (t.angle !== undefined && !finite(t.angle)) throw new Error('Некорректный угол градиента.');
  if (t.patternOpacity !== undefined && (!finite(t.patternOpacity) || t.patternOpacity < 0 || t.patternOpacity > 1)) throw new Error('Некорректная прозрачность узора.');
  return { ...scene, schemaVersion: 3 };
}
