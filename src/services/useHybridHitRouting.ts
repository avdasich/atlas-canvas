import type Konva from 'konva';
import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { isDomItem } from '../domain/layers';
import type { CanvasItem } from '../domain/scene';
/** Routes hits on vectors drawn above an HTML object back into Konva's normal event lifecycle. */
export function useHybridHitRouting(stageRef: RefObject<Konva.Stage | null>, items: CanvasItem[]) {
  const routedPointer = useRef(false);
  const forwardMouse = (
    type: string,
    e: {
      clientX: number;
      clientY: number;
      button: number;
      buttons: number;
      shiftKey: boolean;
      ctrlKey: boolean;
      metaKey: boolean;
      altKey: boolean;
    },
  ) => {
    stageRef.current?.content.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: e.clientX,
        clientY: e.clientY,
        button: e.button,
        buttons: e.buttons,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
      }),
    );
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (routedPointer.current) forwardMouse('mousemove', e);
    };
    const up = (e: PointerEvent) => {
      if (routedPointer.current) {
        forwardMouse('mouseup', e);
        routedPointer.current = false;
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);
  function vectorOverDom(target: EventTarget | null, event: MouseEvent | PointerEvent) {
    const stage = stageRef.current;
    if (!(target instanceof Element) || !target.closest('.dom-object') || !stage) return false;
    stage.setPointersPositions(event);
    const point = stage.getPointerPosition();
    const node = point && stage.getIntersection(point);
    if (!node) return false;
    if (node.getParent()?.getClassName() === 'Transformer') return true;
    const hit = node.hasName('canvas-item') ? node : node.findAncestor('.canvas-item');
    const item = items.find((i) => i.id === hit?.id());
    return !!item && !isDomItem(item);
  }
  return {
    onClickCapture(event: ReactMouseEvent<HTMLElement>) {
      if (vectorOverDom(event.target, event.nativeEvent)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    onPointerDownCapture(event: ReactPointerEvent<HTMLElement>) {
      if (vectorOverDom(event.target, event.nativeEvent)) {
        event.preventDefault();
        event.stopPropagation();
        if (
          document.activeElement instanceof HTMLElement &&
          document.activeElement.closest('.dom-object')
        )
          document.activeElement.blur();
        routedPointer.current = true;
        forwardMouse('mousedown', event);
      }
    },
    onDoubleClickCapture(event: ReactMouseEvent<HTMLElement>) {
      if (vectorOverDom(event.target, event.nativeEvent)) {
        event.preventDefault();
        event.stopPropagation();
        forwardMouse('dblclick', event);
      }
    },
  };
}
