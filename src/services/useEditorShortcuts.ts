import { useEffect, useRef } from 'react';
import { editableTarget, shortcutAction, type ShortcutAction } from '../domain/shortcuts';
type Options = {
  blocked: boolean;
  editing: boolean;
  viewOnly: boolean;
  perform: (action: ShortcutAction, step: number) => void;
  space: (held: boolean) => void;
  finishPointer: () => void;
};
export function useEditorShortcuts(options: Options) {
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const { blocked, editing, viewOnly, perform, space } = current.current;
      if (blocked) return;
      const action = shortcutAction(event);
      if (action === 'save') {
        event.preventDefault();
        perform(action, 1);
        return;
      }
      if (editing || editableTarget(event.target)) return;
      if (viewOnly) {
        if (action === 'escape' || action === 'presentation') {
          event.preventDefault();
          perform('presentation', 1);
        }
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        space(true);
        return;
      }
      if (action) {
        event.preventDefault();
        perform(action, event.shiftKey ? 10 : 1);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') current.current.space(false);
    };
    const blur = () => {
      current.current.space(false);
      current.current.finishPointer();
    };
    const finish = () => current.current.finishPointer();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('mouseup', finish);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('mouseup', finish);
    };
  }, []);
}
