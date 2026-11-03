import type { CanvasItem } from './scene';
export function itemText(item: CanvasItem): string {
  return [item.title, item.content, item.url, ...(item.table?.cells.flatMap(row => row.map(c => c.text)) ?? [])].filter(Boolean).join('\n');
}
export function searchItems(items: CanvasItem[], query: string) {
  const needle = query.trim().toLocaleLowerCase('ru');
  if (!needle) return [];
  return items.flatMap(item => {
    const text = itemText(item), index = text.toLocaleLowerCase('ru').indexOf(needle);
    return index < 0 ? [] : [{ item, excerpt: `${index > 35 ? '…' : ''}${text.slice(Math.max(0, index - 35), index + needle.length + 80)}` }];
  });
}
