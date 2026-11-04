import { useState } from 'react';
import type { CanvasItem } from '../../domain/scene';
import { searchItems } from '../../domain/search';
export default function SearchPanel({
  items,
  onChoose,
  onClose,
}: {
  items: CanvasItem[];
  onChoose: (item: CanvasItem, sectionId?: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const results = searchItems(items, query);
  return (
    <section className="canvas-search" aria-label="Поиск по холсту">
      <div className="search-row">
        <input
          autoFocus
          aria-label="Поиск по записям"
          value={query}
          placeholder="Заметки, таблицы, сноски и ссылки…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && results[0]) onChoose(results[0].item, results[0].sectionId);
          }}
        />
        <button aria-label="Закрыть поиск" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="search-results">
        {results.map(({ item, excerpt, sectionId }) => (
          <button key={item.id} onClick={() => onChoose(item, sectionId)}>
            <small>
              {item.kind === 'table'
                ? 'Таблица'
                : item.kind === 'note'
                  ? 'Заметка'
                  : item.kind === 'disclosure'
                    ? 'Сноски'
                    : 'Объект'}
              {item.hidden ? ' · скрыт' : ''}
            </small>
            {excerpt}
          </button>
        ))}
        {query.trim() && !results.length && <p>Совпадений нет</p>}
      </div>
    </section>
  );
}
