import regions from './country-regions.json';
export type Country = { id: string; name: string; nameRu: string; nameEn: string };
export function normalizeCountryId(id: string | number): string {
  const value = String(id);
  if (!/^\d{1,3}$/.test(value)) throw new Error('Некорректный код страны');
  return value.padStart(3, '0');
}
const russian = new Intl.DisplayNames(['ru'], { type: 'region' });
export function makeCountry(id: string | number, nameEn: string): Country {
  const normalized = normalizeCountryId(id);
  const alpha2 = (regions as Record<string, string>)[normalized];
  const nameRu = alpha2 ? russian.of(alpha2) ?? nameEn : nameEn;
  return { id: normalized, name: nameRu, nameRu, nameEn };
}
