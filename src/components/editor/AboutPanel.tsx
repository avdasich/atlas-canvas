import { useEffect, useState } from 'react';
import pkg from '../../../package.json';
import { t as tr, translateMessage } from '../../i18n/index';
type Notice = {
  ecosystem: string;
  name: string;
  version: string;
  license: string;
  files: { name: string; text: string }[];
};
export default function AboutPanel({ onClose }: { onClose: () => void }) {
  const [notices, setNotices] = useState<Notice[]>([]),
    [query, setQuery] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void fetch('/licenses/notices.json')
      .then((r) => {
        if (!r.ok) throw new Error(tr('Не удалось открыть лицензии'));
        return r.json();
      })
      .then((data: Notice[]) => {
        if (active) setNotices(data);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, []);
  const found = notices.filter((n) =>
    `${n.name} ${n.license}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="dialog-backdrop">
      <section
        className="app-dialog about-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={tr('О программе и лицензии')}
      >
        <h2>Atlas Canvas · {pkg.version}</h2>
        <p>
          {tr(
            'Личный атлас с отдельным холстом для каждой страны. Сцены и импортированные файлы сохраняются на этом компьютере.',
          )}
        </p>
        <p>
          {tr(
            'Встроенные шрифты Noto Sans и Noto Serif: SIL Open Font License 1.1. Карта: Natural Earth / World Atlas; границы и покрытие отражают выбранный источник. С ростом масштаба подключается более детальная геометрия.',
          )}
        </p>
        <h3>{tr('Лицензии компонентов')}</h3>
        <input
          aria-label={tr('Поиск лицензии')}
          placeholder={tr('Название компонента или лицензия…')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error && <p role="alert">{translateMessage(error)}</p>}
        <p>
          {found.length} {' ' + tr('компонентов')}
        </p>
        <div className="license-list">
          {found.map((n, i) => (
            <details key={`${n.ecosystem}-${n.name}-${n.version}-${i}`}>
              <summary>
                {n.name} · {n.version} · {n.license}
              </summary>
              {n.files.length ? (
                n.files.map((f, j) => (
                  <div key={j}>
                    <strong>{f.name}</strong>
                    <pre>{f.text}</pre>
                  </div>
                ))
              ) : (
                <p>{tr('Идентификатор лицензии указан в метаданных пакета.')}</p>
              )}
            </details>
          ))}
        </div>
        <div className="dialog-actions">
          <button onClick={onClose}>{tr('Закрыть')}</button>
        </div>
      </section>
    </div>
  );
}
