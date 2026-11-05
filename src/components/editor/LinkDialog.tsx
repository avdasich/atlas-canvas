import { t as tr, translateMessage } from '../../i18n/index';
import type { LinkKind } from '../../services/useCanvasTransfers';
type Props = {
  linkKind: LinkKind;
  linkUrl: string;
  linkTitle: string;
  setLinkKind: (kind: LinkKind) => void;
  setLinkUrl: (url: string) => void;
  setLinkTitle: (title: string) => void;
  busy: boolean;
  message: string;
  downloadProgress: string;
  cancellable: boolean;
  onCancel: () => void;
  onClose: () => void;
  onSubmit: () => void;
};
export default function LinkDialog({
  linkKind,
  linkUrl,
  linkTitle,
  setLinkKind,
  setLinkUrl,
  setLinkTitle,
  busy,
  message,
  downloadProgress,
  cancellable,
  onCancel,
  onClose,
  onSubmit,
}: Props) {
  return (
    <div className="dialog-backdrop">
      <form
        className="app-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <h2>{tr('Ссылка или медиа по URL')}</h2>
        <label>
          {tr('Тип')}
          <select
            aria-label={tr('Тип содержимого по URL')}
            value={linkKind}
            onChange={(e) => setLinkKind(e.target.value as typeof linkKind)}
          >
            <option value="link">{tr('Ссылка на страницу')}</option>
            <option value="image">{tr('Скачать изображение')}</option>
            <option value="video">{tr('Скачать видео')}</option>
            <option value="audio">{tr('Скачать аудио')}</option>
          </select>
        </label>
        <label>
          {tr('Название')}
          <input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
        </label>
        <label>
          {tr('Адрес')}
          <input
            autoFocus
            type="url"
            required
            value={linkUrl}
            placeholder="https://"
            onChange={(e) => setLinkUrl(e.target.value)}
          />
        </label>
        <p>
          {tr(
            'Страница сохраняется как ссылка. Для офлайн-работы нужен прямой адрес доступного для скачивания файла. Защищённые видеосервисы не скачиваются.',
          )}
        </p>
        {message && <p role="alert">{translateMessage(message)}</p>}
        {busy && downloadProgress && (
          <p role="status">
            {tr('Загрузка:') + ' '}
            {downloadProgress}
          </p>
        )}
        <div className="dialog-actions">
          {busy && cancellable && (
            <button
              type="button"
              onClick={() => {
                onCancel();
              }}
            >
              {tr('Остановить загрузку')}
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => onClose()}>
            {tr('Отмена')}
          </button>
          <button type="submit" disabled={busy}>
            {busy ? tr('Загрузка…') : tr('Добавить')}
          </button>
        </div>
      </form>
    </div>
  );
}
