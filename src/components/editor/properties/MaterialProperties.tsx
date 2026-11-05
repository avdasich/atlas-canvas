import { defaultGlass } from '../../../domain/materials';
import type { CanvasItem } from '../../../domain/scene';
import { t as tr } from '../../../i18n/index';
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
      <summary>{tr('Материал и блестяшки')}</summary>
      <fieldset className="glass-settings">
        <legend>{tr('Стекло')}</legend>
        <label className="check-field">
          <input
            type="checkbox"
            checked={glass.enabled}
            onChange={(e) => patch({ glass: { ...glass, enabled: e.target.checked } })}
          />
          {tr('Стеклянный материал')}
        </label>
        {glass.enabled && (
          <>
            <p className="panel-hint">
              {tr('Полупрозрачное стекло размывает содержимое позади букв или фигуры.')}
            </p>
            <Numeric
              label={tr('Размытие стекла')}
              value={glass.blur}
              min={0}
              max={40}
              onChange={(blur) => patch({ glass: { ...glass, blur } })}
            />
            <Numeric
              label={tr('Плотность стекла, %')}
              value={Math.round(glass.opacity * 100)}
              min={0}
              max={100}
              onChange={(value) => patch({ glass: { ...glass, opacity: value / 100 } })}
            />
            <label className="property-field">
              {tr('Оттенок стекла')}
              <input
                aria-label={tr('Оттенок стекла')}
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
        legend={tr('Блестяшки объекта')}
        label={tr('Мерцание текста или фигуры')}
        hint={tr('Кристаллы видны только внутри букв и контура фигуры. Можно сочетать со стеклом.')}
      />
    </details>
  );
}
