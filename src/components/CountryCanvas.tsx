import { isTauri } from '@tauri-apps/api/core';
import { useState } from 'react';
import type { Country } from '../domain/countries';
import { countryName, t as tr, translateMessage } from '../i18n/index';
import { useScene } from '../services/useScene';
import ArchivePanel from './editor/ArchivePanel';
import CanvasEditor from './editor/CanvasEditor';
import RevisionsPanel from './editor/RevisionsPanel';
type Props = { country: Country; onBack: () => void };
export default function CountryCanvas({ country, onBack }: Props) {
  const storage = useScene(country);
  const [recoveryOpen, setRecoveryOpen] = useState(false),
    [recoveryArchive, setRecoveryArchive] = useState(false);
  if (!storage.loaded)
    return (
      <main className="load-screen">
        <h1>{countryName(country)}</h1>
        <p role={storage.error ? 'alert' : 'status'}>{storage.error || tr('Загрузка холста…')}</p>
        <div>
          <button onClick={onBack}>{tr('← Карта')}</button>
          {storage.error && (
            <>
              <button onClick={storage.reload}>{tr('Повторить загрузку')}</button>
              <button onClick={() => setRecoveryOpen(true)}>
                {tr('Восстановить предыдущую версию')}
              </button>
              <button onClick={() => setRecoveryArchive(true)}>{tr('Восстановить архив')}</button>
            </>
          )}
        </div>
        {recoveryOpen && (
          <RevisionsPanel
            countryId={country.id}
            onClose={() => setRecoveryOpen(false)}
            onRestore={() => {
              setRecoveryOpen(false);
              storage.reload();
            }}
          />
        )}
        {recoveryArchive && (
          <ArchivePanel
            countryId={country.id}
            onClose={() => setRecoveryArchive(false)}
            onRestored={() => {
              setRecoveryArchive(false);
              storage.reload();
            }}
          />
        )}
      </main>
    );
  if (storage.loaded.legacyKey)
    return (
      <main className="load-screen">
        <h1>{tr('Сохраним прежний холст')}</h1>
        <p>
          {tr('В стране «')}
          {countryName(country)}
          {tr('» найдено объектов:') + ' '}
          {storage.loaded.scene.items.length}.
        </p>
        <p>
          {isTauri()
            ? tr('Перенести их в SQLite?')
            : tr('Перенести их в новый формат браузерного предпросмотра?')}{' '}
          {tr('Расположение сохранится, исходная запись localStorage останется нетронутой.')}
        </p>
        {storage.error && <p role="alert">{translateMessage(storage.error)}</p>}
        <div>
          <button onClick={onBack}>{tr('← Карта')}</button>
          <button disabled={storage.status === 'Перенос…'} onClick={() => void storage.migrate()}>
            {tr('Перенести холст')}
          </button>
        </div>
      </main>
    );
  return (
    <CanvasEditor
      country={country}
      onBack={onBack}
      initial={storage.loaded.scene}
      storage={storage}
    />
  );
}
