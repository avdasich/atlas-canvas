import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import type { Country } from '../domain/countries';
import { emptyScene, parseItems, parseScene, type Scene } from '../domain/scene';
import { countries } from '../domain/world';
import { t as tr } from '../i18n/index';
import { rasterizeSvg } from './svg';

export type LoadedScene = { scene: Scene; legacyKey?: string };
export interface SceneRepository {
  load(country: Country): Promise<LoadedScene>;
  save(countryId: string, scene: Scene): Promise<void>;
  migrate(country: Country, loaded: LoadedScene): Promise<void>;
  filled(): Promise<string[]>;
  importImage(file: File): Promise<{ assetId: string; width: number; height: number }>;
  imageUrl(assetId: string): Promise<string>;
}
export const sceneKey = (id: string) => `atlas-canvas:v2:scene:${id}`;
export function readLegacy(storage: Storage, country: Country): LoadedScene | null {
  const keys = [...new Set([country.nameEn, country.nameRu, country.name, country.id])].map(
    (name) => `atlas-canvas:scene:${name}`,
  );
  const entries = keys.flatMap((key) => {
    const raw = storage.getItem(key);
    return raw === null ? [] : [{ key, raw, items: parseItems(JSON.parse(raw)) }];
  });
  const nonempty = entries.filter((e) => e.items.length);
  if (
    nonempty.length > 1 &&
    nonempty.some((e) => JSON.stringify(e.items) !== JSON.stringify(nonempty[0].items))
  )
    throw new Error(
      tr('Найдены разные старые холсты для одной страны. Перенос остановлен, исходники сохранены.'),
    );
  const entry = nonempty[0] ?? entries[0];
  return entry ? { scene: { ...emptyScene(), items: entry.items }, legacyKey: entry.key } : null;
}

export class LocalSceneRepository implements SceneRepository {
  private queues = new Map<string, Promise<void>>();
  constructor(
    private storage: Storage,
    readonly native: boolean,
  ) {}
  async load(country: Country): Promise<LoadedScene> {
    const raw = this.native
      ? await invoke<string | null>('load_scene', { countryId: country.id })
      : this.storage.getItem(sceneKey(country.id));
    if (raw !== null) return { scene: parseScene(JSON.parse(raw)) };
    return readLegacy(this.storage, country) ?? { scene: emptyScene() };
  }
  save(countryId: string, scene: Scene): Promise<void> {
    // Capture immutable JSON now. A later edit must never mutate a queued write.
    const raw = JSON.stringify(parseScene(scene));
    const previous = this.queues.get(countryId) ?? Promise.resolve();
    const pending = previous
      .catch(() => {})
      .then(async () => {
        if (this.native) await invoke('save_scene', { countryId, sceneJson: raw });
        else this.storage.setItem(sceneKey(countryId), raw);
      });
    this.queues.set(countryId, pending);
    void pending
      .finally(() => {
        if (this.queues.get(countryId) === pending) this.queues.delete(countryId);
      })
      .catch(() => {});
    return pending;
  }
  async migrate(country: Country, loaded: LoadedScene) {
    if (!loaded.legacyKey) return;
    const raw = JSON.stringify(parseScene(loaded.scene));
    // Insert only: migration cannot replace a scene already present in the database.
    if (this.native)
      await invoke('migrate_scene', {
        countryId: country.id,
        sceneJson: raw,
        legacyKey: loaded.legacyKey,
      });
    else if (this.storage.getItem(sceneKey(country.id)) === null)
      this.storage.setItem(sceneKey(country.id), raw);
    const verified = await this.load(country);
    if (verified.legacyKey || JSON.stringify(verified.scene) !== raw)
      throw new Error(tr('Проверка переноса не прошла. Старый холст сохранён.'));
    // Intentionally retain the original localStorage entry, including after verification.
  }
  async filled(): Promise<string[]> {
    const statuses: Record<string, boolean> = this.native
      ? await invoke<Record<string, boolean>>('filled_countries')
      : {};
    for (let i = 0; !this.native && i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key?.startsWith('atlas-canvas:v2:scene:')) continue;
      const scene = parseScene(JSON.parse(this.storage.getItem(key)!));
      statuses[key.slice('atlas-canvas:v2:scene:'.length)] = !!scene.items.length;
    }
    for (const country of countries) {
      if (country.id in statuses) continue;
      try {
        const legacy = readLegacy(this.storage, country);
        if (legacy) statuses[country.id] = !!legacy.scene.items.length;
      } catch {
        /* Loading this country displays the exact error and blocks editing. */
      }
    }
    return Object.keys(statuses).filter((id) => statuses[id]);
  }
  async importImage(file: File) {
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) file = await rasterizeSvg(file);
    if (!this.native)
      throw new Error(
        tr(
          'Импорт фотографий доступен в настольном приложении: оригиналы сохраняются в его папке данных.',
        ),
      );
    if (file.size > 50 * 1024 * 1024) throw new Error(tr('Размер изображения превышает 50 МБ.'));
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type))
      throw new Error(tr('Поддерживаются JPEG, PNG, WebP и GIF.'));
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error(tr('Не удалось подготовить изображение.'));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const preview = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error(tr('Не удалось создать превью')))),
          'image/png',
        ),
      );
      const assetId = crypto.randomUUID();
      await invoke('import_image', {
        assetId,
        originalName: file.name,
        bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
        preview: Array.from(new Uint8Array(await preview.arrayBuffer())),
      });
      return { assetId, width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }
  async imageUrl(assetId: string) {
    return convertFileSrc(await invoke<string>('asset_path', { assetId, preview: true }));
  }
}
export const repository: SceneRepository = new LocalSceneRepository(window.localStorage, isTauri());
