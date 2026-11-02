export type Camera = { x: number; y: number; scale: number };
export type ItemKind = 'note' | 'rectangle' | 'square' | 'circle' | 'star' | 'arrow' | 'line' | 'stroke' | 'image';
export type CanvasItem = {
  id: string; kind: ItemKind; x: number; y: number;
  scaleX?: number; scaleY?: number; rotation?: number;
  width?: number; height?: number; content?: string; fontSize?: number;
  fontFamily?: string; fontStyle?: string; fill?: string; stroke?: string;
  opacity?: number; locked?: boolean; points?: number[]; assetId?: string;
};
export type Theme = { background: string; pattern: 'dots' | 'grid' | 'none'; fontFamily: string };
export type Scene = { schemaVersion: 2; items: CanvasItem[]; camera: Camera; theme: Theme };
export const initialCamera: Camera = { x: 0, y: 0, scale: 1 };
export const defaultTheme: Theme = { background: '#f8fafb', pattern: 'dots', fontFamily: 'Arial' };
export const emptyScene = (): Scene => ({ schemaVersion: 2, items: [], camera: { ...initialCamera }, theme: { ...defaultTheme } });
const kinds: ItemKind[] = ['note', 'rectangle', 'square', 'circle', 'star', 'arrow', 'line', 'stroke', 'image'];
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
export function parseItems(value: unknown): CanvasItem[] {
  if (!Array.isArray(value)) throw new Error('Список объектов повреждён. Исходные данные сохранены.');
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || !kinds.includes(item.kind) || !finite(item.x) || !finite(item.y))
      throw new Error('Некорректный объект холста. Автосохранение заблокировано.');
    ids.add(item.id);
    for (const key of ['scaleX', 'scaleY', 'rotation', 'width', 'height', 'fontSize', 'opacity'])
      if (item[key] !== undefined && !finite(item[key])) throw new Error('Повреждена геометрия объекта.');
    for (const key of ['scaleX', 'scaleY', 'width', 'height', 'fontSize'])
      if (item[key] !== undefined && item[key] <= 0) throw new Error('Недопустимый размер объекта.');
    for (const key of ['content', 'fontFamily', 'fontStyle', 'fill', 'stroke', 'assetId'])
      if (item[key] !== undefined && typeof item[key] !== 'string') throw new Error('Повреждены свойства объекта.');
    if (item.opacity !== undefined && (item.opacity < 0 || item.opacity > 1)) throw new Error('Некорректная прозрачность.');
    if (item.kind === 'note' && typeof item.content !== 'string') throw new Error('Повреждён текст заметки.');
    if (['stroke', 'arrow', 'line'].includes(item.kind) && (!Array.isArray(item.points) || item.points.length < 2 || item.points.length % 2 || !item.points.every(finite)))
      throw new Error('Повреждены точки рисунка.');
    if (item.kind === 'image' && (typeof item.assetId !== 'string' || !item.assetId)) throw new Error('Отсутствует ссылка на изображение.');
  }
  return value as CanvasItem[];
}
export function parseScene(value: unknown): Scene {
  if (!value || typeof value !== 'object') throw new Error('Повреждён формат холста.');
  const scene = value as Scene;
  if (scene.schemaVersion !== 2) throw new Error('Версия холста не поддерживается. Обновите приложение.');
  parseItems(scene.items);
  if (!scene.camera || ![scene.camera.x, scene.camera.y, scene.camera.scale].every(finite) || scene.camera.scale <= 0)
    throw new Error('Повреждены настройки камеры.');
  if (!scene.theme || !/^#[\da-f]{6}$/i.test(scene.theme.background) || !['dots', 'grid', 'none'].includes(scene.theme.pattern) || typeof scene.theme.fontFamily !== 'string')
    throw new Error('Повреждены настройки оформления.');
  return scene;
}
