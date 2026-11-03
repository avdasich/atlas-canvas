import type { Theme } from './scene';
export function snapPosition(x: number, y: number, theme: Theme, scale: number) {
  const step = theme.gridSize ?? 22;
  if (theme.snap) {
    x = Math.round(x / step) * step;
    y = Math.round(y / step) * step;
  }
  if (theme.snapGuides !== false) {
    const nearest = (axis: 'x' | 'y', value: number) => {
      const values = (theme.guides ?? []).filter((g) => g.axis === axis).map((g) => g.value);
      const candidate = values.sort((a, b) => Math.abs(a - value) - Math.abs(b - value))[0];
      return candidate !== undefined && Math.abs(candidate - value) * scale <= 8
        ? candidate
        : value;
    };
    x = nearest('x', x);
    y = nearest('y', y);
  }
  return { x, y };
}
