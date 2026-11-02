
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import worldData from "world-atlas/countries-110m.json";

type WorldMapProps = {
  onCountrySelect: (name: string) => void;
};

const world = worldData as unknown as Topology;

const countries = feature(
  world,
  world.objects.countries as GeometryCollection<{ name: string }>
);

const projection = geoNaturalEarth1()
  .fitSize([960, 500], countries);

const path = geoPath(projection);

function WorldMap({ onCountrySelect }: WorldMapProps) {
  return (
    <svg className="world-map" viewBox="0 0 960 500">
      {countries.features.map((country, index) => {
        const name = country.properties.name;

        return (
          <path
            key={country.id ?? index}
            d={path(country) ?? ""}
            className="country"
            onClick={() => onCountrySelect(name)}
          >
            <title>{name}</title>
          </path>
        );
      })}
    </svg>
  );
}

export default WorldMap;
