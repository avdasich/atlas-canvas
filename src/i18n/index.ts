import type { Country } from '../domain/countries';
import { english } from './en';

export type Language = 'ru' | 'en';
let language: Language = 'ru';
const listeners = new Set<() => void>();
export const isLanguage = (value: unknown): value is Language => value === 'ru' || value === 'en';
export const getLanguage = () => language;
export function setLanguage(next: Language) {
  if (next === language) return;
  language = next;
  for (const listener of listeners) listener();
}
export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function translate(message: string, locale: Language, ...values: unknown[]): string {
  const template = locale === 'en' ? (english[message] ?? message) : message;
  return template.replace(/\{(\d+)\}/g, (match, index: string) =>
    Number(index) < values.length ? String(values[Number(index)]) : match,
  );
}
export const t = (message: string, ...values: unknown[]) => translate(message, language, ...values);
export function countryName(country: Country) {
  return language === 'en' ? country.nameEn : country.nameRu;
}
export function formatDate(value: string | number) {
  return new Date(value).toLocaleString(language === 'en' ? 'en-US' : 'ru-RU');
}

// Errors may arrive from Rust or from a queued operation started before a language change.
// Match only complete known messages, never canvas text or user-supplied names.
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const messagePattern = (text: string) =>
  new RegExp('^' + escapePattern(text).replace(/\\\{\d+\\\}/g, '([\\s\\S]*?)') + '$');
const patterns = Object.entries(english)
  .filter(([key]) => /\{\d+\}/.test(key))
  .map(([ru, en]) => ({
    ru,
    en,
    russian: messagePattern(ru),
    english: messagePattern(en),
  }));
export function translateMessage(message: string): string {
  const prefix = message.startsWith('Error: ') ? 'Error: ' : '';
  const body = prefix ? message.slice(prefix.length) : message;
  if (language === 'en' && Object.prototype.hasOwnProperty.call(english, body))
    return prefix + english[body];
  if (language === 'ru') {
    const key = Object.keys(english).find((key) => english[key] === body);
    if (key) return prefix + key;
  }
  for (const entry of patterns) {
    const match = (language === 'en' ? entry.russian : entry.english).exec(body);
    if (match)
      return (
        prefix +
        (language === 'en' ? entry.en : entry.ru).replace(
          /\{(\d+)\}/g,
          (_, index: string) => match[Number(index) + 1] ?? '',
        )
      );
  }
  return message;
}

export function objectCount(count: number) {
  const form = new Intl.PluralRules(language).select(count);
  const word =
    language === 'en'
      ? form === 'one'
        ? 'object'
        : 'objects'
      : form === 'one'
        ? 'объект'
        : form === 'few'
          ? 'объекта'
          : 'объектов';
  return `${count} ${word}`;
}
