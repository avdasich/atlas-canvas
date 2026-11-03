import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { writePreference } from './preferenceWrites';
export function usePreferences<T>(
  key: string,
  initial: T,
  validate: (value: unknown) => value is T,
) {
  const [value, setValue] = useState<T>(initial),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = isTauri()
          ? await invoke<string | null>('load_preferences', { key })
          : localStorage.getItem(`atlas-canvas:prefs:${key}`);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (!validate(parsed)) throw new Error('Неподдерживаемые настройки');
          if (active) setValue(parsed);
        }
      } catch (e) {
        if (active) setError(String(e));
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [key]);
  function update(next: T) {
    if (!ready) return;
    if (!validate(next)) {
      setError('Некорректные настройки');
      return;
    }
    const raw = JSON.stringify(next);
    setValue(next);
    void writePreference(key, async () => {
      if (isTauri()) await invoke('save_preferences', { key, json: raw });
      else localStorage.setItem(`atlas-canvas:prefs:${key}`, raw);
    })
      .then(() => setError(''))
      .catch((e) => setError(`Не удалось сохранить настройки: ${String(e)}`));
  }
  return { value, update, ready, error };
}
