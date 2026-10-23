import * as THREE from 'three';
import { getPolygons } from './countries.js';

const GLOBE_RADIUS = 1;
const TEXTURE_URL = 'assets/earth_atmos_2048.jpg';
const FALLBACK_EARTH_COLOR = 0x3a6ea5;

const MARKER_RADIUS = 0.022;
const MARKER_ALTITUDE = 0.012;
const GLOW_SCALE = 2.4;
const HIGHLIGHT_SCALE = 1.7;
const COLOR_LOCKED = 0x9aa3b5;
const COLOR_UNLOCKED = 0xffc94d;
const UNLOCKED_EMISSIVE_INTENSITY = 0.9;
const GLOW_PULSE_SPEED = 3;

// Locked countries are painted on an equirectangular canvas wrapped on a sphere just above the Earth
const LOCK_TEXTURE_WIDTH = 2048;
const LOCK_TEXTURE_HEIGHT = 1024;
const LOCK_LAYER_ALTITUDE = 0.002;
const LOCK_FILL = 'rgba(12, 14, 34, 0.85)';
const LOCK_STRIPE = 'rgba(195, 177, 255, 0.35)';
const LOCK_STRIPE_SPACING_PX = 8;
const LOCK_OUTLINE = 'rgba(195, 177, 255, 0.9)';
const LOCK_OUTLINE_WIDTH_PX = 1.5;
const LOCK_FADE_MS = 2500;

const STAR_COUNT = 1500;
const STAR_MIN_DISTANCE = 30;
const STAR_MAX_DISTANCE = 60;

const CAMERA_FOV = 45;
// The globe diameter takes about 1 / FIT_MARGIN of the smallest screen dimension
const FIT_MARGIN = 1.3;
const MAX_PIXEL_RATIO = 2;

// Avoids flipping over the poles, where longitude becomes meaningless
const MAX_VIEW_LATITUDE = 80;
const FLY_DURATION_MS = 1200;
const INITIAL_VIEW = { lat: 15, lon: -20 };

let renderer, scene, camera, globe, earth;
const markers = new Map();
const raycaster = new THREE.Raycaster();
const SCREEN_CENTER = new THREE.Vector2(0, 0);
const view = { ...INITIAL_VIEW };
let flight = null;
let highlightedId = null;

let lockContext, lockTexture, lockPattern;
// id -> { path, opacity, fadeStart }
const lockZones = new Map();
const unlockedIds = new Set();

// Three.js has Y up and SphereGeometry's texture starts at lon -180,
// so the geographic frame (X, Y, Z) maps to (x, z, -y)
export function latLonToVector3(lat, lon, radius) {
  const phi = THREE.MathUtils.degToRad(lat);
  const lambda = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    radius * Math.cos(phi) * Math.cos(lambda),
    radius * Math.sin(phi),
    -radius * Math.cos(phi) * Math.sin(lambda)
  );
}

export function vector3ToLatLon(vector) {
  const radius = vector.length();
  return {
    lat: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(vector.y / radius, -1, 1))),
    lon: THREE.MathUtils.radToDeg(Math.atan2(-vector.z, vector.x)),
  };
}

// Great-circle distance in degrees (haversine)
export function angularDistance(a, b) {
  const toRad = THREE.MathUtils.degToRad;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return THREE.MathUtils.radToDeg(2 * Math.asin(Math.min(1, Math.sqrt(h))));
}

export function findNearestDance(point, dances, maxDistanceDeg) {
  let nearest = null;
  let bestDistance = maxDistanceDeg;
  for (const dance of dances) {
    const distance = angularDistance(point, dance);
    if (distance <= bestDistance) {
      bestDistance = distance;
      nearest = dance;
    }
  }
  return nearest;
}

export function wrapLongitude(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export function initGlobe(container, dances, onTextureError) {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 200);

  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 2, 5);
  scene.add(sun);

  globe = new THREE.Group();
  globe.rotation.order = 'XYZ';
  scene.add(globe);

  const earthMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  new THREE.TextureLoader().load(
    TEXTURE_URL,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      earthMaterial.map = texture;
      earthMaterial.needsUpdate = true;
    },
    undefined,
    () => {
      earthMaterial.color.set(FALLBACK_EARTH_COLOR);
      onTextureError?.();
    }
  );
  earth = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64), earthMaterial);
  globe.add(earth);

  globe.add(createLockLayer());
  createMarkers(dances);
  scene.add(createStars());

  resizeGlobe();
  window.addEventListener('resize', resizeGlobe);
}

function createMarkers(dances) {
  const markerGeometry = new THREE.SphereGeometry(MARKER_RADIUS, 16, 16);
  const glowGeometry = new THREE.SphereGeometry(MARKER_RADIUS * GLOW_SCALE, 16, 16);

  for (const dance of dances) {
    const mesh = new THREE.Mesh(
      markerGeometry,
      new THREE.MeshStandardMaterial({ color: COLOR_LOCKED, roughness: 0.5, metalness: 0.2 })
    );
    mesh.position.copy(latLonToVector3(dance.lat, dance.lon, GLOBE_RADIUS + MARKER_ALTITUDE));

    const glow = new THREE.Mesh(
      glowGeometry,
      new THREE.MeshBasicMaterial({
        color: COLOR_UNLOCKED,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glow.visible = false;
    mesh.add(glow);

    globe.add(mesh);
    markers.set(dance.id, { mesh, glow });
  }
}

function createLockLayer() {
  const canvas = document.createElement('canvas');
  canvas.width = LOCK_TEXTURE_WIDTH;
  canvas.height = LOCK_TEXTURE_HEIGHT;
  lockContext = canvas.getContext('2d');

  // Diagonal stripes, like a "closed" sign
  const tile = document.createElement('canvas');
  tile.width = tile.height = LOCK_STRIPE_SPACING_PX;
  const tileContext = tile.getContext('2d');
  tileContext.strokeStyle = LOCK_STRIPE;
  tileContext.beginPath();
  tileContext.moveTo(0, LOCK_STRIPE_SPACING_PX);
  tileContext.lineTo(LOCK_STRIPE_SPACING_PX, 0);
  tileContext.stroke();
  lockPattern = lockContext.createPattern(tile, 'repeat');

  lockTexture = new THREE.CanvasTexture(canvas);
  lockTexture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS + LOCK_LAYER_ALTITUDE, 64, 64),
    new THREE.MeshBasicMaterial({ map: lockTexture, transparent: true, depthWrite: false })
  );
}

// Same equirectangular projection as the Earth texture: x follows the longitude, y the latitude
function geometryToPath(geometry) {
  const path = new Path2D();
  for (const polygon of getPolygons(geometry)) {
    for (const ring of polygon) {
      ring.forEach(([lon, lat], index) => {
        const x = ((lon + 180) / 360) * LOCK_TEXTURE_WIDTH;
        const y = ((90 - lat) / 180) * LOCK_TEXTURE_HEIGHT;
        if (index === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      });
      path.closePath();
    }
  }
  return path;
}

function drawLockZones() {
  lockContext.clearRect(0, 0, LOCK_TEXTURE_WIDTH, LOCK_TEXTURE_HEIGHT);
  lockContext.lineWidth = LOCK_OUTLINE_WIDTH_PX;
  lockContext.strokeStyle = LOCK_OUTLINE;
  for (const zone of lockZones.values()) {
    if (zone.opacity <= 0) continue;
    lockContext.globalAlpha = zone.opacity;
    lockContext.fillStyle = LOCK_FILL;
    lockContext.fill(zone.path, 'evenodd');
    lockContext.fillStyle = lockPattern;
    lockContext.fill(zone.path, 'evenodd');
    lockContext.stroke(zone.path);
  }
  lockContext.globalAlpha = 1;
  lockTexture.needsUpdate = true;
}

// shapes: Map dance id -> GeoJSON geometry (they arrive after the globe is displayed)
export function setCountryShapes(shapes) {
  for (const [id, geometry] of shapes) {
    lockZones.set(id, { path: geometryToPath(geometry), opacity: unlockedIds.has(id) ? 0 : 1, fadeStart: null });
  }
  drawLockZones();
}

function updateLockFades(now) {
  let changed = false;
  for (const zone of lockZones.values()) {
    if (zone.fadeStart === null) continue;
    const progress = Math.min(1, (now - zone.fadeStart) / LOCK_FADE_MS);
    zone.opacity = 1 - progress;
    if (progress === 1) zone.fadeStart = null;
    changed = true;
  }
  if (changed) drawLockZones();
}

function createStars() {
  const positions = new Float32Array(STAR_COUNT * 3);
  const direction = new THREE.Vector3();
  for (let i = 0; i < STAR_COUNT; i++) {
    direction.randomDirection().multiplyScalar(THREE.MathUtils.randFloat(STAR_MIN_DISTANCE, STAR_MAX_DISTANCE));
    direction.toArray(positions, i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.6, depthWrite: false })
  );
}

function resizeGlobe() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;

  // Fit the globe in the narrowest field of view (horizontal in portrait)
  const halfVerticalFov = THREE.MathUtils.degToRad(CAMERA_FOV / 2);
  const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * camera.aspect);
  const distance = (GLOBE_RADIUS * FIT_MARGIN) / Math.sin(Math.min(halfVerticalFov, halfHorizontalFov));
  camera.position.set(0, 0, distance);
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
}

// Marker colour + dark country zone; `animate` fades the zone out instead of removing it at once
export function setDanceUnlocked(id, unlocked, animate = false) {
  if (unlocked) unlockedIds.add(id);
  else unlockedIds.delete(id);

  const marker = markers.get(id);
  if (marker) {
    marker.mesh.material.color.set(unlocked ? COLOR_UNLOCKED : COLOR_LOCKED);
    marker.mesh.material.emissive.set(unlocked ? COLOR_UNLOCKED : 0x000000);
    marker.mesh.material.emissiveIntensity = unlocked ? UNLOCKED_EMISSIVE_INTENSITY : 1;
    marker.glow.visible = unlocked;
  }

  const zone = lockZones.get(id);
  if (!zone) return;
  if (unlocked && animate && zone.opacity > 0) {
    zone.fadeStart = performance.now();
    return;
  }
  zone.fadeStart = null;
  zone.opacity = unlocked ? 0 : 1;
  drawLockZones();
}

export function setHighlightedMarker(id) {
  if (id === highlightedId) return;
  markers.get(highlightedId)?.mesh.scale.setScalar(1);
  markers.get(id)?.mesh.scale.setScalar(HIGHLIGHT_SCALE);
  highlightedId = id;
}

export function rotateView(deltaLat, deltaLon) {
  flight = null;
  view.lat = THREE.MathUtils.clamp(view.lat + deltaLat, -MAX_VIEW_LATITUDE, MAX_VIEW_LATITUDE);
  view.lon = wrapLongitude(view.lon + deltaLon);
}

export function flyTo(lat, lon) {
  flight = {
    start: performance.now(),
    fromLat: view.lat,
    fromLon: view.lon,
    deltaLat: THREE.MathUtils.clamp(lat, -MAX_VIEW_LATITUDE, MAX_VIEW_LATITUDE) - view.lat,
    // Shortest way around the globe
    deltaLon: wrapLongitude(lon - view.lon),
  };
}

function updateFlight(now) {
  if (!flight) return;
  const progress = Math.min(1, (now - flight.start) / FLY_DURATION_MS);
  const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
  view.lat = flight.fromLat + flight.deltaLat * eased;
  view.lon = wrapLongitude(flight.fromLon + flight.deltaLon * eased);
  if (progress === 1) flight = null;
}

// Raycast through the crosshair (screen center) and convert the hit point to lat/lon
export function getCrosshairLatLon() {
  raycaster.setFromCamera(SCREEN_CENTER, camera);
  const hit = raycaster.intersectObject(earth, false)[0];
  if (!hit) return null;
  return vector3ToLatLon(globe.worldToLocal(hit.point.clone()));
}

export function renderGlobe(now) {
  updateFlight(now);
  updateLockFades(now);

  // Rotate so that (view.lat, view.lon) faces the camera, north kept up
  globe.rotation.x = THREE.MathUtils.degToRad(view.lat);
  globe.rotation.y = THREE.MathUtils.degToRad(-90 - view.lon);
  globe.updateMatrixWorld();

  const pulse = 1 + 0.15 * Math.sin((now / 1000) * GLOW_PULSE_SPEED);
  for (const { glow } of markers.values()) {
    if (glow.visible) glow.scale.setScalar(pulse);
  }

  renderer.render(scene, camera);
}
