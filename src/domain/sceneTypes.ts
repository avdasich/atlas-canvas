import type { ImageCrop } from './crop';
import type { DisclosureSection } from './disclosure';
import type { Glass } from './materials';
import type { RichRun } from './richText';
import type { Shimmer } from './shimmer';
export type Camera = { x: number; y: number; scale: number };
export type ItemKind =
  | 'note'
  | 'rectangle'
  | 'square'
  | 'circle'
  | 'ellipse'
  | 'star'
  | 'arrow'
  | 'line'
  | 'stroke'
  | 'image'
  | 'table'
  | 'video'
  | 'audio'
  | 'link'
  | 'disclosure';
export type CellStyle = {
  fill?: string;
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
};
export type TableCell = CellStyle & { text: string };
export type TableData = {
  merges?: { row: number; column: number; rows: number; columns: number }[];
  headerFill?: string;
  cells: TableCell[][];
  columnWidths: number[];
  rowHeights: number[];
  header: boolean;
  borderColor: string;
  background: string;
  color: string;
  borderWidth: number;
  fontSize: number;
  padding: number;
  radius: number;
};
export type CanvasItem = {
  id: string;
  kind: ItemKind;
  x: number;
  y: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  crop?: ImageCrop;
  sections?: DisclosureSection[];
  glass?: Glass;
  shimmer?: Shimmer;
  richText?: RichRun[];
  textBackground?: string;
  width?: number;
  height?: number;
  content?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  textDecoration?: string;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  shadowBlur?: number;
  opacity?: number;
  locked?: boolean;
  hidden?: boolean;
  groupId?: string;
  updatedAt?: string;
  dash?: number[];
  tension?: number;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  points?: number[];
  assetId?: string;
  title?: string;
  url?: string;
  table?: TableData;
};
export type Theme = {
  glassPanels?: boolean;
  textColor?: string;
  backgroundOpacity?: number;
  imageScale?: number;
  imageX?: number;
  imageY?: number;
  drawShapes?: boolean;
  repeatShape?: boolean;
  minimap?: boolean;
  rulers?: boolean;
  snapGuides?: boolean;
  guides?: { id: string; axis: 'x' | 'y'; value: number }[];
  bookmarks?: { id: string; name: string; camera: Camera }[];
  shimmer?: Shimmer;
  background: string;
  pattern: 'dots' | 'grid' | 'lines' | 'none';
  fontFamily: string;
  backgroundType?: 'solid' | 'gradient' | 'image';
  secondary?: string;
  angle?: number;
  backgroundAssetId?: string;
  imageMode?: 'cover' | 'contain' | 'repeat' | 'stretch';
  patternColor?: string;
  patternOpacity?: number;
  gridSize?: number;
  snap?: boolean;
};
export type Scene = { schemaVersion: 5; items: CanvasItem[]; camera: Camera; theme: Theme };
