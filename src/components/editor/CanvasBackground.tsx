import type { Camera, Theme } from '../../domain/scene';
import SnowShimmer from './SnowShimmer';
export default function CanvasBackground({
  theme,
  camera,
  backgroundUrl,
}: {
  theme: Theme;
  camera: Camera;
  backgroundUrl: string;
}) {
  const patternColor = `${theme.patternColor ?? '#85929e'}${Math.round(
    (theme.patternOpacity ?? 0.3) * 255,
  )
    .toString(16)
    .padStart(2, '0')}`;
  const bgImage =
    theme.pattern === 'dots'
      ? `radial-gradient(circle, ${patternColor} 1px, transparent 1px)`
      : theme.pattern === 'grid'
        ? `linear-gradient(${patternColor} 1px, transparent 1px), linear-gradient(90deg, ${patternColor} 1px, transparent 1px)`
        : theme.pattern === 'lines'
          ? `linear-gradient(${patternColor} 1px, transparent 1px)`
          : 'none';
  const step = (theme.gridSize ?? 22) * camera.scale;
  const sceneBackground =
    theme.backgroundType === 'gradient'
      ? `linear-gradient(${theme.angle ?? 135}deg, ${theme.background}, ${theme.secondary ?? '#dce8ec'})`
      : backgroundUrl && theme.backgroundType === 'image' && theme.imageMode === 'repeat'
        ? `url("${backgroundUrl}")`
        : '';
  return (
    <>
      {' '}
      <div
        className="scene-background"
        aria-hidden="true"
        style={{
          opacity: theme.backgroundOpacity ?? 1,
          backgroundImage: sceneBackground,
          backgroundSize:
            theme.imageMode === 'repeat' ? `${300 * (theme.imageScale ?? 1)}px auto` : 'cover',
          backgroundPosition: `${theme.imageX ?? 0}px ${theme.imageY ?? 0}px`,
        }}
      >
        {backgroundUrl && theme.backgroundType === 'image' && theme.imageMode !== 'repeat' && (
          <img
            src={backgroundUrl}
            alt=""
            style={{
              objectFit:
                theme.imageMode === 'contain'
                  ? 'contain'
                  : theme.imageMode === 'stretch'
                    ? 'fill'
                    : 'cover',
              transform: `translate(${theme.imageX ?? 0}px,${theme.imageY ?? 0}px) scale(${theme.imageScale ?? 1})`,
            }}
          />
        )}
      </div>
      <div
        className="scene-pattern"
        aria-hidden="true"
        style={{
          backgroundImage: bgImage,
          backgroundSize: `${step}px ${step}px`,
          backgroundPosition: `${camera.x}px ${camera.y}px`,
        }}
      />
      <SnowShimmer settings={theme.shimmer} />
    </>
  );
}
