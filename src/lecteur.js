/* ── Un lecteur, lu (chantier Médias ; M6, M10, M11, M14 ; ADR 0207, 0208) ───────
 *
 * Ce que la carte, la compacte, la popup et « En ce moment » lisent d'un lecteur,
 * et la phrase qu'ils en disent. PUR : ni React, ni Home Assistant — l'écran
 * passe les états, et le lecteur tel que l'appariement l'a composé
 * (`resolveMedia`, resolve.js : `{ haid, ma, alexa }`).
 *
 *  - Le JUMEAU (M14) : une même enceinte existe souvent deux fois dans Home
 *    Assistant — l'entité de son intégration d'origine et celle qui la pilote
 *    (Music Assistant, la jumelle HACS d'une Echo). La carte garde pour `haid`
 *    l'entité de l'appareil principal (l'officielle : ses sœurs « Annoncer » et
 *    ses capteurs sont à elle), et `ctl` désigne celle qui sait commander — celle
 *    qui a le plus de bits de transport, et qui RÉPOND (un jumeau mort ne commande
 *    pas). L'état d'une paire — lecture, pause, position, titre — se lit sur `ctl`
 *    dès qu'il a des bits de transport, sur l'autre seulement à défaut.
 *  - Les BITS décident (M11) : lecture/pause si `PLAY` ou `PAUSE`, précédent et
 *    suivant par leurs bits, aléatoire, répéter, chercher, le muet ; le volume si
 *    `volume_level` existe ; « Parcourir » par `BROWSE_MEDIA`. Rien d'inerte à
 *    l'écran : ce qu'un lecteur ne sait pas n'est pas dessiné.
 *  - L'INTERRUPTEUR s'il sert (M10) : les bits `TURN_ON` et `TURN_OFF`, et pas
 *    une Echo (`estAlexa`) — ses bits on/off ne coupent rien, « une Echo ne
 *    s'éteint pas ».
 *  - La PHRASE (M6, § 5), dans l'ordre : indisponible, une annonce en vol,
 *    éteinte, rien en lecture, en pause, en lecture. Le geste d'abord : une avance
 *    (`useOptimiste`) remplace l'état lu.
 */
import { tr } from './i18n.js';
import { enPanne } from './outils.js';
import { quandLumiere } from './lumieres.js';

/** Les bits de `supported_features` d'un `media_player` (MediaPlayerEntityFeature). */
export const BITS = {
  PAUSE: 1, SEEK: 2, VOLUME_SET: 4, VOLUME_MUTE: 8, PREVIOUS: 16, NEXT: 32, TURN_ON: 128, TURN_OFF: 256,
  PLAY_MEDIA: 512, VOLUME_STEP: 1024, SELECT_SOURCE: 2048, STOP: 4096, CLEAR_PLAYLIST: 8192, PLAY: 16384,
  SHUFFLE_SET: 32768, SELECT_SOUND_MODE: 65536, BROWSE_MEDIA: 131072, REPEAT_SET: 262144, GROUPING: 524288,
};

/* Les deux intégrations d'une Echo : « Alexa Devices », l'officielle de Home
 * Assistant, et `alexa_media_player` (HACS). `estEcho` (favlecture.js) ne dit
 * que la seconde — celle qui sait la phrase ; ici, l'une ou l'autre. */
const INTEGRATIONS_ALEXA = ['alexa_devices', 'alexa_media'];
export const estAlexa = (integration) => INTEGRATIONS_ALEXA.indexOf(integration) >= 0;

const bitsDe = (st) => Number(((st && st.attributes) || {}).supported_features) || 0;
// Une seule règle de panne dans la maison (`enPanne`, outils.js) : absente, `unavailable` ou `unknown`.
const vivant = (id, st) => !enPanne(id, st);
const num = (v) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? n : null; };
/** Combien de gestes de transport une entité sait : lecture, pause, suivant, précédent. */
const transport = (bits) => [BITS.PLAY, BITS.PAUSE, BITS.NEXT, BITS.PREVIOUS].filter(b => bits & b).length;

/** Une entité `media_player`, telle quelle. */
function lireUn(id, st) {
  const a = (st && st.attributes) || {};
  const ok = vivant(id, st);
  const s = ok ? String(st.state) : null;
  return {
    id, present: !!st, vivant: ok, etat: s,
    on: ok && s !== 'off' && s !== 'standby',
    playing: s === 'playing', paused: s === 'paused',
    // Allumée sans rien lire : `idle`, ou `on` (une TV dans le menu d'une application). L'état prime sur un titre déduit de l'appli (§ 5).
    idle: s === 'idle' || s === 'on',
    title: a.media_title || null, artist: a.media_artist || a.media_album_artist || null, album: a.media_album_name || null,
    serie: a.media_series_title || null, saison: a.media_season != null ? String(a.media_season) : null, episode: a.media_episode != null ? String(a.media_episode) : null,
    channel: a.media_channel || null, app: a.app_name || null, source: a.source || null,
    art: a.entity_picture_local || a.entity_picture || null, mtype: a.media_content_type || null,
    pos: num(a.media_position), posAt: a.media_position_updated_at ? Date.parse(a.media_position_updated_at) : null, dur: num(a.media_duration),
    vol: a.volume_level != null ? Math.round(Number(a.volume_level) * 100) : null, muted: !!a.is_volume_muted,
    shuffle: !!a.shuffle, repeat: a.repeat || 'off', bits: bitsDe(st), classe: a.device_class || null,
    depuis: st && st.last_changed ? st.last_changed : null,
  };
}

/** Ce que l'entité JOUE : un titre ou une pochette, en lecture ou en pause. */
const joue = (x) => !!x && x.vivant && !!(x.title || x.art) && (x.playing || x.paused);

/**
 * Le lecteur `{ haid, ma, alexa }` lu dans `S` : la fusion de l'entité principale
 * et de son jumeau. `ctl` commande le transport, `volId` le volume ; `bits` est
 * l'union des deux (ce que l'appareil sait, par l'une ou l'autre), `bitsCtl`
 * ceux de `ctl` ; `indispo` quand aucune des deux ne répond.
 */
export function lireLecteur(S, lecteur) {
  const etats = S || {};
  const haid = lecteur && lecteur.haid;
  const ma = (lecteur && lecteur.ma) || null;
  const a = lireUn(haid, etats[haid]);
  const b = ma ? lireUn(ma, etats[ma]) : null;
  /* Le jumeau commande quand il sait plus de gestes — ou quand le principal ne répond plus — et seulement s'il RÉPOND : Home
   * Assistant garde `supported_features` sur une entité `unavailable` (une jumelle HACS dont la session a expiré, le cas fréquent) ;
   * un jumeau mort ne commande pas, sinon la puce est dessinée et `media_play` part dans le vide. */
  const parJumeau = !!b && b.vivant && (transport(b.bits) > transport(a.bits) || !a.vivant);
  const c = parJumeau ? b : a, autre = parJumeau ? a : b;
  /* L'ÉTAT d'une paire se lit sur celle qui commande dès qu'elle a des bits de transport : lecture, pause, position, titre. L'autre
   * (l'officielle d'une Echo : ni lecture ni pause) peut rester `playing` quand la jumelle est en pause — elle masquerait la pause.
   * Sans bits de transport sur `ctl`, l'une ou l'autre : ce qui joue se lit sur celle qui joue. */
  const transporte = transport(c.bits) > 0;
  const meta = transporte || joue(c) || !joue(autre) ? c : autre;
  // Le volume : l'entité qui sait le régler et le dit ; celle qui commande d'abord.
  const vol = [c, autre].find(x => x && x.vivant && x.vol != null && (x.bits & BITS.VOLUME_SET)) || [c, autre].find(x => x && x.vivant && x.vol != null) || c;
  const indispo = !a.vivant && !(b && b.vivant);
  const playing = transporte ? c.playing : (a.playing || !!(b && b.playing));
  const paused = transporte ? c.paused : (!playing && (a.paused || !!(b && b.paused)));
  const bits = a.bits | (b ? b.bits : 0);
  return {
    haid, ma, ctl: c.id, volId: vol.id,
    indispo, on: a.on || !!(b && b.on), playing, paused,
    // Allumée sans rien lire (`idle`, `on`) : l'état de celle qui commande ; il prime sur un titre déduit de l'appli (§ 5).
    idle: !playing && !paused && !!meta.idle,
    title: meta.title, artist: meta.artist, album: meta.album, serie: meta.serie, saison: meta.saison, episode: meta.episode, channel: meta.channel,
    app: meta.app || a.app || (b && b.app) || null, source: meta.source, art: meta.art, mtype: meta.mtype,
    pos: meta.pos, posAt: meta.posAt, dur: meta.dur,
    vol: vol.vol, hasVol: vol.vol != null, muted: vol.muted,
    shuffle: meta.shuffle, repeat: meta.repeat,
    bits, bitsCtl: c.bits, bitsHaid: a.bits, bitsVol: vol.bits,
    classe: a.classe || (b && b.classe) || null, alexa: !!(lecteur && lecteur.alexa),
    // « Depuis » : le dernier changement de celle qui est tombée la dernière.
    depuis: indispo ? [a.depuis, b && b.depuis].filter(Boolean).sort().pop() || null : a.depuis,
  };
}

/**
 * Ce que les bits décident (M11, M10) : chaque commande présente ou absente.
 * Le transport sur `ctl`, le muet sur l'entité du volume, « Parcourir » et
 * l'interrupteur sur l'entité principale (c'est elle qui reçoit `play_media`,
 * `turn_on` et `turn_off`).
 */
export function commandesLecteur(l) {
  const ctl = l.bitsCtl || 0, haid = l.bitsHaid || 0, vol = l.bitsVol || 0;
  return {
    lecture: !!(ctl & (BITS.PLAY | BITS.PAUSE)),
    precedent: !!(ctl & BITS.PREVIOUS), suivant: !!(ctl & BITS.NEXT),
    aleatoire: !!(ctl & BITS.SHUFFLE_SET), repeter: !!(ctl & BITS.REPEAT_SET),
    chercher: !!(ctl & BITS.SEEK) && !!l.dur,
    volume: !!l.hasVol, muet: !!l.hasVol && !!(vol & BITS.VOLUME_MUTE),
    parcourir: !!(haid & BITS.BROWSE_MEDIA),
    marche: !!(haid & BITS.TURN_ON) && !!(haid & BITS.TURN_OFF) && !l.alexa,
  };
}

/** Une radio : un flux sans durée, dont la station est le titre (ou `media_channel`). */
export const estRadio = (l) => !!l && !l.dur && (l.mtype === 'channel' || !!l.channel);

/**
 * Ce qui joue, en un titre (§ 5, ligne 6) : « {titre} · {artiste} » ; une série
 * « {titre} · S4 E1 » (`media_series_title`, `media_season` / `media_episode`,
 * sinon ce que le lecteur met dans l'artiste) ; une radio sans durée, sa station ;
 * une TV sans titre, son application — sauf inactive (`idle`) : le menu de Netflix
 * n'est pas un titre, l'appli reste nommée à sa place de source (M10). `null`
 * quand rien ne se lit.
 */
export function titreLecteur(l) {
  if (!l) return null;
  if (l.serie || l.saison != null || l.episode != null) {
    const ep = l.saison != null && l.episode != null ? 'S' + l.saison + ' E' + l.episode : l.episode != null ? 'E' + l.episode : l.artist;
    return [l.serie || l.title, ep].filter(Boolean).join(' · ') || null;
  }
  if (estRadio(l)) return l.channel || l.title || (l.idle ? null : l.app) || null;
  if (l.title) return [l.title, l.artist].filter(Boolean).join(' · ');
  return l.idle ? null : l.app || null;
}

/** « Depuis » : l'heure aujourd'hui, « hier » la veille, la date au-delà — la règle des lumières et des prises. */
const quandLecteur = (t, maintenant = Date.now()) => quandLumiere(t, maintenant);

/**
 * La phrase d'état (M6, § 5), la première qui s'applique, et son encre :
 *  1. indisponible : « Indisponible depuis 14:20 », en rouge, le liseré qui respire ;
 *  2. une annonce en vol : « Annonce : « À table ! » » ;
 *  3. éteinte : « Éteinte » ;
 *  4. rien en lecture : « Rien en lecture » ;
 *  5. en pause : « En pause · {titre} » ;
 *  6. en lecture : « {titre} · {artiste} ».
 * `marche` et `lecture` : les avances d'un geste (vrai, faux ou null) ; `annonce` : le texte en vol, ou null.
 * `enfant` (chantier Mode enfant, E15) : ce que le serveur dit du lecteur quand son profil AGIT (`{ bloque, reprise, demande }`,
 * enfantetat.js), ou null. Bloqué, deux lignes passent AVANT « Éteinte » :
 *  2 bis. le coucher : « Coucher · revient à 07:30 » — ou, en lecture, « Coucher · {titre} » (le son pour dormir : la maquette) ;
 *  2 ter. le temps écoulé, hors lecture : « Temps écoulé · demain 07:30 », ou « Temps écoulé · demande envoyée » quand une demande
 *         attend sa réponse. En lecture, le temps écoulé ne change rien : la maison éteint dans les 20 s, la carte ne ment pas.
 * Rend `{ texte, encre, panne }`.
 */
export function phraseLecteur(l, { annonce = null, marche = null, lecture = null, maintenant = Date.now(), enfant = null } = {}) {
  if (!l || l.indispo) {
    const q = l && l.depuis ? quandLecteur(l.depuis, maintenant) : null;
    return { texte: q ? tr('Indisponible depuis {h}', { h: q }) : tr('Indisponible'), encre: 'var(--o-bad)', panne: true };
  }
  if (annonce) return { texte: tr('Annonce : « {p} »', { p: annonce }), encre: 'var(--o-accent-soft)', panne: false };
  const on = marche != null ? marche : l.on;
  const titre = titreLecteur(l);
  const joueur = on && (lecture != null ? lecture : l.playing);
  const bloque = enfant && typeof enfant === 'object' ? enfant.bloque : null;
  if (bloque === 'coucher') {
    if (joueur) return { texte: tr('Coucher · {titre}', { titre: titre || tr('En lecture') }), encre: 'var(--o-text2)', panne: false };
    return { texte: tr('Coucher · revient à {h}', { h: enfant.reprise || '—' }), encre: 'var(--o-text2)', panne: false };
  }
  if (bloque === 'temps' && !joueur) {
    const d = enfant.demande;
    if (d && typeof d === 'object' && !d.reponse) return { texte: tr('Temps écoulé · demande envoyée'), encre: 'var(--o-text2)', panne: false };
    return { texte: tr('Temps écoulé · demain {h}', { h: enfant.reprise || '—' }), encre: 'var(--o-text2)', panne: false };
  }
  if (!on) return { texte: tr('Éteinte'), encre: 'var(--o-text2)', panne: false };
  /* Inactive (`idle`, `on`), ou rien à reprendre — ni en lecture, ni en pause, ni un titre : « Rien en lecture » ; l'état prime sur un
   * titre que l'appli aurait prêté (§ 5). En pause SANS titre : « En pause » (§ 5, ligne 5) — la carte garde alors sa puce, qui n'est
   * dessinée que s'il y a quelque chose à reprendre (passe bis 2, 17/10 ; M11). */
  if (!joueur && (l.idle || !(titre || l.paused || l.playing))) return { texte: tr('Rien en lecture'), encre: 'var(--o-text2)', panne: false };
  if (!joueur) return { texte: titre ? tr('En pause · {titre}', { titre }) : tr('En pause'), encre: 'var(--o-text2)', panne: false };
  return { texte: titre || tr('En lecture'), encre: 'var(--o-text1)', panne: false };
}

/**
 * Le compte d'une liste de lecteurs, chacun lu avec son jumeau (M14) — l'en-tête de la famille (M15), la tuile de l'Accueil
 * (M16) : `enLecture` ceux qui jouent, `vivants` ceux qui répondent, `total` tous. Un lecteur indisponible ne joue pas.
 */
export function compteLecteurs(S, lecteurs) {
  let enLecture = 0, vivants = 0;
  for (const p of lecteurs || []) {
    const l = lireLecteur(S, p);
    if (l.indispo) continue;
    vivants += 1;
    if (l.playing) enLecture += 1;
  }
  return { enLecture, vivants, total: (lecteurs || []).length };
}

/** « Volume 30 % », « Muet » : le nombre et son unité ne se séparent pas. */
export function volumeTexte(vol, muted) {
  if (muted) return tr('Muet');
  return tr('Volume {n} %', { n: vol == null ? '—' : vol }).replace(/ %/g, '\u00a0%');
}

/** « 30 % » : le chiffre d'une carte étroite, et celui de la popup. */
export const pourcentTexte = (vol) => (vol == null ? '—' : String(vol)) + '\u00a0%';
/** Ce que la barre de volume dit au lecteur d'écran AVEC sa valeur (`aria-valuetext`, `kbSlider`) : « Muet » quand le son est coupé,
 * « max 40 % » sous un plafond du mode enfant (passe bis du 17/10, point 9), les deux cumulés ; null quand il n'y a rien à dire. */
export function etatVolume(muted, plafond = null) {
  const mots = [];
  if (muted) mots.push(tr('Muet'));
  if (plafond != null && plafond < 100) mots.push(tr('max {m}', { m: pourcentTexte(plafond) }));
  return mots.length ? mots.join(' · ') : null;
}

/** Le genre, sous le nom de la popup (§ 6.5) : le modèle de l'appareil quand le registre le donne, sinon « Téléviseur » ou « Enceinte ». */
export function genreLecteur(l, modele = null) {
  if (modele) return modele;
  return l && l.classe === 'tv' ? tr('Téléviseur') : tr('Enceinte');
}

/** Le glyphe de la plaque sans pochette : l'écran d'une TV, l'enceinte sinon. */
export const glypheLecteur = (l) => (l && l.classe === 'tv' ? 'screen' : 'speaker');

/** La position du moment : celle que le lecteur a publiée, avancée du temps écoulé pendant la lecture, bornée par la durée. */
export function posLecteur(l, maintenant = Date.now()) {
  if (!l || l.pos == null) return null;
  let p = l.pos;
  if (l.playing && l.posAt) { const dt = (maintenant - l.posAt) / 1000; if (dt > 0) p += dt; }
  if (l.dur) p = Math.min(p, l.dur);
  return Math.max(0, p);
}

/** « 3:21 » : des secondes en minutes et secondes (« 1:02:05 » au-delà de l'heure). */
export function fmtTemps(s) {
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return '0:00';
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), ss = Math.floor(n % 60);
  const deux = (x) => (x < 10 ? '0' : '') + x;
  return h ? h + ':' + deux(m) + ':' + deux(ss) : m + ':' + deux(ss);
}

/** Le nom d'un lecteur : celui de la configuration, sinon celui de Home Assistant. */
export function nomLecteur(S, lecteur, label = null) {
  if (label) return label;
  if (lecteur && lecteur.name) return lecteur.name;
  const st = S && lecteur ? S[lecteur.haid] : null;
  return (st && st.attributes && st.attributes.friendly_name) || (lecteur && lecteur.haid) || '';
}
