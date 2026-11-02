import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { flushBeforeExit } from './services/exitGuard';
import WorldMap from './components/WorldMap';
import CountryCanvas from './components/CountryCanvas';
import type { Country } from './domain/countries';
import './App.css';
function App() {
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false, unsubscribe: (() => void) | undefined;
    void listen('atlas-before-exit', async () => {
      try { await flushBeforeExit(); await invoke('finish_exit'); } catch { /* Save error is displayed by the editor; the app stays open. */ }
    }).then(fn => { if (disposed) fn(); else unsubscribe = fn; });
    return () => { disposed = true; unsubscribe?.(); };
  }, []);
  const [country, setCountry] = useState<Country | null>(null);
  if (country) return <CountryCanvas key={country.id} country={country} onBack={() => setCountry(null)} />;
  return <main className="map-page"><header className="map-header"><div><span className="eyebrow">ВАШ ЛИЧНЫЙ АТЛАС</span><h1>Atlas Canvas</h1><p>Выберите страну. Соберите её историю на своём холсте.</p></div><span className="offline-label">● Локально и без аккаунта</span></header><WorldMap onCountrySelect={setCountry} /></main>;
}
export default App;
