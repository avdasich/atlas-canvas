import type Konva from 'konva';
import { useRef, useState, type RefObject } from 'react';
import { dimensions, overlaps, type Bounds } from '../domain/geometry';
import type { Camera, CanvasItem, ItemKind, Theme } from '../domain/scene';
type Options = {
  stageRef: RefObject<Konva.Stage | null>;
  camera: Camera;
  theme: Theme;
  items: CanvasItem[];
  tool: 'select' | 'pen' | 'eraser' | 'shape';
  shapeKind: ItemKind;
  spaceHeld: boolean;
  busy: boolean;
  editing: boolean;
  viewOnly: boolean;
  brush: { color: string; width: number; opacity: number };
  bounds: (item: CanvasItem) => Bounds;
  setCamera: (camera: Camera) => void;
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  changeItems: (change: (items: CanvasItem[]) => CanvasItem[]) => void;
  setMenu: (menu: null) => void;
  setTool: (tool: 'select') => void;
};
export function useCanvasPointer(options: Options) {
  const {
    stageRef,
    camera,
    theme,
    items,
    tool,
    shapeKind,
    spaceHeld,
    busy,
    editing,
    viewOnly,
    brush,
    bounds,
    setCamera,
    setSelected,
    changeItems,
    setMenu,
    setTool,
  } = options;
  const marquee = useRef<{ x: number; y: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<Bounds | null>(null);
  const shapeStart = useRef<{ x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const pan = useRef<{
    clientX: number;
    clientY: number;
    camera: Camera;
    moved: boolean;
    blank: boolean;
  } | null>(null);
  const drawing = useRef<CanvasItem | null>(null);
  const [draftStroke, setDraftStroke] = useState<CanvasItem | null>(null);
  function pointerWorld() {
    const p = stageRef.current?.getPointerPosition();
    return p ? { x: (p.x - camera.x) / camera.scale, y: (p.y - camera.y) / camera.scale } : null;
  }
  function pointerDown(event: Konva.KonvaEventObject<MouseEvent>) {
    if (busy || editing || viewOnly) return;
    setMenu(null);
    const blank = event.target === stageRef.current;
    if (blank && event.evt.shiftKey && event.evt.button === 0 && tool === 'select' && !spaceHeld) {
      const p = pointerWorld();
      if (p) {
        marquee.current = p;
        setSelectionBox({ left: p.x, top: p.y, right: p.x, bottom: p.y });
      }
      return;
    }
    if (
      event.evt.button === 1 ||
      (event.evt.button === 0 && (spaceHeld || (tool === 'select' && blank)))
    ) {
      event.evt.preventDefault();
      pan.current = {
        clientX: event.evt.clientX,
        clientY: event.evt.clientY,
        camera,
        moved: false,
        blank,
      };
      setPanning(true);
      return;
    }
    if (event.evt.button === 0 && tool === 'shape') {
      const p = pointerWorld();
      if (!p) return;
      shapeStart.current = p;
      drawing.current = {
        id: crypto.randomUUID(),
        kind: shapeKind,
        x: p.x,
        y: p.y,
        ...(shapeKind === 'line' || shapeKind === 'arrow' ? { points: [0, 0, 0.01, 0.01] } : {}),
      };
      setDraftStroke(drawing.current);
      return;
    }
    if (event.evt.button !== 0 || tool !== 'pen') return;
    const p = pointerWorld();
    if (!p) return;
    drawing.current = {
      id: crypto.randomUUID(),
      kind: 'stroke',
      x: p.x,
      y: p.y,
      points: [0, 0, 0.01, 0.01],
      stroke: brush.color,
      strokeWidth: brush.width,
      opacity: brush.opacity,
    };
    setDraftStroke(drawing.current);
  }
  function pointerMove(event: Konva.KonvaEventObject<MouseEvent>) {
    const p = pan.current;
    if (marquee.current) {
      const point = pointerWorld();
      if (point)
        setSelectionBox({
          left: Math.min(point.x, marquee.current.x),
          top: Math.min(point.y, marquee.current.y),
          right: Math.max(point.x, marquee.current.x),
          bottom: Math.max(point.y, marquee.current.y),
        });
      return;
    }
    if (p) {
      const dx = event.evt.clientX - p.clientX,
        dy = event.evt.clientY - p.clientY;
      if (Math.hypot(dx, dy) > 3) p.moved = true;
      if (p.moved) setCamera({ ...p.camera, x: p.camera.x + dx, y: p.camera.y + dy });
    } else if (drawing.current) {
      const point = pointerWorld();
      if (!point) return;
      const d = drawing.current;
      if (shapeStart.current) {
        const a = shapeStart.current,
          dx = point.x - a.x,
          dy = point.y - a.y;
        if (d.kind === 'line' || d.kind === 'arrow')
          drawing.current = { ...d, points: [0, 0, dx, dy] };
        else {
          const fixed = d.kind === 'circle' || d.kind === 'square';
          const width = Math.max(1, fixed ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.abs(dx)),
            height = Math.max(1, fixed ? width : Math.abs(dy));
          const base = dimensions(d);
          drawing.current = {
            ...d,
            x: a.x + (Math.sign(dx || 1) * width) / 2,
            y: a.y + (Math.sign(dy || 1) * height) / 2,
            scaleX: width / base.width,
            scaleY: height / base.height,
          };
        }
        setDraftStroke(drawing.current);
        return;
      }
      drawing.current = { ...d, points: [...d.points!, point.x - d.x, point.y - d.y] };
      setDraftStroke(drawing.current);
    }
  }
  function finishPointer() {
    if (marquee.current && selectionBox) {
      const ids = items
        .filter((i) => !i.hidden && overlaps(bounds(i), selectionBox, 0))
        .map((i) => i.id);
      setSelected((old) => [...new Set([...old, ...ids])]);
      marquee.current = null;
      setSelectionBox(null);
    }
    if (pan.current?.blank && !pan.current.moved) setSelected([]);
    pan.current = null;
    setPanning(false);
    if (drawing.current) {
      const stroke = drawing.current;
      changeItems((list) => [...list, stroke]);
      drawing.current = null;
      setDraftStroke(null);
      if (shapeStart.current) {
        shapeStart.current = null;
        setSelected([stroke.id]);
        if (!theme.repeatShape) setTool('select');
      }
    }
  }
  return { pointerDown, pointerMove, finishPointer, selectionBox, draftStroke, panning };
}
