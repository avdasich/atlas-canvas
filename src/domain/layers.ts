import { hasMaterial } from './materials';
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
  ['table', 'video', 'audio', 'link', 'disclosure'].includes(item.kind);
export function canvasRuns(items: CanvasItem[]) {
  const runs: { items: CanvasItem[]; zIndex: number }[] = [];
  let current: CanvasItem[] = [],
    overlay = false;
  // Adjacent invisible proxies share a hit layer instead of allocating a full
  // viewport canvas per glass/sparkling object. Visible vector runs stay separate.
  items.forEach((item, index) => {
    const nextOverlay = isDomItem(item) || hasMaterial(item);
    if (current.length && nextOverlay !== overlay) {
      runs.push({ items: current, zIndex: (index - 1) * 2 + 1 });
      current = [];
    }
    current.push(item);
    overlay = nextOverlay;
  });
  if (current.length) runs.push({ items: current, zIndex: (items.length - 1) * 2 + 1 });
  return runs;
}
