import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import Konva from 'konva';
import { sourceCrop } from '../domain/crop';
import { disclosureHeader } from '../domain/disclosure';
import { type Bounds, dimensions, itemBounds, union } from '../domain/geometry';
import { hasMaterial, supportsMaterial } from '../domain/materials';
import { pdfFromJpeg, pdfFromJpegs } from '../domain/pdf';
import type { CanvasItem, Scene } from '../domain/scene';
import { drawShimmer, snowCrystals } from '../domain/shimmer';
import { coveredCell, mergeAt } from '../domain/table';
import { t as tr } from '../i18n/index';
import { exportedMaterial, materialRaster } from './materialRaster';
import { richLayout, textConfig } from './textLayout';
import { vectorNode } from './vectorDrawing';
async function image(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(tr('Не удалось открыть изображение для экспорта')));
    img.src = url;
  });
}
export async function exportCanvas(
  scene: Scene,
  viewport: Bounds,
  region: 'all' | 'viewport',
  format: 'png' | 'pdf' | 'pdf-pages',
) {
  if (!isTauri()) throw new Error(tr('Сохранение PNG/PDF доступно в настольном приложении.'));
  const measure = (i: CanvasItem) => {
    if (i.richText) return richLayout(i, scene.theme.fontFamily);
    const n = new Konva.Text(textConfig(i, scene.theme.fontFamily));
    const size = { width: n.width(), height: n.height() };
    n.destroy();
    return size;
  };
  const items = scene.items.filter((i) => !i.hidden);
  let bounds = viewport;
  if (region === 'all' && items.length) {
    const b = union(items.map((i) => itemBounds(i, measure)));
    bounds = { left: b.left - 40, top: b.top - 40, right: b.right + 40, bottom: b.bottom + 40 };
  }
  const width = Math.max(1, bounds.right - bounds.left),
    height = Math.max(1, bounds.bottom - bounds.top);
  const scale = Math.min(2, 6000 / width, 6000 / height, Math.sqrt(24e6 / (width * height)));
  const container = document.createElement('div');
  const stage = new Konva.Stage({
    container,
    width: Math.max(1, Math.ceil(width * scale)),
    height: Math.max(1, Math.ceil(height * scale)),
  });
  const layer = new Konva.Layer();
  stage.add(layer);
  layer.add(
    new Konva.Rect({ width: stage.width(), height: stage.height(), fill: scene.theme.background }),
  );
  if (scene.theme.backgroundType === 'gradient') {
    const a = ((scene.theme.angle ?? 135) * Math.PI) / 180;
    const length = Math.abs(stage.width() * Math.sin(a)) + Math.abs(stage.height() * Math.cos(a));
    const dx = (Math.sin(a) * length) / 2,
      dy = (-Math.cos(a) * length) / 2;
    layer.add(
      new Konva.Rect({
        width: stage.width(),
        height: stage.height(),
        opacity: scene.theme.backgroundOpacity ?? 1,
        fillLinearGradientStartPoint: { x: stage.width() / 2 - dx, y: stage.height() / 2 - dy },
        fillLinearGradientEndPoint: { x: stage.width() / 2 + dx, y: stage.height() / 2 + dy },
        fillLinearGradientColorStops: [
          0,
          scene.theme.background,
          1,
          scene.theme.secondary ?? '#dce8ec',
        ],
      }),
    );
  }
  const world = new Konva.Group({
    x: -bounds.left * scale,
    y: -bounds.top * scale,
    scaleX: scale,
    scaleY: scale,
  });
  layer.add(world);
  try {
    if (scene.theme.backgroundType === 'image' && scene.theme.backgroundAssetId) {
      const url = convertFileSrc(
        await invoke<string>('asset_path', {
          assetId: scene.theme.backgroundAssetId,
          preview: false,
        }),
      );
      const img = await image(url);
      if (scene.theme.imageMode === 'repeat')
        world.add(
          new Konva.Rect({
            x: bounds.left,
            y: bounds.top,
            width,
            height,
            fillPatternImage: img,
            opacity: scene.theme.backgroundOpacity ?? 1,
            fillPatternScaleX: (300 * (scene.theme.imageScale ?? 1)) / img.width,
            fillPatternScaleY: (300 * (scene.theme.imageScale ?? 1)) / img.width,
            fillPatternOffsetX: -(scene.theme.imageX ?? 0),
            fillPatternOffsetY: -(scene.theme.imageY ?? 0),
            fillPatternRepeat: 'repeat',
          }),
        );
      else {
        const ratio =
          scene.theme.imageMode === 'contain'
            ? Math.min(width / img.width, height / img.height)
            : Math.max(width / img.width, height / img.height);
        const w =
            (scene.theme.imageMode === 'stretch' ? width : img.width * ratio) *
            (scene.theme.imageScale ?? 1),
          h =
            (scene.theme.imageMode === 'stretch' ? height : img.height * ratio) *
            (scene.theme.imageScale ?? 1);
        world.add(
          new Konva.Image({
            image: img,
            x: bounds.left + (width - w) / 2 + (scene.theme.imageX ?? 0),
            y: bounds.top + (height - h) / 2 + (scene.theme.imageY ?? 0),
            width: w,
            height: h,
            opacity: scene.theme.backgroundOpacity ?? 1,
          }),
        );
      }
    }
    const grid = scene.theme.gridSize ?? 22;
    if (scene.theme.pattern !== 'none' && grid * scale >= 8) {
      const color = scene.theme.patternColor ?? '#85929e',
        opacity = scene.theme.patternOpacity ?? 0.3;
      const startX = Math.floor(bounds.left / grid) * grid,
        startY = Math.floor(bounds.top / grid) * grid;
      if (scene.theme.pattern === 'dots') {
        for (let x = startX; x <= bounds.right; x += grid)
          for (let y = startY; y <= bounds.bottom; y += grid)
            world.add(new Konva.Circle({ x, y, radius: 1, fill: color, opacity }));
      } else {
        for (let y = startY; y <= bounds.bottom; y += grid)
          world.add(
            new Konva.Line({
              points: [bounds.left, y, bounds.right, y],
              stroke: color,
              strokeWidth: 1,
              opacity,
            }),
          );
        if (scene.theme.pattern === 'grid')
          for (let x = startX; x <= bounds.right; x += grid)
            world.add(
              new Konva.Line({
                points: [x, bounds.top, x, bounds.bottom],
                stroke: color,
                strokeWidth: 1,
                opacity,
              }),
            );
      }
    }
    if (scene.theme.shimmer?.enabled) {
      const sparkle = document.createElement('canvas');
      sparkle.width = stage.width();
      sparkle.height = stage.height();
      const ctx = sparkle.getContext('2d');
      if (ctx) {
        drawShimmer(ctx, snowCrystals(sparkle.width, sparkle.height), scene.theme.shimmer, 0);
        world.add(
          new Konva.Image({ image: sparkle, x: bounds.left, y: bounds.top, width, height }),
        );
      }
    }
    for (const item of items) {
      const group = new Konva.Group({
        x: item.x,
        y: item.y,
        rotation: item.rotation ?? 0,
        scaleX: item.scaleX ?? 1,
        scaleY: item.scaleY ?? 1,
        opacity: item.opacity ?? 1,
        shadowColor: '#000000',
        shadowOpacity: 0.22,
        shadowBlur: item.shadowBlur ?? 0,
      });
      world.add(group);
      const size = dimensions(item);
      if (supportsMaterial(item)) {
        if (hasMaterial(item)) {
          if (item.glass?.enabled && item.kind === 'note' && item.textBackground) {
            const layout = richLayout(item, scene.theme.fontFamily);
            group.add(
              new Konva.Rect({
                width: layout.width,
                height: layout.height,
                fill: item.textBackground,
              }),
            );
          }
          layer.draw();
          const raster = materialRaster(
            item,
            scene.theme.fontFamily,
            scene.theme.textColor ?? '#243447',
            2,
            (item.glass?.blur ?? 0) * 2 + 3,
          );
          const texture = exportedMaterial(
            raster,
            item,
            stage.toCanvas({ pixelRatio: 1 }),
            group.getAbsoluteTransform(),
          );
          group.add(
            new Konva.Image({
              image: texture,
              x: raster.left,
              y: raster.top,
              width: raster.width,
              height: raster.height,
            }),
          );
        } else
          group.add(vectorNode(item, scene.theme.fontFamily, scene.theme.textColor ?? '#243447'));
      } else if (item.kind === 'image') {
        const url = convertFileSrc(
          await invoke<string>('asset_path', { assetId: item.assetId, preview: false }),
        );
        const img = await image(url);
        group.add(
          new Konva.Image({
            image: img,
            ...size,
            crop: sourceCrop(item.crop, img.naturalWidth, img.naturalHeight),
          }),
        );
      } else if (item.kind === 'disclosure' && item.sections) {
        group.add(new Konva.Rect({ ...size, fill: '#f8fafc', stroke: '#cfdae5', cornerRadius: 8 }));
        group.add(new Konva.Rect({ width: size.width, height: 28, fill: item.fill ?? '#e8eef3' }));
        group.add(
          new Konva.Text({
            width: size.width,
            height: 28,
            padding: 8,
            text: item.title ?? tr('Сноски'),
            fontSize: 11,
            fill: '#526775',
          }),
        );
        let y = 28;
        for (const section of item.sections) {
          group.add(
            new Konva.Rect({
              y,
              width: size.width,
              height: disclosureHeader,
              fill: '#edf2f7',
              stroke: '#cfdae5',
              strokeWidth: 1,
            }),
          );
          group.add(
            new Konva.Text({
              y,
              width: size.width,
              height: disclosureHeader,
              padding: 14,
              text: `${section.collapsed ? '▸' : '▾'} ${section.title || tr('Без заголовка')}`,
              fontFamily: item.fontFamily ?? scene.theme.fontFamily,
              fontSize: 16,
              fontStyle: 'bold',
              fill: '#243447',
            }),
          );
          y += disclosureHeader;
          if (!section.collapsed) {
            group.add(
              new Konva.Text({
                y,
                width: size.width,
                height: section.height,
                padding: 14,
                text: section.content,
                fontFamily: item.fontFamily ?? scene.theme.fontFamily,
                fontSize: 16,
                lineHeight: 1.5,
                fill: '#243447',
              }),
            );
            y += section.height;
          }
        }
      } else if (item.table) {
        const t = item.table;
        let y = 28;
        group.add(new Konva.Rect({ width: size.width, height: 28, fill: '#e8eef3' }));
        group.add(
          new Konva.Text({
            width: size.width,
            height: 28,
            padding: 8,
            text: item.title ?? tr('Таблица'),
            fontSize: 11,
            fill: '#526775',
          }),
        );
        t.cells.forEach((row, r) => {
          let x = 0;
          row.forEach((cell, c) => {
            const baseWidth = t.columnWidths[c];
            if (coveredCell(t, r, c)) {
              x += baseWidth;
              return;
            }
            const merge = mergeAt(t, r, c);
            const w = t.columnWidths.slice(c, c + (merge?.columns ?? 1)).reduce((a, b) => a + b, 0),
              h = t.rowHeights.slice(r, r + (merge?.rows ?? 1)).reduce((a, b) => a + b, 0);
            group.add(
              new Konva.Rect({
                x,
                y,
                width: w,
                height: h,
                fill:
                  cell.fill ?? (r === 0 && t.header ? (t.headerFill ?? '#e7eef3') : t.background),
                stroke: t.borderColor,
                strokeWidth: t.borderWidth,
              }),
            );
            group.add(
              new Konva.Text({
                x,
                y,
                width: w,
                height: h,
                padding: t.padding,
                text: cell.text,
                fill: cell.color ?? t.color,
                fontFamily: item.fontFamily ?? scene.theme.fontFamily,
                fontSize: t.fontSize,
                fontStyle: cell.bold || (r === 0 && t.header) ? 'bold' : 'normal',
                align: cell.align ?? 'left',
              }),
            );
            x += baseWidth;
          });
          y += t.rowHeights[r];
        });
      } else {
        group.add(new Konva.Rect({ ...size, fill: '#e7eef3', stroke: '#c3d1db', cornerRadius: 8 }));
        group.add(
          new Konva.Text({
            ...size,
            padding: 15,
            text: `${item.kind === 'video' ? tr('▶ Видео') : item.kind === 'audio' ? tr('♫ Аудио') : tr('↗ Ссылка')}\n${item.title ?? ''}\n${item.url ?? tr('Медиа включено в переносимый архив .atlas')}`,
            fontSize: 15,
            fill: '#243447',
          }),
        );
      }
    }
    layer.draw();
    const canvas = stage.toCanvas();
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error(tr('Не удалось создать изображение')))),
        format !== 'png' ? 'image/jpeg' : 'image/png',
        0.94,
      ),
    );
    let bytes: Uint8Array = new Uint8Array(await blob.arrayBuffer());
    if (format === 'pdf') bytes = pdfFromJpeg(bytes, canvas.width, canvas.height);
    if (format === 'pdf-pages') {
      const pages: { jpeg: Uint8Array; width: number; height: number }[] = [];
      const pageHeight = Math.max(1, Math.floor(canvas.width * Math.sqrt(2)));
      for (let y = 0; y < canvas.height; y += pageHeight) {
        const page = document.createElement('canvas');
        page.width = canvas.width;
        page.height = Math.min(pageHeight, canvas.height - y);
        page
          .getContext('2d')!
          .drawImage(canvas, 0, y, page.width, page.height, 0, 0, page.width, page.height);
        const blob = await new Promise<Blob>((resolve, reject) =>
          page.toBlob(
            (b) => (b ? resolve(b) : reject(new Error(tr('Не удалось создать страницу PDF')))),
            'image/jpeg',
            0.94,
          ),
        );
        pages.push({
          jpeg: new Uint8Array(await blob.arrayBuffer()),
          width: page.width,
          height: page.height,
        });
      }
      bytes = pdfFromJpegs(pages);
    }
    return invoke<string | null>('save_canvas_export', {
      bytes: Array.from(bytes),
      format: format === 'png' ? 'png' : 'pdf',
    });
  } finally {
    stage.destroy();
  }
}
