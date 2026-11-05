import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef, useState } from 'react';
import { countries } from '../../domain/world';
import { countryName, t as tr, translateMessage } from '../../i18n/index';
import { flushBeforeExit } from '../../services/exitGuard';
type Preview = {
  token: string;
  countries: { countryId: string; count: number; conflict: boolean }[];
  assets: number;
};
export default function ArchivePanel({
  countryId,
  onClose,
  onRestored,
}: {
  countryId?: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [preview, setPreview] = useState<Preview | null>(null),
    [replace, setReplace] = useState(false);
  const operationId = useRef<string | null>(null);
  const [progress, setProgress] = useState('');
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false,
      off: (() => void) | undefined;
    void listen<{ id: string; bytes: number }>('atlas-operation', (e) => {
      if (e.payload.id === operationId.current)
        setProgress(tr('Обработано {0} МиБ', (e.payload.bytes / 1048576).toFixed(1)));
    }).then((fn) => {
      if (disposed) fn();
      else off = fn;
    });
    return () => {
      disposed = true;
      off?.();
    };
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    operationId.current = crypto.randomUUID();
    setProgress(tr('Подготовка…'));
    try {
      await flushBeforeExit();
      await action();
    } catch (e) {
      setMessage(String(e));
    } finally {
      operationId.current = null;
      setProgress('');
      setBusy(false);
    }
  }
  return (
    <div className="dialog-backdrop">
      <section
        className="app-dialog archive-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={tr('Архив и восстановление')}
      >
        <h2>{tr('Архив и восстановление')}</h2>
        <p>
          {tr(
            'Архив .atlas содержит сцены, оформление и оригиналы вложений; полный архив также включает библиотеку оформлений и настройки карты. Его можно перенести на другой компьютер.',
          )}
        </p>
        {!isTauri() ? (
          <p>{tr('Экспорт с вложениями и восстановление доступны в настольном приложении.')}</p>
        ) : !preview ? (
          <>
            <div className="dialog-actions">
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const path = await invoke<string | null>('export_atlas', {
                      countryId: null,
                      operationId: operationId.current,
                    });
                    setMessage(path ? tr('Архив сохранён: {0}', path) : tr('Экспорт отменён'));
                  })
                }
              >
                {tr('Экспорт всего атласа')}
              </button>
              {countryId && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const path = await invoke<string | null>('export_atlas', {
                        countryId,
                        operationId: operationId.current,
                      });
                      setMessage(path ? tr('Холст сохранён: {0}', path) : tr('Экспорт отменён'));
                    })
                  }
                >
                  {tr('Экспорт этой страны')}
                </button>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setPreview(
                      await invoke<Preview | null>('inspect_archive', {
                        operationId: operationId.current,
                      }),
                    );
                  })
                }
              >
                {tr('Открыть архив для восстановления')}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await invoke('open_backup_folder');
                  })
                }
              >
                {tr('Папка резервных копий')}
              </button>
            </div>
            <p className="panel-hint">
              {tr(
                'Автоматическая копия создаётся при сохранении, не чаще раза в час. Копии не удаляются автоматически. Перед экспортом откройте и перенесите прежние холсты из localStorage.',
              )}
            </p>
          </>
        ) : (
          <>
            <h3>{tr('Проверка архива завершена')}</h3>
            <p>
              {preview.countries.length} {' ' + tr('стран ·') + ' '}
              {preview.assets} {' ' + tr('вложений')}
            </p>
            <ul className="archive-countries">
              {preview.countries.map((c) => (
                <li key={c.countryId}>
                  {(() => {
                    const country = countries.find((x) => x.id === c.countryId);
                    return country ? countryName(country) : c.countryId;
                  })()}{' '}
                  — {c.count} {tr('объектов') + ' '}
                  {c.conflict && <strong>{tr('· уже существует')}</strong>}
                </li>
              ))}
            </ul>
            <label className="check-field">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
                disabled={busy}
              />
              {tr('Заменить существующие страны и общие оформления версиями из архива')}
            </label>
            <p className="panel-hint">
              {tr(
                'По умолчанию существующие страны пропускаются. Перед восстановлением будет создана копия текущего атласа.',
              )}
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await invoke<{
                    imported: number;
                    skipped: number;
                    backup?: string;
                  }>('apply_archive', {
                    token: preview.token,
                    replace,
                    operationId: operationId.current,
                  });
                  setPreview(null);
                  setMessage(
                    tr(
                      'Восстановлено стран: {0}. Пропущено: {1}.',
                      result.imported,
                      result.skipped,
                    ),
                  );
                  onRestored();
                })
              }
            >
              {tr('Восстановить')}
            </button>
          </>
        )}
        {busy && (
          <>
            <p role="status">{progress || tr('Выполняется операция…')}</p>
            <button
              onClick={() => {
                if (operationId.current)
                  void invoke('cancel_operation', { id: operationId.current });
                setProgress(tr('Отмена…'));
              }}
            >
              {tr('Остановить операцию')}
            </button>
          </>
        )}
        {message && (
          <p role="status" className="operation-message">
            {translateMessage(message)}
          </p>
        )}
        <div className="dialog-actions">
          <button
            disabled={busy}
            onClick={() => {
              if (preview) void invoke('cancel_archive', { token: preview.token });
              onClose();
            }}
          >
            {tr('Закрыть')}
          </button>
        </div>
      </section>
    </div>
  );
}
