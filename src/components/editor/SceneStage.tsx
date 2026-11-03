import type Konva from 'konva';
import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import { Layer, Rect, Stage, Transformer } from 'react-konva';
import { overlaps, zoomAt, type Bounds } from '../../domain/geometry';
import { canvasRuns } from '../../domain/layers';
import type { Camera, CanvasItem } from '../../domain/scene';
import type { EditorTool } from './editorTools';
type Props = {
  stageRef: RefObject<Konva.Stage | null>;
  transformerRef: RefObject<Konva.Transformer | null>;
  camera: Camera;
  size: { width: number; height: number };
  setCamera: Dispatch<SetStateAction<Camera>>;
  displayedItems: CanvasItem[];
  items: CanvasItem[];
  selected: string[];
  selectedItems: CanvasItem[];
  tool: EditorTool;
  viewOnly: boolean;
  spaceHeld: boolean;
  editing: boolean;
  selectionBox: Bounds | null;
  draftStroke: CanvasItem | null;
  bounds: (item: CanvasItem) => Bounds;
  viewport: () => Bounds;
  renderItem: (item: CanvasItem, draft?: boolean) => ReactNode;
  pointerDown: (event: Konva.KonvaEventObject<MouseEvent>) => void;
  pointerMove: (event: Konva.KonvaEventObject<MouseEvent>) => void;
  finishPointer: () => void;
  previewNodes: () => void;
  syncNodes: (ids: string[]) => void;
};
export default function SceneStage({
  stageRef,
  transformerRef,
  camera,
  size,
  setCamera,
  displayedItems,
  items,
  selected,
  selectedItems,
  tool,
  viewOnly,
  spaceHeld,
  editing,
  selectionBox,
  draftStroke,
  bounds,
  viewport,
  renderItem,
  pointerDown,
  pointerMove,
  finishPointer,
  previewNodes,
  syncNodes,
}: Props) {
  return (
    <Stage
      ref={stageRef}
      width={size.width}
      height={size.height}
      x={camera.x}
      y={camera.y}
      scaleX={camera.scale}
      scaleY={camera.scale}
      onWheel={(e) => {
        e.evt.preventDefault();
        if (editing) return;
        const p = stageRef.current?.getPointerPosition();
        if (p)
          setCamera((c) =>
            zoomAt(c, p, Math.exp(-Math.max(-100, Math.min(100, e.evt.deltaY)) * 0.002)),
          );
      }}
      onMouseDown={pointerDown}
      onMouseMove={pointerMove}
      onMouseUp={finishPointer}
      onMouseLeave={finishPointer}
    >
      {canvasRuns(
        displayedItems.filter(
          (i) =>
            !i.hidden &&
            (selected.includes(i.id) || overlaps(bounds(i), viewport(), 200 / camera.scale)),
        ),
      ).map((run, index) => (
        <Layer
          key={index}
          ref={(layer) => {
            if (layer) {
              layer.getCanvas()._canvas.style.zIndex = String(
                displayedItems.findIndex((i) => i.id === run.items[run.items.length - 1].id) * 2 +
                  1,
              );
              layer.getCanvas()._canvas.style.pointerEvents = 'none';
            }
          }}
        >
          {run.items.map((item) => renderItem(item))}
        </Layer>
      ))}
      <Layer
        ref={(layer) => {
          if (layer) {
            layer.getCanvas()._canvas.style.zIndex = String(items.length * 2 + 10);
            layer.getCanvas()._canvas.style.pointerEvents = 'none';
          }
        }}
      >
        {draftStroke && renderItem(draftStroke, true)}
        {selectionBox && (
          <Rect
            x={selectionBox.left}
            y={selectionBox.top}
            width={selectionBox.right - selectionBox.left}
            height={selectionBox.bottom - selectionBox.top}
            fill="#4f90ba22"
            stroke="#4f90ba"
            strokeWidth={1 / camera.scale}
            listening={false}
          />
        )}
        <Transformer
          ref={transformerRef}
          listening={!viewOnly && tool === 'select' && !spaceHeld && !editing}
          rotateEnabled
          flipEnabled={false}
          keepRatio={selectedItems.length === 1 && selectedItems[0].kind === 'image'}
          anchorSize={9}
          borderStroke="#bf882e"
          anchorStroke="#bf882e"
          anchorFill="#fff"
          onTransform={previewNodes}
          onTransformEnd={() => syncNodes(transformerRef.current?.nodes().map((n) => n.id()) ?? [])}
          boundBoxFunc={(old, next) =>
            Math.abs(next.width) < 8 || Math.abs(next.height) < 8 ? old : next
          }
        />
      </Layer>
    </Stage>
  );
}
