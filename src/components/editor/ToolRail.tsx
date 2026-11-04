import { useRef } from 'react';
import type { ItemKind, Theme } from '../../domain/scene';
import { shapeLabels, type EditorTool } from './editorTools';
type Props = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  tool: EditorTool;
  busy: boolean;
  onTool: (tool: EditorTool) => void;
  onAdd: (kind: ItemKind) => void;
  onPhotos: (files: File[]) => Promise<void>;
  onTable: () => void;
  onMedia: (kind: 'video' | 'audio') => Promise<void>;
  onLink: () => void;
  hasSelection: boolean;
  onDelete: () => void;
};
export default function ToolRail({
  theme,
  setTheme,
  tool,
  busy,
  onTool,
  onAdd,
  onPhotos,
  onTable,
  onMedia,
  onLink,
  hasSelection,
  onDelete,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <nav className="tool-rail" aria-label="Инструменты">
      <button
        title="Выбор (V). Перемещение холста — по пустому месту"
        aria-label="Выбор"
        aria-pressed={tool === 'select'}
        onClick={() => onTool('select')}
      >
        ↖
      </button>
      <button
        title="Текст (T)"
        aria-label="Добавить текст"
        disabled={busy}
        onClick={() => onAdd('note')}
      >
        T
      </button>
      <details className="shape-menu">
        <summary title="Фигуры" aria-label="Фигуры">
          ◇
        </summary>
        <div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={theme.drawShapes ?? false}
              onChange={(e) => setTheme({ ...theme, drawShapes: e.target.checked })}
            />
            Рисовать протягиванием
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={theme.repeatShape ?? false}
              onChange={(e) => setTheme({ ...theme, repeatShape: e.target.checked })}
            />
            Оставлять инструмент активным
          </label>
          {shapeLabels.map(([kind, label]) => (
            <button
              key={kind}
              disabled={busy}
              onClick={(e) => {
                onAdd(kind);
                e.currentTarget.closest('details')?.removeAttribute('open');
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </details>
      <button
        title="Карандаш (P/B)"
        aria-label="Карандаш"
        aria-pressed={tool === 'pen'}
        onClick={() => {
          onTool('pen');
        }}
      >
        ✎
      </button>
      <button
        title="Ластик для штрихов"
        aria-label="Ластик"
        aria-pressed={tool === 'eraser'}
        onClick={() => {
          onTool('eraser');
        }}
      >
        ◩
      </button>
      <button
        title="Добавить фотографию"
        aria-label="Добавить фото"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        ▧
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void onPhotos(files);
        }}
      />
      <button title="Редактируемая таблица" aria-label="Добавить таблицу" onClick={() => onTable()}>
        ▦
      </button>
      <button
        title="Раскрывающиеся сноски"
        aria-label="Добавить сноски"
        disabled={busy}
        onClick={() => onAdd('disclosure')}
      >
        ▸≡
      </button>
      <details className="shape-menu">
        <summary aria-label="Медиа и ссылки">▶</summary>
        <div>
          <button onClick={() => void onMedia('video')}>Видео с диска</button>
          <button onClick={() => void onMedia('audio')}>Аудио с диска</button>
          <button
            onClick={() => {
              onLink();
            }}
          >
            Ссылка или медиа по URL
          </button>
        </div>
      </details>
      <div className="rail-divider" />
      <button
        title="Удалить выбранное"
        aria-label="Удалить"
        disabled={!hasSelection || busy}
        onClick={onDelete}
      >
        ⌫
      </button>
    </nav>
  );
}
