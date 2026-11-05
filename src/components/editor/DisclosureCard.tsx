import { useEffect, useRef, useState } from 'react';
import type { DisclosureSection } from '../../domain/disclosure';
import type { SectionDraft } from '../../domain/drafts';
import { t as tr } from '../../i18n/index';

function SectionText({
  section,
  readOnly,
  onFocus,
  onCommit,
  onDraft,
}: {
  section: DisclosureSection;
  readOnly: boolean;
  onFocus: () => void;
  onCommit: (text: string) => void;
  onDraft: (text: string | null) => void;
}) {
  const [draft, setDraft] = useState(section.content);
  const cancelled = useRef(false);
  useEffect(() => setDraft(section.content), [section.content]);
  if (readOnly)
    return (
      <div className="disclosure-reading" style={{ height: section.height }}>
        {section.content || tr('В этом разделе пока нет текста.')}
      </div>
    );
  return (
    <textarea
      aria-label={tr('Текст раздела {0}', section.title)}
      placeholder={tr('Добавьте подробности, пояснения или источники…')}
      maxLength={100000}
      value={draft}
      style={{ height: section.height }}
      onFocus={() => {
        cancelled.current = false;
        onFocus();
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onDraft(e.target.value);
      }}
      onBlur={() => {
        if (!cancelled.current && draft !== section.content) onCommit(draft);
        onDraft(null);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          cancelled.current = true;
          setDraft(section.content);
          onDraft(null);
          e.currentTarget.blur();
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
    />
  );
}
export default function DisclosureCard({
  sections,
  readOnly,
  onSelect,
  onChange,
  onDraft,
  itemId,
}: {
  sections: DisclosureSection[];
  readOnly: boolean;
  onSelect: () => void;
  onChange: (sectionId: string, patch: Partial<DisclosureSection>) => void;
  onDraft: (draft: SectionDraft | null) => void;
  itemId: string;
}) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  useEffect(() => setOverrides({}), [readOnly, sections]);
  return (
    <div className="disclosure-sections">
      {sections.map((section) => {
        const collapsed = overrides[section.id] ?? section.collapsed;
        return (
          <section className="disclosure-section" key={section.id}>
            <button
              type="button"
              className="disclosure-heading"
              title={section.title}
              aria-expanded={!collapsed}
              onClick={(e) => {
                e.stopPropagation();
                if (readOnly) setOverrides((all) => ({ ...all, [section.id]: !collapsed }));
                else {
                  onSelect();
                  onChange(section.id, { collapsed: !collapsed });
                }
              }}
            >
              <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
              <strong>{section.title || tr('Без заголовка')}</strong>
            </button>
            {!collapsed && (
              <SectionText
                section={section}
                readOnly={readOnly}
                onFocus={onSelect}
                onCommit={(content) => onChange(section.id, { content })}
                onDraft={(text) =>
                  onDraft(text === null ? null : { id: itemId, sectionId: section.id, text })
                }
              />
            )}
          </section>
        );
      })}
    </div>
  );
}
