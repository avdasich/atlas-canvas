import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ShapeConfig } from 'konva/lib/Shape';
import { memo, useEffect, useState } from 'react';
import {
  Arrow,
  Image as CanvasImage,
  Circle,
  Ellipse,
  Group,
  Line,
  Rect,
  Star,
  Text,
} from 'react-konva';
import { sourceCrop } from '../../domain/crop';
import { dimensions } from '../../domain/geometry';
import type { CanvasItem } from '../../domain/scene';
import { repository } from '../../services/SceneRepository';
import { richLayout, textConfig } from '../../services/textLayout';

export { richLayout, textConfig } from '../../services/textLayout';
function StoredImage({ item, common }: { item: CanvasItem; common: ShapeConfig }) {
  const [image, setImage] = useState<HTMLImageElement>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false,
      url: string | undefined;
    setImage(undefined);
    setError(false);
    repository
      .imageUrl(item.assetId!)
      .then((value) => {
        url = value;
        if (cancelled) {
          URL.revokeObjectURL(value);
          return;
        }
        const img = new window.Image();
        img.onload = () => {
          if (!cancelled) setImage(img);
        };
        img.onerror = () => {
          if (!cancelled) setError(true);
        };
        img.src = value;
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item.assetId]);
  const size = dimensions(item);
  return (
    <>
      <CanvasImage
        {...common}
        {...size}
        image={image}
        crop={image ? sourceCrop(item.crop, image.naturalWidth, image.naturalHeight) : undefined}
        fill={image ? undefined : '#e7eef2'}
      />
      {!image && (
        <Text
          {...common}
          id={undefined}
          name={undefined}
          draggable={false}
          listening={false}
          {...size}
          fill={error ? '#a12828' : '#536576'}
          text={error ? 'Фото недоступно\nОригинал не удалён' : 'Загрузка фото…'}
          fontSize={16}
          padding={16}
        />
      )}
    </>
  );
}
function ItemViewComponent({
  item,
  common,
  fontFamily,
  textColor = '#243447',
}: {
  item: CanvasItem;
  common: ShapeConfig;
  fontFamily: string;
  textColor?: string;
  interaction?: unknown;
}) {
  if (['table', 'video', 'audio', 'link', 'disclosure'].includes(item.kind))
    return <Rect {...common} {...dimensions(item)} fill="#ffffff" opacity={0} />;
  if (item.kind === 'ellipse')
    return (
      <Ellipse
        {...common}
        radiusX={65}
        radiusY={45}
        fill={item.fill ?? '#f3c2b2'}
        stroke={item.stroke ?? '#c88370'}
        strokeWidth={item.strokeWidth ?? 2}
      />
    );
  if (item.kind === 'note' && (item.richText || item.textBackground)) {
    const layout = richLayout(item, fontFamily),
      config = textConfig(item, fontFamily);
    return (
      <Group {...common}>
        <Rect
          width={layout.width}
          height={layout.height}
          fill={item.textBackground ?? '#00000000'}
        />
        {layout.segments.map((segment, index) => (
          <Text
            key={index}
            x={segment.x}
            y={segment.y}
            text={segment.text}
            fontSize={config.fontSize}
            fontFamily={config.fontFamily}
            fontStyle={`${segment.bold || item.fontStyle?.includes('bold') ? 'bold' : ''} ${segment.italic || item.fontStyle?.includes('italic') ? 'italic' : ''}`}
            textDecoration={segment.underline || segment.href ? 'underline' : config.textDecoration}
            fill={segment.href ? '#397bc7' : (item.fill ?? textColor)}
            listening={!!segment.href}
            onClick={(e) => {
              if (segment.href && (e.evt.ctrlKey || e.evt.metaKey)) {
                if (isTauri()) void invoke('open_link', { url: segment.href });
                else window.open(segment.href, '_blank', 'noopener,noreferrer');
              }
            }}
          />
        ))}
      </Group>
    );
  }
  if (item.kind === 'note')
    return <Text {...common} {...textConfig(item, fontFamily)} fill={item.fill ?? textColor} />;
  if (item.kind === 'rectangle' || item.kind === 'square') {
    const size = dimensions(item);
    return (
      <Rect
        {...common}
        {...size}
        offsetX={size.width / 2}
        offsetY={size.height / 2}
        cornerRadius={item.cornerRadius ?? 8}
        fill={item.fill ?? '#a7d7df'}
        stroke={item.stroke ?? '#578b9a'}
        strokeWidth={item.strokeWidth ?? 2}
      />
    );
  }
  if (item.kind === 'circle')
    return (
      <Circle
        {...common}
        radius={65}
        fill={item.fill ?? '#f3c2b2'}
        stroke={item.stroke ?? '#c88370'}
        strokeWidth={item.strokeWidth ?? 2}
      />
    );
  if (item.kind === 'star')
    return (
      <Star
        {...common}
        numPoints={5}
        innerRadius={30}
        outerRadius={65}
        fill={item.fill ?? '#f1d587'}
        stroke={item.stroke ?? '#b48b39'}
        strokeWidth={item.strokeWidth ?? 2}
      />
    );
  if (item.kind === 'arrow')
    return (
      <Arrow
        {...common}
        points={item.points ?? []}
        fill={item.stroke ?? '#365b77'}
        stroke={item.stroke ?? '#365b77'}
        strokeWidth={item.strokeWidth ?? 4}
        pointerLength={14}
        pointerWidth={14}
        pointerAtBeginning={item.arrowStart ?? false}
        pointerAtEnding={item.arrowEnd ?? true}
        dash={item.dash}
        hitStrokeWidth={18}
      />
    );
  if (item.kind === 'line' || item.kind === 'stroke')
    return (
      <Line
        {...common}
        points={item.points ?? []}
        stroke={item.stroke ?? '#365b77'}
        strokeWidth={item.strokeWidth ?? 3}
        lineCap="round"
        lineJoin="round"
        tension={item.tension ?? 0}
        dash={item.dash}
        hitStrokeWidth={16}
      />
    );
  if (item.kind === 'image') return <StoredImage item={item} common={common} />;
  return null;
}

export const ItemView = memo(
  ItemViewComponent,
  (before, after) =>
    before.item === after.item &&
    before.fontFamily === after.fontFamily &&
    before.textColor === after.textColor &&
    before.interaction === after.interaction,
);
