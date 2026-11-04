import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Size } from '../../domain/geometry';
import { supportsMaterial } from '../../domain/materials';
import type { CanvasItem, Theme } from '../../domain/scene';
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
    <aside className="properties-panel" aria-label="Свойства">
      <h2>{selected.length ? `Выделено: ${selected.length}` : 'Оформление страны'}</h2>
      {item && (
        <>
          <div className="property-grid">
            <Numeric label="X" value={item.x} onChange={(x) => patch({ x })} />
            <Numeric label="Y" value={item.y} onChange={(y) => patch({ y })} />
            <Numeric
              label="Ширина"
              value={sizeOf(item).width * (item.scaleX ?? 1)}
              min={1}
              onChange={(v) => resize('width', v)}
            />
            <Numeric
              label="Высота"
              value={sizeOf(item).height * (item.scaleY ?? 1)}
              min={1}
              onChange={(v) => resize('height', v)}
            />
          </div>
          <Numeric
            label="Поворот, °"
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
            label="Прозрачность, %"
            value={(item?.opacity ?? 1) * 100}
            min={0}
            max={100}
            onChange={(v) => patch({ opacity: v / 100 })}
          />
          {!item?.glass?.enabled && (
            <label className="property-field">
              Цвет
              <input
                aria-label="Цвет объекта"
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
                  Обводка
                  <input
                    type="color"
                    aria-label="Цвет обводки"
                    value={item.stroke ?? '#578b9a'}
                    onChange={(e) => patch({ stroke: e.target.value })}
                  />
                </label>
                <Numeric
                  label="Толщина линии"
                  value={item.strokeWidth ?? 2}
                  min={0}
                  max={100}
                  onChange={(strokeWidth) => patch({ strokeWidth })}
                />
              </>
            )}
          {item && (
            <Numeric
              label="Тень"
              value={item.shadowBlur ?? 0}
              min={0}
              max={100}
              onChange={(shadowBlur) => patch({ shadowBlur })}
            />
          )}
          {item && ['line', 'arrow', 'stroke'].includes(item.kind) && (
            <>
              <label className="property-field">
                Тип линии
                <select
                  aria-label="Тип линии"
                  value={item.dash?.length ? 'dashed' : 'solid'}
                  onChange={(e) => patch({ dash: e.target.value === 'dashed' ? [10, 7] : [] })}
                >
                  <option value="solid">Сплошная</option>
                  <option value="dashed">Пунктирная</option>
                </select>
              </label>
              {item.kind === 'stroke' && (
                <Numeric
                  label="Сглаживание"
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
                    Наконечник в начале
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={item.arrowEnd ?? true}
                      onChange={(e) => patch({ arrowEnd: e.target.checked })}
                    />
                    Наконечник в конце
                  </label>
                </>
              )}
            </>
          )}
          {item && ['rectangle', 'square'].includes(item.kind) && (
            <Numeric
              label="Скругление"
              value={item.cornerRadius ?? 8}
              min={0}
              max={200}
              onChange={(cornerRadius) => patch({ cornerRadius })}
            />
          )}
          {item?.kind === 'disclosure' && <DisclosureProperties item={item} patch={patch} />}
          {(item?.kind === 'note' || item?.kind === 'disclosure' || table) && (
            <label className="property-field">
              Шрифт
              <select
                aria-label="Шрифт текста"
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
                Обрезать изображение
              </button>
              {item.crop && (
                <button disabled={item.locked} onClick={() => onResetCrop(item)}>
                  Вернуть изображение целиком
                </button>
              )}
            </div>
          )}
          {item?.kind === 'image' && (
            <label className="property-field">
              Заменить файл фото
              <input
                aria-label="Заменить файл фото"
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
            <button onClick={() => onReplace(item)}>Заменить файл медиа</button>
          )}
          {item?.assetId && isTauri() && (
            <div className="panel-actions">
              <button
                onClick={() => void invoke('open_asset', { assetId: item.assetId, reveal: false })}
              >
                Открыть оригинал
              </button>
              <button
                onClick={() => void invoke('open_asset', { assetId: item.assetId, reveal: true })}
              >
                Показать файл в папке
              </button>
            </div>
          )}
          <label className="check-field">
            <input
              type="checkbox"
              checked={selected.every((i) => i.locked)}
              onChange={(e) => patch({ locked: e.target.checked })}
            />
            Заблокировать
          </label>
          <div className="panel-actions">
            <button onClick={() => layer(true)}>На передний план</button>
            <button onClick={() => layer(false)}>На задний план</button>
            <button onClick={() => stepLayer(1)}>На слой выше</button>
            <button onClick={() => stepLayer(-1)}>На слой ниже</button>
            <button disabled={selected.length < 2} onClick={() => group(false)}>
              Сгруппировать
            </button>
            <button disabled={!selected.some((i) => i.groupId)} onClick={() => group(true)}>
              Разгруппировать
            </button>
            <button onClick={duplicate}>Дублировать</button>
            <button className="danger" onClick={remove}>
              Удалить
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
