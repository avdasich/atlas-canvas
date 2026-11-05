import type { Theme } from '../../../domain/scene';
import { t as tr } from '../../../i18n/index';
import { ShimmerSettings } from '../SnowShimmer';
import ThemeLibrary from '../ThemeLibrary';
import Numeric from '../controls/NumericField';
export default function AppearanceProperties({
  theme,
  setTheme,
  fontOptions,
  importFont,
  onBackground,
}: {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  fontOptions: { value: string; label: string }[];
  importFont: () => void;
  onBackground: (file?: File) => void;
}) {
  const fonts = fontOptions.map((font) => (
    <option key={font.value} value={font.value}>
      {font.label}
    </option>
  ));
  return (
    <>
      <fieldset className="glass-settings">
        <legend>{tr('Панели редактора')}</legend>
        <label className="check-field">
          <input
            type="checkbox"
            checked={theme.glassPanels ?? false}
            onChange={(e) => setTheme({ ...theme, glassPanels: e.target.checked })}
          />
          {tr('Стеклянные панели')}
        </label>
      </fieldset>
      <ThemeLibrary theme={theme} onChange={setTheme} />
      <ShimmerSettings
        value={theme.shimmer}
        onChange={(shimmer) => setTheme({ ...theme, shimmer })}
      />
      <div className="theme-presets">
        <button
          onClick={() =>
            setTheme({
              ...theme,
              backgroundType: 'solid',
              background: '#f8fafb',
              textColor: '#243447',
              pattern: 'dots',
              patternColor: '#85929e',
            })
          }
        >
          {tr('Светлая')}
        </button>
        <button
          onClick={() =>
            setTheme({
              ...theme,
              backgroundType: 'gradient',
              background: '#f5ead4',
              textColor: '#493f32',
              secondary: '#e9d3ad',
              pattern: 'none',
            })
          }
        >
          {tr('Песочная')}
        </button>
        <button
          onClick={() =>
            setTheme({
              ...theme,
              backgroundType: 'solid',
              background: '#26323d',
              patternColor: '#8dacc5',
              pattern: 'grid',
              textColor: '#edf3f8',
            })
          }
        >
          {tr('Ночная')}
        </button>
        <button
          onClick={() =>
            setTheme({
              ...theme,
              backgroundType: 'solid',
              background: '#63717f',
              textColor: '#f1f6fb',
              pattern: 'none',
              shimmer: {
                intensity: 0.75,
                speed: 0.7,
                color: '#ffffff',
                ...theme.shimmer,
                enabled: true,
              },
            })
          }
        >
          {tr('Снег')}
        </button>
      </div>
      <label className="property-field">
        {tr('Тип фона')}
        <select
          aria-label={tr('Тип фона')}
          value={theme.backgroundType ?? 'solid'}
          onChange={(e) =>
            setTheme({ ...theme, backgroundType: e.target.value as Theme['backgroundType'] })
          }
        >
          <option value="solid">{tr('Цвет')}</option>
          <option value="gradient">{tr('Градиент')}</option>
          <option value="image">{tr('Изображение')}</option>
        </select>
      </label>
      <label className="property-field">
        {tr('Фон')}
        <input
          aria-label={tr('Цвет фона')}
          type="color"
          value={theme.background}
          onChange={(e) => setTheme({ ...theme, background: e.target.value })}
        />
      </label>
      {theme.backgroundType === 'gradient' && (
        <>
          <label className="property-field">
            {tr('Второй цвет')}
            <input
              type="color"
              aria-label={tr('Второй цвет фона')}
              value={theme.secondary ?? '#dce8ec'}
              onChange={(e) => setTheme({ ...theme, secondary: e.target.value })}
            />
          </label>
          <Numeric
            label={tr('Угол градиента')}
            value={theme.angle ?? 135}
            onChange={(angle) => setTheme({ ...theme, angle })}
          />
        </>
      )}
      {theme.backgroundType === 'image' && (
        <>
          <label className="property-field">
            {tr('Фоновое изображение')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => onBackground(e.target.files?.[0])}
            />
          </label>
          <select
            aria-label={tr('Размещение фона')}
            value={theme.imageMode ?? 'cover'}
            onChange={(e) =>
              setTheme({ ...theme, imageMode: e.target.value as Theme['imageMode'] })
            }
          >
            <option value="cover">{tr('Заполнить')}</option>
            <option value="contain">{tr('Вписать')}</option>
            <option value="repeat">{tr('Повторять')}</option>
            <option value="stretch">{tr('Растянуть')}</option>
          </select>
          <Numeric
            label={tr('Масштаб фонового изображения, %')}
            value={(theme.imageScale ?? 1) * 100}
            min={10}
            max={1000}
            onChange={(n) => setTheme({ ...theme, imageScale: n / 100 })}
          />
          <Numeric
            label={tr('Сдвиг фона X')}
            value={theme.imageX ?? 0}
            onChange={(imageX) => setTheme({ ...theme, imageX })}
          />
          <Numeric
            label={tr('Сдвиг фона Y')}
            value={theme.imageY ?? 0}
            onChange={(imageY) => setTheme({ ...theme, imageY })}
          />
        </>
      )}
      <Numeric
        label={tr('Непрозрачность фона, %')}
        value={(theme.backgroundOpacity ?? 1) * 100}
        min={0}
        max={100}
        onChange={(n) => setTheme({ ...theme, backgroundOpacity: n / 100 })}
      />
      <label className="property-field">
        {tr('Цвет текста страны')}
        <input
          type="color"
          value={theme.textColor ?? '#243447'}
          onChange={(e) => setTheme({ ...theme, textColor: e.target.value })}
        />
      </label>
      <label className="property-field">
        {tr('Узор')}
        <select
          aria-label={tr('Узор фона')}
          value={theme.pattern}
          onChange={(e) => setTheme({ ...theme, pattern: e.target.value as Theme['pattern'] })}
        >
          <option value="dots">{tr('Точки')}</option>
          <option value="grid">{tr('Сетка')}</option>
          <option value="lines">{tr('Линии')}</option>
          <option value="none">{tr('Без узора')}</option>
        </select>
      </label>
      <label className="property-field">
        {tr('Цвет узора')}
        <input
          type="color"
          value={theme.patternColor ?? '#85929e'}
          onChange={(e) => setTheme({ ...theme, patternColor: e.target.value })}
        />
      </label>
      <Numeric
        label={tr('Прозрачность узора, %')}
        value={(theme.patternOpacity ?? 0.3) * 100}
        min={0}
        max={100}
        onChange={(v) => setTheme({ ...theme, patternOpacity: v / 100 })}
      />
      <Numeric
        label={tr('Шаг сетки')}
        value={theme.gridSize ?? 22}
        min={4}
        max={200}
        onChange={(gridSize) => setTheme({ ...theme, gridSize })}
      />
      <label className="check-field">
        <input
          type="checkbox"
          checked={theme.snap ?? false}
          onChange={(e) => setTheme({ ...theme, snap: e.target.checked })}
        />
        {tr('Привязка к сетке')}
      </label>
      <label className="property-field">
        {tr('Шрифт страны')}
        <select
          aria-label={tr('Шрифт страны')}
          value={theme.fontFamily}
          onChange={(e) => setTheme({ ...theme, fontFamily: e.target.value })}
        >
          {fonts}
        </select>
      </label>
      <button onClick={importFont}>{tr('Добавить локальный шрифт')}</button>
    </>
  );
}
