import type { CanvasItem } from '../../../domain/scene';
import { t as tr } from '../../../i18n/index';
export default function LayerList({
  items,
  selected,
  select,
  toggleHidden,
}: {
  items: CanvasItem[];
  selected: CanvasItem[];
  select: (id: string) => void;
  toggleHidden: (id: string) => void;
}) {
  return (
    <details className="layers-panel">
      <summary>
        {tr('Слои ·') + ' '}
        {items.length}
      </summary>
      {[...items].reverse().map((i) => (
        <div className="layer-row" key={i.id}>
          <button onClick={() => select(i.id)} aria-pressed={selected.some((s) => s.id === i.id)}>
            {i.title ?? i.content?.slice(0, 24) ?? i.kind}
            {i.locked ? ' 🔒' : ''}
          </button>
          <button
            aria-label={tr('{0} объект {1}', i.hidden ? tr('Показать') : tr('Скрыть'), i.id)}
            onClick={() => toggleHidden(i.id)}
          >
            {i.hidden ? '○' : '●'}
          </button>
        </div>
      ))}
    </details>
  );
}
