// Fonction qui affiche une position dans les balises correspondant a un prefixe donne
function afficherPosition(position, prefixe) {
  const coords = position.coords;
 
  document.getElementById(prefixe + "-lon").textContent = coords.longitude;
  document.getElementById(prefixe + "-lat").textContent = coords.latitude;
  document.getElementById(prefixe + "-alt").textContent = coords.altitude;
  document.getElementById(prefixe + "-acc").textContent = coords.accuracy + " m";
  document.getElementById(prefixe + "-speed").textContent = coords.speed;
 
  // position.timestamp est un timestamp en millisecondes
  const date = new Date(position.timestamp);
  document.getElementById(prefixe + "-date").textContent = date.toLocaleString();
}
 
function afficherErreur(err) {
  alert("Erreur de geolocalisation : " + err.message);
}
 
if ("geolocation" in navigator) {
  // 1) getCurrentPosition : une seule mesure
  navigator.geolocation.getCurrentPosition(function(position) { afficherPosition(position, "cp"); }, afficherErreur);
  
  // 2) watchPosition : mesure en continu a chaque changement de position
  navigator.geolocation.watchPosition(function(position) { afficherPosition(position, "wp"); }, afficherErreur);

} else {
  alert("La geolocalisation n'est pas supportee par ce navigateur.");
}
