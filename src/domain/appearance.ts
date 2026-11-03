import { emptyScene, parseScene, type Theme } from './scene';
import { defaultShimmer, validShimmer, type Shimmer } from './shimmer';
export type MapAppearance = {
  background: string;
  countries: string;
  filled: string;
  borders: string;
  highlight: string;
  shimmer: Shimmer;
};
export const defaultMapAppearance: MapAppearance = {
  background: '#20323e',
  countries: '#789da5',
  filled: '#86c5ac',
  borders: '#17212b',
  highlight: '#e2a94b',
  shimmer: { ...defaultShimmer },
};
export function validMapAppearance(value: unknown): value is MapAppearance {
  if (!value || typeof value !== 'object') return false;
  const m = value as MapAppearance;
  return (
    ['background', 'countries', 'filled', 'borders', 'highlight'].every((k) =>
      /^#[a-f\d]{6}$/i.test(m[k as keyof MapAppearance] as string),
    ) && validShimmer(m.shimmer)
  );
}
export type ThemePreset = { id: string; name: string; theme: Theme };
export function validThemePresets(value: unknown): value is ThemePreset[] {
  if (!Array.isArray(value) || value.length > 100) return false;
  return value.every((p) => {
    try {
      if (!p || typeof p.id !== 'string' || typeof p.name !== 'string' || p.name.length > 80)
        return false;
      parseScene({ ...emptyScene(), theme: p.theme });
      return true;
    } catch {
      return false;
    }
  });
}
