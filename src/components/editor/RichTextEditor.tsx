import { useLayoutEffect, useRef, useState } from 'react';
import type { RichRun } from '../../domain/richText';
import type { CanvasItem } from '../../domain/scene';
import { validUrl } from '../../domain/scene';
import { t as tr, translateMessage } from '../../i18n/index';
function readRuns(root: HTMLElement): RichRun[] {
  const runs: RichRun[] = [];
  const add = (text: string, style: Omit<RichRun, 'text'>) => {
    if (text) runs.push({ text, ...style });
  };
  const walk = (node: Node, style: Omit<RichRun, 'text'>) => {
    if (node.nodeType === Node.TEXT_NODE) {
      add(node.textContent ?? '', style);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName;
    if (tag === 'BR') {
      add('\n', style);
      return;
    }
    const block = ['DIV', 'P', 'LI'].includes(tag);
    if (block && runs.length && !runs[runs.length - 1].text.endsWith('\n')) add('\n', {});
    const next = {
      ...style,
      ...(['B', 'STRONG'].includes(tag) ? { bold: true } : {}),
      ...(['I', 'EM'].includes(tag) ? { italic: true } : {}),
      ...(tag === 'U' ? { underline: true } : {}),
      ...(tag === 'A' && validUrl(node.getAttribute('href') ?? '')
        ? { href: node.getAttribute('href')! }
        : {}),
    };
    if (tag === 'LI') add('• ', next);
    node.childNodes.forEach((child) => walk(child, next));
  };
  root.childNodes.forEach((node) => walk(node, {}));
  return runs;
}
export default function RichTextEditor({
  item,
  family,
  initial,
  onChange,
  onFinish,
}: {
  item: CanvasItem;
  family: string;
  initial: RichRun[];
  onChange: (text: string, runs: RichRun[]) => void;
  onFinish: (cancel: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    selection = useRef<Range | null>(null),
    cancelled = useRef(false);
  const [url, setUrl] = useState(''),
    [error, setError] = useState('');
  const publish = () => {
    const runs = readRuns(ref.current!);
    onChange(runs.map((r) => r.text).join(''), runs);
  };
  useLayoutEffect(() => {
    const root = ref.current!;
    root.replaceChildren();
    for (const run of initial) {
      const span = document.createElement(run.href ? 'a' : 'span');
      span.textContent = run.text;
      if (run.href) span.setAttribute('href', run.href);
      span.style.fontWeight = run.bold ? 'bold' : '';
      span.style.fontStyle = run.italic ? 'italic' : '';
      span.style.textDecoration = run.underline ? 'underline' : '';
      if (run.bold) {
        const b = document.createElement('b');
        b.textContent = run.text;
        span.replaceChildren(b);
      }
      if (run.italic) {
        const i = document.createElement('i');
        i.append(...Array.from(span.childNodes));
        span.append(i);
      }
      if (run.underline) {
        const u = document.createElement('u');
        u.append(...Array.from(span.childNodes));
        span.append(u);
      }
      root.append(span);
    }
    root.focus();
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    const remember = () => {
      const sel = getSelection();
      if (sel?.rangeCount && root.contains(sel.anchorNode))
        selection.current = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener('selectionchange', remember);
    return () => document.removeEventListener('selectionchange', remember);
  }, []);
  const command = (name: string, value?: string) => {
    ref.current?.focus();
    if (selection.current) {
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(selection.current);
    }
    document.execCommand(name, false, value);
    publish();
  };
  return (
    <div
      className="rich-editor"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !cancelled.current)
          onFinish(false);
      }}
    >
      <div
        className="rich-editable"
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={tr('Текст заметки')}
        aria-multiline="true"
        style={{
          width: item.width ?? 300,
          fontFamily: item.fontFamily ?? family,
          fontSize: item.fontSize ?? 26,
          fontWeight: item.fontStyle?.includes('bold') ? 'bold' : 'normal',
          fontStyle: item.fontStyle?.includes('italic') ? 'italic' : 'normal',
          textDecoration: item.textDecoration,
          textAlign: item.align,
          lineHeight: item.lineHeight ?? 1.3,
          color: item.fill ?? '#243447',
        }}
        onInput={publish}
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
          publish();
        }}
        onClick={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
            e.preventDefault();
            cancelled.current = true;
            onFinish(e.key === 'Escape');
          }
        }}
      />
      <div
        className="rich-toolbar"
        onMouseDown={(e) => {
          if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
        }}
      >
        <button aria-label={tr('Жирный фрагмент')} onClick={() => command('bold')}>
          {tr('Ж')}
        </button>
        <button aria-label={tr('Курсив фрагмента')} onClick={() => command('italic')}>
          {tr('К')}
        </button>
        <button aria-label={tr('Подчеркнуть фрагмент')} onClick={() => command('underline')}>
          {tr('Ч')}
        </button>
        <button onClick={() => command('insertUnorderedList')}>{tr('Список')}</button>
        <input
          aria-label={tr('Ссылка фрагмента')}
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          onClick={() => {
            if (!validUrl(url)) {
              setError(tr('Укажите полный http/https адрес'));
              return;
            }
            command('createLink', url);
            setError('');
          }}
        >
          {tr('Ссылка')}
        </button>
        <button
          onClick={() => {
            cancelled.current = true;
            onFinish(false);
          }}
        >
          {tr('Готово')}
        </button>
      </div>
      {error && <p role="alert">{translateMessage(error)}</p>}
      <span>{tr('⌘/Ctrl + Enter — готово · Esc — отмена')}</span>
    </div>
  );
}
