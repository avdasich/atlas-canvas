import { useState } from 'react';
import type { CanvasItem } from '../../domain/scene';
import { searchItems } from '../../domain/search';
export default function SearchPanel({
  items,
  onChoose,
  onClose,
}: {
  items: CanvasItem[];
  onChoose: (item: CanvasItem) => void;
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
          placeholder="Текст, таблицы и ссылки…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && results[0]) onChoose(results[0].item);
          }}
        />
        <button aria-label="Закрыть поиск" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="search-results">
        {results.map(({ item, excerpt }) => (
          <button key={item.id} onClick={() => onChoose(item)}>
            <small>
              {item.kind === 'table' ? 'Таблица' : item.kind === 'note' ? 'Заметка' : 'Объект'}
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
