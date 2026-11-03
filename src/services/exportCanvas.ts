import Konva from 'konva';
import { pdfFromJpeg } from '../domain/pdf';
import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { type Bounds, dimensions, itemBounds, union } from '../domain/geometry';
import type { CanvasItem, Scene } from '../domain/scene';
import { textConfig } from '../components/editor/ItemView';
async function image(url: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => reject(new Error('Не удалось открыть изображение для экспорта')); img.src = url; }); }
export async function exportCanvas(scene: Scene, viewport: Bounds, region: 'all' | 'viewport', format: 'png' | 'pdf') {
  if (!isTauri()) throw new Error('Сохранение PNG/PDF доступно в настольном приложении.');
  const measure = (i: CanvasItem) => { const n = new Konva.Text(textConfig(i, scene.theme.fontFamily)); const size = { width: n.width(), height: n.height() }; n.destroy(); return size; };
  const items = scene.items.filter(i => !i.hidden);
  let bounds = viewport;
  if (region === 'all' && items.length) { const b = union(items.map(i => itemBounds(i, measure))); bounds = { left: b.left - 40, top: b.top - 40, right: b.right + 40, bottom: b.bottom + 40 }; }
  const width = Math.max(1, bounds.right - bounds.left), height = Math.max(1, bounds.bottom - bounds.top);
  const scale = Math.min(2, 6000 / width, 6000 / height, Math.sqrt(24e6 / (width * height)));
  const container = document.createElement('div');
  const stage = new Konva.Stage({ container, width: Math.max(1, Math.ceil(width * scale)), height: Math.max(1, Math.ceil(height * scale)) });
  const layer = new Konva.Layer(); stage.add(layer);
  layer.add(new Konva.Rect({ width: stage.width(), height: stage.height(), fill: scene.theme.background }));
  if (scene.theme.backgroundType === 'gradient') layer.add(new Konva.Rect({ width: stage.width(), height: stage.height(), fillLinearGradientStartPoint: { x: 0, y: 0 }, fillLinearGradientEndPoint: { x: stage.width(), y: stage.height() }, fillLinearGradientColorStops: [0, scene.theme.background, 1, scene.theme.secondary ?? '#dce8ec'] }));
  const world = new Konva.Group({ x: -bounds.left * scale, y: -bounds.top * scale, scaleX: scale, scaleY: scale }); layer.add(world);
  try {
    if (scene.theme.backgroundType === 'image' && scene.theme.backgroundAssetId) {
      const url = convertFileSrc(await invoke<string>('asset_path', { assetId: scene.theme.backgroundAssetId, preview: false }));
      const img = await image(url); if (scene.theme.imageMode === 'repeat') world.add(new Konva.Rect({ x: bounds.left, y: bounds.top, width, height, fillPatternImage: img, fillPatternRepeat: 'repeat' }));
      else { const ratio = scene.theme.imageMode === 'contain' ? Math.min(width / img.width, height / img.height) : Math.max(width / img.width, height / img.height); const w = img.width * ratio, h = img.height * ratio; world.add(new Konva.Image({ image: img, x: bounds.left + (width - w) / 2, y: bounds.top + (height - h) / 2, width: w, height: h })); }
    }
    const grid = scene.theme.gridSize ?? 22;
    if (scene.theme.pattern !== 'none' && grid * scale >= 8) {
      const color = scene.theme.patternColor ?? '#85929e', opacity = scene.theme.patternOpacity ?? 0.3;
      const startX = Math.floor(bounds.left / grid) * grid, startY = Math.floor(bounds.top / grid) * grid;
      if (scene.theme.pattern === 'dots') { for (let x = startX; x <= bounds.right; x += grid) for (let y = startY; y <= bounds.bottom; y += grid) world.add(new Konva.Circle({ x, y, radius: 1, fill: color, opacity })); }
      else { for (let y = startY; y <= bounds.bottom; y += grid) world.add(new Konva.Line({ points: [bounds.left, y, bounds.right, y], stroke: color, strokeWidth: 1, opacity })); if (scene.theme.pattern === 'grid') for (let x = startX; x <= bounds.right; x += grid) world.add(new Konva.Line({ points: [x, bounds.top, x, bounds.bottom], stroke: color, strokeWidth: 1, opacity })); }
    }
    for (const item of items) {
      const group = new Konva.Group({ x: item.x, y: item.y, rotation: item.rotation ?? 0, scaleX: item.scaleX ?? 1, scaleY: item.scaleY ?? 1, opacity: item.opacity ?? 1 }); world.add(group);
      const size = dimensions(item), style = { fill: item.fill ?? '#a7d7df', stroke: item.stroke ?? '#578b9a', strokeWidth: item.strokeWidth ?? 2 };
      if (item.kind === 'note') group.add(new Konva.Text({ ...textConfig(item, scene.theme.fontFamily), fill: item.fill ?? '#243447' }));
      else if (['rectangle', 'square'].includes(item.kind)) group.add(new Konva.Rect({ ...size, offsetX: size.width / 2, offsetY: size.height / 2, cornerRadius: item.cornerRadius ?? 8, ...style }));
      else if (item.kind === 'circle' || item.kind === 'ellipse') group.add(new Konva.Ellipse({ radiusX: 65, radiusY: item.kind === 'ellipse' ? 45 : 65, ...style, fill: item.fill ?? '#f3c2b2' }));
      else if (item.kind === 'star') group.add(new Konva.Star({ numPoints: 5, innerRadius: 30, outerRadius: 65, ...style, fill: item.fill ?? '#f1d587' }));
      else if (item.kind === 'arrow') group.add(new Konva.Arrow({ points: item.points ?? [], stroke: item.stroke ?? '#365b77', fill: item.stroke ?? '#365b77', strokeWidth: item.strokeWidth ?? 4, pointerLength: 14, pointerWidth: 14 }));
      else if (item.points) group.add(new Konva.Line({ points: item.points, stroke: item.stroke ?? '#365b77', strokeWidth: item.strokeWidth ?? 3, lineCap: 'round', lineJoin: 'round' }));
      else if (item.kind === 'image') { const url = convertFileSrc(await invoke<string>('asset_path', { assetId: item.assetId, preview: false })); group.add(new Konva.Image({ image: await image(url), ...size })); }
      else if (item.table) {
        const t = item.table; let y = 0;
        t.cells.forEach((row, r) => { let x = 0; row.forEach((cell, c) => { const w = t.columnWidths[c], h = t.rowHeights[r]; group.add(new Konva.Rect({ x, y, width: w, height: h, fill: cell.fill ?? (r === 0 && t.header ? '#e7eef3' : t.background), stroke: t.borderColor, strokeWidth: t.borderWidth })); group.add(new Konva.Text({ x, y, width: w, height: h, padding: t.padding, text: cell.text, fill: cell.color ?? t.color, fontFamily: item.fontFamily ?? scene.theme.fontFamily, fontSize: t.fontSize, fontStyle: cell.bold || (r === 0 && t.header) ? 'bold' : 'normal', align: cell.align ?? 'left' })); x += w; }); y += t.rowHeights[r]; });
      } else { group.add(new Konva.Rect({ ...size, fill: '#e7eef3', stroke: '#c3d1db', cornerRadius: 8 })); group.add(new Konva.Text({ ...size, padding: 15, text: `${item.kind === 'video' ? '▶ Видео' : item.kind === 'audio' ? '♫ Аудио' : '↗ Ссылка'}\n${item.title ?? ''}\n${item.url ?? 'Медиа включено в переносимый архив .atlas'}`, fontSize: 15, fill: '#243447' })); }
    }
    layer.draw(); const canvas = stage.toCanvas();
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Не удалось создать изображение')), format === 'pdf' ? 'image/jpeg' : 'image/png', 0.94));
    let bytes: Uint8Array = new Uint8Array(await blob.arrayBuffer()); if (format === 'pdf') bytes = pdfFromJpeg(bytes, canvas.width, canvas.height);
    return invoke<string | null>('save_canvas_export', { bytes: Array.from(bytes), format });
  } finally { stage.destroy(); }
}
