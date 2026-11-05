import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Suspense, lazy, useEffect, useState } from 'react';
import './App.css';
import AboutPanel from './components/editor/AboutPanel';
import ArchivePanel from './components/editor/ArchivePanel';
import LanguageSelect from './components/LanguageSelect';
import WorldMap from './components/WorldMap';
import type { Country } from './domain/countries';
import { t as tr, translateMessage } from './i18n';
import { useInitializeLanguage, useLanguage } from './i18n/useLanguage';
import { flushBeforeExit } from './services/exitGuard';
const CountryCanvas = lazy(() => import('./components/CountryCanvas'));
function App() {
  useLanguage();
  const languageError = useInitializeLanguage();
  const [lightUi, setLightUi] = useState(
    () => localStorage.getItem('atlas-canvas:ui-theme') === 'light',
  );
  useEffect(() => {
    document.documentElement.dataset.uiTheme = lightUi ? 'light' : 'dark';
    localStorage.setItem('atlas-canvas:ui-theme', lightUi ? 'light' : 'dark');
  }, [lightUi]);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false,
      unsubscribe: (() => void) | undefined;
    void listen('atlas-before-exit', async () => {
      try {
        await flushBeforeExit();
        await invoke('finish_exit');
      } catch (e) {
        setBackupError(tr('Не удалось завершить сохранение: {0}', String(e)));
      }
    }).then((fn) => {
      if (disposed) fn();
      else unsubscribe = fn;
    });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [mapRevision, setMapRevision] = useState(0);
  const [backupError, setBackupError] = useState('');
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let off: (() => void) | undefined;
    void listen<string>('atlas-backup-error', (e) =>
      setBackupError(tr('Автокопия не создана: {0}', translateMessage(e.payload))),
    ).then((fn) => {
      if (cancelled) fn();
      else off = fn;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);
  const [country, setCountry] = useState<Country | null>(null);
  if (country)
    return (
      <>
        <Suspense fallback={<main className="load-screen">{tr('Загрузка редактора…')}</main>}>
          <CountryCanvas key={country.id} country={country} onBack={() => setCountry(null)} />
        </Suspense>
        {backupError && (
          <div className="global-notice" role="alert">
            {translateMessage(backupError)}
            <button onClick={() => setBackupError('')}>{tr('Закрыть')}</button>
          </div>
        )}
      </>
    );
  return (
    <main className="map-page">
      <header className="map-header">
        <div>
          <span className="eyebrow">{tr('ВАШ ЛИЧНЫЙ АТЛАС')}</span>
          <h1>Atlas Canvas</h1>
          <p>{tr('Выберите страну. Соберите её историю на своём холсте.')}</p>
        </div>
        <div className="map-header-actions">
          <LanguageSelect />
          <span className="offline-label">{tr('● Локально и без аккаунта')}</span>
          <button onClick={() => setAboutOpen(true)}>{tr('О программе')}</button>
          <button onClick={() => setLightUi((v) => !v)}>
            {lightUi ? tr('Тёмная тема') : tr('Светлая тема')}
          </button>
        </div>
      </header>
      <button className="atlas-archive-button" onClick={() => setArchiveOpen(true)}>
        {tr('Архив и восстановление')}
      </button>
      {backupError && <p role="alert">{translateMessage(backupError)}</p>}
      {languageError && <p role="alert">{translateMessage(languageError)}</p>}
      <WorldMap key={mapRevision} onCountrySelect={setCountry} />
      {aboutOpen && <AboutPanel onClose={() => setAboutOpen(false)} />}
      {archiveOpen && (
        <ArchivePanel
          onClose={() => setArchiveOpen(false)}
          onRestored={() => setMapRevision((n) => n + 1)}
        />
      )}
    </main>
  );
}
export default App;
