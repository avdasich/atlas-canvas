import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { countries, featureCountry, worldFeatures } from '../domain/world';
import type { Country } from '../domain/countries';
import { repository } from '../services/SceneRepository';
const WIDTH = 960, HEIGHT = 500;
const projection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], { type: 'FeatureCollection', features: worldFeatures });
const path = geoPath(projection);
type View = { x: number; y: number; width: number; height: number };
const initialView: View = { x: 0, y: 0, width: WIDTH, height: HEIGHT };
export default function WorldMap({ onCountrySelect }: { onCountrySelect: (country: Country) => void }) {
  const [view, setView] = useState(initialView);
  const [query, setQuery] = useState('');
  const [showList, setShowList] = useState(false);
  const [filled, setFilled] = useState<string[]>([]);
  const [error, setError] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef(view); viewRef.current = view;
  const drag = useRef<{ x: number; y: number; view: View; scaleX: number; scaleY: number } | null>(null);
  const moved = useRef(false);
  const results = countries.filter(c => `${c.nameRu} ${c.nameEn}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
  useEffect(() => {
    let cancelled = false;
    repository.filled().then(ids => {
      if (!cancelled) setFilled(ids);
    }).catch(e => { if (!cancelled) setError(`Не удалось прочитать заполненность стран: ${String(e)}`); });
    return () => { cancelled = true; };
  }, []);
  function zoom(factor: number, px = 0.5, py = 0.5) {
    setView(current => {
      const width = Math.max(WIDTH / 18, Math.min(WIDTH, current.width / factor)), height = width * HEIGHT / WIDTH;
      return { width, height, x: Math.max(0, Math.min(WIDTH - width, current.x + px * current.width - px * width)), y: Math.max(0, Math.min(HEIGHT - height, current.y + py * current.height - py * height)) };
    });
  }
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault(); const matrix = svg.getScreenCTM(); if (!matrix) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()), current = viewRef.current;
      zoom(Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.002), (p.x - current.x) / current.width, (p.y - current.y) / current.height);
    };
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => svg.removeEventListener('wheel', wheel);
  }, []);
  function start(e: ReactMouseEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const matrix = e.currentTarget.getScreenCTM(); if (!matrix) return;
    moved.current = false;
    drag.current = { x: e.clientX, y: e.clientY, view, scaleX: matrix.a, scaleY: matrix.d };
  }
  function move(e: ReactMouseEvent<SVGSVGElement>) {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) > 3) moved.current = true;
    if (!moved.current) return;
    setView({ ...d.view, x: Math.max(0, Math.min(WIDTH - d.view.width, d.view.x - dx / d.scaleX)), y: Math.max(0, Math.min(HEIGHT - d.view.height, d.view.y - dy / d.scaleY)) });
  }
  return <>
    <div className="map-bar"><div className="country-search"><input aria-label="Поиск страны" placeholder="Найти страну на русском или английском…" value={query} onFocus={() => setShowList(true)} onChange={e => { setQuery(e.target.value); setShowList(true); }} onKeyDown={e => { if (e.key === 'Escape') setShowList(false); if (e.key === 'Enter' && results[0]) onCountrySelect(results[0]); }} /><button aria-expanded={showList} onClick={() => setShowList(v => !v)}>Все страны</button>
      {showList && <div className="country-results" role="list" aria-label="Страны">{results.map(c => <button key={c.id} onClick={() => onCountrySelect(c)}><span>{c.nameRu}<small>{c.nameEn}</small></span>{filled.includes(c.id) && <span className="filled-dot" title="Есть записи">●</span>}</button>)}{!results.length && <p>Страна не найдена</p>}</div>}
    </div><div className="map-controls"><button aria-label="Приблизить карту" onClick={() => zoom(1.5)}>+</button><button aria-label="Отдалить карту" onClick={() => zoom(1 / 1.5)}>−</button><button onClick={() => setView(initialView)}>Сброс вида</button></div></div>
    {error && <p role="alert">{error}</p>}
    <svg ref={svgRef} className="world-map" aria-label="Карта мира" viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} onMouseDown={start} onMouseMove={move} onMouseUp={() => { drag.current = null; }} onMouseLeave={() => { drag.current = null; }}>
      {worldFeatures.map((f, index) => {
        const c = featureCountry(index);
        return <path key={c.id} d={path(f) ?? ''} data-country-id={c.id} className={`country ${filled.includes(c.id) ? 'filled' : ''}`} onClick={() => { if (!moved.current) onCountrySelect(c); }}><title>{c.nameRu} · {c.nameEn}</title></path>;
      })}
    </svg><footer className="map-footer"><span><i className="legend-dot" /> Есть записи</span><span>Колесо — масштаб · Мышь — перемещение</span><span>{countries.length} стран и территорий в каталоге</span></footer>
  </>;
}
