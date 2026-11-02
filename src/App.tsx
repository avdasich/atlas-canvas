
import { useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import worldData from "world-atlas/countries-110m.json";
import "./App.css";

const world = worldData as unknown as Topology;

const countries = feature(
  world,
  world.objects.countries as GeometryCollection<{ name: string }>
);

const projection = geoNaturalEarth1()
  .fitSize([960, 500], countries);

const path = geoPath(projection);

function App() {
  const [selectedCountry, setSelectedCountry] = useState("");

  function handleBackClick() {
    setSelectedCountry("");
  }

  if (selectedCountry !== "") {
    return (
      <main className="container">
        <h1>{selectedCountry}</h1>
        <p>Здесь будет бесконечный холст</p>

        <button onClick={handleBackClick}>
          Вернуться к карте
        </button>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>Atlas Canvas</h1>
      <p>Выбери страну, чтобы открыть её холст</p>

      <svg className="world-map" viewBox="0 0 960 500">
        {countries.features.map((country, index) => {
          const name = String(
            country.properties?.name ?? "Неизвестная страна"
          );

          return (
            <path
              key={country.id ?? index}
              d={path(country) ?? ""}
              className="country"
              onClick={() => setSelectedCountry(name)}
            >
              <title>{name}</title>
            </path>
          );
        })}
      </svg>
    </main>
  );
}

export default App;
