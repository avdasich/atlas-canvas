import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Stage, Layer, Transformer } from 'react-konva';
import Konva from 'konva';
import { isTauri } from '@tauri-apps/api/core';
import type { Country } from '../domain/countries';
import { type Camera, type CanvasItem, type ItemKind, type Scene, type Theme } from '../domain/scene';
import { arrangeItems, dimensions, fitCamera, itemBounds, placeItem, zoomAt, type Bounds } from '../domain/geometry';
import { commit, createHistory, redo, undo } from '../state/history';
import { repository } from '../services/SceneRepository';
import { useScene } from '../services/useScene';
import { ItemView, textConfig } from './editor/ItemView';
import PropertiesPanel from './editor/PropertiesPanel';

Konva.dragButtons = [0];
type Props = { country: Country; onBack: () => void };
type Composition = { items: CanvasItem[]; theme: Theme };
const shapeLabels: [ItemKind, string][] = [['rectangle', 'Прямоугольник'], ['square', 'Квадрат'], ['circle', 'Круг'], ['star', 'Звезда'], ['line', 'Линия'], ['arrow', 'Стрелка']];

export default function CountryCanvas({ country, onBack }: Props) {
  const storage = useScene(country);
  if (!storage.loaded) return <main className="load-screen"><h1>{country.name}</h1><p role={storage.error ? 'alert' : 'status'}>{storage.error || 'Загрузка холста…'}</p><div><button onClick={onBack}>← Карта</button>{storage.error && <button onClick={storage.reload}>Повторить загрузку</button>}</div></main>;
  if (storage.loaded.legacyKey) return <main className="load-screen"><h1>Сохраним прежний холст</h1><p>В стране «{country.name}» найдено объектов: {storage.loaded.scene.items.length}.</p><p>{isTauri() ? 'Перенести их в SQLite?' : 'Перенести их в новый формат браузерного предпросмотра?'} Расположение сохранится, исходная запись localStorage останется нетронутой.</p>{storage.error && <p role="alert">{storage.error}</p>}<div><button onClick={onBack}>← Карта</button><button disabled={storage.status === 'Перенос…'} onClick={() => void storage.migrate()}>Перенести холст</button></div></main>;
  return <Editor country={country} onBack={onBack} initial={storage.loaded.scene} storage={storage} />;
}

function Editor({ country, onBack, initial, storage }: Props & { initial: Scene; storage: ReturnType<typeof useScene> }) {
  const [history, setHistory] = useState(() => createHistory<Composition>({ items: initial.items, theme: initial.theme }));
  const { items, theme } = history.present;
  const [camera, setCamera] = useState<Camera>(initial.camera);
  const [selected, setSelected] = useState<string[]>([]);
  const [tool, setTool] = useState<'select' | 'pen'>('select');
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
  const clipboard = useRef<CanvasItem[]>([]);
  const selectedItems = items.filter(item => selected.includes(item.id));
  const editingItem = items.find(item => item.id === editing?.id);
  const nodes = () => stageRef.current?.find('.canvas-item') ?? [];
  const nodeFor = (id: string) => nodes().find(node => node.id() === id);

  const measureText = (item: CanvasItem) => {
    const text = new Konva.Text(textConfig(item, theme.fontFamily));
    const size = { width: text.width(), height: text.height() };
    text.destroy(); return size;
  };
  const bounds = (item: CanvasItem) => itemBounds(item, measureText);
  const viewport = (): Bounds => ({ left: -camera.x / camera.scale, top: -camera.y / camera.scale, right: (size.width - camera.x) / camera.scale, bottom: (size.height - camera.y) / camera.scale });
  const change = (fn: (composition: Composition) => Composition) => setHistory(h => commit(h, fn(h.present)));
  const changeItems = (fn: (items: CanvasItem[]) => CanvasItem[]) => change(c => ({ ...c, items: fn(c.items) }));
  const setTheme = (next: Theme) => change(c => ({ ...c, theme: next }));
  const showAll = (list = items) => setCamera(fitCamera(list.map(bounds), size));
  const performUndo = () => { setHistory(undo); setSelected([]); setEditing(null); };
  const performRedo = () => { setHistory(redo); setSelected([]); setEditing(null); };

  useLayoutEffect(() => {
    const currentItems = editing ? history.present.items.map(i => i.id === editing.id ? { ...i, content: editing.draft } : i) : history.present.items;
    storage.schedule({ schemaVersion: 2, items: currentItems, theme: history.present.theme, camera });
  }, [history.present, camera, editing, storage.schedule]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height) }));
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    transformerRef.current?.nodes(nodes().filter(node => selected.includes(node.id()) && !items.find(i => i.id === node.id())?.locked));
    transformerRef.current?.getLayer()?.batchDraw();
  }, [selected, items, tool, spaceHeld]);
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
    if (kind === 'note') { item.content = 'Новая заметка'; item.fontSize = 28; }
    if (kind === 'arrow' || kind === 'line') item.points = [0, 0, 160, 0];
    const placed = placeItem(item, items, viewport(), measureText);
    changeItems(list => [...list, placed]); setSelected([placed.id]); setTool('select'); setMenu(null); reveal(placed);
    if (kind === 'note') setEditing({ id: placed.id, draft: placed.content! });
  }
  function patch(p: Partial<CanvasItem>) {
    changeItems(list => list.map(item => selected.includes(item.id) ? { ...item, ...p } : item));
  }
  function remove() {
    changeItems(list => list.filter(item => !selected.includes(item.id) || item.locked)); setSelected([]); setMenu(null);
  }
  function duplicate(source = selectedItems) {
    let next = [...items]; const ids: string[] = [];
    for (const item of source) {
      const placed = placeItem({ ...item, id: crypto.randomUUID(), locked: false }, next, viewport(), measureText);
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
    storage.schedule({ schemaVersion: 2, items: currentItems, theme, camera });
    try { await storage.flush(); onBack(); } catch { setBusy(false); }
  }
  async function importPhoto(file?: File) {
    if (!file) return;
    setBusy(true); setMessage('Импорт фотографии…');
    try {
      const { assetId, width, height } = await repository.importImage(file);
      const ratio = Math.min(1, 420 / width, 340 / height);
      const item = placeItem({ id: crypto.randomUUID(), kind: 'image', assetId, x: 0, y: 0, width: width * ratio, height: height * ratio }, items, viewport(), measureText);
      changeItems(list => [...list, item]); setSelected([item.id]); setTool('select'); reveal(item); setMessage('Фотография скопирована в папку приложения.');
    } catch (e) { setMessage(`Импорт не выполнен: ${String(e)}`); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  }

  useEffect(() => {
    const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable);
    function down(e: KeyboardEvent) {
      if (typing(e.target) || editing || busy) return;
      const key = e.key.toLowerCase(), mod = e.metaKey || e.ctrlKey;
      if (e.code === 'Space') { e.preventDefault(); setSpaceHeld(true); return; }
      if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) performRedo(); else performUndo(); return; }
      if (mod && key === 'y') { e.preventDefault(); performRedo(); return; }
      if (mod && key === 'a') { e.preventDefault(); setSelected(items.map(i => i.id)); return; }
      if (mod && key === 'd') { e.preventDefault(); duplicate(); return; }
      if (mod && (key === 'c' || key === 'x')) { e.preventDefault(); clipboard.current = structuredClone(selectedItems); if (key === 'x') remove(); return; }
      if (mod && key === 'v') { e.preventDefault(); duplicate(clipboard.current); return; }
      if (mod || e.altKey) return;
      if (key === 'escape') { setSelected([]); setTool('select'); setMenu(null); }
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
    if (busy || editing) return;
    setMenu(null);
    const blank = event.target === stageRef.current;
    if (event.evt.button === 1 || (event.evt.button === 0 && (spaceHeld || (tool === 'select' && blank)))) {
      event.evt.preventDefault(); pan.current = { clientX: event.evt.clientX, clientY: event.evt.clientY, camera, moved: false, blank }; setPanning(true); return;
    }
    if (event.evt.button !== 0 || tool !== 'pen') return;
    const p = pointerWorld(); if (!p) return;
    drawing.current = { id: crypto.randomUUID(), kind: 'stroke', x: p.x, y: p.y, points: [0, 0, 0.01, 0.01] };
    setDraftStroke(drawing.current);
  }
  function pointerMove(event: Konva.KonvaEventObject<MouseEvent>) {
    const p = pan.current;
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
    if (pan.current?.blank && !pan.current.moved) setSelected([]);
    pan.current = null; setPanning(false);
    if (drawing.current) { const stroke = drawing.current; changeItems(list => [...list, stroke]); drawing.current = null; setDraftStroke(null); }
  }
  function syncNodes(ids: string[]) {
    const updates = new Map(ids.flatMap(id => {
      const node = nodeFor(id); return node ? [[id, { x: node.x(), y: node.y(), scaleX: node.scaleX(), scaleY: node.scaleY(), rotation: node.rotation() }] as const] : [];
    }));
    changeItems(list => list.map(item => updates.has(item.id) && !item.locked ? { ...item, ...updates.get(item.id) } : item));
  }
  function renderItem(item: CanvasItem, draft = false) {
    const common = {
      id: item.id, name: 'canvas-item', x: item.x, y: item.y, scaleX: item.scaleX ?? 1, scaleY: item.scaleY ?? 1,
      rotation: item.rotation ?? 0, opacity: item.opacity ?? 1, visible: editing?.id !== item.id,
      draggable: !draft && !item.locked && tool === 'select' && !spaceHeld && !busy,
      listening: !draft && tool === 'select' && !spaceHeld && !busy,
      onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (e.evt.button !== 0 || spaceHeld) return;
        if (e.evt.shiftKey) setSelected(ids => ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id]);
        else if (!selected.includes(item.id)) setSelected([item.id]);
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
  const bgImage = theme.pattern === 'dots' ? 'radial-gradient(circle, #85929e55 1px, transparent 1px)' : theme.pattern === 'grid' ? 'linear-gradient(#85929e33 1px, transparent 1px), linear-gradient(90deg, #85929e33 1px, transparent 1px)' : 'none';
  return <main className="country-workspace">
    <header className="country-toolbar"><button disabled={busy} onClick={() => void back()}>← Карта</button><div className="country-heading"><strong>{country.name}</strong><small>Личный атлас</small></div><div className="toolbar-spacer" />
      <button aria-label="Отменить" title="Отменить (⌘/Ctrl+Z)" disabled={!history.past.length || !!editing || busy} onClick={performUndo}>↶</button>
      <button aria-label="Повторить" title="Повторить (⌘/Ctrl+Shift+Z)" disabled={!history.future.length || !!editing || busy} onClick={performRedo}>↷</button>
      <button onClick={() => showAll()} title="Показать всё (F)">Показать всё</button>
      <button aria-pressed={showProperties} onClick={() => setShowProperties(v => !v)}>Свойства</button>
    </header>
    {(storage.error || message) && <div className={`editor-notice ${storage.error ? 'error' : ''}`} role={storage.error ? 'alert' : 'status'}>{storage.error || message}<button onClick={() => storage.error ? void storage.flush().catch(() => {}) : setMessage('')}>{storage.error ? 'Повторить сохранение' : 'Закрыть'}</button></div>}
    <div className="editor-body"><nav className="tool-rail" aria-label="Инструменты">
      <button title="Выбор (V). Перемещение холста — по пустому месту" aria-label="Выбор" aria-pressed={tool === 'select'} onClick={() => setTool('select')}>↖</button>
      <button title="Текст (T)" aria-label="Добавить текст" disabled={busy} onClick={() => add('note')}>T</button>
      <details className="shape-menu"><summary title="Фигуры" aria-label="Фигуры">◇</summary><div>{shapeLabels.map(([kind, label]) => <button key={kind} disabled={busy} onClick={e => { add(kind); e.currentTarget.closest('details')?.removeAttribute('open'); }}>{label}</button>)}</div></details>
      <button title="Карандаш (P/B)" aria-label="Карандаш" aria-pressed={tool === 'pen'} onClick={() => { setTool('pen'); setSelected([]); }}>✎</button>
      <button title="Добавить фотографию" aria-label="Добавить фото" disabled={busy} onClick={() => inputRef.current?.click()}>▧</button>
      <input ref={inputRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => void importPhoto(e.target.files?.[0])} />
      <div className="rail-divider" /><button title="Удалить выбранное" aria-label="Удалить" disabled={!selectedItems.length || busy} onClick={remove}>⌫</button>
    </nav>
    <section ref={containerRef} className="canvas-viewport" aria-label="Холст страны" style={{ backgroundColor: theme.background, backgroundImage: bgImage, backgroundSize: `${22 * camera.scale}px ${22 * camera.scale}px`, backgroundPosition: `${camera.x}px ${camera.y}px`, cursor: panning || spaceHeld ? 'grabbing' : tool === 'pen' ? 'crosshair' : 'default' }} onContextMenu={e => { e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); setMenu({ x: Math.min(e.clientX - rect.left, size.width - 220), y: Math.min(e.clientY - rect.top, size.height - 280) }); }}>
      <Stage ref={stageRef} width={size.width} height={size.height} x={camera.x} y={camera.y} scaleX={camera.scale} scaleY={camera.scale}
        onWheel={e => { e.evt.preventDefault(); if (editing) return; const p = stageRef.current?.getPointerPosition(); if (p) setCamera(c => zoomAt(c, p, Math.exp(-Math.max(-100, Math.min(100, e.evt.deltaY)) * 0.002))); }}
        onMouseDown={pointerDown} onMouseMove={pointerMove} onMouseUp={finishPointer} onMouseLeave={finishPointer}>
        <Layer>{items.map(item => renderItem(item))}{draftStroke && renderItem(draftStroke, true)}<Transformer ref={transformerRef} listening={tool === 'select' && !spaceHeld && !editing} rotateEnabled flipEnabled={false} keepRatio={selectedItems.length === 1 && selectedItems[0].kind === 'image'} anchorSize={9} borderStroke="#bf882e" anchorStroke="#bf882e" anchorFill="#fff" onTransformEnd={() => syncNodes(transformerRef.current?.nodes().map(n => n.id()) ?? [])} boundBoxFunc={(old, next) => Math.abs(next.width) < 8 || Math.abs(next.height) < 8 ? old : next} /></Layer>
      </Stage>
      {editing && editingItem && <div className="inline-text-wrap" style={{ left: camera.x + editingItem.x * camera.scale, top: camera.y + editingItem.y * camera.scale, transform: `rotate(${editingItem.rotation ?? 0}deg) scale(${camera.scale * (editingItem.scaleX ?? 1)}, ${camera.scale * (editingItem.scaleY ?? 1)})` }}><textarea ref={textRef} autoFocus aria-label="Текст заметки" value={editing.draft} style={{ width: editingItem.width ?? 300, fontFamily: editingItem.fontFamily ?? theme.fontFamily, fontSize: editingItem.fontSize ?? 26, fontWeight: editingItem.fontStyle === 'bold' ? 'bold' : 'normal', color: editingItem.fill ?? '#243447', lineHeight: 1.3 }} onChange={e => setEditing({ ...editing, draft: e.target.value })} onBlur={() => finishText()} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); finishText(true); } if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); finishText(); } }} /><span>⌘/Ctrl + Enter — готово · Esc — отмена</span></div>}
      {!items.length && <div className="empty-canvas"><span>Ваше пространство для открытий</span><p>Добавьте текст, фигуру или фотографию.<br />У каждой страны — свой холст.</p></div>}
      {menu && <div className="context-menu" role="menu" style={{ left: Math.max(0, menu.x), top: Math.max(0, menu.y) }}><button onClick={() => add('note')}>Добавить текст</button><button onClick={() => { showAll(); setMenu(null); }}>Показать всё <kbd>F</kbd></button><button disabled={items.length < 2} onClick={arrange}>Разложить без пересечений</button><button disabled={!selectedItems.length} onClick={() => duplicate()}>Дублировать</button><button disabled={!selectedItems.length} onClick={remove}>Удалить</button><button onClick={() => { setCamera({ x: 0, y: 0, scale: 1 }); setMenu(null); }}>Сбросить вид</button><button onClick={() => setMenu(null)}>Закрыть меню</button></div>}
    </section>
    {showProperties && <PropertiesPanel selected={selectedItems} theme={theme} setTheme={setTheme} sizeOf={baseSize} patch={patch} resize={(axis, value) => { if (selectedItems.length !== 1) return; const i = selectedItems[0], base = baseSize(i); patch(axis === 'width' ? { scaleX: value / base.width } : { scaleY: value / base.height }); }} remove={remove} duplicate={() => duplicate()} layer={layer} />}
    </div>
    <footer className="editor-status"><span className={storage.error ? 'save-error' : ''} role="status">{storage.status}{!isTauri() && ' · Предпросмотр в браузере'}</span><span>{items.length} объектов · {selectedItems.length} выбрано</span><span className="pan-hint">Пробел + мышь — перемещение · Shift + клик — выбор</span><button title="Масштаб 100% (1)" onClick={() => setCamera(c => zoomAt(c, { x: size.width / 2, y: size.height / 2 }, 1 / c.scale))}>{Math.round(camera.scale * 100)}%</button></footer>
  </main>;
}
