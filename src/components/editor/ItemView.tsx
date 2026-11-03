import { useEffect, useState } from 'react';
import { Rect, Circle, Ellipse, Star, Arrow, Line, Text, Image as CanvasImage } from 'react-konva';
import type { ShapeConfig } from 'konva/lib/Shape';
import type { CanvasItem } from '../../domain/scene';
import { dimensions } from '../../domain/geometry';
import { repository } from '../../services/SceneRepository';

export function textConfig(item: CanvasItem, family = 'Arial') {
  return { text: item.content ?? '', fontSize: item.fontSize ?? 26, fontFamily: item.fontFamily ?? family,
    fontStyle: item.fontStyle ?? 'normal', textDecoration: item.textDecoration ?? '', align: item.align ?? 'left', width: item.width ?? 300, lineHeight: item.lineHeight ?? 1.3, padding: 0 };
}
function StoredImage({ item, common }: { item: CanvasItem; common: ShapeConfig }) {
  const [image, setImage] = useState<HTMLImageElement>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false, url: string | undefined;
    setImage(undefined); setError(false);
    repository.imageUrl(item.assetId!).then(value => {
      url = value;
      if (cancelled) { URL.revokeObjectURL(value); return; }
      const img = new window.Image();
      img.onload = () => { if (!cancelled) setImage(img); };
      img.onerror = () => { if (!cancelled) setError(true); };
      img.src = value;
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [item.assetId]);
  const size = dimensions(item);
  return <>
    <CanvasImage {...common} {...size} image={image} fill={image ? undefined : '#e7eef2'} />
    {!image && <Text {...common} id={undefined} name={undefined} draggable={false} listening={false} {...size} fill={error ? '#a12828' : '#536576'} text={error ? 'Фото недоступно\nОригинал не удалён' : 'Загрузка фото…'} fontSize={16} padding={16} />}
  </>;
}
export function ItemView({ item, common, fontFamily }: { item: CanvasItem; common: ShapeConfig; fontFamily: string }) {
  if (['table', 'video', 'audio', 'link'].includes(item.kind)) return <Rect {...common} {...dimensions(item)} fill='#ffffff' opacity={0} />;
  if (item.kind === 'ellipse') return <Ellipse {...common} radiusX={65} radiusY={45} fill={item.fill ?? '#f3c2b2'} stroke={item.stroke ?? '#c88370'} strokeWidth={item.strokeWidth ?? 2} />;
  if (item.kind === 'note') return <Text {...common} {...textConfig(item, fontFamily)} fill={item.fill ?? '#243447'} />;
  if (item.kind === 'rectangle' || item.kind === 'square') {
    const size = dimensions(item);
    return <Rect {...common} {...size} offsetX={size.width / 2} offsetY={size.height / 2} cornerRadius={item.cornerRadius ?? 8} fill={item.fill ?? '#a7d7df'} stroke={item.stroke ?? '#578b9a'} strokeWidth={item.strokeWidth ?? 2} />;
  }
  if (item.kind === 'circle') return <Circle {...common} radius={65} fill={item.fill ?? '#f3c2b2'} stroke={item.stroke ?? '#c88370'} strokeWidth={item.strokeWidth ?? 2} />;
  if (item.kind === 'star') return <Star {...common} numPoints={5} innerRadius={30} outerRadius={65} fill={item.fill ?? '#f1d587'} stroke={item.stroke ?? '#b48b39'} strokeWidth={item.strokeWidth ?? 2} />;
  if (item.kind === 'arrow') return <Arrow {...common} points={item.points ?? []} fill={item.stroke ?? '#365b77'} stroke={item.stroke ?? '#365b77'} strokeWidth={item.strokeWidth ?? 4} pointerLength={14} pointerWidth={14} hitStrokeWidth={18} />;
  if (item.kind === 'line' || item.kind === 'stroke') return <Line {...common} points={item.points ?? []} stroke={item.stroke ?? '#365b77'} strokeWidth={item.strokeWidth ?? 3} lineCap="round" lineJoin="round" hitStrokeWidth={16} />;
  if (item.kind === 'image') return <StoredImage item={item} common={common} />;
  return null;
}
