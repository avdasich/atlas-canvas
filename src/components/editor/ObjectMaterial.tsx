import { useEffect, useMemo, useRef } from 'react';
import { defaultGlass, rgba } from '../../domain/materials';
import type { Camera, CanvasItem } from '../../domain/scene';
import {
  drawObjectShimmer,
  maskedCrystals,
  materialRaster,
  rasterSignature,
} from '../../services/materialRaster';
import { richLayout } from '../../services/textLayout';

export default function ObjectMaterial({
  item,
  camera,
  fontFamily,
  textColor,
  fontRevision,
  zIndex,
}: {
  item: CanvasItem;
  camera: Camera;
  fontFamily: string;
  textColor: string;
  fontRevision: number;
  zIndex: number;
}) {
  const signature = rasterSignature(item);
  const detail = camera.scale < 0.35 ? 0.5 : camera.scale < 1 ? 1 : 2;
  const raster = useMemo(
    () => materialRaster(item, fontFamily, textColor, detail),
    [signature, fontFamily, textColor, fontRevision, detail],
  );
  const urls = useMemo(
    () => ({ base: raster.base.toDataURL(), rim: raster.rim.toDataURL() }),
    [raster],
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = item.shimmer;
  const animate =
    camera.scale *
      Math.min(raster.width * (item.scaleX ?? 1), raster.height * (item.scaleY ?? 1)) >=
    28;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !settings?.enabled) return;
    canvas.width = raster.mask.width;
    canvas.height = raster.mask.height;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(raster.ratio, 0, 0, raster.ratio, 0, 0);
    const crystals = maskedCrystals(raster),
      motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0,
      visible = true,
      last = -Infinity;
    const draw = (time: number) => {
      ctx.clearRect(0, 0, raster.width, raster.height);
      drawObjectShimmer(
        ctx,
        raster,
        settings,
        !animate || motion.matches ? 0 : time / 1000,
        crystals,
      );
    };
    const tick = (time: number) => {
      if (time - last >= 1000 / 30) {
        draw(time);
        last = time;
      }
      frame = requestAnimationFrame(tick);
    };
    const update = () => {
      cancelAnimationFrame(frame);
      if (document.hidden || !visible) return;
      draw(performance.now());
      if (animate && !motion.matches) frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(canvas);
    motion.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      motion.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [raster, animate, settings?.enabled, settings?.color, settings?.intensity, settings?.speed]);
  const glass = item.glass ?? defaultGlass;
  const noteBackground = useMemo(
    () => (item.kind === 'note' && item.textBackground ? richLayout(item, fontFamily) : null),
    [signature, fontFamily, fontRevision],
  );
  const box = {
    left: raster.left,
    top: raster.top,
    width: raster.width,
    height: raster.height,
    opacity: item.opacity ?? 1,
  };
  const mask = {
    maskImage: `url("${raster.url}")`,
    WebkitMaskImage: `url("${raster.url}")`,
    maskSize: '100% 100%',
    WebkitMaskSize: '100% 100%',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
  };
  return (
    <div
      className="object-material"
      aria-hidden="true"
      data-material-id={item.id}
      style={{
        zIndex,
        left: camera.x + item.x * camera.scale,
        top: camera.y + item.y * camera.scale,
        transform: `rotate(${item.rotation ?? 0}deg) scale(${camera.scale * (item.scaleX ?? 1)},${camera.scale * (item.scaleY ?? 1)})`,
      }}
    >
      {glass.enabled && noteBackground && (
        <div
          className="material-layer"
          style={{
            left: 0,
            top: 0,
            width: noteBackground.width,
            height: noteBackground.height,
            background: item.textBackground,
            opacity: item.opacity ?? 1,
          }}
        />
      )}
      {!glass.enabled && (
        <img alt="" draggable={false} className="material-layer" src={urls.base} style={box} />
      )}
      {glass.enabled && (
        <>
          <div
            className="material-layer glass-object-surface"
            style={{
              ...box,
              ...mask,
              backdropFilter: `blur(${glass.blur}px) saturate(1.3)`,
              WebkitBackdropFilter: `blur(${glass.blur}px) saturate(1.3)`,
              background: `linear-gradient(135deg,#ffffff66 0%,#ffffff08 45%,#ffffff22 100%),${rgba(glass.tint, glass.opacity)}`,
            }}
          />
          <img
            alt=""
            className="material-layer material-rim"
            draggable={false}
            src={urls.rim}
            style={box}
          />
        </>
      )}
      {settings?.enabled && (
        <canvas
          ref={canvasRef}
          className="material-layer material-sparkles"
          style={{ ...box, ...mask }}
        />
      )}
    </div>
  );
}
