import type { RichRun } from './richText';
import type { CanvasItem } from './sceneTypes';
export type NoteDraft = { id: string; draft: string; richText?: RichRun[] };
export type TableDraft = { id: string; row: number; column: number; text: string };
export type SectionDraft = { id: string; sectionId: string; text: string };
/** Drafts are part of autosave/exit, but become one Undo step only when committed. */
export function applyContentDrafts(
  items: CanvasItem[],
  note: NoteDraft | null,
  table: TableDraft | null,
  section: SectionDraft | null,
) {
  return items.map((item) => {
    if (item.id === note?.id) return { ...item, content: note.draft, richText: note.richText };
    if (item.id === table?.id && item.table)
      return {
        ...item,
        table: {
          ...item.table,
          cells: item.table.cells.map((row, r) =>
            row.map((cell, c) =>
              r === table.row && c === table.column ? { ...cell, text: table.text } : cell,
            ),
          ),
        },
      };
    if (item.id === section?.id && item.sections)
      return {
        ...item,
        sections: item.sections.map((s) =>
          s.id === section.sectionId ? { ...s, content: section.text } : s,
        ),
      };
    return item;
  });
}
