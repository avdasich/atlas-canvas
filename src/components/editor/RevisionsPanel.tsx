import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { parseScene, type Scene } from '../../domain/scene';
import { flushBeforeExit } from '../../services/exitGuard';
type Revision = { id: number; createdAt: string; objects: number };
export default function RevisionsPanel({ countryId, onRestore, onClose }: { countryId: string; onRestore: (scene: Scene) => void; onClose: () => void }) {
  const [list, setList] = useState<Revision[]>([]), [error, setError] = useState(''), [chosen, setChosen] = useState<number | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => { if (isTauri()) void invoke<Revision[]>('list_revisions', { countryId }).then(setList).catch(e => setError(String(e))); }, [countryId]);
  return <div className="dialog-backdrop"><section role="dialog" aria-modal="true" aria-label="Версии холста" className="app-dialog"><h2>Версии холста</h2><p>Выберите сохранённую версию. Текущее содержимое останется в истории сохранений.</p>
    {!isTauri() && <p>История сохранений доступна в настольной версии.</p>}<div className="revision-list">{list.map(r => <label key={r.id}><input type="radio" checked={chosen === r.id} onChange={() => setChosen(r.id)} />{new Date(r.createdAt).toLocaleString('ru')} · {r.objects} объектов</label>)}</div>{isTauri() && !list.length && <p>Предыдущих версий пока нет.</p>}{error && <p role="alert">{error}</p>}
    <div className="dialog-actions"><button disabled={busy} onClick={onClose}>Закрыть</button><button disabled={busy || chosen === null} onClick={async () => { setBusy(true); try { await flushBeforeExit(); const raw = await invoke<string>('restore_revision', { countryId, revisionId: chosen }); onRestore(parseScene(JSON.parse(raw))); onClose(); } catch (e) { setError(String(e)); } finally { setBusy(false); } }}>Восстановить выбранную версию</button></div>
  </section></div>;
}
