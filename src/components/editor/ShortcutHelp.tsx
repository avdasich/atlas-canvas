import { shortcutCatalog } from '../../domain/shortcuts';
import { t as tr } from '../../i18n/index';
export default function ShortcutHelp() {
  return (
    <details className="shortcut-help">
      <summary>{tr('Горячие клавиши · все ОС')}</summary>
      <p>
        {tr(
          'Работают и при русской раскладке. В текстовых полях сочетания управляют вводом; сохранение доступно везде.',
        )}
      </p>
      <table className="shortcut-table">
        <thead>
          <tr>
            <th>{tr('Действие')}</th>
            <th>macOS</th>
            <th>Windows / Linux</th>
          </tr>
        </thead>
        <tbody>
          {shortcutCatalog.map((row) => (
            <tr key={row.action}>
              <td>{tr(row.description)}</td>
              <td>{tr(row.mac)}</td>
              <td>{tr(row.other)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
