import type { CanvasItem } from '../../../domain/scene';
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
        Фон заметки
        <input
          type="color"
          value={item.textBackground ?? '#ffffff'}
          onChange={(e) => patch({ textBackground: e.target.value })}
        />
      </label>
      <button onClick={() => patch({ textBackground: undefined })}>Прозрачный фон заметки</button>
      <Numeric
        label="Размер шрифта"
        value={item.fontSize ?? 26}
        min={6}
        max={400}
        onChange={(fontSize) => patch({ fontSize })}
      />
      <Numeric
        label="Межстрочный интервал"
        value={item.lineHeight ?? 1.3}
        min={0.5}
        max={5}
        onChange={(lineHeight) => patch({ lineHeight })}
      />
      <div className="text-style-buttons">
        {[
          ['bold', 'Ж'],
          ['italic', 'К'],
        ].map(([style, label]) => (
          <button
            key={style}
            aria-label={style === 'bold' ? 'Жирный' : 'Курсив'}
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
          Подчеркнуть
        </button>
      </div>
      <label className="property-field">
        Выравнивание
        <select
          aria-label="Выравнивание текста"
          value={item.align ?? 'left'}
          onChange={(e) => patch({ align: e.target.value as CanvasItem['align'] })}
        >
          <option value="left">Слева</option>
          <option value="center">По центру</option>
          <option value="right">Справа</option>
        </select>
      </label>
    </>
  );
}
