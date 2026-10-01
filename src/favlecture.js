/**
 * Les favoris de lecture : une playlist en une touche (30/09).
 *
 * « Je voudrais pouvoir choisir ma playlist également, aujourd'hui il y a même
 * Music Assistant de Home Assistant. »
 *
 * Les playlists sont déjà atteignables — « Parcourir » demande son arbre au
 * lecteur (`media_player/browse_media`), et Spotify, Plex, Sonos ou Music
 * Assistant y rangent les leurs. Seulement il faut redescendre trois niveaux
 * chaque fois. Un favori garde le point d'arrivée, pas le chemin parcouru.
 *
 * LE CONTRAT DE `browse_media`. Un élément qui porte `can_play` se rejoue en
 * recopiant TELS QUELS son `media_content_id` et son `media_content_type` dans
 * `media_player.play_media`. Rien ne se déduit, rien ne se reconstruit : c'est
 * un identifiant opaque, propre à l'intégration qui l'a émis.
 *
 * D'où un choix qui compte : les favoris se rangent PAR LECTEUR. Une URI
 * Spotify ne veut rien dire pour un Plex, et un identifiant Plex ne veut rien
 * dire pour une Freebox. Les proposer partout ferait échouer la commande là où
 * personne ne regarde — chez le lecteur, en silence.
 */
import { integrationDe } from './telecommande.js';

/** Douze : de quoi couvrir ce qu'on écoute vraiment, sans refaire une seconde
 *  bibliothèque à côté de celle du lecteur. */
export const MAX_FAVORIS = 12;

/* Une vignette peut être une image EMBARQUÉE (`data:image/jpeg;base64,…`) de
 * plusieurs centaines de kilo-octets. Le stockage du navigateur en tient cinq
 * méga-octets en tout, pour Loggia entier : on ne garde donc qu'une adresse
 * courte, et on se passe de l'image plutôt que de remplir le pot commun. */
const VIGNETTE_MAX = 400;

/**
 * Ce qu'on garde d'un élément du navigateur, ou `null`.
 *
 * On refuse ce qui ne se rejoue pas : un dossier (`can_expand` seul) n'a pas
 * d'identifiant jouable, et le mettre en favori promettrait une lecture qui
 * n'arriverait jamais.
 */
export function entreeFavorite(enfant) {
  if (!enfant || !enfant.can_play) return null;
  const i = enfant.media_content_id;
  const c = enfant.media_content_type;
  const t = enfant.title;
  if (typeof i !== 'string' || !i) return null;
  if (typeof c !== 'string' || !c) return null;
  if (typeof t !== 'string' || !t.trim()) return null;
  const v = typeof enfant.thumbnail === 'string' && enfant.thumbnail.length <= VIGNETTE_MAX ? enfant.thumbnail : null;
  return { t: t.trim(), i, c, v };
}

/** Deux favoris sont le même quand ils désignent le même média : le titre, lui,
 *  peut changer d'une saison à l'autre chez le fournisseur. */
export function memeFavori(a, b) {
  return !!a && !!b && a.i === b.i && a.c === b.c;
}

/** Mettre en favori, ou l'en retirer. Le plus récent passe devant. */
export function basculerFavori(liste, entree) {
  const base = Array.isArray(liste) ? liste.filter(Boolean) : [];
  if (!entree) return base;
  const sans = base.filter(x => !memeFavori(x, entree));
  if (sans.length !== base.length) return sans;
  return [entree, ...sans].slice(0, MAX_FAVORIS);
}

/**
 * L'appel qui relance un favori sur ce lecteur.
 *
 * Rend `null` plutôt que d'envoyer une commande à moitié remplie : une entrée
 * abîmée par une vieille version, ou un lecteur absent, ne doit pas partir
 * quand même pour échouer côté serveur.
 */
export function appelPourJouer(entree, cible) {
  if (!entree || typeof cible !== 'string' || !cible) return null;
  if (typeof entree.i !== 'string' || !entree.i) return null;
  if (typeof entree.c !== 'string' || !entree.c) return null;
  return {
    domaine: 'media_player',
    service: 'play_media',
    data: { entity_id: cible, media_content_id: entree.i, media_content_type: entree.c },
  };
}

/**
 * LA PHRASE : le seul chemin pour un Echo (30/09).
 *
 * Une enceinte Alexa ne sait PAS `browse_media` — l'intégration n'expose aucun
 * arbre. Aucune playlist n'apparaît donc dans « Parcourir », et il n'y a rien à
 * mettre en favori par ce chemin-là.
 *
 * Ce qu'elle sait faire, en revanche, c'est exécuter une phrase. Dans
 * `alexa_media`, `media_player.play_media` avec le type `custom` appelle
 * `run_custom(media_id)` : le texte est joué comme si on l'avait dit à voix
 * haute, après « Alexa, ». C'est donc la phrase entière qui est l'identifiant —
 * et elle se range comme n'importe quel favori, puisque `appelPourJouer` la
 * relance sans rien reconstruire.
 *
 * La phrase reste CELLE DE L'UTILISATEUR, dans sa langue, avec ses mots : c'est
 * son Alexa qui l'écoute, pas nous. Rien n'est traduit ni complété.
 */
export const TYPE_PHRASE = 'custom';

/** Au-delà, ce n'est plus une commande : Alexa n'en écouterait que le début. */
const PHRASE_MAX = 200;

/** Une phrase pour Alexa, prête à garder et à rejouer, ou `null`. */
export function phraseAlexa(texte) {
  const t = String(texte == null ? '' : texte).trim();
  if (!t || t.length > PHRASE_MAX) return null;
  return { t, i: t, c: TYPE_PHRASE, v: null };
}

/** Un Echo COMMANDABLE par une phrase. C'est `alexa_media_player`, celle de
 *  HACS, qui sait le faire : elle seule expose `run_custom`. */
export function estEcho(integration) {
  return integration === 'alexa_media';
}

/** Le nom lisible d'une entité, ou `null`. */
function nomDe(etats, id) {
  const e = etats && etats[id];
  const n = e && e.attributes ? e.attributes.friendly_name : null;
  return typeof n === 'string' && n.trim() ? n.trim() : null;
}

/** Les mots d'un nom, sans accents, sans casse, sans ponctuation. */
function motsDe(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

/** Ce qui suit le point dans un `entity_id`. */
const objetDe = (id) => String(id || '').slice(String(id || '').indexOf('.') + 1);

/**
 * À QUI envoyer la phrase, ou `null`.
 *
 * Une même enceinte apparaît souvent DEUX FOIS dans Home Assistant, et c'est
 * tout le problème (01/10, relevé sur une installation réelle) :
 *
 *   `media_player.sejour_echo_salon`  « Echo - Salon »  ← Alexa Devices,
 *                        l'intégration officielle. Ne sait PAS la phrase.
 *   `media_player.echo_salon`         « Echo Salon »    ← alexa_media_player,
 *                        celle de HACS. La sait, par `run_custom`.
 *
 * Loggia affiche la première, et il faut commander la seconde. Les apparier par
 * le NOM ne suffit pas : l'officielle écrit « Echo Dot - Bureau » là où l'autre
 * écrit « Echo Bureau ». Sur trois enceintes, un seul nom concordait.
 *
 * Leurs IDENTIFIANTS, eux, se terminent pareil : l'officielle préfixe par la
 * pièce — `sejour_echo_salon` finit par `echo_salon`. On accepte donc deux
 * signes, et seulement eux : l'un des deux identifiants finit par l'autre, ou
 * les deux noms portent exactement les mêmes mots.
 *
 * Deux signes STRICTS, et pas un rapprochement au jugé : viser la mauvaise
 * enceinte ferait parler une autre pièce, ce qui est pire que ne rien faire.
 */
export function cibleAlexa(id, etats, index) {
  if (estEcho(integrationDe(id, index))) return id;
  const nom = nomDe(etats, id);
  if (!nom) return null;
  const mots = motsDe(nom).join(' ');
  const objet = objetDe(id);
  for (const autre of Object.keys(etats || {})) {
    if (autre === id || autre.indexOf('media_player.') !== 0) continue;
    if (!estEcho(integrationDe(autre, index))) continue;
    const o = objetDe(autre);
    if (objet.endsWith(o) || o.endsWith(objet)) return autre;
    const n = nomDe(etats, autre);
    if (n && motsDe(n).join(' ') === mots) return autre;
  }
  return null;
}
