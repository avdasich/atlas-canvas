import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import worldData from 'world-atlas/countries-110m.json';
import { makeCountry } from './countries';
import regions from './country-regions.json';
const world = worldData as unknown as Topology;
export const worldFeatures = feature(
  world,
  world.objects.countries as GeometryCollection<{ name: string }>,
).features;
// Stable dataset-local codes for geometries without an ISO numeric ID.
// These codes are NOT ISO codes; preserve the source's disputed boundary coverage.
const localIds: Record<string, string> = {
  'N. Cyprus': '900',
  Somaliland: '901',
  Kosovo: '902',
  'Indian Ocean Ter.': '903',
  'Siachen Glacier': '904',
};
export const countryForFeature = (f: (typeof worldFeatures)[number]) => {
  return makeCountry(f.id ?? localIds[f.properties.name], f.properties.name);
};
export const featureCountry = (index: number) => countryForFeature(worldFeatures[index]);
const english = new Intl.DisplayNames(['en'], { type: 'region' });
const catalog = new Map(
  Object.entries(regions).map(([id, alpha2]) => [
    id,
    makeCountry(id, english.of(alpha2) ?? alpha2),
  ]),
);
worldFeatures.forEach((f) => {
  const country = countryForFeature(f);
  catalog.set(country.id, country);
});
catalog.set('903', makeCountry('903', 'Indian Ocean Ter.'));
catalog.set('904', makeCountry('904', 'Siachen Glacier'));
export const countries = [...catalog.values()].sort((a, b) =>
  a.nameRu.localeCompare(b.nameRu, 'ru'),
);
