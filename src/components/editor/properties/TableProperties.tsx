import type { CanvasItem, CellStyle, TableData, Theme } from '../../../domain/scene';
import {
  addColumn,
  addRow,
  mergeAt,
  mergeCells,
  removeColumn,
  removeRow,
  splitCell,
} from '../../../domain/table';
import { t as tr } from '../../../i18n/index';
import Numeric from '../controls/NumericField';
import type { CellSelection } from '../DomObjects';
import TableStyles from '../TableStyles';
export default function TableProperties({
  item,
  theme,
  cell,
  patch,
}: {
  item: CanvasItem;
  theme: Theme;
  cell: CellSelection | null;
  patch: (patch: Partial<CanvasItem>) => void;
}) {
  const table = item.table;
  if (!table) return null;
  const setTable = (table: TableData) => patch({ table });
  const cellStyle = (style: CellStyle) => {
    if (!cell) return;
    setTable({
      ...table,
      cells: table.cells.map((row, r) =>
        row.map((c, col) => (r === cell.row && col === cell.column ? { ...c, ...style } : c)),
      ),
    });
  };
  return (
    <details open className="table-properties">
      <summary>{tr('Таблица')}</summary>
      <TableStyles
        table={table}
        fontFamily={item?.fontFamily ?? theme.fontFamily}
        onChange={(table, fontFamily) => patch({ table, ...(fontFamily ? { fontFamily } : {}) })}
      />
      <div className="panel-actions">
        <button disabled={table.cells.length >= 200} onClick={() => setTable(addRow(table))}>
          {tr('+ Строка')}
        </button>
        <button
          disabled={table.columnWidths.length >= 50}
          onClick={() => setTable(addColumn(table))}
        >
          {tr('+ Столбец')}
        </button>
        <button
          disabled={!cell || table.cells.length <= 1}
          onClick={() => cell && setTable(removeRow(table, cell.row))}
        >
          {tr('Удалить строку')}
        </button>
        <button
          disabled={!cell || table.columnWidths.length <= 1}
          onClick={() => cell && setTable(removeColumn(table, cell.column))}
        >
          {tr('Удалить столбец')}
        </button>
      </div>
      <label className="check-field">
        <input
          type="checkbox"
          checked={table.header}
          onChange={(e) => setTable({ ...table, header: e.target.checked })}
        />
        {tr('Выделять первую строку')}
      </label>
      <label className="property-field">
        {tr('Фон таблицы')}
        <input
          type="color"
          value={table.background}
          onChange={(e) => setTable({ ...table, background: e.target.value })}
        />
      </label>
      <label className="property-field">
        {tr('Границы')}
        <input
          type="color"
          value={table.borderColor}
          onChange={(e) => setTable({ ...table, borderColor: e.target.value })}
        />
      </label>
      <Numeric
        label={tr('Толщина границ')}
        value={table.borderWidth}
        min={0}
        max={20}
        onChange={(borderWidth) => setTable({ ...table, borderWidth })}
      />
      <Numeric
        label={tr('Шрифт таблицы')}
        value={table.fontSize}
        min={6}
        max={200}
        onChange={(fontSize) => setTable({ ...table, fontSize })}
      />
      <Numeric
        label={tr('Отступ ячеек')}
        value={table.padding}
        min={0}
        max={100}
        onChange={(padding) => setTable({ ...table, padding })}
      />
      <Numeric
        label={tr('Скругление таблицы')}
        value={table.radius}
        min={0}
        max={100}
        onChange={(radius) => setTable({ ...table, radius })}
      />
      {cell && cell.row < table.cells.length && cell.column < table.columnWidths.length && (
        <fieldset>
          <legend>
            {tr('Ячейка') + ' '}
            {cell.row + 1}:{cell.column + 1}
          </legend>
          <label className="property-field">
            {tr('Фон ячейки')}
            <input
              aria-label={tr('Фон ячейки')}
              type="color"
              value={table.cells[cell.row][cell.column].fill ?? table.background}
              onChange={(e) => cellStyle({ fill: e.target.value })}
            />
          </label>
          <label className="property-field">
            {tr('Цвет текста ячейки')}
            <input
              type="color"
              value={table.cells[cell.row][cell.column].color ?? table.color}
              onChange={(e) => cellStyle({ color: e.target.value })}
            />
          </label>
          <label className="property-field">
            {tr('Выравнивание ячейки')}
            <select
              aria-label={tr('Выравнивание ячейки')}
              value={table.cells[cell.row][cell.column].align ?? 'left'}
              onChange={(e) => cellStyle({ align: e.target.value as CellStyle['align'] })}
            >
              <option value="left">{tr('Слева')}</option>
              <option value="center">{tr('По центру')}</option>
              <option value="right">{tr('Справа')}</option>
            </select>
          </label>
          <div className="panel-actions">
            <button
              disabled={
                cell.column + (mergeAt(table, cell.row, cell.column)?.columns ?? 1) >=
                table.columnWidths.length
              }
              onClick={() => {
                const m = mergeAt(table, cell.row, cell.column);
                setTable(
                  mergeCells(
                    table,
                    m?.row ?? cell.row,
                    m?.column ?? cell.column,
                    m?.rows ?? 1,
                    (m?.columns ?? 1) + 1,
                  ),
                );
              }}
            >
              {tr('Объединить с ячейкой справа')}
            </button>
            <button
              disabled={
                cell.row + (mergeAt(table, cell.row, cell.column)?.rows ?? 1) >= table.cells.length
              }
              onClick={() => {
                const m = mergeAt(table, cell.row, cell.column);
                setTable(
                  mergeCells(
                    table,
                    m?.row ?? cell.row,
                    m?.column ?? cell.column,
                    (m?.rows ?? 1) + 1,
                    m?.columns ?? 1,
                  ),
                );
              }}
            >
              {tr('Объединить с ячейкой снизу')}
            </button>
            <button
              disabled={!mergeAt(table, cell.row, cell.column)}
              onClick={() => setTable(splitCell(table, cell.row, cell.column))}
            >
              {tr('Разделить ячейки')}
            </button>
          </div>
          <p className="panel-hint">
            {tr('Текст скрытых ячеек сохраняется и возвращается при разделении.')}
          </p>
          <button onClick={() => cellStyle({ bold: !table.cells[cell.row][cell.column].bold })}>
            {tr('Жирный текст ячейки')}
          </button>
          <Numeric
            label={tr('Ширина столбца')}
            value={table.columnWidths[cell.column]}
            min={40}
            max={2000}
            onChange={(v) =>
              setTable({
                ...table,
                columnWidths: table.columnWidths.map((n, i) => (i === cell.column ? v : n)),
              })
            }
          />
          <Numeric
            label={tr('Высота строки')}
            value={table.rowHeights[cell.row]}
            min={24}
            max={2000}
            onChange={(v) =>
              setTable({
                ...table,
                rowHeights: table.rowHeights.map((n, i) => (i === cell.row ? v : n)),
              })
            }
          />
        </fieldset>
      )}
    </details>
  );
}
