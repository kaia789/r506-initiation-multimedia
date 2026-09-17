const BERMUDES = [[25.7617, -80.1918], [32.3078, -64.7505], [18.4655, -66.1057]];

const STADIA_KEY = "eed6a6b4-d171-43e4-8215-e5f8490b4245";
const INSEE_NICE = "06088";
const INSEE_MARSEILLE = "13055";

const map = L.map('map').setView([45, 3], 6);

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution: '&copy; OpenStreetMap contributors'}).addTo(map);

const stamenToner = L.tileLayer(`https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png?api_key=${STADIA_KEY}`, { attribution: '&copy; Stadia Maps, &copy; Stamen Design' });

L.control.layers({ "OpenStreetMap": osm, "Stamen Toner": stamenToner }).addTo(map);
L.polygon(BERMUDES, { color: "red" }).addTo(map).bindPopup("Triangle des Bermudes");

function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const rad = deg => deg * Math.PI / 180;
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
    
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getCommune(insee, avecContour) {
    const champs = avecContour ? "nom,centre,contour" : "nom,centre";
    const data = await fetch(`https://geo.api.gouv.fr/communes/${insee}?fields=${champs}&format=json`).then(r => r.json());

    return {nom: data.nom, latlon: [data.centre.coordinates[1], data.centre.coordinates[0]], contour: data.contour};
}

function majPosition({ coords }, marseille) {
    const pos = [coords.latitude, coords.longitude];
    const dist = distanceKm(pos[0], pos[1], marseille.latlon[0], marseille.latlon[1]);

    map.setView(pos, 13);

    L.marker(pos).addTo(map).bindPopup(`Vous etes ici<br>Distance a Marseille : ${dist.toFixed(1)} km`);
    L.circle(pos, { radius: coords.accuracy, color: "green" }).addTo(map).bindPopup(`Precision : ${Math.round(coords.accuracy)} m`);
}

async function init() {
    const [nice, marseille] = await Promise.all([getCommune(INSEE_NICE, true), getCommune(INSEE_MARSEILLE, false)]);

    map.setView(nice.latlon, 12);

    L.marker(nice.latlon).addTo(map).bindPopup(`${nice.nom} centre ville`);
    L.marker(marseille.latlon).addTo(map).bindPopup(`${marseille.nom} centre ville`);
    L.polyline([marseille.latlon, nice.latlon], { color: "blue" }).addTo(map).bindPopup(`${marseille.nom} - ${nice.nom}`);

    if (nice.contour) {
        L.geoJSON(nice.contour, { style: { color: "orange", fillOpacity: 0.05 } }).addTo(map).bindPopup(`Contour de ${nice.nom}`);
    }

    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${nice.latlon[1]},${nice.latlon[0]};${marseille.latlon[1]},${marseille.latlon[0]}?overview=full&geometries=geojson`;
        const rep = await fetch(url);

        if (!rep.ok) throw new Error("reponse osrm : " + rep.status);

        const trajet = await rep.json();

        L.geoJSON(trajet.routes[0].geometry, { style: { color: "purple", weight: 4 } }).addTo(map).bindPopup("Trajet Nice - Marseille (OSRM)");
    } catch (err) {
    console.log("trajet osrm indisponible : " + err);
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => majPosition(pos, marseille), e => alert(e.message));
    } else {
        alert("Geolocalisation non supportee.");
    }
}

init();