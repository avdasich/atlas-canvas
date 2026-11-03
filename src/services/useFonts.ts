import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
export const systemFonts = [
  'Noto Sans',
  'Noto Serif',
  'Arial',
  'Georgia',
  'Verdana',
  'Times New Roman',
  'Courier New',
  'system-ui',
].map((value) => ({ value, label: value }));
const registered = new Set<string>();
export function useFonts() {
  const [loadedAt, setLoadedAt] = useState(0);
  const [fonts, setFonts] = useState(systemFonts),
    [revision, setRevision] = useState(0),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void Promise.all(
      ['Noto Sans', 'Noto Serif'].flatMap((f) => [
        document.fonts.load(`16px "${f}"`),
        document.fonts.load(`bold italic 16px "${f}"`),
      ]),
    )
      .then(() => {
        if (active) setLoadedAt((n) => n + 1);
      })
      .catch(() => {
        if (active) setError('Встроенный шрифт недоступен, используется системная замена.');
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (isTauri())
      void invoke<{ id: string; title: string }[]>('list_fonts')
        .then(async (assets) => {
          const result = [];
          for (const asset of assets) {
            const family = `AtlasFont-${asset.id}`;
            try {
              if (!registered.has(family)) {
                const url = convertFileSrc(
                  await invoke<string>('asset_path', { assetId: asset.id, preview: false }),
                );
                const font = await new FontFace(family, `url("${url}")`).load();
                document.fonts.add(font);
                registered.add(family);
              }
              result.push({ value: family, label: asset.title });
            } catch {
              if (active)
                setError(`Шрифт «${asset.title}» недоступен. Используется системная замена.`);
            }
          }
          if (active) setFonts([...systemFonts, ...result]);
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    return () => {
      active = false;
    };
  }, [revision]);
  async function importFont() {
    if (!isTauri()) {
      setError('Добавление шрифтов доступно в настольном приложении.');
      return;
    }
    try {
      const asset = await invoke<{ assetId: string } | null>('import_media', { kind: 'font' });
      if (asset) setRevision((n) => n + 1);
    } catch (e) {
      setError(String(e));
    }
  }
  return { fonts, error, importFont, loadedAt };
}
