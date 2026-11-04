import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef, useState } from 'react';
import { placeItem, type Bounds, type TextSize } from '../domain/geometry';
import type { CanvasItem, ItemKind, Scene, Theme } from '../domain/scene';
import { validUrl } from '../domain/scene';
import { repository } from './SceneRepository';
import { exportCanvas } from './exportCanvas';
export type LinkKind = 'link' | 'image' | 'video' | 'audio';
type TransferOptions = {
  items: CanvasItem[];
  theme: Theme;
  viewport: () => Bounds;
  measureText: TextSize;
  changeItems: (change: (items: CanvasItem[]) => CanvasItem[]) => void;
  setSelected: (ids: string[]) => void;
  setTool: (tool: 'select') => void;
  setTheme: (theme: Theme) => void;
  setBusy: (busy: boolean) => void;
  setMessage: (message: string) => void;
  reveal: (item: CanvasItem) => void;
  showAll: (items: CanvasItem[]) => void;
  getSavedScene: () => Promise<Scene>;
  closeLinkDialog: () => void;
};
export function useCanvasTransfers(options: TransferOptions) {
  const {
    items,
    theme,
    viewport,
    measureText,
    changeItems,
    setSelected,
    setTool,
    setTheme,
    setBusy,
    setMessage,
    reveal,
    showAll,
    getSavedScene,
    closeLinkDialog,
  } = options;
  const downloadId = useRef<string | null>(null);
  const photoCancel = useRef(false);
  const [photoImporting, setPhotoImporting] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false,
      off: (() => void) | undefined;
    void listen<{ id: string; bytes: number; total?: number }>('atlas-operation', (e) => {
      if (e.payload.id === downloadId.current)
        setDownloadProgress(
          e.payload.total
            ? `${Math.min(100, Math.round((e.payload.bytes / e.payload.total) * 100))}%`
            : `${(e.payload.bytes / 1048576).toFixed(1)} МиБ`,
        );
    }).then((fn) => {
      if (disposed) fn();
      else off = fn;
    });
    return () => {
      disposed = true;
      off?.();
    };
  }, []);
  async function importPhotos(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setPhotoImporting(true);
    photoCancel.current = false;
    setMessage('Импорт фотографий…');
    let next = [...items];
    const ids: string[] = [];
    const errors: string[] = [];
    for (const file of files) {
      if (photoCancel.current) break;
      setMessage(`Импорт фото: ${ids.length + errors.length + 1} / ${files.length}`);
      try {
        const { assetId, width, height } = await repository.importImage(file);
        const ratio = Math.min(1, 420 / width, 340 / height);
        const item = placeItem(
          {
            id: crypto.randomUUID(),
            kind: 'image',
            assetId,
            title: file.name,
            x: 0,
            y: 0,
            width: width * ratio,
            height: height * ratio,
          },
          next,
          viewport(),
          measureText,
        );
        next.push(item);
        ids.push(item.id);
      } catch (e) {
        errors.push(`${file.name}: ${String(e)}`);
      }
    }
    if (ids.length) {
      changeItems((list) => [...list, ...next.filter((i) => ids.includes(i.id))]);
      setSelected(ids);
      setTool('select');
      if (ids.length > 1) showAll(next);
      else reveal(next[next.length - 1]);
    }
    setMessage(
      errors.length
        ? `Импортировано: ${ids.length}. ${errors.join('; ')}`
        : `${photoCancel.current ? 'Импорт остановлен. ' : ''}Фотографий скопировано: ${ids.length}.`,
    );
    setBusy(false);
    setPhotoImporting(false);
  }
  async function downloadUrl(linkKind: LinkKind, linkUrl: string, linkTitle: string) {
    if (!isTauri()) {
      setMessage('Загрузка файлов доступна в настольном приложении.');
      return;
    }
    if (!validUrl(linkUrl)) {
      setMessage('Введите полный http/https адрес');
      return;
    }
    setBusy(true);
    setMessage('');
    downloadId.current = crypto.randomUUID();
    setDownloadProgress('Подключение…');
    try {
      const imported = await invoke<{ assetId: string; title: string }>('import_url', {
        url: linkUrl,
        kind: linkKind,
        operationId: downloadId.current,
      });
      const item = placeItem(
        {
          id: crypto.randomUUID(),
          kind: linkKind as ItemKind,
          ...imported,
          title: linkTitle || imported.title,
          x: 0,
          y: 0,
        },
        items,
        viewport(),
        measureText,
      );
      changeItems((list) => [...list, item]);
      setSelected([item.id]);
      reveal(item);
      closeLinkDialog();
      setMessage('Медиа загружено в папку приложения и доступно офлайн.');
    } catch (e) {
      setMessage(String(e));
    } finally {
      downloadId.current = null;
      setDownloadProgress('');
      setBusy(false);
    }
  }
  async function exportImage(format: 'png' | 'pdf' | 'pdf-pages', region: 'all' | 'viewport') {
    setBusy(true);
    try {
      const scene = await getSavedScene();
      const path = await exportCanvas(scene, viewport(), region, format);
      setMessage(path ? `Экспорт сохранён: ${path}` : 'Экспорт отменён');
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function importBackground(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const image = await repository.importImage(file);
      setTheme({ ...theme, backgroundAssetId: image.assetId, backgroundType: 'image' });
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function replaceAsset(item: CanvasItem, file?: File) {
    setBusy(true);
    downloadId.current = crypto.randomUUID();
    setDownloadProgress('Замена файла…');
    try {
      const result =
        item.kind === 'image' && file
          ? await repository.importImage(file)
          : ['video', 'audio'].includes(item.kind) && isTauri()
            ? await invoke<{ assetId: string; title: string } | null>('import_media', {
                kind: item.kind,
                operationId: downloadId.current,
              })
            : null;
      if (result) {
        changeItems((list) =>
          list.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  assetId: result.assetId,
                  ...(item.kind === 'image' ? { crop: undefined } : {}),
                  title: file?.name ?? ('title' in result ? result.title : i.title),
                }
              : i,
          ),
        );
        setMessage('Файл заменён. Предыдущую версию можно вернуть через отмену.');
      }
    } catch (e) {
      setMessage(String(e));
    } finally {
      downloadId.current = null;
      setDownloadProgress('');
      setBusy(false);
    }
  }
  async function importMedia(kind: 'video' | 'audio') {
    if (!isTauri()) {
      setMessage('Импорт медиа доступен в настольном приложении.');
      return;
    }
    setBusy(true);
    downloadId.current = crypto.randomUUID();
    setDownloadProgress('Импорт файла…');
    try {
      const result = await invoke<{ assetId: string; title: string } | null>('import_media', {
        kind,
        operationId: downloadId.current,
      });
      if (result) {
        const item = placeItem(
          { id: crypto.randomUUID(), kind, ...result, x: 0, y: 0 },
          items,
          viewport(),
          measureText,
        );
        changeItems((list) => [...list, item]);
        setSelected([item.id]);
        reveal(item);
      }
    } catch (e) {
      setMessage(String(e));
    } finally {
      downloadId.current = null;
      setDownloadProgress('');
      setBusy(false);
    }
  }
  return {
    importPhotos,
    downloadUrl,
    exportImage,
    importBackground,
    replaceAsset,
    importMedia,
    downloadId,
    photoCancel,
    photoImporting,
    downloadProgress,
    setDownloadProgress,
  };
}
