/* Le son d'une caméra (chantier du 20/11, A8).
 *
 * Le direct (`CamLive`) demande déjà une piste audio en réception seule, mais la
 * balise `<video>` est MUETTE : rien ne sort tant que personne ne le demande.
 * Ce module dit deux choses, sans toucher au DOM ni à React :
 *  - le flux porte-t-il du son (`aDuSon`) — sans quoi le bouton ne s'affiche pas,
 *    plutôt que d'offrir un bouton qui ne fait rien ;
 *  - quelle caméra est écoutée (`prendreLeSon`) — UNE seule à la fois : en
 *    écouter une seconde coupe la première, comme deux lecteurs qui se couvrent. */

/** Le flux d'une balise vidéo porte-t-il du son ? `true` / `false` quand on le sait, `null` sinon
 *  (rien d'assez fiable à lire : on n'invente pas un bouton). Trois sources, de la plus sûre à la
 *  moins sûre : les pistes du flux WebRTC, la liste des pistes audio d'un lecteur HLS natif
 *  (Safari), puis `mozHasAudio`. */
export function aDuSon(v) {
  if (!v) return null;
  const flux = v.srcObject;
  if (flux && typeof flux.getAudioTracks === 'function') return flux.getAudioTracks().some(p => p.readyState !== 'ended');
  const pistes = v.audioTracks;
  if (pistes && typeof pistes.length === 'number') return pistes.length > 0;
  if (typeof v.mozHasAudio === 'boolean') return v.mozHasAudio;
  return null;
}

// La caméra écoutée : sa clé (celle d'une tuile, pas d'une entité — la même caméra peut paraître deux fois, sous la
// tuile et dans sa fiche) et de quoi la faire taire.
let ecoutee = null;

/** Cette tuile prend le son : celle qui l'avait est coupée. */
export function prendreLeSon(cle, couper) {
  const avant = ecoutee;
  ecoutee = { cle, couper };
  if (avant && avant.cle !== cle) avant.couper();
}

/** Cette tuile rend le son (coupé, ou quitté) : si c'était elle, plus personne n'écoute. */
export function rendreLeSon(cle) {
  if (ecoutee && ecoutee.cle === cle) ecoutee = null;
}
