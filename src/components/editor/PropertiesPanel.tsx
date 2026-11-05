import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Size } from '../../domain/geometry';
import { supportsMaterial } from '../../domain/materials';
import type { CanvasItem, Theme } from '../../domain/scene';
import { t as tr } from '../../i18n/index';
import Numeric from './controls/NumericField';
import type { CellSelection } from './DomObjects';
import AppearanceProperties from './properties/AppearanceProperties';
import DisclosureProperties from './properties/DisclosureProperties';
import LayerList from './properties/LayerList';
import MaterialProperties from './properties/MaterialProperties';
import TableProperties from './properties/TableProperties';
import TextProperties from './properties/TextProperties';
import ShortcutHelp from './ShortcutHelp';
type Props = {
  onReplace: (item: CanvasItem, file?: File) => void;
  onCrop: (item: CanvasItem) => void;
  onResetCrop: (item: CanvasItem) => void;
  selected: CanvasItem[];
  items: CanvasItem[];
  theme: Theme;
  sizeOf: (item: CanvasItem) => Size;
  patch: (patch: Partial<CanvasItem>) => void;
  setTheme: (theme: Theme) => void;
  resize: (axis: 'width' | 'height', value: number) => void;
  remove: () => void;
  duplicate: () => void;
  layer: (front: boolean) => void;
  stepLayer: (direction: 1 | -1) => void;
  select: (id: string) => void;
  toggleHidden: (id: string) => void;
  cell: CellSelection | null;
  fontOptions: { value: string; label: string }[];
  importFont: () => void;
  onBackground: (file?: File) => void;
  group: (ungroup: boolean) => void;
};
export default function PropertiesPanel({
  onReplace,
  onCrop,
  onResetCrop,
  selected,
  items,
  theme,
  sizeOf,
  patch,
  setTheme,
  resize,
  remove,
  duplicate,
  layer,
  stepLayer,
  select,
  toggleHidden,
  cell,
  fontOptions,
  importFont,
  onBackground,
  group,
}: Props) {
  const item = selected.length === 1 ? selected[0] : undefined;
  const table = item?.table;
  const fonts = (
    <>
      {fontOptions.map((font) => (
        <option key={font.value} value={font.value}>
          {font.label}
        </option>
      ))}
    </>
  );
  return (
    <aside className="properties-panel" aria-label={tr('Свойства')}>
      <h2>{selected.length ? tr('Выделено: {0}', selected.length) : tr('Оформление страны')}</h2>
      {item && (
        <>
          <div className="property-grid">
            <Numeric label="X" value={item.x} onChange={(x) => patch({ x })} />
            <Numeric label="Y" value={item.y} onChange={(y) => patch({ y })} />
            <Numeric
              label={tr('Ширина')}
              value={sizeOf(item).width * (item.scaleX ?? 1)}
              min={1}
              onChange={(v) => resize('width', v)}
            />
            <Numeric
              label={tr('Высота')}
              value={sizeOf(item).height * (item.scaleY ?? 1)}
              min={1}
              onChange={(v) => resize('height', v)}
            />
          </div>
          <Numeric
            label={tr('Поворот, °')}
            value={item.rotation ?? 0}
            onChange={(rotation) => patch({ rotation })}
          />
        </>
      )}
      {selected.length > 0 && selected.every(supportsMaterial) && (
        <MaterialProperties item={selected[0]} patch={patch} />
      )}
      {!!selected.length && (
        <>
          <Numeric
            label={tr('Прозрачность, %')}
            value={(item?.opacity ?? 1) * 100}
            min={0}
            max={100}
            onChange={(v) => patch({ opacity: v / 100 })}
          />
          {!item?.glass?.enabled && (
            <label className="property-field">
              {tr('Цвет')}
              <input
                aria-label={tr('Цвет объекта')}
                type="color"
                value={
                  item?.fill ??
                  (item?.kind === 'note'
                    ? '#243447'
                    : item?.kind === 'star'
                      ? '#f1d587'
                      : '#a7d7df')
                }
                onChange={(e) => patch({ fill: e.target.value })}
              />
            </label>
          )}
          {item &&
            !['image', 'table', 'video', 'audio', 'link', 'disclosure'].includes(item.kind) && (
              <>
                <label className="property-field">
                  {tr('Обводка')}
                  <input
                    type="color"
                    aria-label={tr('Цвет обводки')}
                    value={item.stroke ?? '#578b9a'}
                    onChange={(e) => patch({ stroke: e.target.value })}
                  />
                </label>
                <Numeric
                  label={tr('Толщина линии')}
                  value={item.strokeWidth ?? 2}
                  min={0}
                  max={100}
                  onChange={(strokeWidth) => patch({ strokeWidth })}
                />
              </>
            )}
          {item && (
            <Numeric
              label={tr('Тень')}
              value={item.shadowBlur ?? 0}
              min={0}
              max={100}
              onChange={(shadowBlur) => patch({ shadowBlur })}
            />
          )}
          {item && ['line', 'arrow', 'stroke'].includes(item.kind) && (
            <>
              <label className="property-field">
                {tr('Тип линии')}
                <select
                  aria-label={tr('Тип линии')}
                  value={item.dash?.length ? 'dashed' : 'solid'}
                  onChange={(e) => patch({ dash: e.target.value === 'dashed' ? [10, 7] : [] })}
                >
                  <option value="solid">{tr('Сплошная')}</option>
                  <option value="dashed">{tr('Пунктирная')}</option>
                </select>
              </label>
              {item.kind === 'stroke' && (
                <Numeric
                  label={tr('Сглаживание')}
                  value={item.tension ?? 0}
                  min={0}
                  max={1}
                  onChange={(tension) => patch({ tension })}
                />
              )}
              {item.kind === 'arrow' && (
                <>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={item.arrowStart ?? false}
                      onChange={(e) => patch({ arrowStart: e.target.checked })}
                    />
                    {tr('Наконечник в начале')}
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={item.arrowEnd ?? true}
                      onChange={(e) => patch({ arrowEnd: e.target.checked })}
                    />
                    {tr('Наконечник в конце')}
                  </label>
                </>
              )}
            </>
          )}
          {item && ['rectangle', 'square'].includes(item.kind) && (
            <Numeric
              label={tr('Скругление')}
              value={item.cornerRadius ?? 8}
              min={0}
              max={200}
              onChange={(cornerRadius) => patch({ cornerRadius })}
            />
          )}
          {item?.kind === 'disclosure' && <DisclosureProperties item={item} patch={patch} />}
          {(item?.kind === 'note' || item?.kind === 'disclosure' || table) && (
            <label className="property-field">
              {tr('Шрифт')}
              <select
                aria-label={tr('Шрифт текста')}
                value={item.fontFamily ?? theme.fontFamily}
                onChange={(e) => patch({ fontFamily: e.target.value })}
              >
                {fonts}
              </select>
            </label>
          )}
          {item?.kind === 'note' && <TextProperties item={item} patch={patch} />}
          {table && item && <TableProperties item={item} theme={theme} cell={cell} patch={patch} />}
          {item?.kind === 'image' && (
            <div className="panel-actions">
              <button disabled={item.locked} onClick={() => onCrop(item)}>
                {tr('Обрезать изображение')}
              </button>
              {item.crop && (
                <button disabled={item.locked} onClick={() => onResetCrop(item)}>
                  {tr('Вернуть изображение целиком')}
                </button>
              )}
            </div>
          )}
          {item?.kind === 'image' && (
            <label className="property-field">
              {tr('Заменить файл фото')}
              <input
                aria-label={tr('Заменить файл фото')}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onReplace(item, file);
                  e.target.value = '';
                }}
              />
            </label>
          )}
          {item && ['video', 'audio'].includes(item.kind) && (
            <button onClick={() => onReplace(item)}>{tr('Заменить файл медиа')}</button>
          )}
          {item?.assetId && isTauri() && (
            <div className="panel-actions">
              <button
                onClick={() => void invoke('open_asset', { assetId: item.assetId, reveal: false })}
              >
                {tr('Открыть оригинал')}
              </button>
              <button
                onClick={() => void invoke('open_asset', { assetId: item.assetId, reveal: true })}
              >
                {tr('Показать файл в папке')}
              </button>
            </div>
          )}
          <label className="check-field">
            <input
              type="checkbox"
              checked={selected.every((i) => i.locked)}
              onChange={(e) => patch({ locked: e.target.checked })}
            />
            {tr('Заблокировать')}
          </label>
          <div className="panel-actions">
            <button onClick={() => layer(true)}>{tr('На передний план')}</button>
            <button onClick={() => layer(false)}>{tr('На задний план')}</button>
            <button onClick={() => stepLayer(1)}>{tr('На слой выше')}</button>
            <button onClick={() => stepLayer(-1)}>{tr('На слой ниже')}</button>
            <button disabled={selected.length < 2} onClick={() => group(false)}>
              {tr('Сгруппировать')}
            </button>
            <button disabled={!selected.some((i) => i.groupId)} onClick={() => group(true)}>
              {tr('Разгруппировать')}
            </button>
            <button onClick={duplicate}>{tr('Дублировать')}</button>
            <button className="danger" onClick={remove}>
              {tr('Удалить')}
            </button>
          </div>
        </>
      )}
      {!selected.length && (
        <AppearanceProperties
          theme={theme}
          setTheme={setTheme}
          fontOptions={fontOptions}
          importFont={importFont}
          onBackground={onBackground}
        />
      )}
      <LayerList items={items} selected={selected} select={select} toggleHidden={toggleHidden} />
      <ShortcutHelp />
    </aside>
  );
}
