import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Stage, Layer, Transformer, Rect } from 'react-konva';
import Konva from 'konva';
import { isTauri } from '@tauri-apps/api/core';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ArchivePanel from './editor/ArchivePanel';
import RevisionsPanel from './editor/RevisionsPanel';
import SearchPanel from './editor/SearchPanel';
import DomObject, { type CellSelection } from './editor/DomObjects';
import { moveOneLayer } from '../domain/layers';
import { createTable } from '../domain/table';
import { exportCanvas } from '../services/exportCanvas';
import { useFonts } from '../services/useFonts';
import { canvasClipboard } from '../services/clipboard';
import type { Country } from '../domain/countries';
import { validUrl, type Camera, type CanvasItem, type ItemKind, type Scene, type Theme } from '../domain/scene';
import { arrangeItems, dimensions, fitCamera, itemBounds, placeItem, zoomAt, overlaps, type Bounds } from '../domain/geometry';
import { commit, createHistory, redo, undo } from '../state/history';
import { repository } from '../services/SceneRepository';
import { useScene } from '../services/useScene';
import { ItemView, textConfig } from './editor/ItemView';
import PropertiesPanel from './editor/PropertiesPanel';

Konva.dragButtons = [0];
type Props = { country: Country; onBack: () => void };
type Composition = { items: CanvasItem[]; theme: Theme };
const shapeLabels: [ItemKind, string][] = [['rectangle', 'Прямоугольник'], ['square', 'Квадрат'], ['circle', 'Круг'], ['ellipse', 'Эллипс'], ['star', 'Звезда'], ['line', 'Линия'], ['arrow', 'Стрелка']];

export default function CountryCanvas({ country, onBack }: Props) {
  const storage = useScene(country);
  if (!storage.loaded) return <main className="load-screen"><h1>{country.name}</h1><p role={storage.error ? 'alert' : 'status'}>{storage.error || 'Загрузка холста…'}</p><div><button onClick={onBack}>← Карта</button>{storage.error && <button onClick={storage.reload}>Повторить загрузку</button>}</div></main>;
  if (storage.loaded.legacyKey) return <main className="load-screen"><h1>Сохраним прежний холст</h1><p>В стране «{country.name}» найдено объектов: {storage.loaded.scene.items.length}.</p><p>{isTauri() ? 'Перенести их в SQLite?' : 'Перенести их в новый формат браузерного предпросмотра?'} Расположение сохранится, исходная запись localStorage останется нетронутой.</p>{storage.error && <p role="alert">{storage.error}</p>}<div><button onClick={onBack}>← Карта</button><button disabled={storage.status === 'Перенос…'} onClick={() => void storage.migrate()}>Перенести холст</button></div></main>;
  return <Editor country={country} onBack={onBack} initial={storage.loaded.scene} storage={storage} />;
}

function Editor({ country, onBack, initial, storage }: Props & { initial: Scene; storage: ReturnType<typeof useScene> }) {
  const [viewOnly, setViewOnly] = useState(false);
  const lastCamera = useRef(initial.camera);
  const fontLibrary = useFonts();
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [brush, setBrush] = useState({ color: '#365b77', width: 3, opacity: 1 });
  const marquee = useRef<{ x: number; y: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<Bounds | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false), [revisionsOpen, setRevisionsOpen] = useState(false), [searchOpen, setSearchOpen] = useState(false);
  const [cell, setCell] = useState<CellSelection | null>(null);
  const [tableDraft, setTableDraft] = useState<{ id: string; row: number; column: number; text: string } | null>(null);
  const [gesture, setGesture] = useState<{ ids: string[]; dx: number; dy: number } | null>(null);
  const gestureCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => gestureCleanup.current?.(), []);
  const [history, setHistory] = useState(() => createHistory<Composition>({ items: initial.items, theme: initial.theme }));
  const { items, theme } = history.present;
  const [camera, setCamera] = useState<Camera>(initial.camera);
  const [selected, setSelected] = useState<string[]>([]);
  const [tool, setTool] = useState<'select' | 'pen' | 'eraser'>('select');
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [showProperties, setShowProperties] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const pan = useRef<{ clientX: number; clientY: number; camera: Camera; moved: boolean; blank: boolean } | null>(null);
  const drawing = useRef<CanvasItem | null>(null);
  const [draftStroke, setDraftStroke] = useState<CanvasItem | null>(null);
  const drag = useRef<{ id: string; x: number; y: number; ids: string[] } | null>(null);
  const displayedItems = gesture ? items.map(i => gesture.ids.includes(i.id) ? { ...i, x: i.x + gesture.dx, y: i.y + gesture.dy } : i) : items;
  const selectedItems = items.filter(item => selected.includes(item.id));
  const editingItem = items.find(item => item.id === editing?.id);
  const nodes = () => stageRef.current?.find('.canvas-item') ?? [];
  const nodeFor = (id: string) => nodes().find(node => node.id() === id);

  useEffect(() => { let active = true; setBackgroundUrl(''); if (theme.backgroundAssetId && theme.backgroundType === 'image') void repository.imageUrl(theme.backgroundAssetId).then(url => { if (active) setBackgroundUrl(url); }).catch(e => setMessage(String(e))); return () => { active = false; }; }, [theme.backgroundAssetId, theme.backgroundType]);
  const textMeasurements = useRef(new Map<string, { width: number; height: number }>());
  const measureText = (item: CanvasItem) => {
    const cacheKey = JSON.stringify(textConfig(item, theme.fontFamily)); const cached = textMeasurements.current.get(cacheKey); if (cached) return cached;
    const text = new Konva.Text(textConfig(item, theme.fontFamily));
    const size = { width: text.width(), height: text.height() };
    text.destroy(); if (textMeasurements.current.size > 1000) textMeasurements.current.clear(); textMeasurements.current.set(cacheKey, size); return size;
  };
  const bounds = (item: CanvasItem) => itemBounds(item, measureText);
  const viewport = (): Bounds => ({ left: -camera.x / camera.scale, top: -camera.y / camera.scale, right: (size.width - camera.x) / camera.scale, bottom: (size.height - camera.y) / camera.scale });
  const change = (fn: (composition: Composition) => Composition) => setHistory(h => { const next = fn(h.present); return commit(h, { ...next, items: next.items.map(item => h.present.items.find(i => i.id === item.id) === item ? item : { ...item, updatedAt: new Date().toISOString() }) }); });
  const changeItems = (fn: (items: CanvasItem[]) => CanvasItem[]) => change(c => ({ ...c, items: fn(c.items) }));
  const setTheme = (next: Theme) => change(c => ({ ...c, theme: next }));
  const showAll = (list = items) => { lastCamera.current = camera; setCamera(fitCamera(list.filter(i => !i.hidden).map(bounds), size)); };
  const performUndo = () => { setHistory(undo); setSelected([]); setEditing(null); };
  const performRedo = () => { setHistory(redo); setSelected([]); setEditing(null); };

  useLayoutEffect(() => {
    let currentItems = editing ? history.present.items.map(i => i.id === editing.id ? { ...i, content: editing.draft } : i) : history.present.items;
    if (tableDraft) currentItems = currentItems.map(i => i.id === tableDraft.id && i.table ? { ...i, table: { ...i.table, cells: i.table.cells.map((row, r) => row.map((c, col) => r === tableDraft.row && col === tableDraft.column ? { ...c, text: tableDraft.text } : c)) } } : i);
    storage.schedule({ schemaVersion: 3, items: currentItems, theme: history.present.theme, camera });
  }, [history.present, camera, editing, tableDraft, storage.schedule]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height) }));
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    transformerRef.current?.nodes(nodes().filter(node => selected.includes(node.id()) && !items.find(i => i.id === node.id())?.locked && !items.find(i => i.id === node.id())?.hidden));
    transformerRef.current?.getLayer()?.batchDraw();
  }, [selected, items, tool, spaceHeld, camera]);
  useLayoutEffect(() => {
    if (!textRef.current) return;
    textRef.current.style.height = '1px';
    textRef.current.style.height = `${Math.max(40, textRef.current.scrollHeight)}px`;
  }, [editing?.draft]);

  function baseSize(item: CanvasItem) {
    if (item.kind === 'note') return measureText(item);
    if (item.points) {
      const b = itemBounds({ ...item, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
      return { width: Math.max(1, b.right - b.left), height: Math.max(1, b.bottom - b.top) };
    }
    return dimensions(item);
  }
  function reveal(item: CanvasItem) {
    const b = bounds(item), view = viewport();
    if (b.left < view.left || b.top < view.top || b.right > view.right || b.bottom > view.bottom) setCamera(fitCamera([b], size));
  }
  function add(kind: ItemKind) {
    const item: CanvasItem = { id: crypto.randomUUID(), kind, x: 0, y: 0 };
    if (kind === 'table') item.table = createTable();
    if (kind === 'note') { item.content = 'Новая заметка'; item.fontSize = 28; }
    if (kind === 'arrow' || kind === 'line') item.points = [0, 0, 160, 0];
    const placed = placeItem(item, items, viewport(), measureText);
    changeItems(list => [...list, placed]); setSelected([placed.id]); setCell(null); setTool('select'); setMenu(null); reveal(placed);
    if (kind === 'note') setEditing({ id: placed.id, draft: placed.content! });
  }
  function patch(p: Partial<CanvasItem>) {
    changeItems(list => list.map(item => selected.includes(item.id) ? { ...item, ...p } : item));
  }
  function remove() {
    changeItems(list => list.filter(item => !selected.includes(item.id) || item.locked)); setSelected([]); setMenu(null);
  }
  function duplicate(source = selectedItems) {
    let next = [...items]; const ids: string[] = []; const groups = new Map<string, string>();
    for (const item of source) {
      if (item.groupId && !groups.has(item.groupId)) groups.set(item.groupId, crypto.randomUUID());
      const placed = placeItem({ ...item, id: crypto.randomUUID(), groupId: item.groupId ? groups.get(item.groupId) : undefined, locked: false, hidden: false }, next, viewport(), measureText);
      next.push(placed); ids.push(placed.id);
    }
    changeItems(() => next); setSelected(ids); setMenu(null);
    if (ids.length) reveal(next[next.length - 1]);
  }
  function layer(front: boolean) {
    changeItems(list => {
      const chosen = list.filter(i => selected.includes(i.id)), other = list.filter(i => !selected.includes(i.id));
      return front ? [...other, ...chosen] : [...chosen, ...other];
    }); setMenu(null);
  }
  function arrange() {
    if (items.some(i => i.locked)) { setMessage('Снимите блокировку объектов перед общей раскладкой.'); return; }
    const next = arrangeItems(items, viewport(), measureText);
    changeItems(() => next); showAll(next); setMenu(null);
  }
  function finishText(cancel = false) {
    if (!editing) return;
    if (!cancel) changeItems(list => list.map(i => i.id === editing.id ? { ...i, content: editing.draft } : i));
    setEditing(null);
  }
  async function back() {
    setBusy(true);
    const currentItems = editing ? items.map(i => i.id === editing.id ? { ...i, content: editing.draft } : i) : items;
    storage.schedule({ schemaVersion: 3, items: currentItems, theme, camera });
    try { await storage.flush(); onBack(); } catch { setBusy(false); }
  }
  async function importPhotos(files: File[]) {
    if (!files.length) return;
    setBusy(true); setMessage('Импорт фотографий…');
    let next = [...items]; const ids: string[] = []; const errors: string[] = [];
    for (const file of files) {
      try {
        const { assetId, width, height } = await repository.importImage(file);
        const ratio = Math.min(1, 420 / width, 340 / height);
        const item = placeItem({ id: crypto.randomUUID(), kind: 'image', assetId, title: file.name, x: 0, y: 0, width: width * ratio, height: height * ratio }, next, viewport(), measureText);
        next.push(item); ids.push(item.id);
      } catch (e) { errors.push(`${file.name}: ${String(e)}`); }
    }
    if (ids.length) { changeItems(() => next); setSelected(ids); setTool('select'); if (ids.length > 1) showAll(next); else reveal(next[next.length - 1]); }
    setMessage(errors.length ? `Импортировано: ${ids.length}. ${errors.join('; ')}` : `Фотографий скопировано: ${ids.length}.`);
    setBusy(false); if (inputRef.current) inputRef.current.value = '';
  }
  const [linkOpen, setLinkOpen] = useState(false), [linkKind, setLinkKind] = useState<'link' | 'image' | 'video' | 'audio'>('link'), [linkUrl, setLinkUrl] = useState(''), [linkTitle, setLinkTitle] = useState('');
  async function downloadUrl() { if (!isTauri()) { setMessage('Загрузка файлов доступна в настольном приложении.'); return; } if (!validUrl(linkUrl)) { setMessage('Введите полный http/https адрес'); return; } setBusy(true); try { const imported = await invoke<{ assetId: string; title: string }>('import_url', { url: linkUrl, kind: linkKind }); const item = placeItem({ id: crypto.randomUUID(), kind: linkKind as ItemKind, ...imported, title: linkTitle || imported.title, x: 0, y: 0 }, items, viewport(), measureText); changeItems(list => [...list, item]); setSelected([item.id]); reveal(item); setLinkOpen(false); setMessage('Медиа загружено в папку приложения и доступно офлайн.'); } catch (e) { setMessage(String(e)); } finally { setBusy(false); } }
  async function exportImage(format: 'png' | 'pdf', region: 'all' | 'viewport') { setBusy(true); try { await storage.flush(); const path = await exportCanvas({ schemaVersion: 3, items, theme, camera }, viewport(), region, format); setMessage(path ? `Экспорт сохранён: ${path}` : 'Экспорт отменён'); } catch (e) { setMessage(String(e)); } finally { setBusy(false); } }
  async function importBackground(file?: File) { if (!file) return; setBusy(true); try { const image = await repository.importImage(file); setTheme({ ...theme, backgroundAssetId: image.assetId, backgroundType: 'image' }); } catch (e) { setMessage(String(e)); } finally { setBusy(false); } }
  async function importMedia(kind: 'video' | 'audio') {
    if (!isTauri()) { setMessage('Импорт медиа доступен в настольном приложении.'); return; }
    setBusy(true);
    try {
      const result = await invoke<{ assetId: string; title: string } | null>('import_media', { kind });
      if (result) { const item = placeItem({ id: crypto.randomUUID(), kind, ...result, x: 0, y: 0 }, items, viewport(), measureText); changeItems(list => [...list, item]); setSelected([item.id]); reveal(item); }
    } catch (e) { setMessage(String(e)); } finally { setBusy(false); }
  }
  function startDomDrag(item: CanvasItem, event: ReactPointerEvent) {
    const startX = event.clientX, startY = event.clientY;
    const ids = (item.groupId ? items.filter(i => i.groupId === item.groupId).map(i => i.id) : [item.id]).filter(id => !items.find(i => i.id === id)?.locked);
    let dx = 0, dy = 0;
    const move = (e: PointerEvent) => { dx = (e.clientX - startX) / camera.scale; dy = (e.clientY - startY) / camera.scale; setGesture({ ids, dx, dy }); };
    const finish = () => { changeItems(list => list.map(i => ids.includes(i.id) ? { ...i, x: i.x + dx, y: i.y + dy } : i)); setGesture(null); cleanup(); };
    const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); gestureCleanup.current = null; };
    gestureCleanup.current?.(); gestureCleanup.current = cleanup;
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish, { once: true }); window.addEventListener('pointercancel', finish, { once: true });
  }
  useEffect(() => {
    const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable);
    function down(e: KeyboardEvent) {
      if (typing(e.target) || editing || busy || archiveOpen || revisionsOpen || linkOpen) return;
      const key = e.key.toLowerCase(), mod = e.metaKey || e.ctrlKey;
      if (e.code === 'Space') { e.preventDefault(); setSpaceHeld(true); return; }
      if (mod && key === 'f') { e.preventDefault(); setSearchOpen(true); return; }
      if (mod && key === 'g') { e.preventDefault(); const groupId = e.shiftKey ? undefined : crypto.randomUUID(); patch({ groupId }); return; }
      if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) performRedo(); else performUndo(); return; }
      if (mod && key === 'y') { e.preventDefault(); performRedo(); return; }
      if (mod && key === 'a') { e.preventDefault(); setSelected(items.filter(i => !i.hidden).map(i => i.id)); return; }
      if (mod && key === 'd') { e.preventDefault(); duplicate(); return; }
      if (mod && (key === 'c' || key === 'x')) { e.preventDefault(); canvasClipboard.write(selectedItems); if (key === 'x') remove(); return; }
      if (mod && key === 'v') { e.preventDefault(); duplicate(canvasClipboard.read()); return; }
      if (mod || e.altKey) return;
      if (key === 'escape') { setViewOnly(false); setSearchOpen(false); setSelected([]); setTool('select'); setMenu(null); }
      if (key === 'v') setTool('select');
      if (key === 'p' || key === 'b') { setTool('pen'); setSelected([]); }
      if (key === 't') { e.preventDefault(); add('note'); }
      if (key === 'r') add('rectangle');
      if (key === 'o') add('circle');
      if (key === 'f') showAll();
      if (key === '1') setCamera(c => zoomAt(c, { x: size.width / 2, y: size.height / 2 }, 1 / c.scale));
      if (key === 'delete' || key === 'backspace') { e.preventDefault(); remove(); }
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceHeld(false); };
    const blur = () => { setSpaceHeld(false); finishPointer(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    const upWindow = () => finishPointer(); window.addEventListener('mouseup', upWindow);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); window.removeEventListener('mouseup', upWindow); };
  });

  function pointerWorld() {
    const p = stageRef.current?.getPointerPosition();
    return p ? { x: (p.x - camera.x) / camera.scale, y: (p.y - camera.y) / camera.scale } : null;
  }
  function pointerDown(event: Konva.KonvaEventObject<MouseEvent>) {
    if (busy || editing || viewOnly) return;
    setMenu(null);
    const blank = event.target === stageRef.current;
    if (blank && event.evt.shiftKey && event.evt.button === 0 && tool === 'select' && !spaceHeld) { const p = pointerWorld(); if (p) { marquee.current = p; setSelectionBox({ left: p.x, top: p.y, right: p.x, bottom: p.y }); } return; }
    if (event.evt.button === 1 || (event.evt.button === 0 && (spaceHeld || (tool === 'select' && blank)))) {
      event.evt.preventDefault(); pan.current = { clientX: event.evt.clientX, clientY: event.evt.clientY, camera, moved: false, blank }; setPanning(true); return;
    }
    if (event.evt.button !== 0 || tool !== 'pen') return;
    const p = pointerWorld(); if (!p) return;
    drawing.current = { id: crypto.randomUUID(), kind: 'stroke', x: p.x, y: p.y, points: [0, 0, 0.01, 0.01], stroke: brush.color, strokeWidth: brush.width, opacity: brush.opacity };
    setDraftStroke(drawing.current);
  }
  function pointerMove(event: Konva.KonvaEventObject<MouseEvent>) {
    const p = pan.current;
    if (marquee.current) { const point = pointerWorld(); if (point) setSelectionBox({ left: Math.min(point.x, marquee.current.x), top: Math.min(point.y, marquee.current.y), right: Math.max(point.x, marquee.current.x), bottom: Math.max(point.y, marquee.current.y) }); return; }
    if (p) {
      const dx = event.evt.clientX - p.clientX, dy = event.evt.clientY - p.clientY;
      if (Math.hypot(dx, dy) > 3) p.moved = true;
      if (p.moved) setCamera({ ...p.camera, x: p.camera.x + dx, y: p.camera.y + dy });
    } else if (drawing.current) {
      const point = pointerWorld(); if (!point) return;
      const d = drawing.current;
      drawing.current = { ...d, points: [...d.points!, point.x - d.x, point.y - d.y] }; setDraftStroke(drawing.current);
    }
  }
  function finishPointer() {
    if (marquee.current && selectionBox) { const ids = items.filter(i => !i.hidden && overlaps(bounds(i), selectionBox, 0)).map(i => i.id); setSelected(old => [...new Set([...old, ...ids])]); marquee.current = null; setSelectionBox(null); }
    if (pan.current?.blank && !pan.current.moved) setSelected([]);
    pan.current = null; setPanning(false);
    if (drawing.current) { const stroke = drawing.current; changeItems(list => [...list, stroke]); drawing.current = null; setDraftStroke(null); }
  }
  function syncNodes(ids: string[]) {
    const updates = new Map(ids.flatMap(id => {
      const node = nodeFor(id); return node ? [[id, { x: theme.snap ? Math.round(node.x() / (theme.gridSize ?? 22)) * (theme.gridSize ?? 22) : node.x(), y: theme.snap ? Math.round(node.y() / (theme.gridSize ?? 22)) * (theme.gridSize ?? 22) : node.y(), scaleX: node.scaleX(), scaleY: node.scaleY(), rotation: node.rotation() }] as const] : [];
    }));
    changeItems(list => list.map(item => updates.has(item.id) && !item.locked ? { ...item, ...updates.get(item.id) } : item));
  }
  function renderItem(item: CanvasItem, draft = false) {
    const common = {
      id: item.id, name: 'canvas-item', x: item.x, y: item.y, scaleX: item.scaleX ?? 1, scaleY: item.scaleY ?? 1,
      rotation: item.rotation ?? 0, opacity: item.opacity ?? 1, visible: !item.hidden && editing?.id !== item.id,
      shadowColor: '#000000', shadowOpacity: 0.22, shadowBlur: item.shadowBlur ?? 0,
      draggable: !viewOnly && !draft && !item.locked && tool === 'select' && !spaceHeld && !busy,
      listening: !viewOnly && !item.hidden && !draft && (tool === 'select' || (tool === 'eraser' && item.kind === 'stroke')) && !spaceHeld && !busy,
      onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (e.evt.button !== 0 || spaceHeld) return;
        if (tool === 'eraser') { if (!item.locked && item.kind === 'stroke') changeItems(list => list.filter(i => i.id !== item.id)); return; }
        if (e.evt.shiftKey) setSelected(ids => ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id]);
        else if (!selected.includes(item.id)) setSelected(item.groupId ? items.filter(i => i.groupId === item.groupId && !i.hidden).map(i => i.id) : [item.id]);
      },
      onDblClick: () => { if (item.kind === 'note' && !item.locked) setEditing({ id: item.id, draft: item.content ?? '' }); },
      onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => {
        const ids = (selected.includes(item.id) ? selected : [item.id]).filter(id => !items.find(i => i.id === id)?.locked);
        setSelected(ids); drag.current = { id: item.id, x: e.target.x(), y: e.target.y(), ids };
      },
      onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
        if (!drag.current) return;
        const d = drag.current;
        for (const id of d.ids) {
          if (id === d.id) continue;
          const original = items.find(i => i.id === id); const node = nodeFor(id);
          if (original && node) node.position({ x: original.x + e.target.x() - d.x, y: original.y + e.target.y() - d.y });
        }
      },
      onDragEnd: () => { syncNodes(drag.current?.ids ?? [item.id]); drag.current = null; },
    };
    return <ItemView key={item.id} item={item} common={common} fontFamily={theme.fontFamily} />;
  }
  const patternColor = `${theme.patternColor ?? '#85929e'}${Math.round((theme.patternOpacity ?? 0.3) * 255).toString(16).padStart(2, '0')}`;
  const bgImage = theme.pattern === 'dots' ? `radial-gradient(circle, ${patternColor} 1px, transparent 1px)` : theme.pattern === 'grid' ? `linear-gradient(${patternColor} 1px, transparent 1px), linear-gradient(90deg, ${patternColor} 1px, transparent 1px)` : theme.pattern === 'lines' ? `linear-gradient(${patternColor} 1px, transparent 1px)` : 'none';
  const sceneBackground = theme.backgroundType === 'gradient' ? `linear-gradient(${theme.angle ?? 135}deg, ${theme.background}, ${theme.secondary ?? '#dce8ec'})` : backgroundUrl && theme.backgroundType === 'image' ? `url("${backgroundUrl}")` : '';
  const step = (theme.gridSize ?? 22) * camera.scale;
  const backgroundStyle = { backgroundColor: theme.background, backgroundImage: sceneBackground ? `${bgImage}, ${sceneBackground}` : bgImage, backgroundSize: sceneBackground ? `${step}px ${step}px, ${theme.imageMode === 'repeat' ? 'auto' : theme.imageMode ?? 'cover'}` : `${step}px ${step}px`, backgroundRepeat: sceneBackground ? `repeat, ${theme.imageMode === 'repeat' ? 'repeat' : 'no-repeat'}` : 'repeat', backgroundPosition: sceneBackground ? `${camera.x}px ${camera.y}px, center` : `${camera.x}px ${camera.y}px` };
  return <main className={`country-workspace ${viewOnly ? 'view-only' : ''}`}>
    {viewOnly && <button className='leave-view' onClick={() => setViewOnly(false)}>Вернуться к редактированию · Esc</button>}
    <header className="country-toolbar"><button disabled={busy} onClick={() => void back()}>← Карта</button><div className="country-heading"><strong>{country.name}</strong><small>Личный атлас</small></div><div className="toolbar-spacer" />
      <button aria-label="Отменить" title="Отменить (⌘/Ctrl+Z)" disabled={!history.past.length || !!editing || busy} onClick={performUndo}>↶</button>
      <button aria-label="Повторить" title="Повторить (⌘/Ctrl+Shift+Z)" disabled={!history.future.length || !!editing || busy} onClick={performRedo}>↷</button>
      <button onClick={() => showAll()} title="Показать всё (F)">Показать всё</button>
      <button onClick={() => { setViewOnly(true); setSelected([]); }}>Просмотр</button>
      <button onClick={() => setSearchOpen(v => !v)} title='Поиск (⌘/Ctrl+F)'>Поиск</button>
      <details className='editor-file-menu'><summary>Ещё</summary><div><button disabled={!selectedItems.length} onClick={() => setCamera(fitCamera(selectedItems.map(bounds), size))}>Показать выделенное</button><button onClick={() => setCamera(lastCamera.current)}>Предыдущий вид</button><button onClick={() => setArchiveOpen(true)}>Архив и восстановление</button><button onClick={() => setRevisionsOpen(true)}>Версии холста</button><button onClick={() => void exportImage('png', 'all')}>PNG всего холста</button><button onClick={() => void exportImage('png', 'viewport')}>PNG видимой области</button><button onClick={() => void exportImage('pdf', 'all')}>PDF всего холста</button><button onClick={() => { setSelected(items.filter(i => !i.hidden).map(i => i.id)); }}>Выделить всё</button><button disabled={!selectedItems.length} onClick={() => canvasClipboard.write(selectedItems)}>Копировать объекты</button><button onClick={() => duplicate(canvasClipboard.read())}>Вставить объекты</button></div></details>
      <button aria-pressed={showProperties} onClick={() => setShowProperties(v => !v)}>Свойства</button>
    </header>
    {(storage.error || message) && <div className={`editor-notice ${storage.error ? 'error' : ''}`} role={storage.error ? 'alert' : 'status'}>{storage.error || message}<button onClick={() => storage.error ? void storage.flush().catch(() => {}) : setMessage('')}>{storage.error ? 'Повторить сохранение' : 'Закрыть'}</button></div>}
    {fontLibrary.error && <div role='status' className='editor-notice'>{fontLibrary.error}</div>}{tool === 'pen' && <div className='brush-bar'><label>Цвет <input aria-label='Цвет карандаша' type='color' value={brush.color} onChange={e => setBrush({ ...brush, color: e.target.value })} /></label><label>Толщина <input aria-label='Толщина карандаша' type='number' min={1} max={100} value={brush.width} onChange={e => setBrush({ ...brush, width: Math.max(1, Math.min(100, Number(e.target.value))) })} /></label><label>Непрозрачность <input type='range' min={0.05} max={1} step={0.05} value={brush.opacity} onChange={e => setBrush({ ...brush, opacity: Number(e.target.value) })} /></label></div>}
    <div className="editor-body"><nav className="tool-rail" aria-label="Инструменты">
      <button title="Выбор (V). Перемещение холста — по пустому месту" aria-label="Выбор" aria-pressed={tool === 'select'} onClick={() => setTool('select')}>↖</button>
      <button title="Текст (T)" aria-label="Добавить текст" disabled={busy} onClick={() => add('note')}>T</button>
      <details className="shape-menu"><summary title="Фигуры" aria-label="Фигуры">◇</summary><div>{shapeLabels.map(([kind, label]) => <button key={kind} disabled={busy} onClick={e => { add(kind); e.currentTarget.closest('details')?.removeAttribute('open'); }}>{label}</button>)}</div></details>
      <button title="Карандаш (P/B)" aria-label="Карандаш" aria-pressed={tool === 'pen'} onClick={() => { setTool('pen'); setSelected([]); }}>✎</button>
      <button title='Ластик для штрихов' aria-label='Ластик' aria-pressed={tool === 'eraser'} onClick={() => { setTool('eraser'); setSelected([]); }}>◩</button>
      <button title="Добавить фотографию" aria-label="Добавить фото" disabled={busy} onClick={() => inputRef.current?.click()}>▧</button>
      <input ref={inputRef} type="file" multiple hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => void importPhotos(Array.from(e.target.files ?? []))} />
      <button title='Редактируемая таблица' aria-label='Добавить таблицу' onClick={() => add('table')}>▦</button>
      <details className='shape-menu'><summary aria-label='Медиа и ссылки'>▶</summary><div><button onClick={() => void importMedia('video')}>Видео с диска</button><button onClick={() => void importMedia('audio')}>Аудио с диска</button><button onClick={() => { setLinkKind('link'); setMessage(''); setLinkOpen(true); }}>Ссылка или медиа по URL</button></div></details>
      <div className="rail-divider" /><button title="Удалить выбранное" aria-label="Удалить" disabled={!selectedItems.length || busy} onClick={remove}>⌫</button>
    </nav>
    <section ref={containerRef} className="canvas-viewport" aria-label="Холст страны" onDragOver={e => { if (!busy) e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (!busy) void importPhotos(Array.from(e.dataTransfer.files)); }} style={{ ...backgroundStyle, cursor: panning || spaceHeld ? 'grabbing' : tool === 'pen' ? 'crosshair' : 'default' }} onContextMenu={e => { e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); setMenu({ x: Math.min(e.clientX - rect.left, size.width - 220), y: Math.min(e.clientY - rect.top, size.height - 280) }); }}>
      <Stage ref={stageRef} width={size.width} height={size.height} x={camera.x} y={camera.y} scaleX={camera.scale} scaleY={camera.scale}
        onWheel={e => { e.evt.preventDefault(); if (editing) return; const p = stageRef.current?.getPointerPosition(); if (p) setCamera(c => zoomAt(c, p, Math.exp(-Math.max(-100, Math.min(100, e.evt.deltaY)) * 0.002))); }}
        onMouseDown={pointerDown} onMouseMove={pointerMove} onMouseUp={finishPointer} onMouseLeave={finishPointer}>
        <Layer>{displayedItems.filter(i => selected.includes(i.id) || overlaps(bounds(i), viewport(), 200 / camera.scale)).map(item => renderItem(item))}{draftStroke && renderItem(draftStroke, true)}{selectionBox && <Rect x={selectionBox.left} y={selectionBox.top} width={selectionBox.right - selectionBox.left} height={selectionBox.bottom - selectionBox.top} fill='#4f90ba22' stroke='#4f90ba' strokeWidth={1 / camera.scale} listening={false} />}<Transformer ref={transformerRef} listening={!viewOnly && tool === 'select' && !spaceHeld && !editing} rotateEnabled flipEnabled={false} keepRatio={selectedItems.length === 1 && selectedItems[0].kind === 'image'} anchorSize={9} borderStroke="#bf882e" anchorStroke="#bf882e" anchorFill="#fff" onTransformEnd={() => syncNodes(transformerRef.current?.nodes().map(n => n.id()) ?? [])} boundBoxFunc={(old, next) => Math.abs(next.width) < 8 || Math.abs(next.height) < 8 ? old : next} /></Layer>
      </Stage>
      {displayedItems.filter(i => !i.hidden && ['table', 'video', 'audio', 'link'].includes(i.kind) && overlaps(bounds(i), viewport(), 200 / camera.scale)).map(item => <DomObject key={item.id} item={item} camera={camera} selected={selected.includes(item.id)} interactive={tool === 'select' && !spaceHeld && !busy} onSelect={() => !viewOnly && setSelected(item.groupId ? items.filter(i => i.groupId === item.groupId).map(i => i.id) : [item.id])} onDrag={e => { if (!viewOnly) startDomDrag(item, e); }} onCell={setCell} onDraft={setTableDraft} onTable={table => changeItems(list => list.map(i => i.id === item.id ? { ...i, table } : i))} />)}
      {searchOpen && <SearchPanel items={items} onClose={() => setSearchOpen(false)} onChoose={item => { if (item.hidden) changeItems(list => list.map(i => i.id === item.id ? { ...i, hidden: false } : i)); setSelected([item.id]); setCamera(fitCamera([bounds(item)], size)); }} />}
      {editing && editingItem && <div className="inline-text-wrap" style={{ left: camera.x + editingItem.x * camera.scale, top: camera.y + editingItem.y * camera.scale, transform: `rotate(${editingItem.rotation ?? 0}deg) scale(${camera.scale * (editingItem.scaleX ?? 1)}, ${camera.scale * (editingItem.scaleY ?? 1)})` }}><textarea ref={textRef} autoFocus aria-label="Текст заметки" value={editing.draft} style={{ width: editingItem.width ?? 300, fontFamily: editingItem.fontFamily ?? theme.fontFamily, fontSize: editingItem.fontSize ?? 26, fontWeight: editingItem.fontStyle?.includes('bold') ? 'bold' : 'normal', fontStyle: editingItem.fontStyle?.includes('italic') ? 'italic' : 'normal', textDecoration: editingItem.textDecoration, textAlign: editingItem.align,  color: editingItem.fill ?? '#243447', lineHeight: editingItem.lineHeight ?? 1.3 }} onChange={e => setEditing({ ...editing, draft: e.target.value })} onBlur={() => finishText()} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); finishText(true); } if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); finishText(); } }} /><span>⌘/Ctrl + Enter — готово · Esc — отмена</span></div>}
      {!items.length && <div className="empty-canvas"><span>Ваше пространство для открытий</span><p>Добавьте текст, фигуру или фотографию.<br />У каждой страны — свой холст.</p></div>}
      {menu && <div className="context-menu" role="menu" style={{ left: Math.max(0, menu.x), top: Math.max(0, menu.y) }}><button onClick={() => add('note')}>Добавить текст</button><button onClick={() => { showAll(); setMenu(null); }}>Показать всё <kbd>F</kbd></button><button disabled={items.length < 2} onClick={arrange}>Разложить без пересечений</button><button disabled={!selectedItems.length} onClick={() => duplicate()}>Дублировать</button><button disabled={!selectedItems.length} onClick={remove}>Удалить</button><button onClick={() => { setCamera({ x: 0, y: 0, scale: 1 }); setMenu(null); }}>Сбросить вид</button><button onClick={() => setMenu(null)}>Закрыть меню</button></div>}
    </section>
    {showProperties && <PropertiesPanel items={items} cell={cell} fontOptions={fontLibrary.fonts} importFont={() => void fontLibrary.importFont()} onBackground={file => void importBackground(file)} select={id => setSelected([id])} toggleHidden={id => changeItems(list => list.map(i => i.id === id ? { ...i, hidden: !i.hidden } : i))} group={ungroup => patch({ groupId: ungroup ? undefined : crypto.randomUUID() })} selected={selectedItems} theme={theme} setTheme={setTheme} sizeOf={baseSize} patch={patch} resize={(axis, value) => { if (selectedItems.length !== 1) return; const i = selectedItems[0], base = baseSize(i); patch(axis === 'width' ? { scaleX: value / base.width } : { scaleY: value / base.height }); }} remove={remove} duplicate={() => duplicate()} layer={layer} stepLayer={direction => changeItems(list => moveOneLayer(list, selected, direction))} />}
    </div>
    {archiveOpen && <ArchivePanel countryId={country.id} onClose={() => setArchiveOpen(false)} onRestored={() => onBack()} />}
    {revisionsOpen && <RevisionsPanel countryId={country.id} onClose={() => setRevisionsOpen(false)} onRestore={scene => { setHistory(createHistory({ items: scene.items, theme: scene.theme })); setCamera(scene.camera); setSelected([]); }} />}
    {linkOpen && <div className='dialog-backdrop'><form className='app-dialog' onSubmit={e => { e.preventDefault(); if (linkKind !== 'link') { void downloadUrl(); return; } if (!validUrl(linkUrl)) { setMessage('Введите полный http/https адрес'); return; } const item = placeItem({ id: crypto.randomUUID(), kind: 'link', title: linkTitle || new URL(linkUrl).hostname, url: linkUrl, x: 0, y: 0 }, items, viewport(), measureText); changeItems(list => [...list, item]); setSelected([item.id]); reveal(item); setLinkOpen(false); }}><h2>Ссылка или медиа по URL</h2><label>Тип<select aria-label='Тип содержимого по URL' value={linkKind} onChange={e => setLinkKind(e.target.value as typeof linkKind)}><option value='link'>Ссылка на страницу</option><option value='image'>Скачать изображение</option><option value='video'>Скачать видео</option><option value='audio'>Скачать аудио</option></select></label><label>Название<input value={linkTitle} onChange={e => setLinkTitle(e.target.value)} /></label><label>Адрес<input autoFocus type='url' required value={linkUrl} placeholder='https://' onChange={e => setLinkUrl(e.target.value)} /></label><p>Страница сохраняется как ссылка. Для офлайн-работы нужен прямой адрес доступного для скачивания файла. Защищённые видеосервисы не скачиваются.</p>{message && <p role='alert'>{message}</p>}<div className='dialog-actions'><button type='button' disabled={busy} onClick={() => setLinkOpen(false)}>Отмена</button><button type='submit' disabled={busy}>{busy ? 'Загрузка…' : 'Добавить'}</button></div></form></div>}
    <footer className="editor-status"><span className={storage.error ? 'save-error' : ''} role="status">{storage.status}{!isTauri() && ' · Предпросмотр в браузере'}</span><span>{items.length} объектов · {selectedItems.length} выбрано</span><span className="pan-hint">Пробел + мышь — перемещение · Shift + клик — выбор</span><button title="Масштаб 100% (1)" onClick={() => setCamera(c => zoomAt(c, { x: size.width / 2, y: size.height / 2 }, 1 / c.scale))}>{Math.round(camera.scale * 100)}%</button></footer>
  </main>;
}
