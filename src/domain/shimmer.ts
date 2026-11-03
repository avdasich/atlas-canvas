export type Shimmer = { enabled: boolean; intensity: number; speed: number; color: string };
export const defaultShimmer: Shimmer = {
  enabled: false,
  intensity: 0.55,
  speed: 0.7,
  color: '#ffffff',
};
export function validShimmer(value: unknown): value is Shimmer {
  if (!value || typeof value !== 'object') return false;
  const s = value as Shimmer;
  return (
    typeof s.enabled === 'boolean' &&
    Number.isFinite(s.intensity) &&
    s.intensity >= 0 &&
    s.intensity <= 1 &&
    Number.isFinite(s.speed) &&
    s.speed >= 0.1 &&
    s.speed <= 2 &&
    typeof s.color === 'string' &&
    /^#[a-f\d]{6}$/i.test(s.color)
  );
}
export type Crystal = {
  x: number;
  y: number;
  radius: number;
  phase: number;
  rate: number;
  ray: boolean;
};
export function snowCrystals(width: number, height: number): Crystal[] {
  let seed = 291113;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: Math.min(2400, Math.ceil((width * height) / 460)) }, () => ({
    x: random() * width,
    y: random() * height,
    radius: 0.3 + random() * 0.8,
    phase: random() * Math.PI * 2,
    rate: 0.4 + random() * 1.8,
    ray: random() > 0.94,
  }));
}
export function crystalLight(c: Crystal, seconds: number, speed: number) {
  // Each stationary crystal has its own slow highlight cycle. No falling snow.
  return 0.025 + Math.pow((Math.sin(seconds * c.rate * speed + c.phase) + 1) / 2, 24) * 0.975;
}
export function drawShimmer(
  ctx: CanvasRenderingContext2D,
  crystals: Crystal[],
  settings: Shimmer,
  seconds: number,
) {
  ctx.fillStyle = settings.color;
  ctx.strokeStyle = settings.color;
  for (const c of crystals) {
    const light = crystalLight(c, seconds, settings.speed);
    ctx.globalAlpha = light * settings.intensity;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
    ctx.fill();
    if (light > 0.68 && c.ray) {
      const ray = c.radius * (2 + light * 2);
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.moveTo(c.x - ray, c.y);
      ctx.lineTo(c.x + ray, c.y);
      ctx.moveTo(c.x, c.y - ray);
      ctx.lineTo(c.x, c.y + ray);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
