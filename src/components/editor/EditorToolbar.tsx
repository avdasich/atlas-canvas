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
        ← Карта
      </button>
      <div className="country-heading">
        <strong>{props.countryName}</strong>
        <small>Личный атлас</small>
      </div>
      <div className="toolbar-spacer" />
      <button
        aria-label="Отменить"
        title="Отменить (⌘/Ctrl+Z)"
        disabled={!props.canUndo || props.busy}
        onClick={props.onUndo}
      >
        ↶
      </button>
      <button
        aria-label="Повторить"
        title="Повторить (⌘/Ctrl+Shift+Z)"
        disabled={!props.canRedo || props.busy}
        onClick={props.onRedo}
      >
        ↷
      </button>
      <button title="Показать всё (F)" onClick={props.onFit}>
        Показать всё
      </button>
      <button title="Просмотр (Shift+P)" onClick={props.onView}>
        Просмотр
      </button>
      <button title="Поиск (⌘/Ctrl+F)" onClick={props.onSearch}>
        Поиск
      </button>
      <details className="editor-file-menu">
        <summary>Ещё</summary>
        <div>
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
        title="Свойства (Shift+I)"
        aria-pressed={props.properties}
        onClick={props.onProperties}
      >
        Свойства
      </button>
    </header>
  );
}
