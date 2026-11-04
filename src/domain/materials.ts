import type { CanvasItem } from './sceneTypes';
export type Glass = { enabled: boolean; blur: number; tint: string; opacity: number };
export const defaultGlass: Glass = { enabled: false, blur: 12, tint: '#dbeeff', opacity: 0.25 };
export function validGlass(value: unknown): value is Glass {
  if (!value || typeof value !== 'object') return false;
  const g = value as Glass;
  return (
    typeof g.enabled === 'boolean' &&
    Number.isFinite(g.blur) &&
    g.blur >= 0 &&
    g.blur <= 40 &&
    /^#[\da-f]{6}$/i.test(g.tint) &&
    Number.isFinite(g.opacity) &&
    g.opacity >= 0 &&
    g.opacity <= 1
  );
}
export function supportsMaterial(item: CanvasItem) {
  return [
    'note',
    'rectangle',
    'square',
    'circle',
    'ellipse',
    'star',
    'line',
    'arrow',
    'stroke',
  ].includes(item.kind);
}
export function hasMaterial(item: CanvasItem) {
  return supportsMaterial(item) && !!(item.glass?.enabled || item.shimmer?.enabled);
}
export function rgba(hex: string, opacity: number) {
  return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${opacity})`;
}
