export default function Numeric({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="property-field">
      {label}
      <input
        aria-label={label}
        type="number"
        value={Math.round(value * 100) / 100}
        min={min}
        max={max}
        step="any"
        onChange={(e) => {
          if (!e.target.value.trim()) return;
          const n = Number(e.target.value);
          if (
            Number.isFinite(n) &&
            (min === undefined || n >= min) &&
            (max === undefined || n <= max)
          )
            onChange(n);
        }}
      />
    </label>
  );
}
