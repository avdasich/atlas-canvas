import type { CanvasItem } from './sceneTypes';
export type DisclosureSection = {
  id: string;
  title: string;
  content: string;
  collapsed: boolean;
  height: number;
};
export const disclosureHeader = 44;
export function createSection(title = 'Дополнительно'): DisclosureSection {
  return { id: crypto.randomUUID(), title, content: '', collapsed: true, height: 140 };
}
export function disclosureSize(item: CanvasItem) {
  return {
    width: item.width ?? 380,
    height:
      28 +
      (item.sections ?? []).reduce(
        (height, s) => height + disclosureHeader + (s.collapsed ? 0 : s.height),
        0,
      ),
  };
}
export function validSections(value: unknown): value is DisclosureSection[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) return false;
  const ids = new Set<string>();
  return value.every((section) => {
    if (
      !section ||
      typeof section.id !== 'string' ||
      !section.id ||
      section.id.length > 80 ||
      ids.has(section.id) ||
      typeof section.title !== 'string' ||
      section.title.length > 500 ||
      typeof section.content !== 'string' ||
      section.content.length > 100000 ||
      typeof section.collapsed !== 'boolean' ||
      !Number.isFinite(section.height) ||
      section.height < 60 ||
      section.height > 1000
    )
      return false;
    ids.add(section.id);
    return true;
  });
}
