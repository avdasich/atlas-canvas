export function sanitizeSvg(source: string): { svg: string; width: number; height: number } {
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw new Error('SVG с внешними сущностями не поддерживается.');
  const document = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg')
    throw new Error('Повреждён SVG.');
  const root = document.documentElement;
  const allowed = new Set([
    'svg',
    'g',
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'text',
    'tspan',
    'defs',
    'linearGradient',
    'radialGradient',
    'stop',
    'clipPath',
    'mask',
    'pattern',
    'use',
    'title',
    'desc',
  ]);
  const attrs = new Set([
    'xmlns',
    'xmlns:xlink',
    'id',
    'x',
    'y',
    'x1',
    'x2',
    'y1',
    'y2',
    'cx',
    'cy',
    'r',
    'rx',
    'ry',
    'width',
    'height',
    'viewBox',
    'preserveAspectRatio',
    'd',
    'points',
    'transform',
    'fill',
    'fill-opacity',
    'fill-rule',
    'stroke',
    'stroke-width',
    'stroke-opacity',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-dasharray',
    'opacity',
    'font-size',
    'font-family',
    'font-weight',
    'font-style',
    'text-anchor',
    'dx',
    'dy',
    'offset',
    'stop-color',
    'stop-opacity',
    'gradientUnits',
    'gradientTransform',
    'patternUnits',
    'patternTransform',
    'clip-path',
    'clip-rule',
    'mask',
    'href',
    'xlink:href',
  ]);
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    if (!allowed.has(el.localName)) {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      if (
        !attrs.has(attr.name) ||
        (/(?:javascript|data|https?|file):/i.test(attr.value) && !attr.name.startsWith('xmlns')) ||
        (attr.name.endsWith('href') && !/^#[\w.-]+$/.test(attr.value)) ||
        (/url\s*\(/i.test(attr.value) && !/^url\(\s*['"]?#[\w.-]+['"]?\s*\)$/.test(attr.value))
      )
        el.removeAttribute(attr.name);
    }
  }
  const box = root
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const w = parseFloat(root.getAttribute('width') ?? '') || box?.[2] || 800,
    h = parseFloat(root.getAttribute('height') ?? '') || box?.[3] || 600;
  if (!Number.isFinite(w + h) || w <= 0 || h <= 0 || w > 100000 || h > 100000)
    throw new Error('Недопустимый размер SVG.');
  const scale = Math.min(1, 4096 / w, 4096 / h),
    width = Math.max(1, Math.round(w * scale)),
    height = Math.max(1, Math.round(h * scale));
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  if (!root.hasAttribute('viewBox')) root.setAttribute('viewBox', `0 0 ${w} ${h}`);
  return { svg: new XMLSerializer().serializeToString(root), width, height };
}
export async function rasterizeSvg(file: File): Promise<File> {
  if (file.size > 5 * 1024 * 1024) throw new Error('SVG превышает 5 МиБ.');
  const safe = sanitizeSvg(await file.text()),
    url = URL.createObjectURL(new Blob([safe.svg], { type: 'image/svg+xml' }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Не удалось преобразовать SVG'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = safe.width;
    canvas.height = safe.height;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Не удалось сохранить SVG как PNG'))),
        'image/png',
      ),
    );
    return new File([png], file.name.replace(/\.svg$/i, '') + '.png', { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
