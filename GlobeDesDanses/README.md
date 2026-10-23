# 🌍 Globe des danses

Application web (projet R5.06 « programmation multimédia ») : on explore un globe terrestre 3D
en inclinant son téléphone pour découvrir des danses du monde. Quand le viseur s'arrête sur un
pays, sa musique se lance ; il faut alors danser en rythme devant la caméra pour débloquer le
pays sur la mini-carte.

100 % front-end (HTML, CSS, JavaScript en modules ES), sans serveur ni étape de build.

## Fonctionnalités

- **Globe 3D** texturé avec fond étoilé, un marqueur par pays (gris = verrouillé, doré et
  brillant = débloqué), viseur fixe au centre de l'écran.
- **Pays verrouillés** : chaque pays à débloquer est recouvert d'une zone sombre hachurée, sur le
  globe comme sur la mini-carte ; elle s'efface en fondu quand on débloque le pays.
- **Sélection par raycast** : rayon lancé au centre de l'écran → point du globe → latitude/longitude
  → pays le plus proche (seuil de 10°). Après 1,5 s sous le viseur, le pays est sélectionné.
- **Contrôle par inclinaison** du téléphone (`deviceorientation`) : vitesse proportionnelle à
  l'inclinaison, zone morte, lissage, bouton « Calibrer », permission iOS 13+ au clic sur « Démarrer ».
  Sans capteur : glisser à la souris ou au doigt, flèches du clavier.
- **Musique** : `audio/<id>.mp3` s'il existe, sinon rythme synthétique (Web Audio API) au tempo
  de la danse. Arrêt quand on quitte le pays.
- **Mode danse** (ml5.js bodyPose / MoveNet) : caméra frontale en miroir avec squelette,
  énergie de mouvement (poignets, chevilles, hanches), détection des pics comparés aux temps
  (± 150 ms), jauge de rythme, « +1 » à chaque temps réussi, manche de 20 s, 60 % pour débloquer
  (confettis), bouton « Réessayer ».
  Si la caméra ou le modèle d'IA est indisponible : mode de secours « taper le rythme ».
- **Mini-carte** Leaflet (OpenStreetMap) synchronisée avec le viseur, repliable ; cliquer sur un
  pays fait tourner le globe vers lui ; popup avec la danse et le meilleur score.
- **Progression** sauvegardée dans `localStorage` (pays débloqués, meilleurs scores), compteur
  « X / N danses débloquées » (N = nombre de pays de la liste) et bouton « Réinitialiser » (↺).

## Technologies

| Rôle | Outil |
|---|---|
| 3D | [Three.js](https://threejs.org/) 0.160 (modules ES via importmap) |
| Carte | [Leaflet](https://leafletjs.com/) 1.9.4 + tuiles OpenStreetMap |
| IA | [ml5.js](https://ml5js.org/) 1.3.1, `ml5.bodyPose` (MoveNet SinglePose Lightning) |
| Son | Web Audio API |
| Capteurs | DeviceOrientation Event |
| Contours des pays | GeoJSON [mledoze/countries](https://github.com/mledoze/countries) 5.1.0 (données Natural Earth) |
| Style | CSS (glassmorphism), police Poppins (Google Fonts) |

## Structure

```
GlobeDesDanses/
├── index.html
├── style.css
├── assets/earth_atmos_2048.jpg   texture de la Terre
├── audio/                        mp3 optionnels (voir audio/README.md)
├── data/dances.js                liste des danses
└── js/
    ├── main.js          initialisation, état global, boucle d'animation, interface
    ├── globe.js         Three.js : globe, marqueurs, zones verrouillées, raycast, latLonToVector3 / vector3ToLatLon
    ├── countries.js     chargement des contours des pays (GeoJSON)
    ├── orientation.js   capteurs d'orientation + souris / doigt / clavier
    ├── map.js           mini-carte Leaflet
    ├── audio.js         lecture des mp3 et rythme synthétique
    ├── dance.js         caméra, ml5 bodyPose, détection du rythme
    ├── confetti.js      animation de célébration
    └── storage.js       sauvegarde localStorage
```

## Ajouter une danse

Ajoute une entrée dans `data/dances.js` (`id`, `iso`, `pays`, `danse`, `lat`, `lon`, `bpm`,
`description`, `couleur`, et `bpmPas` si le pas est plus lent que la musique, comme pour la salsa).
`iso` est le code ISO à 3 lettres du pays (`FRA`, `JPN`…) : il sert à charger son contour. Le globe, la
carte et le compteur s'adaptent tout seuls. Pour la musique, voir [audio/README.md](audio/README.md).

## Tester en local

1. Ouvre le dépôt dans VS Code et installe l'extension **Live Server**.
2. Clic droit sur `GlobeDesDanses/index.html` → **Open with Live Server**
   (adresse du type `http://127.0.0.1:5500/GlobeDesDanses/index.html`).
3. Sur ordinateur, `localhost` compte comme un contexte sécurisé : la caméra fonctionne, et le globe
   se pilote à la souris ou aux flèches.

**Sur téléphone**, la caméra et les capteurs exigent le **HTTPS** : une adresse `http://192.168…`
ne suffit pas. Deux solutions :
- déployer sur GitHub Pages (voir ci-dessous) ;
- ou ouvrir un tunnel HTTPS vers Live Server, par exemple l'onglet **Ports** de VS Code
  (« Forward a Port » → 5500, visibilité *Public*) ou `npx localtunnel --port 5500`.

## Déployer sur GitHub Pages

1. Pousse le dépôt sur GitHub (`git push`).
2. Sur GitHub : **Settings → Pages → Build and deployment**, source **Deploy from a branch**,
   branche `main`, dossier `/ (root)`, puis **Save**.
3. Après une à deux minutes, l'application est disponible à l'adresse
   `https://<utilisateur>.github.io/<dépôt>/GlobeDesDanses/`
   (ici : `https://kaia789.github.io/r506-initiation-multimedia/GlobeDesDanses/`).

## Limites connues

- **Détection du rythme approximative** : un « pic » est un maximum de vitesse des poignets,
  chevilles et hanches. Il faut marquer chaque temps par un geste vif (coup de bras, pas
  appuyé) ; un simple rebond régulier donne des pics entre les temps. Les seuils sont des
  constantes en haut de `js/dance.js` (`MIN_PEAK_ENERGY`, `DETECTION_LATENCY_S`…) et peuvent
  être ajustés après essai sur téléphone.
- **Mp3 personnels** : le jeu suppose que le morceau démarre sur un temps et garde un tempo
  constant égal au `bpm` indiqué ; en boucle, un décalage peut apparaître si la durée du
  morceau n'est pas un multiple du temps.
- **Fichier audio absent** : le navigateur affiche une erreur 404 dans la console réseau ;
  c'est ainsi que l'appli détecte qu'il faut passer au rythme synthétique (comportement normal).
- **Orientation** pensée pour le mode **portrait** ; en paysage, les axes d'inclinaison ne
  correspondent plus aux directions attendues.
- Sur iPhone, le **mode silencieux** coupe le son de la Web Audio API.
- Le modèle d'IA (quelques Mo) est téléchargé au premier « Danser ! » : il faut une connexion,
  et le premier chargement prend quelques secondes.
- Le mode danse fige le globe : on ne peut pas changer de pays pendant une manche.
- Les contours des pays (≈ 1 Mo, surtout les États-Unis) sont téléchargés au démarrage : sans
  connexion, les zones sombres n'apparaissent pas mais le jeu reste jouable avec les marqueurs.
- Les tuiles CARTO (Positron) demandent désormais une clé API : la carte utilise donc les tuiles
  OpenStreetMap, adoucies en CSS pour le style pastel.
