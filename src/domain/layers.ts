import type { CanvasItem } from './scene';
export function moveOneLayer(
  items: CanvasItem[],
  selected: string[],
  direction: 1 | -1,
): CanvasItem[] {
  const next = [...items],
    ids = new Set(selected);
  if (direction === 1) {
    for (let i = next.length - 2; i >= 0; i--)
      if (ids.has(next[i].id) && !ids.has(next[i + 1].id))
        [next[i], next[i + 1]] = [next[i + 1], next[i]];
  } else
    for (let i = 1; i < next.length; i++)
      if (ids.has(next[i].id) && !ids.has(next[i - 1].id))
        [next[i], next[i - 1]] = [next[i - 1], next[i]];
  return next;
}
export const isDomItem = (item: CanvasItem) =>
  ['table', 'video', 'audio', 'link'].includes(item.kind);
export function canvasRuns(items: CanvasItem[]) {
  const runs: { items: CanvasItem[]; zIndex: number }[] = [];
  let current: CanvasItem[] = [],
    start = 0;
  items.forEach((item, index) => {
    current.push(item);
    if (isDomItem(item)) {
      runs.push({ items: current, zIndex: index * 2 + 1 });
      current = [];
      start = index + 1;
    }
  });
  if (current.length) runs.push({ items: current, zIndex: start * 2 + 1 });
  return runs;
}
