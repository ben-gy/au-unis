// Leaflet state choropleth. Adapted from patterns/leafletMap.ts.
//
// Boundaries are the real ABS ASGS state polygons shipped in public/data —
// never hand-authored coordinates. The map is deliberately the only geographic
// view: this dataset has no geography finer than "state of the institution",
// and drawing anything more specific would be inventing detail the source
// does not contain.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface StateMapOptions {
  /** Metric for a state, or null when nothing is published. */
  valueFor: (stateName: string) => number | null;
  tooltipFor: (stateName: string) => string;
  /** [low, high] for the colour ramp. */
  domain: [number, number];
  /** Value that renders neutral — makes the ramp diverging. */
  midpoint?: number;
  onSelect?: (stateName: string) => void;
}

/** Diverging ramp: navy (low) → light (mid) → red (high). */
function colourFor(value: number | null, domain: [number, number], midpoint?: number): string {
  if (value === null || !Number.isFinite(value)) return '#e5eaf1';
  const [lo, hi] = domain;
  const mid = midpoint ?? (lo + hi) / 2;
  const clamp = (t: number) => Math.max(0, Math.min(1, t));
  if (value >= mid) {
    const t = clamp((value - mid) / Math.max(1e-9, hi - mid));
    return mix([203, 213, 225], [185, 28, 28], t);
  }
  const t = clamp((mid - value) / Math.max(1e-9, mid - lo));
  return mix([203, 213, 225], [30, 58, 95], t);
}

function mix(a: number[], b: number[], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export async function renderStateMap(container: HTMLElement, options: StateMapOptions): Promise<void> {
  container.innerHTML = '';
  const canvas = document.createElement('div');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.append(canvas);

  let geo: unknown;
  try {
    const res = await fetch('data/au-states.geojson');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    geo = await res.json();
  } catch {
    container.innerHTML = '<p class="state-msg error">Could not load the state boundaries. Reload to try again.</p>';
    return;
  }

  const map = L.map(canvas, {
    minZoom: 2,
    maxZoom: 9,
    zoomControl: true,
    // Don't hijack page scrolling — zoom buttons and pinch still work.
    scrollWheelZoom: false,
    attributionControl: true,
  });
  map.attributionControl.setPrefix(false);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: 'Tiles © CARTO',
    subdomains: 'abcd',
    minZoom: 2,
    maxZoom: 9,
  }).addTo(map);

  const nameOf = (props: Record<string, unknown>): string =>
    String(props.name ?? props.NAME ?? props.STE_NAME21 ?? props.state ?? '');

  const layer = L.geoJSON(geo as never, {
    attribution: 'Boundaries: ABS ASGS (CC BY 4.0)',
    style: (feature) => {
      const name = nameOf((feature?.properties ?? {}) as Record<string, unknown>);
      return {
        fillColor: colourFor(options.valueFor(name), options.domain, options.midpoint),
        fillOpacity: 0.85,
        color: '#ffffff',
        weight: 0.8,
      };
    },
    onEachFeature: (feature, lyr) => {
      const name = nameOf((feature.properties ?? {}) as Record<string, unknown>);
      lyr.bindTooltip(options.tooltipFor(name), { sticky: true, className: 'map-tip' });
      lyr.on({
        mouseover: () => (lyr as L.Path).setStyle({ weight: 2.4, color: '#14263c' }),
        mouseout: () => layer.resetStyle(lyr as L.Path),
        click: () => options.onSelect?.(name),
      });
    },
  }).addTo(map);

  // Zero-size defence: Leaflet mis-renders when built in a container that has
  // not finished layout, so fit once the container really has height.
  const bounds = layer.getBounds();
  const fit = () => {
    map.invalidateSize();
    if (bounds.isValid() && canvas.clientHeight > 50) map.fitBounds(bounds, { padding: [14, 14] });
  };
  const ro = new ResizeObserver(() => {
    if (canvas.clientHeight > 50) {
      fit();
      ro.disconnect();
    }
  });
  ro.observe(canvas);
  setTimeout(fit, 400);
}
