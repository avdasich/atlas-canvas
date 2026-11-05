import type { CanvasItem } from '../../../domain/scene';
import { t as tr } from '../../../i18n/index';
import Numeric from '../controls/NumericField';
export default function TextProperties({
  item,
  patch,
}: {
  item: CanvasItem;
  patch: (patch: Partial<CanvasItem>) => void;
}) {
  return (
    <>
      <label className="property-field">
        {tr('Фон заметки')}
        <input
          type="color"
          value={item.textBackground ?? '#ffffff'}
          onChange={(e) => patch({ textBackground: e.target.value })}
        />
      </label>
      <button onClick={() => patch({ textBackground: undefined })}>
        {tr('Прозрачный фон заметки')}
      </button>
      <Numeric
        label={tr('Размер шрифта')}
        value={item.fontSize ?? 26}
        min={6}
        max={400}
        onChange={(fontSize) => patch({ fontSize })}
      />
      <Numeric
        label={tr('Межстрочный интервал')}
        value={item.lineHeight ?? 1.3}
        min={0.5}
        max={5}
        onChange={(lineHeight) => patch({ lineHeight })}
      />
      <div className="text-style-buttons">
        {[
          ['bold', tr('Ж')],
          ['italic', tr('К')],
        ].map(([style, label]) => (
          <button
            key={style}
            aria-label={style === 'bold' ? tr('Жирный') : tr('Курсив')}
            aria-pressed={item.fontStyle?.includes(style)}
            onClick={() => {
              const current = (item.fontStyle ?? '').split(' ').filter((s) => s !== 'normal');
              patch({
                fontStyle: current.includes(style)
                  ? current.filter((s) => s !== style).join(' ') || 'normal'
                  : [...current, style].join(' '),
              });
            }}
          >
            {label}
          </button>
        ))}
        <button
          aria-pressed={item.textDecoration === 'underline'}
          onClick={() =>
            patch({ textDecoration: item.textDecoration === 'underline' ? '' : 'underline' })
          }
        >
          {tr('Подчеркнуть')}
        </button>
      </div>
      <label className="property-field">
        {tr('Выравнивание')}
        <select
          aria-label={tr('Выравнивание текста')}
          value={item.align ?? 'left'}
          onChange={(e) => patch({ align: e.target.value as CanvasItem['align'] })}
        >
          <option value="left">{tr('Слева')}</option>
          <option value="center">{tr('По центру')}</option>
          <option value="right">{tr('Справа')}</option>
        </select>
      </label>
    </>
  );
}
