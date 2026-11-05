import { createSection } from '../../../domain/disclosure';
import type { CanvasItem } from '../../../domain/scene';
import { t as tr } from '../../../i18n/index';
import Numeric from '../controls/NumericField';
export default function DisclosureProperties({
  item,
  patch,
}: {
  item: CanvasItem;
  patch: (patch: Partial<CanvasItem>) => void;
}) {
  const sections = item.sections ?? [];
  return (
    <details open>
      <summary>{tr('Раскрывающиеся сноски')}</summary>
      <label className="property-field">
        {tr('Название блока')}
        <input
          maxLength={200}
          value={item.title ?? tr('Сноски')}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </label>
      {sections.map((section, index) => (
        <fieldset className="disclosure-properties" key={section.id}>
          <legend>
            {tr('Раздел') + ' '}
            {index + 1}
          </legend>
          <label className="property-field">
            {tr('Заголовок')}
            <input
              aria-label={tr('Заголовок раздела {0}', index + 1)}
              maxLength={500}
              value={section.title}
              onChange={(e) =>
                patch({
                  sections: sections.map((s) =>
                    s.id === section.id ? { ...s, title: e.target.value } : s,
                  ),
                })
              }
            />
          </label>
          <Numeric
            label={tr('Высота текста раздела {0}', index + 1)}
            value={section.height}
            min={60}
            max={1000}
            onChange={(height) =>
              patch({ sections: sections.map((s) => (s.id === section.id ? { ...s, height } : s)) })
            }
          />
          <button
            disabled={sections.length <= 1}
            onClick={() => patch({ sections: sections.filter((s) => s.id !== section.id) })}
          >
            {tr('Удалить раздел') + ' '}
            {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        disabled={sections.length >= 100}
        onClick={() => patch({ sections: [...sections, createSection(tr('Новый раздел'))] })}
      >
        {tr('+ Раздел')}
      </button>
      <p className="panel-hint">
        {tr(
          'Нажмите заголовок на холсте, чтобы раскрыть раздел и написать текст. В режиме просмотра разделы тоже раскрываются.',
        )}
      </p>
    </details>
  );
}
