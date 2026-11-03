import type { TableData } from './scene';
export function createTable(rows = 3, columns = 3): TableData {
  return { cells: Array.from({ length: rows }, () => Array.from({ length: columns }, () => ({ text: '' }))), columnWidths: Array(columns).fill(150), rowHeights: Array(rows).fill(44), header: true, borderColor: '#d2dce3', background: '#ffffff', color: '#243447', borderWidth: 1, fontSize: 16, padding: 10, radius: 10 };
}
export function addRow(t: TableData): TableData { return { ...t, cells: [...t.cells, t.columnWidths.map(() => ({ text: '' }))], rowHeights: [...t.rowHeights, 44] }; }
export function addColumn(t: TableData): TableData { return { ...t, cells: t.cells.map(row => [...row, { text: '' }]), columnWidths: [...t.columnWidths, 150] }; }
export function removeRow(t: TableData, row: number): TableData { return t.cells.length < 2 ? t : { ...t, cells: t.cells.filter((_, i) => i !== row), rowHeights: t.rowHeights.filter((_, i) => i !== row) }; }
export function removeColumn(t: TableData, column: number): TableData { return t.columnWidths.length < 2 ? t : { ...t, cells: t.cells.map(row => row.filter((_, i) => i !== column)), columnWidths: t.columnWidths.filter((_, i) => i !== column) }; }
export function tableSize(t: TableData) { return { width: t.columnWidths.reduce((a, b) => a + b, 0), height: 28 + t.rowHeights.reduce((a, b) => a + b, 0) }; }
