import Konva from 'konva';
import { layoutRichText, type RichRun } from '../domain/richText';
import type { CanvasItem } from '../domain/scene';

export function textConfig(item: CanvasItem, family = 'Arial') {
  return {
    text: item.content ?? '',
    fontSize: item.fontSize ?? 26,
    fontFamily: item.fontFamily ?? family,
    fontStyle: item.fontStyle ?? 'normal',
    textDecoration: item.textDecoration ?? '',
    align: item.align ?? 'left',
    width: item.width ?? 300,
    lineHeight: item.lineHeight ?? 1.3,
    padding: 0,
  };
}
export function richLayout(item: CanvasItem, family: string) {
  const config = textConfig(item, family);
  return layoutRichText(
    item.richText ?? [{ text: item.content ?? '' }],
    config.width,
    config.fontSize,
    config.lineHeight,
    item.align ?? 'left',
    (text: string, run: RichRun) => {
      const n = new Konva.Text({
        ...config,
        width: undefined,
        text,
        fontStyle: `${run.bold || item.fontStyle?.includes('bold') ? 'bold' : ''} ${run.italic || item.fontStyle?.includes('italic') ? 'italic' : ''}`,
      });
      const width = n.width();
      n.destroy();
      return width;
    },
  );
}
