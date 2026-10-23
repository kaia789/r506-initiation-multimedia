# Musiques des danses

Ce dossier est vide : l'application fonctionne sans aucun fichier audio, grâce à un rythme
synthétique (grosse caisse + charleston) joué au tempo de chaque danse.

## Ajouter une vraie musique

1. Choisis un morceau **libre de droits** (et vérifie sa licence), par exemple sur
   Pixabay Music, Free Music Archive ou ccMixter.
2. Nomme le fichier avec l'`id` du pays, en minuscules, avec l'extension `.mp3` :

   | Pays | Fichier |
   |---|---|
   | Afrique du Sud | `afrique-du-sud.mp3` |
   | Cuba | `cuba.mp3` |
   | République dominicaine | `republique-dominicaine.mp3` |
   | Brésil | `bresil.mp3` |
   | Jamaïque | `jamaique.mp3` |
   | Argentine | `argentine.mp3` |
   | Colombie | `colombie.mp3` |
   | Nigeria | `nigeria.mp3` |
   | Corée du Sud | `coree-du-sud.mp3` |
   | États-Unis | `etats-unis.mp3` |
   | Espagne | `espagne.mp3` |
   | Inde | `inde.mp3` |

3. Dépose-le dans ce dossier, puis recharge la page : la carte d'info affiche « Musique en cours ».

## Pour que la détection du rythme soit juste

- Le jeu suppose que **le morceau commence sur un temps** : coupe le silence du début
  (avec Audacity par exemple), sinon les temps attendus seront décalés.
- Le tempo utilisé est celui de `data/dances.js` (`bpm`, ou `bpmPas` s'il existe) :
  ajuste-le à ton morceau (un détecteur de BPM en ligne suffit).
- Le morceau est joué en boucle : un extrait de 30 à 60 s suffit et allège la page.
