export type RichRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  href?: string;
};
export type RichSegment = RichRun & { x: number; y: number; width: number };
export function layoutRichText(
  runs: RichRun[],
  width: number,
  fontSize: number,
  lineHeight: number,
  align: 'left' | 'center' | 'right',
  measure: (text: string, run: RichRun) => number,
) {
  const lines: { parts: RichSegment[]; width: number }[] = [{ parts: [], width: 0 }];
  let line = lines[0];
  const newline = () => {
    line = { parts: [], width: 0 };
    lines.push(line);
  };
  const append = (text: string, run: RichRun, w: number) => {
    line.parts.push({
      ...run,
      text,
      x: line.width,
      y: (lines.length - 1) * fontSize * lineHeight,
      width: w,
    });
    line.width += w;
  };
  for (const run of runs)
    for (const token of run.text.split(/(\n|[^\S\n]+|[^\s]+)/).filter(Boolean)) {
      if (token === '\n') {
        newline();
        continue;
      }
      const w = measure(token, run);
      if (line.width && line.width + w > width) newline();
      if (w <= width) append(token, run, w);
      else
        for (const char of Array.from(token)) {
          const cw = measure(char, run);
          if (line.width && line.width + cw > width) newline();
          append(char, run, cw);
        }
    }
  return {
    width,
    height: Math.max(fontSize * lineHeight, lines.length * fontSize * lineHeight),
    segments: lines.flatMap((l) =>
      l.parts.map((p) => ({
        ...p,
        x:
          p.x +
          (align === 'center' ? (width - l.width) / 2 : align === 'right' ? width - l.width : 0),
      })),
    ),
  };
}
