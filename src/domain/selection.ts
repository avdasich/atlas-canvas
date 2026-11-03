import type { CanvasItem } from './scene';
/** Groups are selected as a unit; hidden members stay out of direct canvas selection. */
export function selectItem(
  items: CanvasItem[],
  selected: string[],
  item: CanvasItem,
  extend = false,
): string[] {
  const group = item.groupId
    ? items
        .filter((candidate) => candidate.groupId === item.groupId && !candidate.hidden)
        .map((candidate) => candidate.id)
    : [item.id];
  if (!extend) return group;
  return group.every((id) => selected.includes(id))
    ? selected.filter((id) => !group.includes(id))
    : [...new Set([...selected, ...group])];
}
