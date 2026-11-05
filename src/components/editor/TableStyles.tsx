import { useState } from 'react';
import { validateTable, type TableData } from '../../domain/scene';
import { tableStyle, tableStyles, type TableStyle } from '../../domain/table';
import { t as tr, translateMessage } from '../../i18n/index';
import { usePreferences } from '../../services/usePreferences';
type SavedStyle = { id: string; name: string; style: TableStyle; fontFamily?: string };
function valid(value: unknown): value is SavedStyle[] {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every((p) => {
      try {
        if (
          typeof p.id !== 'string' ||
          (p.fontFamily !== undefined && typeof p.fontFamily !== 'string') ||
          typeof p.name !== 'string' ||
          p.name.length > 80
        )
          return false;
        validateTable({
          ...tableStyles[0].style,
          ...p.style,
          cells: [[{ text: '' }]],
          rowHeights: [44],
          columnWidths: [150],
        });
        return true;
      } catch {
        return false;
      }
    })
  );
}
export default function TableStyles({
  table,
  fontFamily,
  onChange,
}: {
  table: TableData;
  fontFamily?: string;
  onChange: (table: TableData, fontFamily?: string) => void;
}) {
  const apply = (style: TableStyle, font?: string) =>
    onChange(
      {
        ...table,
        ...style,
        rowHeights: table.rowHeights.map((h) =>
          Math.max(h, Math.ceil(style.fontSize * 1.3 + style.padding * 2 + style.borderWidth * 2)),
        ),
      },
      font,
    );
  const saved = usePreferences<SavedStyle[]>('table-styles', [], valid),
    [name, setName] = useState('');
  return (
    <details>
      <summary>{tr('Стили таблицы')}</summary>
      <div className="theme-presets">
        {tableStyles.map((p) => (
          <button key={p.name} onClick={() => apply(p.style)}>
            {tr(p.name)}
          </button>
        ))}
      </div>
      <label className="property-field">
        {tr('Название стиля')}
        <input
          aria-label={tr('Название стиля таблицы')}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        disabled={!saved.ready || !name.trim() || saved.value.length >= 100}
        onClick={() => {
          saved.update([
            ...saved.value,
            { id: crypto.randomUUID(), name: name.trim(), style: tableStyle(table), fontFamily },
          ]);
          setName('');
        }}
      >
        {tr('Сохранить стиль таблицы')}
      </button>
      {saved.value.map((p) => (
        <div className="layer-row" key={p.id}>
          <button onClick={() => apply(p.style, p.fontFamily)}>{p.name}</button>
          <button
            aria-label={tr('Удалить стиль {0}', p.name)}
            onClick={() => saved.update(saved.value.filter((v) => v.id !== p.id))}
          >
            ×
          </button>
        </div>
      ))}
      {saved.error && <p role="alert">{translateMessage(saved.error)}</p>}
      <p className="panel-hint">
        {tr('Стили меняют общую палитру. Индивидуальные цвета ячеек сохраняются.')}
      </p>
    </details>
  );
}
