import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const RAYON_TERRE = 1;
// restcountries.com v3.1 a ete ferme (la v5 demande une cle API) : on lit directement
// le jeu de donnees open source dont restcountries est issu
const URL_PAYS = 'https://cdn.jsdelivr.net/gh/mledoze/countries@master/countries.json';

// Scene + camera + renderer
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 1.3;
controls.maxDistance = 10;

// Lumieres : ambiante pour tout voir + directionnelle pour le relief
scene.add(new THREE.AmbientLight(0xffffff, 1));
const soleil = new THREE.DirectionalLight(0xffffff, 1.5);
soleil.position.set(5, 3, 5);
scene.add(soleil);

// Terre : sphere de rayon 1 texturee
const textures = new THREE.TextureLoader();
const textureTerre = textures.load('assets/earth_atmos_2048.jpg');
textureTerre.colorSpace = THREE.SRGBColorSpace;

const terre = new THREE.Mesh(new THREE.SphereGeometry(RAYON_TERRE, 64, 64), new THREE.MeshStandardMaterial({ map: textureTerre }));
scene.add(terre);

// Formule ECEF : X = r cos(lat) cos(lon), Y = r cos(lat) sin(lon), Z = r sin(lat)
// Three.js a l'axe Y vers le haut et la texture de SphereGeometry commence a lon = -180,
// donc : x = X, y = Z (nord en haut), z = -Y
function latLonVersXYZ(lat, lon, rayon) {
    const phi = THREE.MathUtils.degToRad(lat);
    const lambda = THREE.MathUtils.degToRad(lon);

    return new THREE.Vector3(
        rayon * Math.cos(phi) * Math.cos(lambda),
        rayon * Math.sin(phi),
        -rayon * Math.cos(phi) * Math.sin(lambda)
    );
}

// Place un objet sur la Terre, tourne vers l'exterieur (son axe +Z pointe hors du globe)
function placerSurTerre(objet, lat, lon, altitude) {
    const position = latLonVersXYZ(lat, lon, RAYON_TERRE + altitude);
    objet.position.copy(position);
    objet.lookAt(position.clone().multiplyScalar(2));
    terre.add(objet);
}

// Marqueur de ma position
function getPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Géolocalisation non supportée'));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject);
    });
}

async function afficherMaPosition() {
    const texte = document.getElementById('position');

    try {
        const { coords } = await getPosition();

        const marqueur = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 16), new THREE.MeshStandardMaterial({ color: 0x39FF14 }));
        marqueur.rotation.x = Math.PI / 2; // le cylindre est vertical sur +Y, on le couche sur +Z
        const pivot = new THREE.Object3D();
        pivot.add(marqueur);
        marqueur.position.z = 0.03;
        placerSurTerre(pivot, coords.latitude, coords.longitude, 0);

        // On place la camera au-dessus de ma position
        camera.position.copy(latLonVersXYZ(coords.latitude, coords.longitude, 3.5));

        texte.textContent = `Position : ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
    } catch (err) {
        texte.textContent = `Position indisponible : ${err.message}`;
    }
}

// Marqueurs des pays avec leur drapeau
const geoDrapeau = new THREE.PlaneGeometry(0.03, 0.02);

function creerDrapeau(code) {
    const materiau = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

    textures.load(`https://flagcdn.com/w80/${code.toLowerCase()}.png`, texture => {
        texture.colorSpace = THREE.SRGBColorSpace;
        materiau.map = texture;
        materiau.needsUpdate = true;
    }, undefined, () => {
        console.log(`Drapeau introuvable pour ${code}`);
    });

    return new THREE.Mesh(geoDrapeau, materiau);
}

async function afficherPays() {
    const texte = document.getElementById('pays');

    try {
        const rep = await fetch(URL_PAYS);

        if (!rep.ok) throw new Error('réponse pays : ' + rep.status);

        const pays = await rep.json();
        let nb = 0;

        for (const p of pays) {
            if (!p.latlng || p.latlng.length < 2) continue;

            const drapeau = creerDrapeau(p.cca2);
            drapeau.name = p.translations?.fra?.common ?? p.name.common;
            placerSurTerre(drapeau, p.latlng[0], p.latlng[1], 0.01);
            nb++;
        }

        texte.textContent = `Pays : ${nb} drapeaux affichés`;
    } catch (err) {
        texte.textContent = `Pays indisponibles : ${err.message}`;
        console.log('chargement des pays impossible : ' + err);
    }
}

afficherMaPosition();
afficherPays();

// Animation
function animate() {
    controls.update();
    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
