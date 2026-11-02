import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Country } from '../domain/countries';
import type { Scene } from '../domain/scene';
import { repository, type LoadedScene } from './SceneRepository';
import { SceneWriter } from './SceneWriter';
import { installExitGuard } from './exitGuard';

export function useScene(country: Country) {
  const [loaded, setLoaded] = useState<LoadedScene | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Загрузка…');
  const [writer] = useState(() => new SceneWriter(scene => repository.save(country.id, scene)));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    repository.load(country).then(result => {
      if (cancelled) return;
      writer.reset(result.scene);
      setLoaded(result); setError(''); setStatus(result.legacyKey ? 'Ожидает переноса' : 'Сохранено');
    }).catch(e => { if (!cancelled) { setError(String(e)); setStatus('Ошибка загрузки'); } });
    return () => { cancelled = true; };
  }, [country, retry, writer]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (loaded?.legacyKey || (!writer.dirty && !writer.pending)) return;
    if (active.current) setStatus('Сохранение…');
    try {
      await writer.flush();
      if (active.current) { setError(''); setStatus(writer.dirty ? 'Есть изменения' : 'Сохранено'); }
    } catch (e) {
      if (active.current) { setError(`Не удалось сохранить: ${String(e)}`); setStatus('Ошибка сохранения'); }
      throw e;
    }
  }, [writer, loaded?.legacyKey]);

  const schedule = useCallback((scene: Scene) => {
    writer.update(scene);
    if (timer.current) clearTimeout(timer.current);
    if ((!writer.dirty && !writer.pending) || loaded?.legacyKey) return;
    setStatus('Есть изменения');
    timer.current = setTimeout(() => { void flush().catch(() => {}); }, 650);
  }, [flush, writer, loaded?.legacyKey]);

  useEffect(() => {
    active.current = true;
    let unsubscribe: (() => void) | undefined;
    let disposed = false;
    let closing = false;
    const uninstallGuard = installExitGuard(flush);
    if (isTauri()) void getCurrentWindow().onCloseRequested(async event => {
      event.preventDefault();
      if (closing) return;
      closing = true;
      try { await flush(); await invoke('finish_exit'); }
      catch { closing = false; }
    }).then(fn => { if (disposed) fn(); else unsubscribe = fn; });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (writer.dirty || writer.pending) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { active.current = false; disposed = true; uninstallGuard(); unsubscribe?.(); window.removeEventListener('beforeunload', beforeUnload); if (timer.current) clearTimeout(timer.current); };
  }, [flush, writer]);

  async function migrate() {
    if (!loaded) return;
    setStatus('Перенос…');
    try {
      await repository.migrate(country, loaded);
      setLoaded({ scene: loaded.scene }); setError(''); setStatus('Сохранено');
    } catch (e) { setError(String(e)); setStatus('Ошибка переноса'); }
  }
  return { loaded, error, status, schedule, flush, migrate, reload: () => setRetry(n => n + 1) };
}
