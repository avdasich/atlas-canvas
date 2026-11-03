import type { TableData } from './scene';
export function createTable(rows = 3, columns = 3): TableData {
  return {
    cells: Array.from({ length: rows }, () =>
      Array.from({ length: columns }, () => ({ text: '' })),
    ),
    columnWidths: Array(columns).fill(150),
    rowHeights: Array(rows).fill(44),
    header: true,
    borderColor: '#d2dce3',
    background: '#ffffff',
    color: '#243447',
    borderWidth: 1,
    fontSize: 16,
    padding: 10,
    radius: 10,
  };
}
export function addRow(t: TableData): TableData {
  return {
    ...t,
    cells: [...t.cells, t.columnWidths.map(() => ({ text: '' }))],
    rowHeights: [...t.rowHeights, 44],
  };
}
export function addColumn(t: TableData): TableData {
  return {
    ...t,
    cells: t.cells.map((row) => [...row, { text: '' }]),
    columnWidths: [...t.columnWidths, 150],
  };
}
export function removeRow(t: TableData, row: number): TableData {
  return t.cells.length < 2
    ? t
    : {
        ...t,
        merges: deleteMergedAxis(t, 'row', row),
        cells: t.cells.filter((_, i) => i !== row),
        rowHeights: t.rowHeights.filter((_, i) => i !== row),
      };
}
export function removeColumn(t: TableData, column: number): TableData {
  return t.columnWidths.length < 2
    ? t
    : {
        ...t,
        merges: deleteMergedAxis(t, 'column', column),
        cells: t.cells.map((row) => row.filter((_, i) => i !== column)),
        columnWidths: t.columnWidths.filter((_, i) => i !== column),
      };
}
export function tableSize(t: TableData) {
  return {
    width: t.columnWidths.reduce((a, b) => a + b, 0),
    height: 28 + t.rowHeights.reduce((a, b) => a + b, 0),
  };
}
export type CellMerge = { row: number; column: number; rows: number; columns: number };
export function mergeAt(t: TableData, row: number, column: number) {
  return t.merges?.find(
    (m) =>
      row >= m.row && row < m.row + m.rows && column >= m.column && column < m.column + m.columns,
  );
}
export function coveredCell(t: TableData, row: number, column: number) {
  const m = mergeAt(t, row, column);
  return !!m && (m.row !== row || m.column !== column);
}
export function mergeCells(
  t: TableData,
  row: number,
  column: number,
  rows: number,
  columns: number,
): TableData {
  if (
    ![row, column, rows, columns].every(Number.isInteger) ||
    row < 0 ||
    column < 0 ||
    rows < 1 ||
    columns < 1 ||
    row + rows > t.cells.length ||
    column + columns > t.columnWidths.length
  )
    throw new Error('Объединение выходит за границы таблицы.');
  let r0 = row,
    c0 = column,
    r1 = row + rows,
    c1 = column + columns;
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const m of t.merges ?? [])
      if (m.row < r1 && m.row + m.rows > r0 && m.column < c1 && m.column + m.columns > c0) {
        const next = [
          Math.min(r0, m.row),
          Math.min(c0, m.column),
          Math.max(r1, m.row + m.rows),
          Math.max(c1, m.column + m.columns),
        ];
        if (next.some((v, i) => v !== [r0, c0, r1, c1][i])) {
          [r0, c0, r1, c1] = next;
          expanded = true;
        }
      }
  }
  const merges = (t.merges ?? []).filter(
    (m) => !(m.row < r1 && m.row + m.rows > r0 && m.column < c1 && m.column + m.columns > c0),
  );
  if (r1 - r0 > 1 || c1 - c0 > 1)
    merges.push({ row: r0, column: c0, rows: r1 - r0, columns: c1 - c0 });
  return { ...t, merges };
}
export function splitCell(t: TableData, row: number, column: number): TableData {
  const m = mergeAt(t, row, column);
  return { ...t, merges: (t.merges ?? []).filter((v) => v !== m) };
}
export function deleteMergedAxis(t: TableData, axis: 'row' | 'column', index: number) {
  const size = axis === 'row' ? 'rows' : 'columns';
  return (t.merges ?? []).flatMap((m) => {
    const start = m[axis],
      count = m[size];
    const next = {
      ...m,
      [axis]: start > index ? start - 1 : start,
      [size]: index >= start && index < start + count ? count - 1 : count,
    };
    return next.rows > 0 && next.columns > 0 && (next.rows > 1 || next.columns > 1) ? [next] : [];
  });
}
export type TableStyle = Pick<
  TableData,
  | 'background'
  | 'color'
  | 'borderColor'
  | 'borderWidth'
  | 'fontSize'
  | 'padding'
  | 'radius'
  | 'header'
  | 'headerFill'
>;
export const tableStyles: { name: string; style: TableStyle }[] = [
  {
    name: 'Чистая',
    style: {
      background: '#ffffff',
      color: '#243447',
      borderColor: '#d2dce3',
      borderWidth: 1,
      fontSize: 16,
      padding: 10,
      radius: 10,
      header: true,
      headerFill: '#e7eef3',
    },
  },
  {
    name: 'Полночь',
    style: {
      background: '#24313f',
      color: '#edf4fc',
      borderColor: '#46596a',
      borderWidth: 1,
      fontSize: 16,
      padding: 12,
      radius: 14,
      header: true,
      headerFill: '#344b65',
    },
  },
  {
    name: 'Бумага',
    style: {
      background: '#fbf5e8',
      color: '#534537',
      borderColor: '#c9b89c',
      borderWidth: 1,
      fontSize: 17,
      padding: 12,
      radius: 4,
      header: true,
      headerFill: '#eadbc0',
    },
  },
  {
    name: 'Сад',
    style: {
      background: '#f3f8f2',
      color: '#254837',
      borderColor: '#b2cebb',
      borderWidth: 1,
      fontSize: 16,
      padding: 12,
      radius: 14,
      header: true,
      headerFill: '#cce4d2',
    },
  },
  {
    name: 'Лаванда',
    style: {
      background: '#f7f3ff',
      color: '#493866',
      borderColor: '#cec0e6',
      borderWidth: 1,
      fontSize: 16,
      padding: 12,
      radius: 16,
      header: true,
      headerFill: '#e3d8f6',
    },
  },
];
export function tableStyle(t: TableData): TableStyle {
  const {
    background,
    color,
    borderColor,
    borderWidth,
    fontSize,
    padding,
    radius,
    header,
    headerFill,
  } = t;
  return {
    background,
    color,
    borderColor,
    borderWidth,
    fontSize,
    padding,
    radius,
    header,
    headerFill,
  };
}
