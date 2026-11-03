export function pdfFromJpeg(jpeg: Uint8Array, width: number, height: number): Uint8Array {
  return pdfFromJpegs([{ jpeg, width, height }]);
}
export function pdfFromJpegs(
  pages: { jpeg: Uint8Array; width: number; height: number }[],
): Uint8Array {
  if (
    !pages.length ||
    pages.some((p) => p.width <= 0 || p.height <= 0 || !Number.isFinite(p.width + p.height))
  )
    throw new Error('Некорректные страницы PDF');
  const encoder = new TextEncoder(),
    chunks: Uint8Array[] = [],
    offsets = [0];
  let length = 0;
  const append = (data: string | Uint8Array) => {
    const b = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(b);
    length += b.length;
  };
  append('%PDF-1.4\n');
  const object = (id: number, body: string) => {
    offsets[id] = length;
    append(`${id} 0 obj\n${body}\nendobj\n`);
  };
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(
    2,
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  );
  pages.forEach(({ jpeg, width, height }, i) => {
    const id = 3 + i * 3,
      pageWidth = Math.min(1200, width),
      pageHeight = (pageWidth * height) / width;
    object(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`,
    );
    offsets[id + 1] = length;
    append(
      `${id + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    );
    append(jpeg);
    append('\nendstream\nendobj\n');
    const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
    object(
      id + 2,
      `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`,
    );
  });
  const count = 3 + pages.length * 3,
    xref = length;
  append(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) append(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  append(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const result = new Uint8Array(length);
  let cursor = 0;
  for (const c of chunks) {
    result.set(c, cursor);
    cursor += c.length;
  }
  return result;
}
