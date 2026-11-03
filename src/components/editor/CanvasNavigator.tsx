import { useState } from 'react';
import type { Bounds } from '../../domain/geometry';
import { union } from '../../domain/geometry';
import type { Camera, Theme } from '../../domain/scene';
type Props = {
  theme: Theme;
  camera: Camera;
  viewport: Bounds;
  bounds: Bounds[];
  size: { width: number; height: number };
  onCamera: (camera: Camera) => void;
  onTheme: (theme: Theme) => void;
};
export default function CanvasNavigator({
  theme,
  camera,
  viewport,
  bounds,
  size,
  onCamera,
  onTheme,
}: Props) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState('');
  const all = union([...bounds, viewport]),
    pad = Math.max(10, (all.right - all.left) * 0.05);
  const b = {
    left: all.left - pad,
    top: all.top - pad,
    right: all.right + pad,
    bottom: all.bottom + pad,
  };
  const width = Math.max(1, b.right - b.left),
    height = Math.max(1, b.bottom - b.top);
  const addGuide = (axis: 'x' | 'y') =>
    onTheme({
      ...theme,
      guides: [
        ...(theme.guides ?? []),
        {
          id: crypto.randomUUID(),
          axis,
          value:
            axis === 'x'
              ? (viewport.left + viewport.right) / 2
              : (viewport.top + viewport.bottom) / 2,
        },
      ],
    });
  const interval = Math.pow(10, Math.floor(Math.log10(100 / camera.scale)));
  const tickStep =
    interval * (interval * camera.scale < 40 ? 5 : interval * camera.scale < 80 ? 2 : 1);
  const ticks = (start: number, end: number) =>
    Array.from(
      { length: Math.min(200, Math.ceil((end - start) / tickStep) + 1) },
      (_, i) => Math.ceil(start / tickStep) * tickStep + i * tickStep,
    );
  return (
    <>
      {theme.rulers && (
        <svg className="canvas-rulers" width={size.width} height={size.height} aria-hidden="true">
          <rect width={size.width} height={20} fill="#eaf0f5dc" />
          <rect width={20} height={size.height} fill="#eaf0f5dc" />
          {ticks(viewport.left, viewport.right).map((x) => (
            <g key={`x${x}`}>
              <line
                x1={camera.x + x * camera.scale}
                x2={camera.x + x * camera.scale}
                y1={15}
                y2={20}
              />
              <text x={camera.x + x * camera.scale + 3} y={11}>
                {Math.round(x * 100) / 100}
              </text>
            </g>
          ))}
          {ticks(viewport.top, viewport.bottom).map((y) => (
            <g key={`y${y}`}>
              <line
                y1={camera.y + y * camera.scale}
                y2={camera.y + y * camera.scale}
                x1={15}
                x2={20}
              />
              <text transform={`translate(11,${camera.y + y * camera.scale + 3}) rotate(-90)`}>
                {Math.round(y * 100) / 100}
              </text>
            </g>
          ))}
        </svg>
      )}
      {!!theme.guides?.length && (
        <svg className="canvas-guides" width={size.width} height={size.height} aria-hidden="true">
          {theme.guides.map((g) => (
            <line
              key={g.id}
              x1={g.axis === 'x' ? camera.x + g.value * camera.scale : 0}
              x2={g.axis === 'x' ? camera.x + g.value * camera.scale : size.width}
              y1={g.axis === 'y' ? camera.y + g.value * camera.scale : 0}
              y2={g.axis === 'y' ? camera.y + g.value * camera.scale : size.height}
            />
          ))}
        </svg>
      )}
      <div className="canvas-navigation">
        <button aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          Навигация и направляющие
        </button>
        {open && (
          <div className="navigation-settings">
            <label className="check-field">
              <input
                type="checkbox"
                checked={theme.minimap ?? false}
                onChange={(e) => onTheme({ ...theme, minimap: e.target.checked })}
              />
              Мини-карта
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={theme.rulers ?? false}
                onChange={(e) => onTheme({ ...theme, rulers: e.target.checked })}
              />
              Линейки
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={theme.snapGuides ?? true}
                onChange={(e) => onTheme({ ...theme, snapGuides: e.target.checked })}
              />
              Привязка к направляющим
            </label>
            <div className="dialog-actions">
              <button disabled={(theme.guides?.length ?? 0) >= 100} onClick={() => addGuide('x')}>
                Вертикальная
              </button>
              <button disabled={(theme.guides?.length ?? 0) >= 100} onClick={() => addGuide('y')}>
                Горизонтальная
              </button>
            </div>
            {theme.guides?.map((g) => (
              <div className="guide-row" key={g.id}>
                <label>
                  {g.axis.toUpperCase()}
                  <input
                    aria-label={`Направляющая ${g.axis} ${g.id}`}
                    type="number"
                    value={Math.round(g.value)}
                    onChange={(e) => {
                      if (e.target.value.trim() && Number.isFinite(Number(e.target.value)))
                        onTheme({
                          ...theme,
                          guides: theme.guides!.map((v) =>
                            v.id === g.id ? { ...v, value: Number(e.target.value) } : v,
                          ),
                        });
                    }}
                  />
                </label>
                <button
                  aria-label="Удалить направляющую"
                  onClick={() =>
                    onTheme({ ...theme, guides: theme.guides!.filter((v) => v.id !== g.id) })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <h3>Закладки вида</h3>
            <input
              aria-label="Название закладки"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              disabled={!name.trim() || (theme.bookmarks?.length ?? 0) >= 100}
              onClick={() => {
                onTheme({
                  ...theme,
                  bookmarks: [
                    ...(theme.bookmarks ?? []),
                    { id: crypto.randomUUID(), name: name.trim(), camera: { ...camera } },
                  ],
                });
                setName('');
              }}
            >
              Запомнить вид
            </button>
            {theme.bookmarks?.map((mark) => (
              <div className="layer-row" key={mark.id}>
                <button onClick={() => onCamera({ ...mark.camera })}>{mark.name}</button>
                <button
                  aria-label={`Удалить закладку ${mark.name}`}
                  onClick={() =>
                    onTheme({
                      ...theme,
                      bookmarks: theme.bookmarks!.filter((m) => m.id !== mark.id),
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {theme.minimap && (
          <svg
            className="canvas-minimap"
            aria-label="Мини-карта холста"
            viewBox={`${b.left} ${b.top} ${width} ${height}`}
            onClick={(e) => {
              const matrix = e.currentTarget.getScreenCTM();
              if (!matrix) return;
              const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
              onCamera({
                ...camera,
                x: size.width / 2 - point.x * camera.scale,
                y: size.height / 2 - point.y * camera.scale,
              });
            }}
          >
            <rect x={b.left} y={b.top} width={width} height={height} fill="#edf3f7" />
            {bounds.map((v, i) => (
              <rect
                key={i}
                x={v.left}
                y={v.top}
                width={Math.max(1, v.right - v.left)}
                height={Math.max(1, v.bottom - v.top)}
                fill="#8fabbc"
              />
            ))}
            <rect
              x={viewport.left}
              y={viewport.top}
              width={viewport.right - viewport.left}
              height={viewport.bottom - viewport.top}
              fill="#e2a94b22"
              stroke="#b37d23"
              strokeWidth={Math.max(width / 200, 0.1)}
            />
          </svg>
        )}
      </div>
    </>
  );
}
