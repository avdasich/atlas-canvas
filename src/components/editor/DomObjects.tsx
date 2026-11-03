import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { dimensions } from '../../domain/geometry';
import type { Camera, CanvasItem, TableData } from '../../domain/scene';
import { coveredCell, mergeAt } from '../../domain/table';
export type CellSelection = { row: number; column: number };
type Props = {
  item: CanvasItem;
  camera: Camera;
  selected: boolean;
  interactive: boolean;
  readOnly: boolean;
  zIndex: number;
  fontFamily: string;
  onSelect: (extend?: boolean) => void;
  onDrag: (event: ReactPointerEvent) => void;
  onTable: (table: TableData) => void;
  onCell: (cell: CellSelection) => void;
  onDraft: (draft: { id: string; row: number; column: number; text: string } | null) => void;
};
function Cell({
  text,
  label,
  style,
  onCommit,
  onFocus,
  onDraft,
  readOnly,
}: {
  text: string;
  label: string;
  style: React.CSSProperties;
  onCommit: (text: string) => void;
  onFocus: () => void;
  onDraft: (text: string | null) => void;
  readOnly: boolean;
}) {
  const cancelled = useRef(false);
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  return (
    <textarea
      aria-label={label}
      value={draft}
      readOnly={readOnly}
      style={style}
      rows={1}
      onFocus={() => {
        cancelled.current = false;
        onFocus();
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onDraft(e.target.value);
      }}
      onBlur={() => {
        if (!cancelled.current) onCommit(draft);
        onDraft(null);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          cancelled.current = true;
          setDraft(text);
          onDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
export default function DomObject({
  item,
  camera,
  selected,
  interactive,
  readOnly,
  zIndex,
  fontFamily,
  onSelect,
  onDrag,
  onTable,
  onCell,
  onDraft,
}: Props) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setUrl('');
    setError('');
    if (item.assetId && ['video', 'audio'].includes(item.kind) && isTauri())
      void invoke<string>('asset_path', { assetId: item.assetId, preview: false })
        .then((p) => {
          if (active) setUrl(convertFileSrc(p));
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    return () => {
      active = false;
    };
  }, [item.assetId, item.kind]);
  const size = dimensions(item);
  return (
    <div
      className={`dom-object ${selected ? 'selected' : ''}`}
      data-object-id={item.id}
      style={{
        zIndex,
        left: camera.x + item.x * camera.scale,
        top: camera.y + item.y * camera.scale,
        width: size.width,
        height: size.height,
        opacity: item.opacity ?? 1,
        boxShadow: item.shadowBlur ? `0 0 ${item.shadowBlur}px #0005` : 'none',
        transform: `rotate(${item.rotation ?? 0}deg) scale(${camera.scale * (item.scaleX ?? 1)},${camera.scale * (item.scaleY ?? 1)})`,
        pointerEvents: interactive ? 'auto' : 'none',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('.object-handle')) onSelect(e.shiftKey);
      }}
    >
      <div
        className="object-handle"
        style={{ background: item.fill ?? '#e8eef3', cursor: readOnly ? 'default' : 'move' }}
        onPointerDown={(e) => {
          if (e.button === 0) {
            e.stopPropagation();
            e.preventDefault();
            if (e.shiftKey || !selected) onSelect(e.shiftKey);
            if (!item.locked && !e.shiftKey) onDrag(e);
          }
        }}
      >
        {item.title ??
          (item.kind === 'table'
            ? 'Таблица'
            : item.kind === 'video'
              ? 'Видео'
              : item.kind === 'audio'
                ? 'Аудио'
                : 'Ссылка')}
        <span>{item.locked ? '🔒' : '⠿'}</span>
      </div>
      {item.kind === 'table' && item.table && (
        <div
          className="table-clip"
          style={{ borderRadius: item.table.radius, height: size.height - 28 }}
        >
          <table
            style={{
              width: size.width,
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
              background: item.table.background,
              color: item.table.color,
              fontFamily: item.fontFamily ?? fontFamily,
              fontSize: item.table.fontSize,
            }}
          >
            <colgroup>
              {item.table.columnWidths.map((width, c) => (
                <col key={c} style={{ width }} />
              ))}
            </colgroup>
            <tbody>
              {item.table.cells.map((row, r) => (
                <tr key={r} style={{ height: item.table!.rowHeights[r] }}>
                  {row.map((cell, c) =>
                    coveredCell(item.table!, r, c) ? null : (
                      <td
                        rowSpan={mergeAt(item.table!, r, c)?.rows ?? 1}
                        colSpan={mergeAt(item.table!, r, c)?.columns ?? 1}
                        key={c}
                        style={{
                          padding: 0,
                          border: `${item.table!.borderWidth}px solid ${item.table!.borderColor}`,
                          background:
                            cell.fill ??
                            (r === 0 && item.table!.header
                              ? (item.table!.headerFill ?? '#e7eef3')
                              : item.table!.background),
                        }}
                      >
                        <Cell
                          text={cell.text}
                          label={`Ячейка ${r + 1}:${c + 1}`}
                          readOnly={!!item.locked || readOnly}
                          style={{
                            height:
                              item
                                .table!.rowHeights.slice(
                                  r,
                                  r + (mergeAt(item.table!, r, c)?.rows ?? 1),
                                )
                                .reduce((a, b) => a + b, 0) - item.table!.borderWidth,
                            padding: item.table!.padding,
                            color: cell.color ?? item.table!.color,
                            textAlign: cell.align ?? 'left',
                            fontWeight:
                              cell.bold || (r === 0 && item.table!.header) ? 'bold' : 'normal',
                          }}
                          onFocus={() => {
                            onSelect();
                            onCell({ row: r, column: c });
                          }}
                          onDraft={(text) =>
                            onDraft(text === null ? null : { id: item.id, row: r, column: c, text })
                          }
                          onCommit={(text) => {
                            if (text !== cell.text)
                              onTable({
                                ...item.table!,
                                cells: item.table!.cells.map((row, ri) =>
                                  row.map((cell, ci) =>
                                    ri === r && ci === c ? { ...cell, text } : cell,
                                  ),
                                ),
                              });
                          }}
                        />
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(item.kind === 'video' || item.kind === 'audio') && (
        <div className="media-body">
          {error ? (
            <p role="alert">Файл недоступен: {error}</p>
          ) : url ? (
            item.kind === 'video' ? (
              <video
                controls
                preload="metadata"
                src={url}
                onError={() =>
                  setError('Формат или кодек не поддерживается этой ОС. Оригинал сохранён.')
                }
              />
            ) : (
              <audio
                controls
                preload="metadata"
                src={url}
                onError={() =>
                  setError('Формат или кодек не поддерживается этой ОС. Оригинал сохранён.')
                }
              />
            )
          ) : (
            <p>Загрузка файла…</p>
          )}
        </div>
      )}
      {item.kind === 'link' && (
        <div className="link-body">
          <span>{item.url}</span>
          <button
            onClick={() => {
              if (isTauri())
                void invoke('open_link', { url: item.url }).catch((e) => setError(String(e)));
              else window.open(item.url, '_blank', 'noopener,noreferrer');
            }}
          >
            Открыть ссылку ↗
          </button>
          {error && <small>{error}</small>}
        </div>
      )}
    </div>
  );
}
