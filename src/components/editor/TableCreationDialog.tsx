import { useState } from 'react';
import type { TableData } from '../../domain/scene';
import { createTable } from '../../domain/table';
import { t as tr } from '../../i18n/index';
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
        <h2>{tr('Новая таблица')}</h2>
        <label>
          {tr('Строки')}
          <input
            aria-label={tr('Количество строк')}
            type="number"
            min={1}
            max={200}
            required
            value={tableRows}
            onChange={(e) => setTableRows(Number(e.target.value))}
          />
        </label>
        <label>
          {tr('Столбцы')}
          <input
            aria-label={tr('Количество столбцов')}
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
            {tr('Отмена')}
          </button>
          <button type="submit">{tr('Создать таблицу')}</button>
        </div>
      </form>
    </div>
  );
}
