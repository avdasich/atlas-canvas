import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import detailedData from 'world-atlas/countries-50m.json';
const world = detailedData as unknown as Topology;
export const features = feature(
  world,
  world.objects.countries as GeometryCollection<{ name: string }>,
).features;
