import Konva from 'konva';
import { dimensions } from '../domain/geometry';
import type { CanvasItem } from '../domain/scene';
import { richLayout, textConfig } from './textLayout';

/** Untransformed vector content, shared by material masks and raster exports. */
export function vectorNode(
  item: CanvasItem,
  family: string,
  textColor = '#243447',
  mask = false,
): Konva.Group {
  const group = new Konva.Group({ listening: false });
  const fill = mask ? '#ffffff' : (item.fill ?? '#a7d7df');
  const stroke = mask ? '#ffffff' : (item.stroke ?? '#578b9a');
  const style = { fill, stroke, strokeWidth: item.strokeWidth ?? 2, listening: false };
  const size = dimensions(item);
  if (item.kind === 'note' && (item.richText || item.textBackground)) {
    const layout = richLayout(item, family),
      config = textConfig(item, family);
    if (item.textBackground && !mask)
      group.add(
        new Konva.Rect({ width: layout.width, height: layout.height, fill: item.textBackground }),
      );
    for (const part of layout.segments)
      group.add(
        new Konva.Text({
          x: part.x,
          y: part.y,
          text: part.text,
          fontSize: config.fontSize,
          fontFamily: config.fontFamily,
          fontStyle: `${part.bold || item.fontStyle?.includes('bold') ? 'bold' : ''} ${part.italic || item.fontStyle?.includes('italic') ? 'italic' : ''}`,
          textDecoration: part.underline || part.href ? 'underline' : config.textDecoration,
          fill: mask ? '#ffffff' : part.href ? '#397bc7' : (item.fill ?? textColor),
        }),
      );
  } else if (item.kind === 'note')
    group.add(
      new Konva.Text({
        ...textConfig(item, family),
        fill: mask ? '#ffffff' : (item.fill ?? textColor),
      }),
    );
  else if (item.kind === 'rectangle' || item.kind === 'square')
    group.add(
      new Konva.Rect({
        ...size,
        offsetX: size.width / 2,
        offsetY: size.height / 2,
        cornerRadius: item.cornerRadius ?? 8,
        ...style,
      }),
    );
  else if (item.kind === 'circle' || item.kind === 'ellipse')
    group.add(
      new Konva.Ellipse({
        radiusX: 65,
        radiusY: item.kind === 'ellipse' ? 45 : 65,
        ...style,
        fill: mask ? '#ffffff' : (item.fill ?? '#f3c2b2'),
        stroke: mask ? '#ffffff' : (item.stroke ?? '#c88370'),
      }),
    );
  else if (item.kind === 'star')
    group.add(
      new Konva.Star({
        numPoints: 5,
        innerRadius: 30,
        outerRadius: 65,
        ...style,
        fill: mask ? '#ffffff' : (item.fill ?? '#f1d587'),
        stroke: mask ? '#ffffff' : (item.stroke ?? '#b48b39'),
      }),
    );
  else if (item.kind === 'arrow')
    group.add(
      new Konva.Arrow({
        points: item.points ?? [],
        fill: mask ? '#ffffff' : (item.stroke ?? '#365b77'),
        stroke: mask ? '#ffffff' : (item.stroke ?? '#365b77'),
        strokeWidth: item.strokeWidth ?? 4,
        pointerLength: 14,
        pointerWidth: 14,
        pointerAtBeginning: item.arrowStart ?? false,
        pointerAtEnding: item.arrowEnd ?? true,
        dash: item.dash,
      }),
    );
  else if (item.kind === 'line' || item.kind === 'stroke')
    group.add(
      new Konva.Line({
        points: item.points ?? [],
        stroke: mask ? '#ffffff' : (item.stroke ?? '#365b77'),
        strokeWidth: item.strokeWidth ?? 3,
        lineCap: 'round',
        lineJoin: 'round',
        tension: item.tension ?? 0,
        dash: item.dash,
      }),
    );
  if (!mask && item.shadowBlur)
    group
      .getChildren()
      .forEach((node) =>
        node.setAttrs({ shadowColor: '#000000', shadowOpacity: 0.22, shadowBlur: item.shadowBlur }),
      );
  return group;
}
