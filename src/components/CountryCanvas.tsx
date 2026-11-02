
type CountryCanvasProps = {
    countryName: string;
    onBack: () => void;
  };
  
  function CountryCanvas({
    countryName,
    onBack,
  }: CountryCanvasProps) {
    return (
      <main className="country-workspace">
        <header className="country-toolbar">
          <button onClick={onBack}>
            ← К карте
          </button>
  
          <span>{countryName}</span>
        </header>
  
        <section className="country-surface" />
      </main>
    );
  }
  
  export default CountryCanvas;
  