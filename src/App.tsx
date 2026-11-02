
import { useState } from "react";
import "./App.css";

function App() {
  const [selectedCountry, setSelectedCountry] = useState("");

  function handleCountryClick() {
    setSelectedCountry("Тестовая страна");
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

      <svg viewBox="0 0 400 260" width="400">
        <path
          d="M 80 80 L 220 60 L 260 150 L 170 210 L 90 170 Z"
          className="country"
          onClick={handleCountryClick}
        />
      </svg>
    </main>
  );
}

export default App;
