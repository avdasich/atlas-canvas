
import { useState } from "react";
import WorldMap from "./components/WorldMap";
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

      <WorldMap onCountrySelect={handleCountrySelect} />
    </main>
  );
}

export default App;
