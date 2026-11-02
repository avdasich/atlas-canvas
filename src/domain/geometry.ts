import type { Camera, CanvasItem } from './scene';
export type Bounds = { left: number; top: number; right: number; bottom: number };
export type Size = { width: number; height: number };
export type TextSize = (item: CanvasItem) => Size;
export function dimensions(item: CanvasItem): Size {
  if (item.kind === 'rectangle') return { width: item.width ?? 180, height: item.height ?? 110 };
  if (item.kind === 'square') return { width: item.width ?? 130, height: item.height ?? 130 };
  if (item.kind === 'note') return { width: item.width ?? 300, height: item.height ?? 50 };
  if (item.kind === 'image') return { width: item.width ?? 320, height: item.height ?? 240 };
  return { width: 130, height: 130 };
}
export function itemBounds(item: CanvasItem, measureText?: TextSize): Bounds {
  const sx = item.scaleX ?? 1, sy = item.scaleY ?? 1;
  const a = (item.rotation ?? 0) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  let points: number[];
  let pad = 1;
  if (item.kind === 'circle') {
    const rx = 65 * sx, ry = 65 * sy;
    const dx = Math.hypot(rx * cos, ry * sin), dy = Math.hypot(rx * sin, ry * cos);
    return { left: item.x - dx - Math.hypot(sx * cos, sy * sin), right: item.x + dx + Math.hypot(sx * cos, sy * sin), top: item.y - dy - Math.hypot(sx * sin, sy * cos), bottom: item.y + dy + Math.hypot(sx * sin, sy * cos) };
  } else if (item.kind === 'star') {
    points = Array.from({ length: 10 }, (_, i) => {
      const theta = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 30 : 65;
      return [Math.cos(theta) * r, Math.sin(theta) * r];
    }).flat();
  } else if (item.points) {
    points = item.points;
    pad = item.kind === 'arrow' ? 16 : 2;
  } else {
    const { width, height } = item.kind === 'note' && measureText ? measureText(item) : dimensions(item);
    const centered = item.kind === 'rectangle' || item.kind === 'square';
    const left = centered ? -width / 2 : 0, top = centered ? -height / 2 : 0;
    points = [left, top, left + width, top, left + width, top + height, left, top + height];
    if (item.kind === 'note' || item.kind === 'image') pad = 0;
  }
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i] * sx, y = points[i + 1] * sy;
    const px = item.x + x * cos - y * sin, py = item.y + x * sin + y * cos;
    left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
  }
  const p = pad * Math.max(sx, sy);
  return { left: left - p, top: top - p, right: right + p, bottom: bottom + p };
}
export const overlaps = (a: Bounds, b: Bounds, gap = 24) => !(a.right + gap <= b.left || a.left >= b.right + gap || a.bottom + gap <= b.top || a.top >= b.bottom + gap);
export function union(bounds: Bounds[]): Bounds {
  return bounds.reduce((a, b) => ({ left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) }));
}
export function fitCamera(bounds: Bounds[], size: Size): Camera {
  if (!bounds.length) return { x: 0, y: 0, scale: 1 };
  const b = union(bounds);
  // Fit is allowed below the interactive zoom limit for very distant objects.
  const scale = Math.min(1.5, Math.max(1, size.width - 100) / Math.max(1, b.right - b.left), Math.max(1, size.height - 100) / Math.max(1, b.bottom - b.top));
  return { scale, x: size.width / 2 - (b.left + b.right) / 2 * scale, y: size.height / 2 - (b.top + b.bottom) / 2 * scale };
}
export function zoomAt(camera: Camera, pointer: { x: number; y: number }, factor: number): Camera {
  const scale = Math.max(0.05, Math.min(8, camera.scale * factor));
  return { scale, x: pointer.x - (pointer.x - camera.x) / camera.scale * scale, y: pointer.y - (pointer.y - camera.y) / camera.scale * scale };
}
export function placeItem(item: CanvasItem, existing: CanvasItem[], viewport: Bounds, measure?: TextSize): CanvasItem {
  const b = itemBounds(item, measure), width = b.right - b.left, height = b.bottom - b.top;
  const cx = (viewport.left + viewport.right) / 2, cy = (viewport.top + viewport.bottom) / 2;
  const origin = { ...item, x: item.x + cx - (b.left + b.right) / 2, y: item.y + cy - (b.top + b.bottom) / 2 };
  const occupied = existing.map(i => itemBounds(i, measure));
  // Try object edges as well as the center: densely packed scenes still use visible gaps.
  const xs = new Set([cx - width / 2, viewport.left + 16]);
  const ys = new Set([cy - height / 2, viewport.top + 16]);
  for (const o of occupied) { xs.add(o.right + 25); xs.add(o.left - width - 25); ys.add(o.bottom + 25); ys.add(o.top - height - 25); }
  const candidates: { x: number; y: number; distance: number }[] = [];
  for (const x of xs) for (const y of ys) {
    if (x >= viewport.left + 12 && y >= viewport.top + 12 && x + width <= viewport.right - 12 && y + height <= viewport.bottom - 12)
      candidates.push({ x, y, distance: Math.hypot(x + width / 2 - cx, y + height / 2 - cy) });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const ob = itemBounds(origin, measure);
  for (const p of candidates) {
    const candidate = { ...origin, x: origin.x + p.x - ob.left, y: origin.y + p.y - ob.top };
    if (!occupied.some(o => overlaps(itemBounds(candidate, measure), o))) return candidate;
  }
  for (let ring = 0; ring < 100; ring++) for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
    const candidate = { ...origin, x: origin.x + dx * (width + 32), y: origin.y + dy * (height + 32) };
    if (!occupied.some(o => overlaps(itemBounds(candidate, measure), o))) return candidate;
  }
  const right = occupied.length ? Math.max(...occupied.map(o => o.right)) : ob.right;
  return { ...origin, x: origin.x + right + 32 - ob.left };
}
export function arrangeItems(items: CanvasItem[], viewport: Bounds, measure?: TextSize): CanvasItem[] {
  const width = Math.max(650, Math.min(1200, viewport.right - viewport.left - 80));
  const left = (viewport.left + viewport.right - width) / 2;
  let x = left, y = viewport.top + 60, rowHeight = 0;
  return items.map(item => {
    if (item.locked) return item;
    const b = itemBounds(item, measure), w = b.right - b.left, h = b.bottom - b.top;
    if (x > left && x + w > left + width) { x = left; y += rowHeight + 44; rowHeight = 0; }
    const moved = { ...item, x: item.x + x - b.left, y: item.y + y - b.top };
    x += w + 44; rowHeight = Math.max(rowHeight, h);
    return moved;
  });
}
