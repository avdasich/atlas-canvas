import { t as tr } from '../../i18n/index';
import LanguageSelect from '../LanguageSelect';
export type ToolbarMenuItem = {
  label: string;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
};
type Props = {
  countryName: string;
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onBack: () => void | Promise<void>;
  onUndo: () => void;
  onRedo: () => void;
  onFit: () => void;
  onView: () => void;
  onSearch: () => void;
  properties: boolean;
  onProperties: () => void;
  menu: ToolbarMenuItem[];
};
export default function EditorToolbar(props: Props) {
  return (
    <header className="country-toolbar">
      <button disabled={props.busy} onClick={() => void props.onBack()}>
        {tr('← Карта')}
      </button>
      <div className="country-heading">
        <strong>{props.countryName}</strong>
        <small>{tr('Личный атлас')}</small>
      </div>
      <div className="toolbar-spacer" />
      <button
        aria-label={tr('Отменить')}
        title={tr('Отменить (⌘/Ctrl+Z)')}
        disabled={!props.canUndo || props.busy}
        onClick={props.onUndo}
      >
        ↶
      </button>
      <button
        aria-label={tr('Повторить')}
        title={tr('Повторить (⌘/Ctrl+Shift+Z)')}
        disabled={!props.canRedo || props.busy}
        onClick={props.onRedo}
      >
        ↷
      </button>
      <button title={tr('Показать всё (F)')} onClick={props.onFit}>
        {tr('Показать всё')}
      </button>
      <button title={tr('Просмотр (Shift+P)')} onClick={props.onView}>
        {tr('Просмотр')}
      </button>
      <button title={tr('Поиск (⌘/Ctrl+F)')} onClick={props.onSearch}>
        {tr('Поиск')}
      </button>
      <details className="editor-file-menu">
        <summary>{tr('Ещё')}</summary>
        <div>
          <LanguageSelect />
          {props.menu.map((item) => (
            <button
              key={item.label}
              disabled={item.disabled || props.busy}
              onClick={() => void item.onClick()}
            >
              {item.label}
            </button>
          ))}
        </div>
      </details>
      <button
        title={tr('Свойства (Shift+I)')}
        aria-pressed={props.properties}
        onClick={props.onProperties}
      >
        {tr('Свойства')}
      </button>
    </header>
  );
}
