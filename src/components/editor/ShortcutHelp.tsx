import { shortcutCatalog } from '../../domain/shortcuts';
export default function ShortcutHelp() {
  return (
    <details className="shortcut-help">
      <summary>Горячие клавиши · все ОС</summary>
      <p>
        Работают и при русской раскладке. В текстовых полях сочетания управляют вводом; сохранение
        доступно везде.
      </p>
      <table className="shortcut-table">
        <thead>
          <tr>
            <th>Действие</th>
            <th>macOS</th>
            <th>Windows / Linux</th>
          </tr>
        </thead>
        <tbody>
          {shortcutCatalog.map((row) => (
            <tr key={row.action}>
              <td>{row.description}</td>
              <td>{row.mac}</td>
              <td>{row.other}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
