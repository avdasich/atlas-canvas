
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import worldData from "world-atlas/countries-110m.json";

type WorldMapProps = {
  onCountrySelect: (name: string) => void;
};

type View = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MAP_WIDTH = 960;
const MAP_HEIGHT = 500;

const world = worldData as unknown as Topology;

const countries = feature(
  world,
  world.objects.countries as GeometryCollection<{ name: string }>
);

const projection = geoNaturalEarth1().fitSize(
  [MAP_WIDTH, MAP_HEIGHT],
  countries
);

const path = geoPath(projection);

function WorldMap({ onCountrySelect }: WorldMapProps) {
  const [view, setView] = useState<View>({
    x: 0,
    y: 0,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
  });

  const svgRef = useRef<SVGSVGElement>(null);

  const dragRef = useRef<{
    mouseX: number;
    mouseY: number;
    view: View;
  } | null>(null);

  const movedRef = useRef(false);

  const zoomAt = useCallback(
    (factor: number, px = 0.5, py = 0.5) => {
      setView((current) => {
        const width = Math.max(
          MAP_WIDTH / 6,
          Math.min(MAP_WIDTH, current.width / factor)
        );

        const height = width * MAP_HEIGHT / MAP_WIDTH;

        const anchorX = current.x + px * current.width;
        const anchorY = current.y + py * current.height;

        const x = Math.max(
          0,
          Math.min(MAP_WIDTH - width, anchorX - px * width)
        );

        const y = Math.max(
          0,
          Math.min(MAP_HEIGHT - height, anchorY - py * height)
        );

        return { x, y, width, height };
      });
    },
    []
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    function handleWheel(event: WheelEvent) {
      event.preventDefault();

      const rect = svg!.getBoundingClientRect();

      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;

      zoomAt(event.deltaY < 0 ? 1.2 : 1 / 1.2, px, py);
    }

    svg.addEventListener("wheel", handleWheel, {
      passive: false,
    });

    return () => svg.removeEventListener("wheel", handleWheel);
  }, [zoomAt]);

  function handleMouseDown(event: ReactMouseEvent<SVGSVGElement>) {
    if (event.button !== 0) return;

    movedRef.current = false;

    dragRef.current = {
      mouseX: event.clientX,
      mouseY: event.clientY,
      view,
    };
  }

  function handleMouseMove(event: ReactMouseEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;

    const dx = event.clientX - drag.mouseX;
    const dy = event.clientY - drag.mouseY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      movedRef.current = true;
    }

    if (!movedRef.current) return;

    const rect = event.currentTarget.getBoundingClientRect();

    const x = Math.max(
      0,
      Math.min(
        MAP_WIDTH - drag.view.width,
        drag.view.x - (dx / rect.width) * drag.view.width
      )
    );

    const y = Math.max(
      0,
      Math.min(
        MAP_HEIGHT - drag.view.height,
        drag.view.y - (dy / rect.height) * drag.view.height
      )
    );

    setView({ ...drag.view, x, y });
  }

  return (
    <>
      <div className="map-controls">
        <button onClick={() => zoomAt(1.5)}>+</button>
        <button onClick={() => zoomAt(1 / 1.5)}>−</button>
      </div>

      <svg
        ref={svgRef}
        className="world-map"
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={() => (dragRef.current = null)}
        onMouseLeave={() => (dragRef.current = null)}
      >
        {countries.features.map((country, index) => {
          const name = country.properties.name;

          return (
            <path
              key={country.id ?? index}
              d={path(country) ?? ""}
              className="country"
              onClick={() => {
                if (!movedRef.current) {
                  onCountrySelect(name);
                }
              }}
            >
              <title>{name}</title>
            </path>
          );
        })}
      </svg>
    </>
  );
}

export default WorldMap;
