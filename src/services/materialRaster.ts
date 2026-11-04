import type Konva from 'konva';
import { defaultGlass, rgba } from '../domain/materials';
import type { CanvasItem } from '../domain/scene';
import type { Shimmer } from '../domain/shimmer';
import { drawShimmer, snowCrystals } from '../domain/shimmer';
import { vectorNode } from './vectorDrawing';

export type MaterialRaster = {
  mask: HTMLCanvasElement;
  base: HTMLCanvasElement;
  rim: HTMLCanvasElement;
  url: string;
  left: number;
  top: number;
  width: number;
  height: number;
  ratio: number;
};
export function rasterSignature(item: CanvasItem) {
  const {
    x: _x,
    y: _y,
    scaleX: _sx,
    scaleY: _sy,
    rotation: _r,
    updatedAt: _time,
    opacity: _opacity,
    glass: _glass,
    shimmer: _shimmer,
    ...visual
  } = item;
  return JSON.stringify(visual);
}
function canvas(width: number, height: number) {
  const result = document.createElement('canvas');
  result.width = Math.max(1, Math.ceil(width));
  result.height = Math.max(1, Math.ceil(height));
  return result;
}
export function materialRaster(
  item: CanvasItem,
  family: string,
  color: string,
  detail = 1,
  padding = 3,
): MaterialRaster {
  const baseNode = vectorNode(item, family, color),
    maskNode = vectorNode(item, family, color, true);
  try {
    const b = baseNode.getClientRect({ skipTransform: true });
    const left = Math.floor(b.x) - padding,
      top = Math.floor(b.y) - padding;
    const width = Math.max(1, Math.ceil(b.width) + padding * 2),
      height = Math.max(1, Math.ceil(b.height) + padding * 2);
    const ratio = Math.min(detail, 1200 / width, 1200 / height);
    const options = { x: left, y: top, width, height, pixelRatio: ratio };
    const mask = maskNode.toCanvas(options),
      base = baseNode.toCanvas(options);
    const rim = canvas(mask.width, mask.height),
      context = rim.getContext('2d')!;
    const alpha = mask.getContext('2d')!.getImageData(0, 0, mask.width, mask.height).data;
    const edge = context.createImageData(mask.width, mask.height),
      w = mask.width,
      h = mask.height;
    const at = (x: number, y: number) =>
      x < 0 || x >= w || y < 0 || y >= h ? 0 : alpha[(y * w + x) * 4 + 3];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const a = at(x, y),
          highlight = Math.max(0, a - Math.min(at(x - 1, y), at(x, y - 1)));
        const shadow = Math.max(0, a - Math.min(at(x + 1, y), at(x, y + 1)));
        const n = (y * w + x) * 4,
          bright = highlight >= shadow;
        edge.data[n] = bright ? 255 : 65;
        edge.data[n + 1] = bright ? 255 : 100;
        edge.data[n + 2] = bright ? 255 : 130;
        edge.data[n + 3] = Math.max(highlight, shadow) * (bright ? 0.9 : 0.45);
      }
    context.putImageData(edge, 0, 0);
    return { mask, base, rim, url: mask.toDataURL(), left, top, width, height, ratio };
  } finally {
    baseNode.destroy();
    maskNode.destroy();
  }
}
export function maskedCrystals(raster: MaterialRaster) {
  const { width, height, mask } = raster;
  const alpha = mask.getContext('2d')!.getImageData(0, 0, mask.width, mask.height).data;
  const all = snowCrystals(width * 3, height * 3).map((c) => ({
    ...c,
    x: c.x / 3,
    y: c.y / 3,
    radius: c.radius * 0.8,
  }));
  return all.filter(
    (c) =>
      alpha[
        (Math.min(mask.height - 1, Math.floor((c.y * mask.height) / height)) * mask.width +
          Math.min(mask.width - 1, Math.floor((c.x * mask.width) / width))) *
          4 +
          3
      ] > 120,
  );
}
export function drawObjectShimmer(
  ctx: CanvasRenderingContext2D,
  raster: MaterialRaster,
  settings: Shimmer,
  seconds: number,
  crystals = maskedCrystals(raster),
) {
  ctx.save();
  drawShimmer(ctx, crystals, settings, seconds);
  ctx.restore();
}

/** Export fallback: separable box blur also works where Canvas2D.filter is absent. */
function blurPixels(target: HTMLCanvasElement, radius: number) {
  const r = Math.min(50, Math.max(0, Math.round(radius)));
  if (!r) return;
  const ctx = target.getContext('2d')!,
    image = ctx.getImageData(0, 0, target.width, target.height);
  const { width: w, height: h } = image;
  let source = new Uint8ClampedArray(image.data),
    out = new Uint8ClampedArray(source.length);
  for (let pass = 0; pass < 2; pass++) {
    for (const horizontal of [true, false]) {
      const length = horizontal ? w : h,
        count = horizontal ? h : w;
      for (let line = 0; line < count; line++) {
        const pixel = (pos: number) =>
          horizontal
            ? (line * w + Math.max(0, Math.min(length - 1, pos))) * 4
            : (Math.max(0, Math.min(length - 1, pos)) * w + line) * 4;
        const sums = [0, 0, 0, 0];
        for (let n = -r; n <= r; n++) {
          const p = pixel(n);
          for (let c = 0; c < 4; c++) sums[c] += source[p + c];
        }
        for (let n = 0; n < length; n++) {
          const p = pixel(n);
          for (let c = 0; c < 4; c++) out[p + c] = sums[c] / (2 * r + 1);
          const before = pixel(n - r),
            after = pixel(n + r + 1);
          for (let c = 0; c < 4; c++) sums[c] += source[after + c] - source[before + c];
        }
      }
      [source, out] = [out, source];
    }
  }
  image.data.set(source);
  ctx.putImageData(image, 0, 0);
}
export function exportedMaterial(
  raster: MaterialRaster,
  item: CanvasItem,
  backdrop: HTMLCanvasElement,
  absolute: Konva.Transform,
) {
  const result = canvas(raster.mask.width, raster.mask.height),
    ctx = result.getContext('2d')!;
  const glass = item.glass ?? defaultGlass;
  if (glass.enabled) {
    const inverse = absolute.copy().invert().getMatrix();
    ctx.save();
    ctx.scale(raster.ratio, raster.ratio);
    ctx.translate(-raster.left, -raster.top);
    ctx.transform(inverse[0], inverse[1], inverse[2], inverse[3], inverse[4], inverse[5]);
    ctx.drawImage(backdrop, 0, 0);
    ctx.restore();
    blurPixels(result, glass.blur * raster.ratio * 0.5);
    ctx.fillStyle = rgba(glass.tint, glass.opacity);
    ctx.fillRect(0, 0, result.width, result.height);
    const shine = ctx.createLinearGradient(0, 0, result.width, result.height);
    shine.addColorStop(0, '#ffffff66');
    shine.addColorStop(0.45, '#ffffff08');
    shine.addColorStop(1, '#ffffff22');
    ctx.fillStyle = shine;
    ctx.fillRect(0, 0, result.width, result.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(raster.mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(raster.rim, 0, 0);
  } else ctx.drawImage(raster.base, 0, 0);
  if (item.shimmer?.enabled) {
    const glints = canvas(result.width, result.height),
      sparkles = glints.getContext('2d')!;
    sparkles.scale(raster.ratio, raster.ratio);
    drawObjectShimmer(sparkles, raster, item.shimmer, 0);
    sparkles.setTransform(1, 0, 0, 1, 0, 0);
    sparkles.globalCompositeOperation = 'destination-in';
    sparkles.drawImage(raster.mask, 0, 0);
    ctx.drawImage(glints, 0, 0);
  }
  return result;
}
