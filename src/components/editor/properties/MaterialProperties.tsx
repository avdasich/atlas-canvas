import { defaultGlass } from '../../../domain/materials';
import type { CanvasItem } from '../../../domain/scene';
import Numeric from '../controls/NumericField';
import { ShimmerSettings } from '../SnowShimmer';
export default function MaterialProperties({
  item,
  patch,
}: {
  item: CanvasItem;
  patch: (patch: Partial<CanvasItem>) => void;
}) {
  const glass = item.glass ?? defaultGlass;
  return (
    <details open className="material-properties">
      <summary>Материал и блестяшки</summary>
      <fieldset className="glass-settings">
        <legend>Стекло</legend>
        <label className="check-field">
          <input
            type="checkbox"
            checked={glass.enabled}
            onChange={(e) => patch({ glass: { ...glass, enabled: e.target.checked } })}
          />
          Стеклянный материал
        </label>
        {glass.enabled && (
          <>
            <p className="panel-hint">
              Полупрозрачное стекло размывает содержимое позади букв или фигуры.
            </p>
            <Numeric
              label="Размытие стекла"
              value={glass.blur}
              min={0}
              max={40}
              onChange={(blur) => patch({ glass: { ...glass, blur } })}
            />
            <Numeric
              label="Плотность стекла, %"
              value={Math.round(glass.opacity * 100)}
              min={0}
              max={100}
              onChange={(value) => patch({ glass: { ...glass, opacity: value / 100 } })}
            />
            <label className="property-field">
              Оттенок стекла
              <input
                aria-label="Оттенок стекла"
                type="color"
                value={glass.tint}
                onChange={(e) => patch({ glass: { ...glass, tint: e.target.value } })}
              />
            </label>
          </>
        )}
      </fieldset>
      <ShimmerSettings
        value={item.shimmer}
        onChange={(shimmer) => patch({ shimmer })}
        legend="Блестяшки объекта"
        label="Мерцание текста или фигуры"
        hint="Кристаллы видны только внутри букв и контура фигуры. Можно сочетать со стеклом."
      />
    </details>
  );
}
