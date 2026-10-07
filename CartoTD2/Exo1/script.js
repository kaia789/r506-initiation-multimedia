import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const NB_GOUTTES = 3000;

// Scene + camera + renderer
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0b18);
scene.fog = new THREE.Fog(0x0b0b18, 6, 32);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 3, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);

// Lumieres : ambiante bleutee faible, clair de lune froid, contre-jour bleu, lanterne chaude qui vacille
scene.add(new THREE.AmbientLight(0x6677aa, 0.25));
const lune = new THREE.DirectionalLight(0xaabbff, 0.6);
lune.position.set(5, 10, 5);
scene.add(lune);
const contreJour = new THREE.DirectionalLight(0x6688ff, 1);
contreJour.position.set(-5, 4, -6);
scene.add(contreJour);
const lanterne = new THREE.PointLight(0xff9944, 25, 14, 2);
lanterne.position.set(0, 2.5, 2);
scene.add(lanterne);

// Sol
const sol = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x5a5a66 }));
sol.rotation.x = -Math.PI / 2;
scene.add(sol);

// Objets generiques textures
const textures = new THREE.TextureLoader();
function chargerTexture(chemin) {
    const texture = textures.load(chemin);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ map: chargerTexture('assets/panda.jpg') }));
cube.position.set(3.5, 1.5, 0);
scene.add(cube);

const terre = new THREE.Mesh(new THREE.SphereGeometry(1.2, 48, 48), new THREE.MeshStandardMaterial({ map: chargerTexture('assets/earth_atmos_2048.jpg') }));
terre.position.set(-3.5, 1.5, 0);
scene.add(terre);

// Modele 3D glTF
let canard = null;
new GLTFLoader().load('assets/Duck.glb', gltf => {
    canard = gltf.scene;
    canard.scale.setScalar(1.5);
    scene.add(canard);
}, undefined, err => console.error('Erreur chargement Duck.glb', err));

// Pluie : un nuage de points qu'on fait tomber
const positions = new Float32Array(NB_GOUTTES * 3);
for (let i = 0; i < NB_GOUTTES; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 40;
    positions[i * 3 + 1] = Math.random() * 20;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
}
const pluieGeo = new THREE.BufferGeometry();
pluieGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const pluie = new THREE.Points(pluieGeo, new THREE.PointsMaterial({ color: 0x99bbff, size: 0.08, transparent: true, opacity: 0.7 }));
scene.add(pluie);

// Capteurs du smartphone
const capteurs = { beta: 0, gamma: 0, secousse: 0 };
const valeurs = document.getElementById('valeurs');

function onOrientation(e) {
    if (e.beta === null) return; // evenement vide envoye par les ordinateurs
    capteurs.beta = e.beta;   // inclinaison avant/arriere (-180..180)
    capteurs.gamma = e.gamma; // inclinaison gauche/droite (-90..90)
    valeurs.textContent = `Orientation : beta ${capteurs.beta.toFixed(0)}°, gamma ${capteurs.gamma.toFixed(0)}°`;
}

function onMotion(e) {
    const a = e.acceleration;
    if (a && a.x !== null) capteurs.secousse = Math.hypot(a.x, a.y, a.z);
}

async function activerCapteurs() {
    // iOS demande une autorisation (pendant le clic), Android non
    if (typeof window.DeviceOrientationEvent?.requestPermission === 'function') {
        try {
            const [reponse] = await Promise.all([
                DeviceOrientationEvent.requestPermission(),
                DeviceMotionEvent.requestPermission()
            ]);
            if (reponse !== 'granted') {
                valeurs.textContent = 'Autorisation refusée';
                return;
            }
        } catch (err) {
            valeurs.textContent = `Erreur d'autorisation : ${err.message}`;
            return;
        }
    }

    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
    document.getElementById('btnCapteurs').hidden = true;
    valeurs.textContent = 'En attente des capteurs...';

    // Rien apres 2 s : pas de capteur (ordinateur) ou page pas en HTTPS
    setTimeout(() => {
        if (valeurs.textContent === 'En attente des capteurs...') {
            valeurs.textContent = 'Aucune donnée reçue (pas de capteur, ou page pas en HTTPS)';
        }
    }, 2000);
}

document.getElementById('btnCapteurs').addEventListener('click', activerCapteurs);

// Animation
const horloge = new THREE.Timer();
const rad = deg => deg * Math.PI / 180;

function animate(timestamp) {
    horloge.update(timestamp);
    const dt = horloge.getDelta();
    const t = horloge.getElapsed();

    cube.rotation.x += 0.5 * dt;
    cube.rotation.y += 0.8 * dt;
    terre.rotation.y += 0.3 * dt;

    // La lanterne vacille comme une flamme
    lanterne.intensity = 25 + Math.sin(t * 10) * 3 + Math.random() * 2;

    // Le telephone incline le cube et la Terre
    cube.rotation.z = rad(capteurs.gamma);
    terre.rotation.x = rad(capteurs.beta) / 2;

    if (canard) {
        canard.position.y = 0.2 + Math.abs(Math.sin(t * 2)) * 0.5;
        canard.rotation.y = t + rad(capteurs.gamma);
    }

    // La pluie tombe plus vite quand on secoue le telephone
    const vitesse = (8 + capteurs.secousse * 3) * dt;
    const pos = pluieGeo.attributes.position.array;
    for (let i = 1; i < pos.length; i += 3) {
        pos[i] -= vitesse;
        if (pos[i] < 0) pos[i] = 20;
    }
    pluieGeo.attributes.position.needsUpdate = true;
    capteurs.secousse *= 0.95;

    controls.update();
    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
