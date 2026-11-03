import { Suspense, lazy, useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { flushBeforeExit } from './services/exitGuard';
import WorldMap from './components/WorldMap';
const CountryCanvas = lazy(() => import('./components/CountryCanvas'));
import type { Country } from './domain/countries';
import './App.css';
import ArchivePanel from './components/editor/ArchivePanel';
function App() {
  const [lightUi, setLightUi] = useState(() => localStorage.getItem('atlas-canvas:ui-theme') === 'light');
  useEffect(() => { document.documentElement.dataset.uiTheme = lightUi ? 'light' : 'dark'; localStorage.setItem('atlas-canvas:ui-theme', lightUi ? 'light' : 'dark'); }, [lightUi]);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false, unsubscribe: (() => void) | undefined;
    void listen('atlas-before-exit', async () => {
      try { await flushBeforeExit(); await invoke('finish_exit'); } catch { /* Save error is displayed by the editor; the app stays open. */ }
    }).then(fn => { if (disposed) fn(); else unsubscribe = fn; });
    return () => { disposed = true; unsubscribe?.(); };
  }, []);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [mapRevision, setMapRevision] = useState(0);
  const [backupError, setBackupError] = useState('');
  useEffect(() => { if (!isTauri()) return; let cancelled = false; let off: (() => void) | undefined; void listen<string>('atlas-backup-error', e => setBackupError(`Автокопия не создана: ${e.payload}`)).then(fn => { if (cancelled) fn(); else off = fn; }); return () => { cancelled = true; off?.(); }; }, []);
  const [country, setCountry] = useState<Country | null>(null);
  if (country) return <><Suspense fallback={<main className="load-screen">Загрузка редактора…</main>}><CountryCanvas key={country.id} country={country} onBack={() => setCountry(null)} /></Suspense>{backupError && <div className="global-notice" role="alert">{backupError}<button onClick={() => setBackupError('')}>Закрыть</button></div>}</>;
  return <main className="map-page"><header className="map-header"><div><span className="eyebrow">ВАШ ЛИЧНЫЙ АТЛАС</span><h1>Atlas Canvas</h1><p>Выберите страну. Соберите её историю на своём холсте.</p></div><div className="map-header-actions"><span className="offline-label">● Локально и без аккаунта</span><button onClick={() => setLightUi(v => !v)}>{lightUi ? "Тёмная тема" : "Светлая тема"}</button></div></header><button className="atlas-archive-button" onClick={() => setArchiveOpen(true)}>Архив и восстановление</button>{backupError && <p role="alert">{backupError}</p>}<WorldMap key={mapRevision} onCountrySelect={setCountry} />{archiveOpen && <ArchivePanel onClose={() => setArchiveOpen(false)} onRestored={() => setMapRevision(n => n + 1)} />}</main>;
}
export default App;
