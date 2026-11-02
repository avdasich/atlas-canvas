
import { useState } from "react";
import WorldMap from "./components/WorldMap";
import CountryCanvas from "./components/CountryCanvas";
import "./App.css";

function App() {
  const [selectedCountry, setSelectedCountry] = useState("");

  function handleCountrySelect(name: string) {
    setSelectedCountry(name);
  }

  function handleBackClick() {
    setSelectedCountry("");
  }

  if (selectedCountry !== "") {
    return (
      <CountryCanvas
        countryName={selectedCountry}
        onBack={handleBackClick}
      />
    );
  }

  return (
    <main className="container">
      <h1>Atlas Canvas</h1>
      <p>Выбери страну, чтобы открыть её холст</p>

      <WorldMap onCountrySelect={handleCountrySelect} />
    </main>
  );
}

export default App;
