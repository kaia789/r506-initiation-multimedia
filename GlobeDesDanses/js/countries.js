// Country outlines (Natural Earth data, packaged by mledoze/countries): one GeoJSON file per
// ISO 3166-1 alpha-3 code, so adding a dance only needs its `iso` field.
const SHAPES_URL = 'https://cdn.jsdelivr.net/gh/mledoze/countries@5.1.0/data/';

// Resolves to a Map dance id -> GeoJSON geometry; countries that fail to load are left out
export async function loadCountryShapes(dances) {
  const results = await Promise.allSettled(
    dances.filter((dance) => dance.iso).map(async (dance) => {
      const response = await fetch(`${SHAPES_URL}${dance.iso.toLowerCase()}.geo.json`);
      if (!response.ok) throw new Error(`${dance.iso}: HTTP ${response.status}`);
      const data = await response.json();
      const feature = data.features ? data.features[0] : data;
      return [dance.id, feature.geometry];
    })
  );
  return new Map(results.filter((result) => result.status === 'fulfilled').map((result) => result.value));
}

// Polygon rings as arrays of [lon, lat], whatever the geometry type
export function getPolygons(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}
