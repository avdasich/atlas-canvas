import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { writePreference } from '../services/preferenceWrites';
import { getLanguage, isLanguage, setLanguage, subscribeLanguage, type Language } from './index';

const key = 'ui-language';
let revision = 0;
export function useLanguage() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);
  return { language, changeLanguage };
}
export async function changeLanguage(next: Language) {
  if (!isLanguage(next)) return;
  revision++;
  setLanguage(next);
  document.documentElement.lang = next;
  await writePreference(key, async () => {
    if (isTauri()) {
      await invoke('set_ui_language', { language: next });
      await invoke('save_preferences', { key, json: JSON.stringify(next) });
    } else localStorage.setItem(`atlas-canvas:prefs:${key}`, JSON.stringify(next));
  });
}
export function useInitializeLanguage() {
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const started = revision;
    void (async () => {
      const raw = isTauri()
        ? await invoke<string | null>('load_preferences', { key })
        : localStorage.getItem(`atlas-canvas:prefs:${key}`);
      const saved: unknown = raw ? JSON.parse(raw) : null;
      if (!active || revision !== started) return;
      const next = isLanguage(saved) ? saved : navigator.language.startsWith('ru') ? 'ru' : 'en';
      setLanguage(next);
      document.documentElement.lang = next;
      if (isTauri()) await invoke('set_ui_language', { language: next });
    })().catch((e: unknown) => {
      if (active) setError(String(e));
    });
    return () => {
      active = false;
    };
  }, []);
  return error;
}
