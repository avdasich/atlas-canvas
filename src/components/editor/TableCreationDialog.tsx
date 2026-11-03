import { useState } from 'react';
import type { TableData } from '../../domain/scene';
import { createTable } from '../../domain/table';
export default function TableCreationDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (table: TableData) => void;
}) {
  const [tableRows, setTableRows] = useState(3),
    [tableColumns, setTableColumns] = useState(3);
  if (!open) return null;
  return (
    <div className="dialog-backdrop">
      <form
        className="app-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (
            tableRows >= 1 &&
            tableRows <= 200 &&
            tableColumns >= 1 &&
            tableColumns <= 50 &&
            Number.isInteger(tableRows) &&
            Number.isInteger(tableColumns)
          ) {
            onCreate(createTable(tableRows, tableColumns));
          }
        }}
      >
        <h2>Новая таблица</h2>
        <label>
          Строки
          <input
            aria-label="Количество строк"
            type="number"
            min={1}
            max={200}
            required
            value={tableRows}
            onChange={(e) => setTableRows(Number(e.target.value))}
          />
        </label>
        <label>
          Столбцы
          <input
            aria-label="Количество столбцов"
            type="number"
            min={1}
            max={50}
            required
            value={tableColumns}
            onChange={(e) => setTableColumns(Number(e.target.value))}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={() => onClose()}>
            Отмена
          </button>
          <button type="submit">Создать таблицу</button>
        </div>
      </form>
    </div>
  );
}
