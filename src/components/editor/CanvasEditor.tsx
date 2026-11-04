import { invoke, isTauri } from '@tauri-apps/api/core';
import Konva from 'konva';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Country } from '../../domain/countries';
import { applyImageCrop, fullImage } from '../../domain/crop';
import { createSection } from '../../domain/disclosure';
import { applyContentDrafts, type SectionDraft } from '../../domain/drafts';
import {
  arrangeItems,
  dimensions,
  fitCamera,
  itemBounds,
  overlaps,
  placeItem,
  zoomAt,
  type Bounds,
} from '../../domain/geometry';
import { moveOneLayer } from '../../domain/layers';
import { hasMaterial } from '../../domain/materials';
import type { RichRun } from '../../domain/richText';
import {
  validUrl,
  type Camera,
  type CanvasItem,
  type ItemKind,
  type Scene,
  type Theme,
} from '../../domain/scene';
import { selectItem } from '../../domain/selection';
import { snapPosition } from '../../domain/snapping';
import { createTable } from '../../domain/table';
import { canvasClipboard } from '../../services/clipboard';
import { flushBeforeExit } from '../../services/exitGuard';
import { exportCanvas } from '../../services/exportCanvas';
import { repository } from '../../services/SceneRepository';
import { useCanvasPointer } from '../../services/useCanvasPointer';
import { useCanvasTransfers } from '../../services/useCanvasTransfers';
import { useEditorShortcuts } from '../../services/useEditorShortcuts';
import { useFonts } from '../../services/useFonts';
import { useHybridHitRouting } from '../../services/useHybridHitRouting';
import { useScene } from '../../services/useScene';
import { commit, createHistory, redo, undo } from '../../state/history';
import AboutPanel from './AboutPanel';
import ArchivePanel from './ArchivePanel';
import CanvasBackground from './CanvasBackground';
import CanvasNavigator from './CanvasNavigator';
import DomObject, { type CellSelection } from './DomObjects';
import EditorToolbar, { type ToolbarMenuItem } from './EditorToolbar';
import { shapeLabels, type EditorTool } from './editorTools';
import ImageCropDialog from './ImageCropDialog';
import { ItemView, richLayout, textConfig } from './ItemView';
import LinkDialog from './LinkDialog';
import ObjectMaterial from './ObjectMaterial';
import PropertiesPanel from './PropertiesPanel';
import RevisionsPanel from './RevisionsPanel';
import RichTextEditor from './RichTextEditor';
import SceneStage from './SceneStage';
import SearchPanel from './SearchPanel';
import TableCreationDialog from './TableCreationDialog';
import ToolRail from './ToolRail';

Konva.dragButtons = [0];
type Props = { country: Country; onBack: () => void };
type Composition = { items: CanvasItem[]; theme: Theme };

/**
 * Coordinates scene history, camera and selection. Transient pointer previews are
 * committed once at gesture end; draft input also participates in autosave.
 * Transfers, keyboard/mouse lifecycles, rendering and property panels live in their own modules.
 */
export default function CanvasEditor({
  country,
  onBack,
  initial,
  storage,
}: Props & { initial: Scene; storage: ReturnType<typeof useScene> }) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const lastCamera = useRef(initial.camera);
  const fontLibrary = useFonts();
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [brush, setBrush] = useState({ color: '#365b77', width: 3, opacity: 1 });
  const [archiveOpen, setArchiveOpen] = useState(false),
    [revisionsOpen, setRevisionsOpen] = useState(false),
    [searchOpen, setSearchOpen] = useState(false);
  const [croppingId, setCroppingId] = useState<string | null>(null);
  const [sectionDraft, setSectionDraft] = useState<SectionDraft | null>(null);
  const [cell, setCell] = useState<CellSelection | null>(null);
  const [tableDraft, setTableDraft] = useState<{
    id: string;
    row: number;
    column: number;
    text: string;
  } | null>(null);
  const [gesture, setGesture] = useState<{ ids: string[]; dx: number; dy: number } | null>(null);
  const gestureCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => gestureCleanup.current?.(), []);
  const [history, setHistory] = useState(() =>
    createHistory<Composition>({ items: initial.items, theme: initial.theme }),
  );
  const { items, theme } = history.present;
  const [camera, setCamera] = useState<Camera>(initial.camera);
  const [selected, setSelected] = useState<string[]>([]);
  const [tool, setTool] = useState<EditorTool>('select');
  const [shapeKind, setShapeKind] = useState<ItemKind>('rectangle');
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [editing, setEditing] = useState<{
    id: string;
    draft: string;
    richText?: RichRun[];
  } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [showProperties, setShowProperties] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const drag = useRef<{ id: string; x: number; y: number; ids: string[] } | null>(null);
  const [liveTransforms, setLiveTransforms] = useState<Record<string, Partial<CanvasItem>>>({});
  const displayedItems = items.map((i) =>
    liveTransforms[i.id] || gesture?.ids.includes(i.id)
      ? {
          ...i,
          ...liveTransforms[i.id],
          ...(gesture?.ids.includes(i.id) ? { x: i.x + gesture.dx, y: i.y + gesture.dy } : {}),
        }
      : i,
  );
  const itemInteraction = useMemo(
    () => ({}),
    [
      items,
      theme,
      selected,
      tool,
      spaceHeld,
      busy,
      viewOnly,
      editing?.id,
      camera.scale,
      fontLibrary.loadedAt,
      fontLibrary.fonts,
    ],
  );
  const selectedItems = items.filter((item) => selected.includes(item.id));
  const editingItem = items.find((item) => item.id === editing?.id);
  const nodes = () => stageRef.current?.find('.canvas-item') ?? [];
  const nodeFor = (id: string) => nodes().find((node) => node.id() === id);

  useEffect(() => {
    let active = true;
    setBackgroundUrl('');
    if (theme.backgroundAssetId && theme.backgroundType === 'image')
      void repository
        .imageUrl(theme.backgroundAssetId)
        .then((url) => {
          if (active) setBackgroundUrl(url);
        })
        .catch((e) => setMessage(String(e)));
    return () => {
      active = false;
    };
  }, [theme.backgroundAssetId, theme.backgroundType]);
  const textMeasurements = useRef(new Map<string, { width: number; height: number }>());
  const measureText = (item: CanvasItem) => {
    const cacheKey = JSON.stringify([
      textConfig(item, theme.fontFamily),
      item.richText,
      fontLibrary.loadedAt,
      fontLibrary.fonts,
    ]);
    const cached = textMeasurements.current.get(cacheKey);
    if (cached) return cached;
    if (item.richText) return richLayout(item, theme.fontFamily);
    const text = new Konva.Text(textConfig(item, theme.fontFamily));
    const size = { width: text.width(), height: text.height() };
    text.destroy();
    if (textMeasurements.current.size > 1000) textMeasurements.current.clear();
    textMeasurements.current.set(cacheKey, size);
    return size;
  };
  const bounds = (item: CanvasItem) => itemBounds(item, measureText);
  // Read-only sections may expand locally without changing the stored geometry.
  const domBounds = (item: CanvasItem) =>
    bounds(
      item.kind === 'disclosure' && (viewOnly || item.locked)
        ? { ...item, sections: item.sections?.map((s) => ({ ...s, collapsed: false })) }
        : item,
    );
  const viewport = (): Bounds => ({
    left: -camera.x / camera.scale,
    top: -camera.y / camera.scale,
    right: (size.width - camera.x) / camera.scale,
    bottom: (size.height - camera.y) / camera.scale,
  });
  // Glass panels float over the scene; keep new objects and Fit in the free area.
  const frame = {
    left: theme.glassPanels && !viewOnly ? 78 : 0,
    right:
      theme.glassPanels && !viewOnly && showProperties && size.width > 650
        ? Math.min(272, Math.max(180, size.width * 0.28)) + 20
        : 0,
  };
  const usableViewport = (): Bounds => ({
    ...viewport(),
    left: (frame.left - camera.x) / camera.scale,
    right: (size.width - frame.right - camera.x) / camera.scale,
  });
  const fitInEditor = (list: Bounds[]) => {
    const next = fitCamera(list, {
      width: Math.max(1, size.width - frame.left - frame.right),
      height: size.height,
    });
    return { ...next, x: next.x + frame.left };
  };
  const change = (fn: (composition: Composition) => Composition) =>
    setHistory((h) => {
      const next = fn(h.present);
      return commit(h, {
        ...next,
        items: next.items.map((item) =>
          h.present.items.find((i) => i.id === item.id) === item
            ? item
            : { ...item, updatedAt: new Date().toISOString() },
        ),
      });
    });
  const changeItems = (fn: (items: CanvasItem[]) => CanvasItem[]) =>
    change((c) => ({ ...c, items: fn(c.items) }));
  const setTheme = (next: Theme) => change((c) => ({ ...c, theme: next }));
  const showAll = (list = items) => {
    lastCamera.current = camera;
    setCamera(fitInEditor(list.filter((i) => !i.hidden).map(bounds)));
  };
  const performUndo = () => {
    setHistory(undo);
    setSelected([]);
    setEditing(null);
  };
  const performRedo = () => {
    setHistory(redo);
    setSelected([]);
    setEditing(null);
  };

  useLayoutEffect(() => {
    const currentItems = applyContentDrafts(
      history.present.items,
      editing,
      tableDraft,
      sectionDraft,
    );
    storage.schedule({
      schemaVersion: 5,
      items: currentItems,
      theme: history.present.theme,
      camera,
    });
  }, [history.present, camera, editing, tableDraft, sectionDraft, storage.schedule]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      }),
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    transformerRef.current?.nodes(
      nodes().filter(
        (node) =>
          selected.includes(node.id()) &&
          !items.find((i) => i.id === node.id())?.locked &&
          !items.find((i) => i.id === node.id())?.hidden,
      ),
    );
    transformerRef.current?.getLayer()?.batchDraw();
  }, [selected, items, tool, spaceHeld, camera]);

  function baseSize(item: CanvasItem) {
    if (item.kind === 'note') return measureText(item);
    if (item.points) {
      const b = itemBounds({ ...item, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
      return { width: Math.max(1, b.right - b.left), height: Math.max(1, b.bottom - b.top) };
    }
    return dimensions(item);
  }
  function reveal(item: CanvasItem) {
    const b = bounds(item),
      view = usableViewport();
    if (b.left < view.left || b.top < view.top || b.right > view.right || b.bottom > view.bottom)
      setCamera(fitInEditor([b]));
  }
  function add(kind: ItemKind, table?: ReturnType<typeof createTable>) {
    if (shapeLabels.some(([value]) => value === kind) && theme.drawShapes) {
      setShapeKind(kind);
      setTool('shape');
      setSelected([]);
      setMenu(null);
      return;
    }
    const item: CanvasItem = { id: crypto.randomUUID(), kind, x: 0, y: 0 };
    if (kind === 'table') item.table = table ?? createTable();
    if (kind === 'disclosure') {
      item.title = 'Сноски';
      item.sections = [createSection('Подробнее'), createSection('Источники')];
    }
    if (kind === 'note') {
      item.content = 'Новая заметка';
      item.fontSize = 28;
      item.fill = theme.textColor ?? '#243447';
    }
    if (kind === 'arrow' || kind === 'line') item.points = [0, 0, 160, 0];
    const placed = placeItem(item, items, usableViewport(), measureText);
    changeItems((list) => [...list, placed]);
    setSelected([placed.id]);
    setCell(null);
    setTool('select');
    setMenu(null);
    reveal(placed);
    if (kind === 'note') setEditing({ id: placed.id, draft: placed.content! });
  }
  function patch(p: Partial<CanvasItem>) {
    changeItems((list) =>
      list.map((item) => (selected.includes(item.id) ? { ...item, ...p } : item)),
    );
  }
  function remove() {
    changeItems((list) => list.filter((item) => !selected.includes(item.id) || item.locked));
    setSelected([]);
    setMenu(null);
  }
  function duplicate(source = selectedItems) {
    let next = [...items];
    const ids: string[] = [];
    const groups = new Map<string, string>();
    for (const item of source) {
      if (item.groupId && !groups.has(item.groupId)) groups.set(item.groupId, crypto.randomUUID());
      const placed = placeItem(
        {
          ...item,
          id: crypto.randomUUID(),
          groupId: item.groupId ? groups.get(item.groupId) : undefined,
          locked: false,
          hidden: false,
        },
        next,
        usableViewport(),
        measureText,
      );
      next.push(placed);
      ids.push(placed.id);
    }
    changeItems(() => next);
    setSelected(ids);
    setMenu(null);
    if (ids.length) reveal(next[next.length - 1]);
  }
  function layer(front: boolean) {
    changeItems((list) => {
      const chosen = list.filter((i) => selected.includes(i.id)),
        other = list.filter((i) => !selected.includes(i.id));
      return front ? [...other, ...chosen] : [...chosen, ...other];
    });
    setMenu(null);
  }
  function arrange() {
    if (items.some((i) => i.locked)) {
      setMessage('Снимите блокировку объектов перед общей раскладкой.');
      return;
    }
    const next = arrangeItems(items, usableViewport(), measureText);
    changeItems(() => next);
    showAll(next);
    setMenu(null);
  }
  function finishText(cancel = false) {
    if (!editing) return;
    if (!cancel)
      changeItems((list) =>
        list.map((i) =>
          i.id === editing.id ? { ...i, content: editing.draft, richText: editing.richText } : i,
        ),
      );
    setEditing(null);
  }
  async function back() {
    setBusy(true);
    const currentItems = applyContentDrafts(items, editing, tableDraft, sectionDraft);
    storage.schedule({ schemaVersion: 5, items: currentItems, theme, camera });
    try {
      await storage.flush();
      onBack();
    } catch {
      setBusy(false);
    }
  }
  const [tableCreator, setTableCreator] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false),
    [linkKind, setLinkKind] = useState<'link' | 'image' | 'video' | 'audio'>('link'),
    [linkUrl, setLinkUrl] = useState(''),
    [linkTitle, setLinkTitle] = useState('');
  const {
    importPhotos,
    downloadUrl,
    exportImage,
    importBackground,
    replaceAsset,
    importMedia,
    downloadId,
    photoCancel,
    photoImporting,
    downloadProgress,
    setDownloadProgress,
  } = useCanvasTransfers({
    items,
    theme,
    viewport: usableViewport,
    measureText,
    changeItems,
    setSelected: (ids) => {
      setSelected(ids);
      setTool('select');
    },
    setTool,
    setTheme,
    setBusy,
    setMessage,
    reveal,
    showAll,
    getSavedScene: async () => {
      await flushBeforeExit();
      return (await repository.load(country)).scene;
    },
    closeLinkDialog: () => setLinkOpen(false),
  });
  function startDomDrag(item: CanvasItem, event: ReactPointerEvent) {
    const startX = event.clientX,
      startY = event.clientY;
    const ids = (selected.includes(item.id) ? selected : selectItem(items, selected, item)).filter(
      (id) => !items.find((i) => i.id === id)?.locked,
    );
    let dx = 0,
      dy = 0;
    const move = (e: PointerEvent) => {
      dx = (e.clientX - startX) / camera.scale;
      dy = (e.clientY - startY) / camera.scale;
      setGesture({ ids, dx, dy });
    };
    const finish = () => {
      if (dx !== 0 || dy !== 0)
        changeItems((list) =>
          list.map((i) =>
            ids.includes(i.id)
              ? { ...i, ...snapPosition(i.x + dx, i.y + dy, theme, camera.scale) }
              : i,
          ),
        );
      setGesture(null);
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      gestureCleanup.current = null;
    };
    gestureCleanup.current?.();
    gestureCleanup.current = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('pointercancel', finish, { once: true });
  }
  const { pointerDown, pointerMove, finishPointer, selectionBox, draftStroke, panning } =
    useCanvasPointer({
      stageRef,
      camera,
      theme,
      items,
      tool,
      shapeKind,
      spaceHeld,
      busy,
      editing: !!editing,
      viewOnly,
      brush,
      bounds,
      setCamera,
      setSelected,
      changeItems,
      setMenu,
      setTool,
    });
  useEditorShortcuts({
    blocked:
      busy || archiveOpen || revisionsOpen || linkOpen || tableCreator || aboutOpen || !!croppingId,
    editing: !!editing,
    viewOnly,
    space: setSpaceHeld,
    finishPointer,
    perform(action, step) {
      switch (action) {
        case 'select':
          setTool('select');
          break;
        case 'pen':
        case 'eraser':
          setTool(action);
          setSelected([]);
          break;
        case 'text':
          add('note');
          break;
        case 'rectangle':
        case 'ellipse':
          add(action);
          break;
        case 'fit':
          showAll();
          break;
        case 'actualSize':
          setCamera((c) => zoomAt(c, { x: size.width / 2, y: size.height / 2 }, 1 / c.scale));
          break;
        case 'undo':
          performUndo();
          break;
        case 'redo':
          performRedo();
          break;
        case 'selectAll':
          setSelected(items.filter((i) => !i.hidden).map((i) => i.id));
          break;
        case 'duplicate':
          duplicate();
          break;
        case 'copy':
        case 'cut':
          canvasClipboard.write(selectedItems);
          if (action === 'cut') remove();
          break;
        case 'paste':
          duplicate(canvasClipboard.read());
          break;
        case 'group':
        case 'ungroup':
          patch({ groupId: action === 'group' ? crypto.randomUUID() : undefined });
          break;
        case 'search':
          setSearchOpen(true);
          break;
        case 'remove':
          remove();
          break;
        case 'save':
          void flushBeforeExit()
            .then(() => setMessage('Сохранено'))
            .catch((e) => setMessage(String(e)));
          break;
        case 'archive':
          setArchiveOpen(true);
          break;
        case 'export':
          void exportImage('png', 'all');
          break;
        case 'presentation':
          setViewOnly((v) => !v);
          setSelected([]);
          break;
        case 'properties':
          setShowProperties((v) => !v);
          break;
        case 'raise':
        case 'lower':
          changeItems((list) => moveOneLayer(list, selected, action === 'raise' ? 1 : -1));
          break;
        case 'front':
        case 'back':
          layer(action === 'front');
          break;
        case 'lock':
          patch({ locked: !selectedItems.every((i) => i.locked) });
          break;
        case 'hide':
          patch({ hidden: !selectedItems.every((i) => i.hidden) });
          break;
        case 'left':
        case 'right':
        case 'up':
        case 'down':
          changeItems((list) =>
            list.map((i) =>
              selected.includes(i.id) && !i.locked
                ? {
                    ...i,
                    x: i.x + (action === 'left' ? -step : action === 'right' ? step : 0),
                    y: i.y + (action === 'up' ? -step : action === 'down' ? step : 0),
                  }
                : i,
            ),
          );
          break;
        case 'escape':
          setSearchOpen(false);
          setSelected([]);
          setTool('select');
          setMenu(null);
          break;
      }
    },
  });

  function previewNodes() {
    const updates: Record<string, Partial<CanvasItem>> = {};
    for (const n of nodes())
      if (selected.includes(n.id()))
        updates[n.id()] = {
          x: n.x(),
          y: n.y(),
          scaleX: n.scaleX(),
          scaleY: n.scaleY(),
          rotation: n.rotation(),
        };
    setLiveTransforms(updates);
  }
  function syncNodes(ids: string[]) {
    const updates = new Map(
      ids.flatMap((id) => {
        const node = nodeFor(id);
        return node
          ? [
              [
                id,
                {
                  ...snapPosition(node.x(), node.y(), theme, camera.scale),
                  scaleX: node.scaleX(),
                  scaleY: node.scaleY(),
                  rotation: node.rotation(),
                },
              ] as const,
            ]
          : [];
      }),
    );
    changeItems((list) =>
      list.map((item) =>
        updates.has(item.id) && !item.locked ? { ...item, ...updates.get(item.id) } : item,
      ),
    );
    setLiveTransforms({});
  }
  function renderItem(item: CanvasItem, draft = false) {
    const common = {
      id: item.id,
      name: 'canvas-item',
      x: item.x,
      y: item.y,
      scaleX: item.scaleX ?? 1,
      scaleY: item.scaleY ?? 1,
      rotation: item.rotation ?? 0,
      opacity: item.opacity ?? 1,
      visible: !item.hidden && editing?.id !== item.id,
      shadowColor: '#000000',
      shadowOpacity: 0.22,
      shadowBlur: item.shadowBlur ?? 0,
      draggable: !viewOnly && !draft && !item.locked && tool === 'select' && !spaceHeld && !busy,
      listening:
        !viewOnly &&
        !item.hidden &&
        !draft &&
        (tool === 'select' || (tool === 'eraser' && item.kind === 'stroke')) &&
        !spaceHeld &&
        !busy,
      onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (e.evt.button !== 0 || spaceHeld) return;
        // End property input before taking a canvas gesture; keyboard actions
        // must not remain focused in the last checkbox or numeric field.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        e.evt.preventDefault();
        if (tool === 'eraser') {
          if (!item.locked && item.kind === 'stroke')
            changeItems((list) => list.filter((i) => i.id !== item.id));
          return;
        }
        if (e.evt.shiftKey || !selected.includes(item.id))
          setSelected((ids) => selectItem(items, ids, item, e.evt.shiftKey));
      },
      onDblClick: () => {
        if (item.kind === 'note' && !item.locked)
          setEditing({ id: item.id, draft: item.content ?? '', richText: item.richText });
      },
      onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => {
        const ids = (selected.includes(item.id) ? selected : [item.id]).filter(
          (id) => !items.find((i) => i.id === id)?.locked,
        );
        setSelected(ids);
        drag.current = { id: item.id, x: e.target.x(), y: e.target.y(), ids };
      },
      onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
        if (!drag.current) return;
        const d = drag.current;
        for (const id of d.ids) {
          if (id === d.id) continue;
          const original = items.find((i) => i.id === id);
          const node = nodeFor(id);
          if (original && node)
            node.position({
              x: original.x + e.target.x() - d.x,
              y: original.y + e.target.y() - d.y,
            });
        }
        previewNodes();
      },
      onDragEnd: () => {
        syncNodes(drag.current?.ids ?? [item.id]);
        drag.current = null;
      },
    };
    return (
      <ItemView
        interaction={itemInteraction}
        key={`${item.id}-${item.kind === 'note' ? `${fontLibrary.loadedAt}-${fontLibrary.fonts.length}` : ''}`}
        textColor={theme.textColor ?? '#243447'}
        item={item}
        common={hasMaterial(item) ? { ...common, opacity: 0 } : common}
        fontFamily={theme.fontFamily}
      />
    );
  }
  const hitRouting = useHybridHitRouting(stageRef, items);
  function submitLink() {
    if (linkKind !== 'link') {
      void downloadUrl(linkKind, linkUrl, linkTitle);
      return;
    }
    if (!validUrl(linkUrl)) {
      setMessage('Введите полный http/https адрес');
      return;
    }
    const item = placeItem(
      {
        id: crypto.randomUUID(),
        kind: 'link',
        title: linkTitle || new URL(linkUrl).hostname,
        url: linkUrl,
        x: 0,
        y: 0,
      },
      items,
      usableViewport(),
      measureText,
    );
    changeItems((list) => [...list, item]);
    setSelected([item.id]);
    reveal(item);
    setLinkOpen(false);
  }
  const fileMenu: ToolbarMenuItem[] = [
    { label: 'О программе и лицензии', onClick: () => setAboutOpen(true) },
    {
      label: 'Показать выделенное',
      onClick: () => setCamera(fitInEditor(selectedItems.map(bounds))),
      disabled: !selectedItems.length,
    },
    { label: 'Предыдущий вид', onClick: () => setCamera(lastCamera.current) },
    { label: 'Архив и восстановление', onClick: () => setArchiveOpen(true) },
    { label: 'Версии холста', onClick: () => setRevisionsOpen(true) },
    { label: 'PNG всего холста', onClick: () => void exportImage('png', 'all') },
    { label: 'PNG видимой области', onClick: () => void exportImage('png', 'viewport') },
    { label: 'PDF всего холста', onClick: () => void exportImage('pdf', 'all') },
    { label: 'PDF по страницам', onClick: () => void exportImage('pdf-pages', 'all') },
    {
      label: 'PNG выбранной таблицы',
      onClick: async () => {
        try {
          const result = await exportCanvas(
            { schemaVersion: 5, items: selectedItems, theme, camera },
            viewport(),
            'all',
            'png',
          );
          setMessage(result ? `Таблица сохранена: ${result}` : 'Экспорт отменён');
        } catch (e) {
          setMessage(String(e));
        }
      },
      disabled: selectedItems.length !== 1 || selectedItems[0].kind !== 'table',
    },
    {
      label: 'Выделить всё',
      onClick: () => {
        setSelected(items.filter((i) => !i.hidden).map((i) => i.id));
      },
    },
    {
      label: 'Копировать объекты',
      onClick: () => canvasClipboard.write(selectedItems),
      disabled: !selectedItems.length,
    },
    { label: 'Вставить объекты', onClick: () => duplicate(canvasClipboard.read()) },
  ];
  return (
    <main
      aria-busy={busy}
      className={`country-workspace ${viewOnly ? 'view-only' : ''} ${theme.glassPanels ? 'glass-panels' : ''}`}
    >
      {viewOnly && (
        <button className="leave-view" onClick={() => setViewOnly(false)}>
          Вернуться к редактированию · Esc
        </button>
      )}
      <EditorToolbar
        countryName={country.name}
        busy={busy}
        canUndo={!!history.past.length && !editing}
        canRedo={!!history.future.length && !editing}
        onBack={back}
        onUndo={performUndo}
        onRedo={performRedo}
        onFit={() => showAll()}
        onView={() => {
          setViewOnly(true);
          setSelected([]);
        }}
        onSearch={() => setSearchOpen((v) => !v)}
        properties={showProperties}
        onProperties={() => setShowProperties((v) => !v)}
        menu={fileMenu}
      />
      {(storage.error || message) && (
        <div
          className={`editor-notice ${storage.error ? 'error' : ''}`}
          role={storage.error ? 'alert' : 'status'}
        >
          {storage.error || message}
          <button
            onClick={() => (storage.error ? void storage.flush().catch(() => {}) : setMessage(''))}
          >
            {storage.error ? 'Повторить сохранение' : 'Закрыть'}
          </button>
        </div>
      )}
      {busy && !linkOpen && (downloadId.current || photoImporting) && (
        <div className="operation-bar" role="status">
          <span>{photoImporting ? 'Копирование фотографий…' : `Импорт: ${downloadProgress}`}</span>
          <button
            onClick={() => {
              if (photoImporting) photoCancel.current = true;
              else if (downloadId.current)
                void invoke('cancel_operation', { id: downloadId.current });
              setDownloadProgress('Отмена…');
            }}
          >
            {photoImporting ? 'Остановить после текущего фото' : 'Остановить операцию'}
          </button>
        </div>
      )}
      {fontLibrary.error && (
        <div role="status" className="editor-notice">
          {fontLibrary.error}
        </div>
      )}
      {tool === 'pen' && (
        <div className="brush-bar">
          <label>
            Цвет{' '}
            <input
              aria-label="Цвет карандаша"
              type="color"
              value={brush.color}
              onChange={(e) => setBrush({ ...brush, color: e.target.value })}
            />
          </label>
          <label>
            Толщина{' '}
            <input
              aria-label="Толщина карандаша"
              type="number"
              min={1}
              max={100}
              value={brush.width}
              onChange={(e) =>
                setBrush({ ...brush, width: Math.max(1, Math.min(100, Number(e.target.value))) })
              }
            />
          </label>
          <label>
            Непрозрачность{' '}
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={brush.opacity}
              onChange={(e) => setBrush({ ...brush, opacity: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
      <div className="editor-body">
        <ToolRail
          theme={theme}
          setTheme={setTheme}
          tool={tool}
          busy={busy}
          onTool={(next) => {
            setTool(next);
            if (next !== 'select') setSelected([]);
          }}
          onAdd={add}
          onPhotos={importPhotos}
          onTable={() => setTableCreator(true)}
          onMedia={importMedia}
          onLink={() => {
            setLinkKind('link');
            setMessage('');
            setLinkOpen(true);
          }}
          hasSelection={!!selectedItems.length}
          onDelete={remove}
        />
        <section
          ref={containerRef}
          className="canvas-viewport"
          aria-label="Холст страны"
          {...hitRouting}
          onDragOver={(e) => {
            if (!busy && !viewOnly) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (!busy && !viewOnly) void importPhotos(Array.from(e.dataTransfer.files));
          }}
          style={{
            backgroundColor: theme.background,
            cursor:
              panning || spaceHeld
                ? 'grabbing'
                : tool === 'pen' || tool === 'shape'
                  ? 'crosshair'
                  : 'default',
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            if (viewOnly) return;
            const rect = e.currentTarget.getBoundingClientRect();
            setMenu({
              x: Math.min(e.clientX - rect.left, size.width - 220),
              y: Math.min(e.clientY - rect.top, size.height - 280),
            });
          }}
        >
          <CanvasBackground theme={theme} camera={camera} backgroundUrl={backgroundUrl} />
          <SceneStage
            stageRef={stageRef}
            transformerRef={transformerRef}
            camera={camera}
            size={size}
            setCamera={setCamera}
            displayedItems={displayedItems}
            items={items}
            selected={selected}
            selectedItems={selectedItems}
            tool={tool}
            viewOnly={viewOnly}
            spaceHeld={spaceHeld}
            editing={!!editing}
            selectionBox={selectionBox}
            draftStroke={draftStroke}
            bounds={bounds}
            viewport={viewport}
            renderItem={renderItem}
            pointerDown={pointerDown}
            pointerMove={pointerMove}
            finishPointer={finishPointer}
            previewNodes={previewNodes}
            syncNodes={syncNodes}
          />
          {displayedItems
            .filter(
              (i) =>
                !i.hidden && hasMaterial(i) && overlaps(bounds(i), viewport(), 200 / camera.scale),
            )
            .map((item) => (
              <ObjectMaterial
                key={item.id}
                item={item}
                camera={camera}
                fontFamily={theme.fontFamily}
                textColor={theme.textColor ?? '#243447'}
                fontRevision={fontLibrary.loadedAt}
                zIndex={displayedItems.findIndex((i) => i.id === item.id) * 2 + 2}
              />
            ))}
          {displayedItems
            .filter(
              (i) =>
                !i.hidden &&
                ['table', 'video', 'audio', 'link', 'disclosure'].includes(i.kind) &&
                overlaps(domBounds(i), viewport(), 200 / camera.scale),
            )
            .map((item) => (
              <DomObject
                key={item.id}
                readOnly={viewOnly}
                zIndex={displayedItems.findIndex((i) => i.id === item.id) * 2 + 2}
                fontFamily={theme.fontFamily}
                item={item}
                camera={camera}
                selected={selected.includes(item.id)}
                interactive={viewOnly || (tool === 'select' && !spaceHeld && !busy)}
                onSelect={(extend = false) =>
                  !viewOnly && setSelected((ids) => selectItem(items, ids, item, extend))
                }
                onDrag={(e) => {
                  if (!viewOnly) startDomDrag(item, e);
                }}
                onCell={setCell}
                onDraft={setTableDraft}
                onSectionDraft={setSectionDraft}
                onSectionChange={(sectionId, patch) =>
                  changeItems((list) =>
                    list.map((i) =>
                      i.id === item.id
                        ? {
                            ...i,
                            sections: i.sections?.map((section) =>
                              section.id === sectionId ? { ...section, ...patch } : section,
                            ),
                          }
                        : i,
                    ),
                  )
                }
                onTable={(table) =>
                  changeItems((list) => list.map((i) => (i.id === item.id ? { ...i, table } : i)))
                }
              />
            ))}
          {!viewOnly && (
            <CanvasNavigator
              theme={theme}
              onTheme={setTheme}
              camera={camera}
              onCamera={setCamera}
              viewport={viewport()}
              bounds={items.filter((i) => !i.hidden).map(bounds)}
              size={size}
            />
          )}
          {searchOpen && (
            <SearchPanel
              items={items}
              onClose={() => setSearchOpen(false)}
              onChoose={(item, sectionId) => {
                const revealed = {
                  ...item,
                  hidden: false,
                  ...(sectionId
                    ? {
                        sections: item.sections?.map((s) =>
                          s.id === sectionId ? { ...s, collapsed: false } : s,
                        ),
                      }
                    : {}),
                };
                if (item.hidden || sectionId)
                  changeItems((list) => list.map((i) => (i.id === item.id ? revealed : i)));
                setSelected([item.id]);
                setCamera(fitInEditor([bounds(revealed)]));
              }}
            />
          )}
          {editing && editingItem && (
            <div
              className="inline-text-wrap"
              style={{
                left: camera.x + editingItem.x * camera.scale,
                top: camera.y + editingItem.y * camera.scale,
                transform: `rotate(${editingItem.rotation ?? 0}deg) scale(${camera.scale * (editingItem.scaleX ?? 1)}, ${camera.scale * (editingItem.scaleY ?? 1)})`,
              }}
            >
              <RichTextEditor
                key={editing.id}
                item={editingItem}
                family={theme.fontFamily}
                initial={editing.richText ?? [{ text: editing.draft }]}
                onChange={(draft, richText) => setEditing({ ...editing, draft, richText })}
                onFinish={finishText}
              />
            </div>
          )}
          {!items.length && (
            <div className="empty-canvas">
              <span>Ваше пространство для открытий</span>
              <p>
                Добавьте текст, фигуру или фотографию.
                <br />У каждой страны — свой холст.
              </p>
            </div>
          )}
          {menu && (
            <div
              className="context-menu"
              role="menu"
              style={{ left: Math.max(0, menu.x), top: Math.max(0, menu.y) }}
            >
              <button onClick={() => add('note')}>Добавить текст</button>
              <button
                onClick={() => {
                  showAll();
                  setMenu(null);
                }}
              >
                Показать всё <kbd>F</kbd>
              </button>
              <button disabled={items.length < 2} onClick={arrange}>
                Разложить без пересечений
              </button>
              <button disabled={!selectedItems.length} onClick={() => duplicate()}>
                Дублировать
              </button>
              <button disabled={!selectedItems.length} onClick={remove}>
                Удалить
              </button>
              <button
                onClick={() => {
                  setCamera({ x: 0, y: 0, scale: 1 });
                  setMenu(null);
                }}
              >
                Сбросить вид
              </button>
              <button onClick={() => setMenu(null)}>Закрыть меню</button>
            </div>
          )}
        </section>
        {showProperties && (
          <PropertiesPanel
            onReplace={(item, file) => void replaceAsset(item, file)}
            onCrop={(item) => setCroppingId(item.id)}
            onResetCrop={(item) =>
              changeItems((list) =>
                list.map((i) => (i.id === item.id ? applyImageCrop(i, fullImage) : i)),
              )
            }
            items={items}
            cell={cell}
            fontOptions={fontLibrary.fonts}
            importFont={() => void fontLibrary.importFont()}
            onBackground={(file) => void importBackground(file)}
            select={(id) => setSelected([id])}
            toggleHidden={(id) =>
              changeItems((list) =>
                list.map((i) => (i.id === id ? { ...i, hidden: !i.hidden } : i)),
              )
            }
            group={(ungroup) => patch({ groupId: ungroup ? undefined : crypto.randomUUID() })}
            selected={selectedItems}
            theme={theme}
            setTheme={setTheme}
            sizeOf={baseSize}
            patch={patch}
            resize={(axis, value) => {
              if (selectedItems.length !== 1) return;
              const i = selectedItems[0],
                base = baseSize(i);
              patch(
                axis === 'width' ? { scaleX: value / base.width } : { scaleY: value / base.height },
              );
            }}
            remove={remove}
            duplicate={() => duplicate()}
            layer={layer}
            stepLayer={(direction) =>
              changeItems((list) => moveOneLayer(list, selected, direction))
            }
          />
        )}
      </div>
      {aboutOpen && <AboutPanel onClose={() => setAboutOpen(false)} />}
      {archiveOpen && (
        <ArchivePanel
          countryId={country.id}
          onClose={() => setArchiveOpen(false)}
          onRestored={() => onBack()}
        />
      )}
      {revisionsOpen && (
        <RevisionsPanel
          countryId={country.id}
          onClose={() => setRevisionsOpen(false)}
          onRestore={(scene) => {
            setHistory(createHistory({ items: scene.items, theme: scene.theme }));
            setCamera(scene.camera);
            setSelected([]);
          }}
        />
      )}
      <TableCreationDialog
        open={tableCreator}
        onClose={() => setTableCreator(false)}
        onCreate={(table) => {
          add('table', table);
          setTableCreator(false);
        }}
      />
      {croppingId && items.find((i) => i.id === croppingId)?.kind === 'image' && (
        <ImageCropDialog
          item={items.find((i) => i.id === croppingId)!}
          onClose={() => setCroppingId(null)}
          onApply={(crop) => {
            changeItems((list) =>
              list.map((i) => (i.id === croppingId ? applyImageCrop(i, crop) : i)),
            );
            setCroppingId(null);
          }}
        />
      )}
      {linkOpen && (
        <LinkDialog
          linkKind={linkKind}
          linkUrl={linkUrl}
          linkTitle={linkTitle}
          setLinkKind={setLinkKind}
          setLinkUrl={setLinkUrl}
          setLinkTitle={setLinkTitle}
          busy={busy}
          message={message}
          downloadProgress={downloadProgress}
          cancellable={!!downloadId.current}
          onCancel={() => {
            void invoke('cancel_operation', { id: downloadId.current });
            setDownloadProgress('Отмена…');
          }}
          onClose={() => setLinkOpen(false)}
          onSubmit={submitLink}
        />
      )}
      <footer className="editor-status">
        <span className={storage.error ? 'save-error' : ''} role="status">
          {storage.status}
          {!isTauri() && ' · Предпросмотр в браузере'}
        </span>
        <span>
          {items.length} объектов · {selectedItems.length} выбрано
        </span>
        <span className="pan-hint">Пробел + мышь — перемещение · Shift + клик — выбор</span>
        <button
          title="Масштаб 100% (1)"
          onClick={() =>
            setCamera((c) => zoomAt(c, { x: size.width / 2, y: size.height / 2 }, 1 / c.scale))
          }
        >
          {Math.round(camera.scale * 100)}%
        </button>
      </footer>
    </main>
  );
}
