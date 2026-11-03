import { useEffect, useRef, useState } from 'react';
import { defaultShimmer, drawShimmer, snowCrystals, type Shimmer } from '../../domain/shimmer';

export function ShimmerSettings({
  value,
  onChange,
}: {
  value?: Shimmer;
  onChange: (value: Shimmer) => void;
}) {
  const s = value ?? defaultShimmer;
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return (
    <fieldset className="shimmer-settings">
      <legend>Эффект фона</legend>
      <label className="check-field">
        <input
          type="checkbox"
          checked={s.enabled}
          onChange={(e) => onChange({ ...s, enabled: e.target.checked })}
        />
        Снежное переливание
      </label>
      {s.enabled && (
        <>
          <p className="panel-hint">Мелкие кристаллы плавно мерцают поверх выбранного фона.</p>
          <label className="property-field">
            Интенсивность · {Math.round(s.intensity * 100)}%
            <input
              aria-label="Интенсивность переливания"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.intensity}
              onChange={(e) => onChange({ ...s, intensity: Number(e.target.value) })}
            />
          </label>
          <label className="property-field">
            Скорость
            <input
              aria-label="Скорость переливания"
              type="range"
              min={0.1}
              max={2}
              step={0.1}
              value={s.speed}
              onChange={(e) => onChange({ ...s, speed: Number(e.target.value) })}
            />
          </label>
          <label className="property-field">
            Цвет кристаллов
            <input
              aria-label="Цвет кристаллов"
              type="color"
              value={s.color}
              onChange={(e) => onChange({ ...s, color: e.target.value })}
            />
          </label>
          {reduced && (
            <p role="status" className="panel-hint">
              В системе уменьшена анимация: кристаллы отображаются без движения.
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}
export default function SnowShimmer({ settings }: { settings?: Shimmer }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !settings?.enabled) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 1,
      height = 1,
      frame = 0,
      visible = true,
      last = -Infinity;
    let crystals = snowCrystals(width, height);
    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height);
      drawShimmer(ctx, crystals, settings, motion.matches ? 0 : now / 1000);
    };
    const tick = (now: number) => {
      if (now - last >= 1000 / 30) {
        draw(now);
        last = now;
      }
      frame = requestAnimationFrame(tick);
    };
    const update = () => {
      cancelAnimationFrame(frame);
      if (document.hidden || !visible) return;
      draw(performance.now());
      if (!motion.matches) frame = requestAnimationFrame(tick);
    };
    const resize = new ResizeObserver(([entry]) => {
      width = Math.max(1, entry.contentRect.width);
      height = Math.max(1, entry.contentRect.height);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      crystals = snowCrystals(width, height);
      update();
    });
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    resize.observe(canvas);
    intersection.observe(canvas);
    motion.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      motion.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [settings?.enabled, settings?.intensity, settings?.speed, settings?.color]);
  return settings?.enabled ? (
    <canvas ref={canvasRef} className="snow-shimmer" aria-hidden="true" />
  ) : null;
}
