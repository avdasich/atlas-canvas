import { useRef } from 'react';
import type { ItemKind, Theme } from '../../domain/scene';
import { t as tr } from '../../i18n/index';
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
    <nav className="tool-rail" aria-label={tr('Инструменты')}>
      <button
        title={tr('Выбор (V). Перемещение холста — по пустому месту')}
        aria-label={tr('Выбор')}
        aria-pressed={tool === 'select'}
        onClick={() => onTool('select')}
      >
        ↖
      </button>
      <button
        title={tr('Текст (T)')}
        aria-label={tr('Добавить текст')}
        disabled={busy}
        onClick={() => onAdd('note')}
      >
        T
      </button>
      <details className="shape-menu">
        <summary title={tr('Фигуры')} aria-label={tr('Фигуры')}>
          ◇
        </summary>
        <div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={theme.drawShapes ?? false}
              onChange={(e) => setTheme({ ...theme, drawShapes: e.target.checked })}
            />
            {tr('Рисовать протягиванием')}
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={theme.repeatShape ?? false}
              onChange={(e) => setTheme({ ...theme, repeatShape: e.target.checked })}
            />
            {tr('Оставлять инструмент активным')}
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
              {tr(label)}
            </button>
          ))}
        </div>
      </details>
      <button
        title={tr('Карандаш (P/B)')}
        aria-label={tr('Карандаш')}
        aria-pressed={tool === 'pen'}
        onClick={() => {
          onTool('pen');
        }}
      >
        ✎
      </button>
      <button
        title={tr('Ластик для штрихов')}
        aria-label={tr('Ластик')}
        aria-pressed={tool === 'eraser'}
        onClick={() => {
          onTool('eraser');
        }}
      >
        ◩
      </button>
      <button
        title={tr('Добавить фотографию')}
        aria-label={tr('Добавить фото')}
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
      <button
        title={tr('Редактируемая таблица')}
        aria-label={tr('Добавить таблицу')}
        onClick={() => onTable()}
      >
        ▦
      </button>
      <button
        title={tr('Раскрывающиеся сноски')}
        aria-label={tr('Добавить сноски')}
        disabled={busy}
        onClick={() => onAdd('disclosure')}
      >
        ▸≡
      </button>
      <details className="shape-menu">
        <summary aria-label={tr('Медиа и ссылки')}>▶</summary>
        <div>
          <button onClick={() => void onMedia('video')}>{tr('Видео с диска')}</button>
          <button onClick={() => void onMedia('audio')}>{tr('Аудио с диска')}</button>
          <button
            onClick={() => {
              onLink();
            }}
          >
            {tr('Ссылка или медиа по URL')}
          </button>
        </div>
      </details>
      <div className="rail-divider" />
      <button
        title={tr('Удалить выбранное')}
        aria-label={tr('Удалить')}
        disabled={!hasSelection || busy}
        onClick={onDelete}
      >
        ⌫
      </button>
    </nav>
  );
}
