import type { CanvasItem, Theme } from '../../domain/scene';
import type { Size } from '../../domain/geometry';
const fonts = ['Arial', 'Georgia', 'Verdana', 'Times New Roman', 'Courier New', 'system-ui'];
type Props = {
  selected: CanvasItem[]; theme: Theme; sizeOf: (item: CanvasItem) => Size;
  patch: (patch: Partial<CanvasItem>) => void; setTheme: (theme: Theme) => void;
  resize: (axis: 'width' | 'height', value: number) => void;
  remove: () => void; duplicate: () => void; layer: (front: boolean) => void;
};
function Numeric({ label, value, min, max, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return <label className="property-field">{label}<input aria-label={label} type="number" value={Math.round(value * 100) / 100} min={min} max={max} step="any" onChange={e => {
    if (!e.target.value.trim()) return;
    const n = Number(e.target.value);
    if (Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n);
  }} /></label>;
}
export default function PropertiesPanel({ selected, theme, sizeOf, patch, setTheme, resize, remove, duplicate, layer }: Props) {
  const item = selected.length === 1 ? selected[0] : undefined;
  return <aside className="properties-panel" aria-label="Свойства">
    <h2>{selected.length ? `Выделено: ${selected.length}` : 'Оформление страны'}</h2>
    {item && <>
      <div className="property-grid"><Numeric label="X" value={item.x} onChange={x => patch({ x })} /><Numeric label="Y" value={item.y} onChange={y => patch({ y })} />
        <Numeric label="Ширина" value={sizeOf(item).width * (item.scaleX ?? 1)} min={1} onChange={v => resize('width', v)} />
        <Numeric label="Высота" value={sizeOf(item).height * (item.scaleY ?? 1)} min={1} onChange={v => resize('height', v)} />
      </div>
      <Numeric label="Поворот, °" value={item.rotation ?? 0} onChange={rotation => patch({ rotation })} />
    </>}
    {!!selected.length && <>
      <Numeric label="Прозрачность, %" value={(item?.opacity ?? 1) * 100} min={0} max={100} onChange={v => patch({ opacity: v / 100 })} />
      <label className="property-field">Цвет<input aria-label="Цвет объекта" type="color" value={item?.fill ?? (item?.kind === 'note' ? '#243447' : item?.kind === 'star' ? '#f1d587' : item?.kind === 'circle' ? '#f3c2b2' : '#a7d7df')} onChange={e => patch({ fill: e.target.value, stroke: e.target.value })} /></label>
      {item?.kind === 'note' && <>
        <Numeric label="Размер шрифта" value={item.fontSize ?? 26} min={6} max={400} onChange={fontSize => patch({ fontSize })} />
        <label className="property-field">Шрифт<select aria-label="Шрифт текста" value={item.fontFamily ?? theme.fontFamily} onChange={e => patch({ fontFamily: e.target.value })}>{fonts.map(font => <option key={font}>{font}</option>)}</select></label>
        <button onClick={() => patch({ fontStyle: item.fontStyle === 'bold' ? 'normal' : 'bold' })} aria-pressed={item.fontStyle === 'bold'}>Жирный</button>
      </>}
      <label className="check-field"><input type="checkbox" checked={selected.every(i => i.locked)} onChange={e => patch({ locked: e.target.checked })} />Заблокировать</label>
      <div className="panel-actions"><button onClick={() => layer(true)}>На передний план</button><button onClick={() => layer(false)}>На задний план</button><button onClick={duplicate}>Дублировать</button><button className="danger" onClick={remove}>Удалить</button></div>
    </>}
    {!selected.length && <>
      <label className="property-field">Фон<input aria-label="Цвет фона" type="color" value={theme.background} onChange={e => setTheme({ ...theme, background: e.target.value })} /></label>
      <label className="property-field">Узор<select aria-label="Узор фона" value={theme.pattern} onChange={e => setTheme({ ...theme, pattern: e.target.value as Theme['pattern'] })}><option value="dots">Точки</option><option value="grid">Сетка</option><option value="none">Без узора</option></select></label>
      <label className="property-field">Шрифт страны<select aria-label="Шрифт страны" value={theme.fontFamily} onChange={e => setTheme({ ...theme, fontFamily: e.target.value })}>{fonts.map(font => <option key={font}>{font}</option>)}</select></label>
      <p className="panel-hint">Оформление сохраняется только для этой страны. Выберите объект для настройки его свойств.</p>
    </>}
    <details className="shortcut-help"><summary>Горячие клавиши</summary><p>V — выбор · P/B — карандаш · T — текст · R — прямоугольник · O — круг</p><p>Shift + клик — несколько объектов<br />Пробел + мышь — перемещение<br />F — показать всё · 1 — 100%</p><p>⌘/Ctrl + Z — отменить<br />⌘/Ctrl + Shift + Z — повторить<br />⌘/Ctrl + D — дублировать<br />⌘/Ctrl + A — выделить всё<br />Delete — удалить · Esc — снять выбор</p><p>Текст: двойной клик, ⌘/Ctrl + Enter — готово, Esc — отменить ввод.</p></details>
  </aside>;
}
