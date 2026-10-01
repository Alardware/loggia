/**
 * Reconnaître la marque derrière le nom d'une application (30/09).
 *
 * Une télévision annonce ses applications par leur nom — « Netflix »,
 * « Disney+ », « Prime Video ». Le catalogue, lui, en dessine trente-deux. Ce
 * module fait le lien entre les deux, et rien d'autre.
 *
 * Il ne porte AUCUN tracé : les dessins vivent tous dans `dessins.js`, avec le
 * reste du catalogue. Une première version en embarquait une copie, et c'était
 * une erreur — deux catalogues pour une seule marque finissent par diverger.
 *
 * Les marques appartiennent à leurs propriétaires : ces dessins servent à
 * DÉSIGNER un service, jamais à prétendre le représenter.
 */
import { NOMS_DESSINS, DESSINS_CAT } from './dessins.js';

/** Sans accents, sans casse, sans ponctuation : « Disney+ » et « disney plus »
 *  doivent tomber sur la même marque. */
const aplati = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\+/g, ' plus').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* Ce qu'un appareil appelle autrement que le catalogue. Home Assistant rend le
 * nom que la télévision lui donne, et il varie d'une marque à l'autre : une
 * box dit « Amazon Prime Video » là où une autre dit « Prime Video », et
 * « HBO Max » est devenu « Max ». On ne devine pas — on nomme les écarts. */
const ALIAS = {
  'amazon-prime-video': 'Prime Video',
  'primevideo': 'Prime Video',
  'hbo-max': 'Max',
  'youtube-kids': 'YouTube',
  'yt-music': 'YouTube Music',
  'google-tv': 'Chromecast',
  'mycanal': 'Canal+',
  'arte': 'Arte.tv',
  'france-television': 'France.tv',
  'francetv': 'France.tv',
  'amazon-alexa': 'Alexa',
  'echo': 'Alexa',
};

/* Le nom de chaque dessin, aplati, vers sa clé. Calculé une fois : le
 * catalogue ne bouge pas en cours de route. */
let PAR_NOM = null;
function parNom() {
  if (PAR_NOM) return PAR_NOM;
  PAR_NOM = new Map();
  for (const [cle, n] of Object.entries(NOMS_DESSINS)) {
    const a = aplati(n && n[0]);
    if (a && !PAR_NOM.has(a)) PAR_NOM.set(a, cle);
  }
  return PAR_NOM;
}

/**
 * Le dessin qui va avec ce nom d'application, ou `null`.
 *
 * Rien n'est inventé : un nom qu'on ne reconnaît pas ne reçoit pas un dessin
 * approchant, il n'en reçoit aucun — et la grille retombe alors sur les
 * initiales, qui, elles, ne se trompent jamais de marque.
 */
export function marqueDe(nom) {
  const a = aplati(nom);
  if (!a) return null;
  const t = parNom();
  if (t.has(a)) return t.get(a);
  const al = ALIAS[a];
  const b = al ? aplati(al) : null;
  return (b && t.has(b)) ? t.get(b) : null;
}

/** Les services de streaming du catalogue, dans son ordre. */
export const STREAMING = () => (DESSINS_CAT.streaming || []).slice();
