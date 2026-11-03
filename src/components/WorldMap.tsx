import { geoNaturalEarth1, geoPath } from 'd3-geo';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { defaultMapAppearance, validMapAppearance } from '../domain/appearance';
import type { Country } from '../domain/countries';
import { countries, countryForFeature, worldFeatures } from '../domain/world';
import { repository } from '../services/SceneRepository';
import { usePreferences } from '../services/usePreferences';
import SnowShimmer, { ShimmerSettings } from './editor/SnowShimmer';
const WIDTH = 960,
  HEIGHT = 500;
const projection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], {
  type: 'FeatureCollection',
  features: worldFeatures,
});
const path = geoPath(projection);
const geometry = new WeakMap(worldFeatures.map((f) => [f, path(f) ?? '']));
type View = { x: number; y: number; width: number; height: number };
let detailPromise: Promise<typeof worldFeatures> | undefined;
const loadDetail = () =>
  (detailPromise ??= import('../domain/worldDetail').then((module) => module.features));
const initialView: View = { x: 0, y: 0, width: WIDTH, height: HEIGHT };
export default function WorldMap({
  onCountrySelect,
}: {
  onCountrySelect: (country: Country) => void;
}) {
  const appearance = usePreferences('map', defaultMapAppearance, validMapAppearance);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focused, setFocused] = useState<Country | null>(null);
  const [focusMessage, setFocusMessage] = useState('');
  const [view, setView] = useState(initialView);
  const [detailedFeatures, setDetailedFeatures] = useState<typeof worldFeatures>([]);
  const focusRequest = useRef(0);
  useEffect(() => {
    if (view.width >= WIDTH * 0.8 || detailedFeatures.length) return;
    let active = true;
    void loadDetail()
      .then((features) => {
        if (active) setDetailedFeatures(features);
      })
      .catch((e) => {
        if (active) setError(`Детальная карта недоступна: ${String(e)}`);
      });
    return () => {
      active = false;
    };
  }, [view.width, detailedFeatures.length]);
  const [query, setQuery] = useState('');
  const [showList, setShowList] = useState(false);
  const [filled, setFilled] = useState<string[]>([]);
  const [error, setError] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef<{ x: number; y: number; view: View; scaleX: number; scaleY: number } | null>(
    null,
  );
  const moved = useRef(false);
  const features =
    view.width < WIDTH * 0.8 && detailedFeatures.length ? detailedFeatures : worldFeatures;
  const results = countries.filter((c) =>
    `${c.nameRu} ${c.nameEn}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()),
  );
  useEffect(() => {
    let cancelled = false;
    repository
      .filled()
      .then((ids) => {
        if (!cancelled) setFilled(ids);
      })
      .catch((e) => {
        if (!cancelled) setError(`Не удалось прочитать заполненность стран: ${String(e)}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function focusCountry(country: Country) {
    setFocused(country);
    setShowList(false);
    const request = ++focusRequest.current;
    let detailed: typeof worldFeatures;
    try {
      detailed = await loadDetail();
    } catch (e) {
      setFocusMessage(String(e));
      return;
    }
    if (focusRequest.current !== request) return;
    setDetailedFeatures(detailed);
    const feature = detailed.find((f) => countryForFeature(f).id === country.id);
    if (!feature) {
      setFocusMessage(
        'Эта страна слишком мала для геометрии карты. Её холст доступен по кнопке ниже.',
      );
      return;
    }
    const [[left, top], [right, bottom]] = path.bounds(feature);
    const width = Math.min(
        WIDTH,
        Math.max(65, (right - left) * 1.7, ((bottom - top) * 1.7 * WIDTH) / HEIGHT),
      ),
      height = (width * HEIGHT) / WIDTH;
    setView({
      width,
      height,
      x: Math.max(0, Math.min(WIDTH - width, (left + right - width) / 2)),
      y: Math.max(0, Math.min(HEIGHT - height, (top + bottom - height) / 2)),
    });
    setFocusMessage('');
  }
  function zoom(factor: number, px = 0.5, py = 0.5) {
    setView((current) => {
      const width = Math.max(WIDTH / 18, Math.min(WIDTH, current.width / factor)),
        height = (width * HEIGHT) / WIDTH;
      return {
        width,
        height,
        x: Math.max(0, Math.min(WIDTH - width, current.x + px * current.width - px * width)),
        y: Math.max(0, Math.min(HEIGHT - height, current.y + py * current.height - py * height)),
      };
    });
  }
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()),
        current = viewRef.current;
      zoom(
        Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.002),
        (p.x - current.x) / current.width,
        (p.y - current.y) / current.height,
      );
    };
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => svg.removeEventListener('wheel', wheel);
  }, []);
  function start(e: ReactMouseEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const matrix = e.currentTarget.getScreenCTM();
    if (!matrix) return;
    moved.current = false;
    drag.current = { x: e.clientX, y: e.clientY, view, scaleX: matrix.a, scaleY: matrix.d };
  }
  function move(e: ReactMouseEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x,
      dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) > 3) moved.current = true;
    if (!moved.current) return;
    setView({
      ...d.view,
      x: Math.max(0, Math.min(WIDTH - d.view.width, d.view.x - dx / d.scaleX)),
      y: Math.max(0, Math.min(HEIGHT - d.view.height, d.view.y - dy / d.scaleY)),
    });
  }
  return (
    <>
      <div className="map-bar">
        <div className="country-search">
          <input
            aria-label="Поиск страны"
            placeholder="Найти страну на русском или английском…"
            value={query}
            onFocus={() => setShowList(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowList(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowList(false);
              if (e.key === 'Enter' && results[0]) focusCountry(results[0]);
            }}
          />
          <button aria-expanded={showList} onClick={() => setShowList((v) => !v)}>
            Все страны
          </button>
          {showList && (
            <div className="country-results" role="list" aria-label="Страны">
              {results.map((c) => (
                <div className="country-result-row" key={c.id}>
                  <button onClick={() => onCountrySelect(c)}>
                    <span>
                      {c.nameRu}
                      <small>{c.nameEn}</small>
                    </span>
                    {filled.includes(c.id) && (
                      <span className="filled-dot" title="Есть записи">
                        ●
                      </span>
                    )}
                  </button>
                  <button
                    aria-label={`Показать на карте: ${c.nameRu}`}
                    onClick={() => focusCountry(c)}
                  >
                    ⌖
                  </button>
                </div>
              ))}
              {!results.length && <p>Страна не найдена</p>}
            </div>
          )}
        </div>
        <div className="map-controls">
          <button onClick={() => setSettingsOpen(true)}>Оформление карты</button>
          <button aria-label="Приблизить карту" onClick={() => zoom(1.5)}>
            +
          </button>
          <button aria-label="Отдалить карту" onClick={() => zoom(1 / 1.5)}>
            −
          </button>
          <button onClick={() => setView(initialView)}>Сброс вида</button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <div
        className="map-surface"
        style={
          {
            '--map-background': appearance.value.background,
            '--map-country': appearance.value.countries,
            '--map-filled': appearance.value.filled,
            '--map-border': appearance.value.borders,
            '--map-highlight': appearance.value.highlight,
          } as CSSProperties
        }
      >
        <SnowShimmer settings={appearance.value.shimmer} />
        <svg
          ref={svgRef}
          className="world-map"
          aria-label="Карта мира"
          viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={() => {
            drag.current = null;
          }}
          onMouseLeave={() => {
            drag.current = null;
          }}
        >
          {features.map((f, index) => {
            const c = countryForFeature(f);
            return (
              <path
                key={`${c.id}-${index}`}
                d={
                  geometry.get(f) ??
                  (() => {
                    const d = path(f) ?? '';
                    geometry.set(f, d);
                    return d;
                  })()
                }
                data-country-id={c.id}
                className={`country ${filled.includes(c.id) ? 'filled' : ''} ${focused?.id === c.id ? 'focused' : ''}`}
                onClick={() => {
                  if (!moved.current) onCountrySelect(c);
                }}
              >
                <title>
                  {c.nameRu} · {c.nameEn}
                </title>
              </path>
            );
          })}
        </svg>
        {focused && (
          <div className="country-focus">
            <strong>{focused.nameRu}</strong>
            {focusMessage && <p>{focusMessage}</p>}
            <button onClick={() => onCountrySelect(focused)}>Открыть холст</button>
            <button aria-label="Снять подсветку страны" onClick={() => setFocused(null)}>
              ×
            </button>
          </div>
        )}
      </div>
      {settingsOpen && (
        <div className="dialog-backdrop">
          <section
            className="app-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Оформление карты"
          >
            <h2>Оформление карты</h2>
            {(
              [
                ['background', 'Фон карты'],
                ['countries', 'Пустые страны'],
                ['filled', 'Заполненные страны'],
                ['borders', 'Границы'],
                ['highlight', 'Подсветка'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="property-field">
                {label}
                <input
                  type="color"
                  aria-label={label}
                  disabled={!appearance.ready}
                  value={appearance.value[key]}
                  onChange={(e) =>
                    appearance.update({ ...appearance.value, [key]: e.target.value })
                  }
                />
              </label>
            ))}
            <ShimmerSettings
              value={appearance.value.shimmer}
              onChange={(shimmer) => appearance.update({ ...appearance.value, shimmer })}
            />
            {appearance.error && <p role="alert">{appearance.error}</p>}
            <div className="dialog-actions">
              <button onClick={() => appearance.update(structuredClone(defaultMapAppearance))}>
                Сбросить оформление
              </button>
              <button onClick={() => setSettingsOpen(false)}>Готово</button>
            </div>
          </section>
        </div>
      )}
      <footer className="map-footer">
        <span>
          <i className="legend-dot" /> Есть записи
        </span>
        <span>Колесо — масштаб · Мышь — перемещение</span>
        <span>{countries.length} стран и территорий в каталоге</span>
      </footer>
    </>
  );
}
