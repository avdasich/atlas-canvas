import { useState } from 'react';
import { isLanguage, t, translateMessage } from '../i18n/index';
import { useLanguage } from '../i18n/useLanguage';

export default function LanguageSelect() {
  const { language, changeLanguage } = useLanguage();
  const [error, setError] = useState('');
  return (
    <label className="language-select">
      <span>{t('Язык')}</span>
      <select
        aria-label={t('Язык интерфейса')}
        value={language}
        onChange={(event) => {
          const next = event.target.value;
          if (!isLanguage(next)) return;
          setError('');
          void changeLanguage(next).catch((e: unknown) =>
            setError(t('Не удалось сохранить язык: {0}', String(e))),
          );
        }}
      >
        <option value="ru">Русский</option>
        <option value="en">English</option>
      </select>
      {error && <span role="alert">{translateMessage(error)}</span>}
    </label>
  );
}
