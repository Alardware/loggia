/* ── Spotify : les playlists d'un compte, et l'enceinte où les jouer (ADR 0344) ──
 *
 * PUR : ni React, ni Home Assistant. L'écran passe les états, l'index et l'arbre
 * du lecteur ; le serveur fait les deux gestes (`loggia/spotify/jouer`,
 * spotify.py) — l'enceinte, puis la playlist.
 *
 *  - Le COMPTE est l'entité `media_player` de l'intégration officielle
 *    (`spotify`) : c'est elle qui joue, sur l'enceinte Spotify Connect choisie
 *    dans sa `source_list`.
 *  - Ses PLAYLISTS se lisent par le composant (`loggia/spotify/playlists`,
 *    ADR 0346), que Spotify joue ou non : à l'arrêt, Home Assistant refuse de
 *    parcourir le lecteur. `lirePlaylists` le demande par le `callWS` qu'on lui
 *    passe. Un composant pas encore redémarré ne connaît pas la commande :
 *    l'arbre du lecteur (`media_player/browse_media`), sous le dossier dont
 *    l'identifiant finit par `current_user_playlists` — avec ou sans le préfixe
 *    `spotify://<entrée>/`, selon la version de Home Assistant.
 *  - Une playlist de Spotify lui-même (« Top Hits Kids », 37i9…) n'y est pas :
 *    elle s'ajoute par son lien, et son nom s'écrit à la main — depuis fin
 *    2024, Spotify ne donne plus leur détail aux nouvelles applications.
 */
import { integrationDe } from './telecommande.js';

const INTEGRATION_SPOTIFY = 'spotify';
/** Vingt-quatre : la place d'une rangée qu'on parcourt du doigt, pas une seconde bibliothèque. */
export const MAX_AJOUTEES = 24;
const NOM_MAX = 80;
/* Une vignette se garde par son ADRESSE, celle que donne le service, jamais embarquée : une image `data:` de plusieurs centaines de
 * kilo-octets n'a rien à faire dans l'état de l'écran. */
const VIGNETTE_MAX = 400;

/* La même règle que le serveur (`uri_spotify`, spotify.py) : une playlist ou un album, par son URI, son lien open.spotify.com
 * (avec ou sans la langue, `intl-fr/`), ou l'identifiant de l'arbre (`spotify://<entrée>/spotify:…`). */
const URI = /spotify:(playlist|album):([A-Za-z0-9]{10,40})/;
const LIEN = /open\.spotify\.com\/(?:[a-z-]+\/)?(playlist|album)\/([A-Za-z0-9]{10,40})/;

/** L'URI `spotify:playlist:…` d'un texte, ou `null`. */
export function uriSpotify(texte) {
  const t = String(texte == null ? '' : texte).trim();
  if (!t) return null;
  const u = URI.exec(t) || LIEN.exec(t);
  return u ? 'spotify:' + u[1] + ':' + u[2] : null;
}

/** Les comptes Spotify de la maison, dans l'ordre de leurs identifiants. */
export function comptesSpotify(etats, index) {
  if (!index) return [];
  return Object.keys(etats || {}).filter(id => id.indexOf('media_player.') === 0 && integrationDe(id, index) === INTEGRATION_SPOTIFY).sort();
}

/** Le dossier des playlists dans la racine de l'arbre, ou `null`. */
export function dossierPlaylists(racine) {
  const enfants = racine && Array.isArray(racine.children) ? racine.children : [];
  return enfants.find(e => e && typeof e.media_content_id === 'string' && /current_user_playlists$/.test(e.media_content_id)) || null;
}

/** Les playlists d'un dossier de l'arbre, sans doublon : `{ t, i, v, d }` — `d`, lue dans le compte. */
export function playlistsDuDossier(noeud) {
  const enfants = noeud && Array.isArray(noeud.children) ? noeud.children : [];
  const vues = new Set();
  const r = [];
  for (const e of enfants) {
    if (!e || !e.can_play) continue;
    const i = uriSpotify(e.media_content_id);
    const t = typeof e.title === 'string' ? e.title.trim() : '';
    if (!i || !t || vues.has(i)) continue;
    vues.add(i);
    const v = typeof e.thumbnail === 'string' && /^https:\/\//.test(e.thumbnail) && e.thumbnail.length <= VIGNETTE_MAX ? e.thumbnail : null;
    r.push({ t, i, v, d: true });
  }
  return r;
}

/** Les playlists du compte (ADR 0346), par le composant : que Spotify joue ou non. Un composant pas encore redémarré répond
 *  `unknown_command` : l'arbre du lecteur, comme avant — il ne s'ouvre que pendant une lecture. Tout autre refus remonte. */
export async function lirePlaylists(h, compte) {
  try {
    return playlistsDuDossier(await h.callWS({ type: 'loggia/spotify/playlists', entity_id: compte }));
  } catch (e) {
    if (!e || e.code !== 'unknown_command') throw e;
  }
  const racine = await h.callWS({ type: 'media_player/browse_media', entity_id: compte });
  const dossier = dossierPlaylists(racine);
  return playlistsDuDossier(dossier ? await h.callWS({ type: 'media_player/browse_media', entity_id: compte, media_content_id: dossier.media_content_id, media_content_type: dossier.media_content_type }) : null);
}

/** Une playlist ajoutée par son lien, prête à garder (`{ t, i }`), ou `null` : il faut un lien lisible ET un nom. */
export function playlistAjoutee(lien, nom) {
  const i = uriSpotify(lien);
  const t = String(nom == null ? '' : nom).trim().slice(0, NOM_MAX);
  return i && t ? { t, i } : null;
}

/** Ajouter — la plus récente devant, sans doublon, `MAX_AJOUTEES` au plus. Une même URI garde le dernier nom donné. */
export function ajouterPlaylist(liste, p) {
  const base = Array.isArray(liste) ? liste.filter(x => x && typeof x.i === 'string') : [];
  if (!p || !uriSpotify(p.i) || !p.t) return base;
  return [{ t: p.t, i: p.i }, ...base.filter(x => x.i !== p.i)].slice(0, MAX_AJOUTEES);
}

export function retirerPlaylist(liste, i) {
  return (Array.isArray(liste) ? liste : []).filter(x => x && x.i !== i);
}

/** Ce que la rangée montre : celles du compte, puis celles ajoutées qui n'y sont pas déjà. */
export function rangeePlaylists(lues, ajoutees) {
  const d = Array.isArray(lues) ? lues : [];
  const vues = new Set(d.map(p => p.i));
  const a = (Array.isArray(ajoutees) ? ajoutees : [])
    .filter(p => p && typeof p.t === 'string' && p.t && uriSpotify(p.i) === p.i && !vues.has(p.i))
    .map(p => ({ t: p.t, i: p.i, v: null, d: false }));
  return [...d, ...a];
}

/* Les playlists qu'un profil a décochées en édition (`loggia_spotify_cachees`, ADR 0345) : des URI, 200 au plus. On range
 * les CACHÉES, pas les montrées : une playlist créée demain dans Spotify arrive cochée. */
const MAX_CACHEES = 200;
const urisCachees = (c) => (Array.isArray(c) ? c : []).filter(x => typeof x === 'string' && uriSpotify(x) === x);

/** Ce que la rangée et la fiche montrent hors édition : toutes, sauf les décochées. */
export function playlistsMontrees(liste, cachees) {
  const c = new Set(urisCachees(cachees));
  return (Array.isArray(liste) ? liste : []).filter(p => p && !c.has(p.i));
}

/** Cocher ou décocher une playlist ; `null` quand plus rien n'est caché — la clé s'efface. */
export function basculerCachee(cachees, i) {
  const base = urisCachees(cachees);
  const r = uriSpotify(i) !== i ? base : base.includes(i) ? base.filter(x => x !== i) : [...base, i].slice(-MAX_CACHEES);
  return r.length ? r : null;
}

/** « Tout cacher » : chaque playlist de la rangée, ou `null` s'il n'y en a aucune. */
export function cacherToutes(liste) {
  const r = urisCachees((Array.isArray(liste) ? liste : []).map(p => p && p.i)).slice(0, MAX_CACHEES);
  return r.length ? r : null;
}

/* Les mots d'un nom, sans accents, sans casse, sans ponctuation — la règle de `cibleAlexa` (favlecture.js). */
function motsDe(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * L'enceinte Spotify Connect d'une Echo, ou `null` : les MÊMES mots que l'un de ses noms (« Echo Salon » pour « Echo - Salon »),
 * et une seule candidate. Rien au jugé : viser la mauvaise enceinte ferait jouer une autre pièce.
 */
export function enceintePour(noms, sources) {
  const liste = Array.isArray(sources) ? sources.filter(s => typeof s === 'string' && s) : [];
  for (const nom of (Array.isArray(noms) ? noms : [noms])) {
    const m = motsDe(nom);
    if (!m) continue;
    const ok = liste.filter(s => motsDe(s) === m);
    if (ok.length === 1) return ok[0];
  }
  return null;
}

/** L'enceinte proposée : celle retenue sur cet écran si Spotify la voit encore, sinon celle qui joue, sinon la première. */
export function enceinteParDefaut(retenue, actuelle, sources) {
  const liste = Array.isArray(sources) ? sources : [];
  if (retenue && liste.indexOf(retenue) >= 0) return retenue;
  if (actuelle && liste.indexOf(actuelle) >= 0) return actuelle;
  return liste.length ? liste[0] : null;
}
