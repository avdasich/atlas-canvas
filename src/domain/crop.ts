import type { CanvasItem } from './sceneTypes';

/** Image coordinates, independent of preview/original resolution. */
export type ImageCrop = { x: number; y: number; width: number; height: number };
export const fullImage: ImageCrop = { x: 0, y: 0, width: 1, height: 1 };
export const minimumCrop = 0.001;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function validCrop(value: unknown): value is ImageCrop {
  if (!value || typeof value !== 'object') return false;
  const c = value as ImageCrop;
  return (
    [c.x, c.y, c.width, c.height].every(Number.isFinite) &&
    c.x >= 0 &&
    c.y >= 0 &&
    c.width >= minimumCrop &&
    c.height >= minimumCrop &&
    c.x + c.width <= 1 + 1e-9 &&
    c.y + c.height <= 1 + 1e-9
  );
}
export function sourceCrop(crop: ImageCrop | undefined, width: number, height: number) {
  const c = crop ?? fullImage;
  return { x: c.x * width, y: c.y * height, width: c.width * width, height: c.height * height };
}

/** Keep the remaining pixels in place, including rotated and scaled images. */
export function applyImageCrop(item: CanvasItem, crop: ImageCrop): CanvasItem {
  if (item.kind !== 'image' || !validCrop(crop)) throw new Error('Некорректная область обрезки.');
  const before = item.crop ?? fullImage;
  const width = item.width ?? 320,
    height = item.height ?? 240;
  const dx = ((width * (crop.x - before.x)) / before.width) * (item.scaleX ?? 1);
  const dy = ((height * (crop.y - before.y)) / before.height) * (item.scaleY ?? 1);
  const angle = ((item.rotation ?? 0) * Math.PI) / 180;
  const next: CanvasItem = {
    ...item,
    x: item.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: item.y + dx * Math.sin(angle) + dy * Math.cos(angle),
    width: (width * crop.width) / before.width,
    height: (height * crop.height) / before.height,
    crop: { ...crop },
  };
  if (crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1) delete next.crop;
  return next;
}
export function moveCrop(crop: ImageCrop, dx: number, dy: number): ImageCrop {
  return {
    ...crop,
    x: clamp(crop.x + dx, 0, 1 - crop.width),
    y: clamp(crop.y + dy, 0, 1 - crop.height),
  };
}
export type CropCorner = 'nw' | 'ne' | 'sw' | 'se';
export function resizeCrop(
  crop: ImageCrop,
  corner: CropCorner,
  dx: number,
  dy: number,
  ratio?: number,
): ImageCrop {
  const west = corner.includes('w'),
    north = corner.includes('n');
  const anchorX = west ? crop.x + crop.width : crop.x;
  const anchorY = north ? crop.y + crop.height : crop.y;
  const maxWidth = west ? anchorX : 1 - anchorX;
  const maxHeight = north ? anchorY : 1 - anchorY;
  let width = clamp(crop.width + (west ? -dx : dx), minimumCrop, maxWidth);
  let height = clamp(crop.height + (north ? -dy : dy), minimumCrop, maxHeight);
  if (ratio) {
    if (Math.abs(dx) >= Math.abs(dy) * ratio) height = width / ratio;
    else width = height * ratio;
    const minimum = Math.max(minimumCrop, minimumCrop * ratio);
    width = Math.max(minimum, width);
    height = width / ratio;
    const fit = Math.min(1, maxWidth / width, maxHeight / height);
    width *= fit;
    height *= fit;
  }
  if (width < minimumCrop || height < minimumCrop) return crop;
  return {
    x: west ? anchorX - width : anchorX,
    y: north ? anchorY - height : anchorY,
    width,
    height,
  };
}
export function cropToAspect(crop: ImageCrop, ratio: number): ImageCrop {
  let width = crop.width,
    height = crop.height;
  if (width / height > ratio) width = height * ratio;
  else height = width / ratio;
  if (width < minimumCrop || height < minimumCrop) return crop;
  return {
    x: crop.x + (crop.width - width) / 2,
    y: crop.y + (crop.height - height) / 2,
    width,
    height,
  };
}
