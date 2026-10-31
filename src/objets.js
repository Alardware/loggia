/* ── Les objets de la maison ─────────────────────────────────────────────────
 *
 * La vue Objets montre tout ce qui se pilote, aux cartes de la Vue Piece, avec
 * des filtres (maquette du 14/09/2026). Ce fichier dit ce qui range un
 * appareil sous ses filtres, ce qui compte comme « actif », les chiffres de
 * tete et l'ordre de la grille. Pas de React, pas de Home Assistant : le
 * dashboard lui passe des objets deja lus, les tests aussi. */

import { comparerTextes, tr } from './i18n.js';
import { nombre } from './format.js';
import { coverActif } from './voletecran.js';

/** Les filtres, dans l'ordre des puces — « Tous » et « Favoris » a part.
 *
 * Sept familles, pas onze (retour user du 17/09 : « trop de filtres, sur
 * mobile c'est pas agreable ») : une puce que l'on doit chercher en faisant
 * defiler la rangee ne filtre plus rien. D'abord ce que l'on commande, du plus
 * courant au plus rare, puis ce qui mesure. Des familles de NATURE, aucune de
 * lieu : « Jardin » est parti le meme jour (« il y a un robot dedans et une
 * prise » — ils ont deja leur famille). */
export const OBJ_ORDRE = ['lumieres', 'volets', 'chauffage', 'prises', 'multimedia', 'iot', 'capteurs'];

/** « IoT » = les APPAREILS : ce qui travaille seul — robot aspirateur, tondeuse,
 * distributeur, ventilateur, humidificateur, vanne. Pas les prises : « une
 * prise c'est une prise » (retour user du 17/09). */
export const DOMAINES_IOT = ['vacuum', 'lawn_mower', 'feeder', 'fan', 'humidifier', 'valve', 'borne'];

/** Les classes de capteur binaire qui disent une presence : la fiche d'edition
 * les nomme ; sous les filtres, ce sont des capteurs comme les autres. */
const CLASSES_PRESENCE = ['motion', 'occupancy', 'presence'];

/**
 * Les filtres d'un objet. Le premier est son filtre principal, tire du
 * domaine ; « favoris » s'ajoute a ce qui est epingle. Etre dehors ne range
 * nulle part. Un domaine que l'on ne sait pas ranger n'a aucun filtre : il ne
 * s'affiche que sous « Tous » — les serrures, sirenes et alarmes : la maquette
 * n'a pas de puce « Securite » (retour user du 14/09) ; et les cameras, dont
 * la puce est partie le 17/09 (« deja camera on peut l'enlever ») : elles ont
 * leur place dans la vue Securite et sur l'Accueil.
 *
 * « Capteurs » recoit la presence et les plantes — une plante EST un bouquet
 * de capteurs.
 *
 * « Que des prises » (chantier Prises, P1, 13/10) : une prise est un switch
 * qui MESURE — `estPrise`, la règle de prises.js. Les autres switch rejoignent
 * IoT. Un `input_boolean` n'est pas découvert : il n'arrive dans Objets que
 * si on l'ajoute à la main, et il est alors rangé sous IoT.
 */
export function filtresObjet({ domaine, type = 'entite', estLumiere = false, estPrise = false, epingle = false }) {
  // Un groupe de capteurs binaires (chantier Capteurs, C20) est sous « Capteurs », comme ses membres l'étaient.
  const dom = type === 'zone' ? 'climate' : type === 'feeder' ? 'feeder' : type === 'plant' ? 'plant' : type === 'groupe' ? 'groupe' : String(domaine || '');
  const principal = dom === 'light' || (dom === 'switch' && estLumiere) ? 'lumieres'
    : dom === 'cover' ? 'volets'
      : dom === 'climate' || dom === 'water_heater' ? 'chauffage'
        : dom === 'switch' && estPrise ? 'prises'
          : dom === 'media_player' ? 'multimedia'
            : DOMAINES_IOT.indexOf(dom) >= 0 || dom === 'switch' || dom === 'input_boolean' ? 'iot'
              : dom === 'binary_sensor' || dom === 'sensor' || dom === 'plant' || dom === 'groupe' ? 'capteurs'
                : null;
  const f = principal ? [principal] : [];
  if (epingle) f.push('favoris');
  return f;
}

/**
 * Un objet est actif quand il fait quelque chose : allume, en lecture, en
 * chauffe, ouvert, en marche. Une serrure ou une camera ne « font » rien au
 * sens de ce compte ; un capteur, si — il detecte.
 */
export function objetActif({ domaine, etat, attributs = {} }) {
  const s = String(etat == null ? '' : etat).toLowerCase();
  if (!s || s === 'unavailable' || s === 'unknown') return false;
  const dom = String(domaine || '');
  if (dom === 'media_player') return s === 'playing';
  // Un chauffe-eau : son état est un MODE, pas une marche (G1-D7) — actif seulement si un attribut connu dit qu'il chauffe.
  if (dom === 'water_heater') return s !== 'off' && chauffeEauEnChauffe(attributs);
  if (dom === 'climate') {
    const action = String(attributs.hvac_action || '').toLowerCase();
    if (action) return action !== 'off' && action !== 'idle';
    return s !== 'off';
  }
  // Le verdict des cartes (V12) : un volet qui bute à 1 % est fermé, pas actif.
  if (dom === 'cover') return coverActif({ state: s, attributes: attributs || {} });
  if (dom === 'vacuum') return s === 'cleaning';
  if (dom === 'lawn_mower') return s === 'mowing';
  if (dom === 'valve') return s === 'open';
  if (dom === 'lock' || dom === 'camera' || dom === 'alarm_control_panel') return false;
  return s === 'on';
}

/* ── Le chauffe-eau sur la carte générique (G1-D7, 30/10 ; ADR 0300) ─────────
 *
 * L'état d'un `water_heater` est son MODE de fonctionnement : la carte l'écrivait
 * brut, « eco » dans les sept langues, et Objets le comptait « actif » faute de
 * `hvac_action`. Les sept modes standard de Home Assistant se traduisent ; un mode
 * propre au fabricant (« Boost 2h ») reste tel quel : c'est le nom que son
 * intégration lui donne. La carte « Eau chaude » complète est un autre chantier. */
const MODES_CHAUFFE_EAU = () => ({ eco: tr('Éco'), electric: tr('Électrique'), gas: tr('Gaz'), heat_pump: tr('Pompe à chaleur'),
  high_demand: tr('Forte demande'), performance: tr('Performance'), off: tr('Arrêt') });

/** Le mot d'un mode de chauffe-eau : traduit s'il est standard, tel quel sinon. */
export function modeChauffeEau(etat) {
  const s = etat == null ? '' : String(etat);
  const m = MODES_CHAUFFE_EAU();
  return Object.prototype.hasOwnProperty.call(m, s) ? m[s] : s;
}

/** La phrase d'un chauffe-eau : son mode, puis la température relevée et la consigne quand elles existent, comme un climat —
 *  « Éco · 52° → 55° ». Arrêté, la consigne se tait. */
export function phraseChauffeEau(st) {
  const a = (st && st.attributes) || {};
  const s = st && st.state != null ? String(st.state) : '';
  const lu = (x) => (x == null || x === '' || !Number.isFinite(Number(x)) ? null : nombre(Number(x), 1, 0) + '°');
  const actuel = lu(a.current_temperature);
  const consigne = s === 'off' ? null : lu(a.temperature);
  const temp = consigne ? (actuel || '—') + ' → ' + consigne : actuel;
  return [modeChauffeEau(s), temp].filter(Boolean).join(' · ');
}

/** Un chauffe-eau EN CHAUFFE, d'après un attribut connu : `hvac_action` à `heating` ou `preheating`. Home Assistant n'en publie
 *  aucun pour un `water_heater` ; sans lui, jamais — plutôt que de compter chaque ballon en mode « Éco » comme un appareil qui chauffe. */
export function chauffeEauEnChauffe(attributs) {
  const action = String((attributs && attributs.hvac_action) || '').toLowerCase();
  return action === 'heating' || action === 'preheating';
}

/* Ce qui « tourne », pour l'en-tête d'Objets › IoT (chantier IoT, I14 ; passe bis du 18/10, point 9) : une liste FERMÉE — un robot
 * au travail, un ventilateur ou un humidificateur allumé. Le filtre IoT range aussi les interrupteurs qui ne mesurent pas et les
 * `input_boolean` : allumés, ils ne disent pas qu'un appareil travaille. Et jamais une vanne ouverte : l'eau qui coule n'est pas
 * un appareil qui tourne. */
const EN_MARCHE_IOT = { vacuum: 'cleaning', lawn_mower: 'mowing', fan: 'on', humidifier: 'on' };
/** Cet appareil d'Objets › IoT est-il « en marche » ? */
export function enMarcheIot(domaine, etat) {
  const voulu = EN_MARCHE_IOT[String(domaine || '')];
  return !!voulu && String(etat == null ? '' : etat).toLowerCase() === voulu;
}

/** Ce qu'une carte pèse dans les chiffres d'Objets : un groupe de capteurs compte ses MEMBRES (chantier Capteurs, C20) — le
 *  compte ne baisse pas quand quatre portes deviennent une carte ; toute autre carte compte un. */
export const poidsObjet = (o) => (o && Array.isArray(o.membres) ? o.membres.length : 1);

/** Le compte d'une puce : les objets d'un filtre (« tous » : tous), à leur poids. */
export function compteObjets(objets, filtre) {
  return (objets || []).filter(o => filtre === 'tous' || (o.filtres || []).indexOf(filtre) >= 0).reduce((n, o) => n + poidsObjet(o), 0);
}

/** Les chiffres de tete : appareils, pieces distinctes, actifs, absents. Un groupe compte ses membres : ceux qui détectent sont
 *  actifs, ceux qui ne répondent plus, absents (C20). */
export function statsObjets(objets) {
  const pieces = new Set();
  let actifs = 0, absentes = 0;
  (objets || []).forEach(o => {
    if (o.piece) pieces.add(String(o.piece));
    if (Array.isArray(o.membres)) { actifs += Number(o.actifsMembres) || 0; absentes += Number(o.muetsMembres) || 0; return; }
    if (o.actif) actifs += 1;
    if (o.absent) absentes += 1;
  });
  return { appareils: compteObjets(objets, 'tous'), pieces: pieces.size, actifs, absentes };
}

/**
 * Les puces a montrer : « Tous » toujours, « Favoris » s'il y a une epingle,
 * puis chaque filtre non vide, dans l'ordre. Chacune porte son compte.
 */
export function pucesObjets(objets) {
  const n = {};
  (objets || []).forEach(o => (o.filtres || []).forEach(f => { n[f] = (n[f] || 0) + poidsObjet(o); }));
  const out = [{ id: 'tous', n: compteObjets(objets, 'tous') }];
  if (n.favoris) out.push({ id: 'favoris', n: n.favoris });
  OBJ_ORDRE.forEach(f => { if (n[f]) out.push({ id: f, n: n[f] }); });
  return out;
}

/**
 * L'ordre de la grille : piece par piece (l'ordre des zones de la maison),
 * puis filtre principal, puis nom. Ce qui n'a pas de piece ferme la marche.
 */
export function trierObjets(objets, ordrePieces = []) {
  const rangPiece = (p) => { if (!p) return ordrePieces.length + 1; const i = ordrePieces.indexOf(p); return i < 0 ? ordrePieces.length : i; };
  const rangFiltre = (o) => { const f = (o.filtres || [])[0]; const i = f ? OBJ_ORDRE.indexOf(f) : -1; return i < 0 ? OBJ_ORDRE.length : i; };
  return (objets || []).slice().sort((a, b) =>
    rangPiece(a.piece) - rangPiece(b.piece)
    || rangFiltre(a) - rangFiltre(b)
    || comparerTextes(String(a.nom || ''), String(b.nom || '')));
}

/**
 * Le domaine d'une carte en mode edition, tel que la fiche le nomme : ce que
 * Home Assistant donne, sauf la prise declaree lumiere. Une cle qui n'est pas
 * une entite (zone de chauffage, plante, distributeur, intertitre) a le sien.
 */
export function domaineEdition(cle, { estLumiere = false, classe = '' } = {}) {
  const k = String(cle || '');
  if (k.indexOf('zone:') === 0) return 'chauffage';
  if (k.indexOf('plant:') === 0) return 'plante';
  if (k.indexOf('groupe:') === 0) return 'capteur';
  if (k === 'obj:feeder') return 'animaux';
  if (k.indexOf('sect:') === 0) return 'titre';
  if (k === 'carte:presence') return 'presence';
  const dom = k.indexOf('.') > 0 ? k.slice(0, k.indexOf('.')) : '';
  if (dom === 'light' || (dom === 'switch' && estLumiere)) return 'lumiere';
  if (dom === 'switch' || dom === 'input_boolean') return 'prise';
  if (dom === 'cover') return 'volet';
  if (dom === 'climate' || dom === 'water_heater') return 'chauffage';
  if (dom === 'media_player') return 'multimedia';
  if (dom === 'binary_sensor' && CLASSES_PRESENCE.indexOf(String(classe || '')) >= 0) return 'presence';
  if (dom === 'binary_sensor' || dom === 'sensor') return 'capteur';
  if (dom === 'camera') return 'camera';
  if (dom === 'lock') return 'serrure';
  if (dom === 'alarm_control_panel') return 'alarme';
  if (dom === 'siren') return 'sirene';
  if (dom === 'vacuum') return 'aspirateur';
  if (dom === 'lawn_mower') return 'tondeuse';
  return 'carte';
}

/** L'identifiant court d'une carte : l'objet de l'entite, sans son domaine ; la queue d'une cle sinon. */
export function identifiantEdition(cle) {
  const k = String(cle || '');
  if (k.indexOf('.') > 0 && k.indexOf(':') < 0) return k.slice(k.indexOf('.') + 1);
  const i = k.indexOf(':');
  return i >= 0 ? k.slice(i + 1) : k;
}

/**
 * Les jours de reserve d'un distributeur : ce qu'il reste dans le bac, divise
 * par ce que les repas du jour distribuent. Sans repas connu, on ne sait pas.
 */
export function joursDeReserve(grammes, repas) {
  const parJour = (repas || []).reduce((s, m) => s + (Number(m && m.g) || 0), 0);
  if (!(grammes > 0) || !(parJour > 0)) return null;
  return Math.floor(grammes / parJour);
}

/**
 * Ce qu'un capteur de plante dit, mesure par mesure — des reperes generaux,
 * pas un avis de botaniste : le sol (sec / ok / humide), la temperature
 * (froid / ok / chaud), la lumiere (faible / ok / plein), l'engrais (peu / ok
 * / trop). `null` quand la mesure manque. `presse` liste ce qui presse.
 */
/* Les reperes, la SEULE table d'une plante (chantier Capteurs, C30) : le sol de 15 a 70 %, 10 a 32 °C, 500 a 20 000 lx,
 * 350 a 2 000 µS/cm. La fiche en ecrit la plage (« Ideal : 15 a 70 % ») et en tire ses conseils. */
export const PLAGES_PLANTE = { hum: [15, 70], temp: [10, 32], lux: [500, 20000], cond: [350, 2000] };
/* La LUMIÈRE ne se juge pas à l'instant (audit du 19/10, M6) : la nuit, toutes les plantes passaient « Lumière faible ». `luxJour`
 * (lirePlante, App.jsx) : le maximum du jour s'il est connu, sinon le lux du moment quand le soleil est levé, sinon null — la
 * lumière ne presse pas. Absent (une plante d'exemple), le lux du moment. */
export function verdictsPlante({ hum = null, temp = null, lux = null, cond = null, luxJour } = {}) {
  const v = (x, [bas, haut], mots) => (x == null || isNaN(x)) ? null : x < bas ? mots[0] : x > haut ? mots[2] : mots[1];
  const out = {
    hum: v(hum, PLAGES_PLANTE.hum, ['sec', 'ok', 'humide']),
    temp: v(temp, PLAGES_PLANTE.temp, ['froid', 'ok', 'chaud']),
    lux: v(luxJour === undefined ? lux : luxJour, PLAGES_PLANTE.lux, ['faible', 'ok', 'plein']),
    cond: v(cond, PLAGES_PLANTE.cond, ['peu', 'ok', 'trop']),
  };
  const presse = [];
  if (out.hum === 'sec') presse.push('arroser');
  if (out.lux === 'faible') presse.push('lumiere');
  if (out.temp === 'froid' || out.temp === 'chaud') presse.push('temperature');
  out.presse = presse;
  return out;
}
