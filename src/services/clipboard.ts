import type { CanvasItem } from '../domain/scene';
let items: CanvasItem[] = [];
export const canvasClipboard = { write(value: CanvasItem[]) { items = structuredClone(value); }, read() { return structuredClone(items); } };
