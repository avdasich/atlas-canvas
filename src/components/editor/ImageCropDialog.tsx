import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  cropToAspect,
  fullImage,
  moveCrop,
  resizeCrop,
  validCrop,
  type CropCorner,
  type ImageCrop,
} from '../../domain/crop';
import type { CanvasItem } from '../../domain/scene';
import { repository } from '../../services/SceneRepository';

type Drag = { start: { x: number; y: number }; crop: ImageCrop; corner?: CropCorner };
export default function ImageCropDialog({
  item,
  onApply,
  onClose,
}: {
  item: CanvasItem;
  onApply: (crop: ImageCrop) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState('');
  const [natural, setNatural] = useState({ width: 1, height: 1 });
  const [crop, setCrop] = useState<ImageCrop>(item.crop ?? fullImage);
  const [ratio, setRatio] = useState(0);
  const [windowSize, setWindowSize] = useState({ width: innerWidth, height: innerHeight });
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => dialog.current?.focus(), []);
  const frame = useRef<HTMLDivElement>(null),
    drag = useRef<Drag | null>(null);
  useEffect(() => {
    let active = true;
    void repository
      .imageUrl(item.assetId!)
      .then((src) => {
        if (active) setUrl(src);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    const resize = () => setWindowSize({ width: innerWidth, height: innerHeight });
    window.addEventListener('resize', resize);
    return () => {
      active = false;
      window.removeEventListener('resize', resize);
    };
  }, [item.assetId]);
  const scale = Math.min(
    Math.max(180, windowSize.width - 100) / natural.width,
    660 / natural.width,
    Math.max(140, windowSize.height * 0.48) / natural.height,
  );
  const normalizedRatio = ratio ? ratio / (natural.width / natural.height) : undefined;
  const point = (e: ReactPointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  function start(e: ReactPointerEvent, corner?: CropCorner) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    drag.current = { start: point(e), crop, corner };
    frame.current?.setPointerCapture(e.pointerId);
  }
  return (
    <div className="dialog-backdrop">
      <section
        ref={dialog}
        tabIndex={-1}
        className="app-dialog crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Обрезка изображения"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <h2>Обрезка изображения</h2>
        <p>Перемещайте рамку и тяните её углы. Исходный файл остаётся целым.</p>
        {error && <p role="alert">{error}</p>}
        {url && (
          <div
            ref={frame}
            className="crop-frame"
            style={{ width: natural.width * scale, height: natural.height * scale }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const p = point(e),
                d = drag.current;
              const next = d.corner
                ? resizeCrop(d.crop, d.corner, p.x - d.start.x, p.y - d.start.y, normalizedRatio)
                : moveCrop(d.crop, p.x - d.start.x, p.y - d.start.y);
              if (validCrop(next)) setCrop(next);
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <img
              src={url}
              alt="Исходное изображение для обрезки"
              draggable={false}
              onLoad={(e) =>
                setNatural({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                })
              }
            />
            <div
              className="crop-selection"
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.width * 100}%`,
                height: `${crop.height * 100}%`,
              }}
              onPointerDown={(e) => start(e)}
            >
              <span className="crop-thirds horizontal" />
              <span className="crop-thirds vertical" />
              {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                <button
                  type="button"
                  key={corner}
                  className={`crop-corner ${corner}`}
                  aria-label={`Угол обрезки ${corner}`}
                  onPointerDown={(e) => start(e, corner)}
                />
              ))}
            </div>
          </div>
        )}
        <label className="property-field">
          Пропорции
          <select
            value={ratio}
            onChange={(e) => {
              const next = Number(e.target.value);
              setRatio(next);
              if (next) setCrop((c) => cropToAspect(c, next / (natural.width / natural.height)));
            }}
          >
            <option value={0}>Свободно</option>
            <option value={1}>Квадрат · 1:1</option>
            <option value={4 / 3}>4:3</option>
            <option value={16 / 9}>16:9</option>
            <option value={3 / 4}>3:4</option>
          </select>
        </label>
        <div className="crop-values">
          {(['x', 'y', 'width', 'height'] as const).map((key) => (
            <label key={key}>
              {{ x: 'Слева, %', y: 'Сверху, %', width: 'Ширина, %', height: 'Высота, %' }[key]}
              <input
                aria-label={`Обрезка: ${key}`}
                type="number"
                step={0.1}
                min={key === 'x' || key === 'y' ? 0 : 0.1}
                max={100}
                value={Math.round(crop[key] * 1000) / 10}
                onChange={(e) => {
                  const next = { ...crop, [key]: Number(e.target.value) / 100 };
                  if (key === 'x') next.width = Math.min(next.width, 1 - next.x);
                  if (key === 'y') next.height = Math.min(next.height, 1 - next.y);
                  if (key === 'width') next.width = Math.min(next.width, 1 - next.x);
                  if (key === 'height') next.height = Math.min(next.height, 1 - next.y);
                  if (validCrop(next)) {
                    setRatio(0);
                    setCrop(next);
                  }
                }}
              />
            </label>
          ))}
        </div>
        <div className="dialog-actions">
          <button
            type="button"
            onClick={() => {
              setRatio(0);
              setCrop(fullImage);
            }}
          >
            Сбросить рамку
          </button>
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            disabled={!url || !!error || !validCrop(crop)}
            onClick={() => onApply(crop)}
          >
            Применить обрезку
          </button>
        </div>
      </section>
    </div>
  );
}
