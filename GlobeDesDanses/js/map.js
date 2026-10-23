// Leaflet is loaded as a classic script in index.html and exposes the global `L`.
// CARTO basemaps now answer "API key required", hence the standard OpenStreetMap tiles.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const INITIAL_ZOOM = 3;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

// Short animated pans chained at the same rhythm give a continuous, smooth motion
const SYNC_INTERVAL_MS = 250;
const PAN_DURATION_S = 0.25;
const MIN_PAN_DEG = 0.05;

const MARKER_RADIUS_PX = 8;
const COLOR_LOCKED = '#9aa3b5';
const COLOR_UNLOCKED = '#ffc94d';

let map = null;
const mapMarkers = new Map();
let lastSync = 0;
let lastCenter = null;

export function initMiniMap(container, dances, onDanceClick) {
  if (typeof L === 'undefined') return false;

  // The map follows the globe: no manual panning, only the zoom buttons
  map = L.map(container, {
    center: [0, 0],
    zoom: INITIAL_ZOOM,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    touchZoom: false,
    keyboard: false,
  });
  L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);

  for (const dance of dances) {
    const marker = L.circleMarker([dance.lat, dance.lon], {
      radius: MARKER_RADIUS_PX,
      color: '#ffffff',
      weight: 2,
      fillColor: COLOR_LOCKED,
      fillOpacity: 1,
    })
      // autoPan would fight with the globe synchronisation
      .bindPopup('', { autoPan: false, closeButton: false })
      .on('click', () => onDanceClick(dance))
      .addTo(map);
    mapMarkers.set(dance.id, { marker, dance });
    setMapMarkerState(dance.id, { unlocked: false, bestScore: null });
  }
  return true;
}

export function setMapMarkerState(id, { unlocked, bestScore }) {
  const entry = mapMarkers.get(id);
  if (!entry) return;
  const { marker, dance } = entry;
  marker.setStyle({ fillColor: unlocked ? COLOR_UNLOCKED : COLOR_LOCKED });
  if (unlocked) marker.bringToFront();

  const status = unlocked ? '⭐ Débloquée' : '🔒 À débloquer';
  const score = bestScore === null ? 'Pas encore de score' : `Meilleur score : ${bestScore} %`;
  marker.setPopupContent(
    `<strong>${dance.pays}</strong><br>${dance.danse} · ${dance.bpm} BPM<br>${status}<br><small>${score}</small>`
  );
}

export function syncMiniMap(point, now) {
  if (!map || !point || now - lastSync < SYNC_INTERVAL_MS) return;
  lastSync = now;

  // Unwrap the longitude so crossing the antimeridian pans a few degrees, not around the world
  let lon = point.lon;
  if (lastCenter) lon += 360 * Math.round((lastCenter.lon - lon) / 360);
  if (lastCenter && Math.abs(lastCenter.lat - point.lat) < MIN_PAN_DEG && Math.abs(lastCenter.lon - lon) < MIN_PAN_DEG) return;

  // Back in [-180, 180] without animation: the tiles repeat so the jump is invisible
  if (Math.abs(lon) > 180) {
    const wrapped = lon - 360 * Math.round(lon / 360);
    map.setView([point.lat, wrapped], map.getZoom(), { animate: false });
    lastCenter = { lat: point.lat, lon: wrapped };
    return;
  }

  map.panTo([point.lat, lon], { animate: true, duration: PAN_DURATION_S, easeLinearity: 1, noMoveStart: true });
  lastCenter = { lat: point.lat, lon };
}

export function refreshMiniMapSize() {
  map?.invalidateSize();
}
