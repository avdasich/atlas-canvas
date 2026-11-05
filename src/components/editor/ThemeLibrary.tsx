import { useState } from 'react';
import { validThemePresets, type ThemePreset } from '../../domain/appearance';
import type { Theme } from '../../domain/scene';
import { t as tr } from '../../i18n/index';
import { usePreferences } from '../../services/usePreferences';
export default function ThemeLibrary({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
}) {
  const presets = usePreferences<ThemePreset[]>('themes', [], validThemePresets);
  const [name, setName] = useState('');
  return (
    <details className="theme-library">
      <summary>{tr('Мои оформления')}</summary>
      <label className="property-field">
        {tr('Название оформления')}
        <input
          aria-label={tr('Название оформления')}
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        disabled={!presets.ready || !name.trim() || presets.value.length >= 100}
        onClick={() => {
          presets.update([
            ...presets.value,
            {
              id: crypto.randomUUID(),
              name: name.trim(),
              theme: Object.fromEntries(
                Object.entries(structuredClone(theme)).filter(
                  ([key]) =>
                    ![
                      'guides',
                      'bookmarks',
                      'drawShapes',
                      'repeatShape',
                      'minimap',
                      'rulers',
                      'snapGuides',
                    ].includes(key),
                ),
              ) as Theme,
            },
          ]);
          setName('');
        }}
      >
        {tr('Сохранить оформление')}
      </button>
      {presets.error && <p role="alert">{presets.error}</p>}
      {presets.value.map((p) => (
        <div className="layer-row" key={p.id}>
          <button
            onClick={() =>
              onChange({
                ...theme,
                ...structuredClone(p.theme),
                guides: theme.guides,
                bookmarks: theme.bookmarks,
              })
            }
          >
            {p.name}
          </button>
          <button
            aria-label={tr('Удалить оформление {0}', p.name)}
            onClick={() => presets.update(presets.value.filter((v) => v.id !== p.id))}
          >
            ×
          </button>
        </div>
      ))}
    </details>
  );
}
