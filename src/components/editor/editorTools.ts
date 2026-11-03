import type { ItemKind } from '../../domain/scene';
export type EditorTool = 'select' | 'pen' | 'eraser' | 'shape';
export const shapeLabels: [ItemKind, string][] = [
  ['rectangle', 'Прямоугольник'],
  ['square', 'Квадрат'],
  ['circle', 'Круг'],
  ['ellipse', 'Эллипс'],
  ['star', 'Звезда'],
  ['line', 'Линия'],
  ['arrow', 'Стрелка'],
];
