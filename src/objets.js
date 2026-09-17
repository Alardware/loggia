/* ── Les objets de la maison ─────────────────────────────────────────────────
 *
 * La vue Objets montre tout ce qui se pilote, aux cartes de la Vue Piece, avec
 * des filtres (maquette du 14/09/2026). Ce fichier dit ce qui range un
 * appareil sous ses filtres, ce qui compte comme « actif », les chiffres de
 * tete et l'ordre de la grille. Pas de React, pas de Home Assistant : le
 * dashboard lui passe des objets deja lus, les tests aussi. */

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
export const DOMAINES_IOT = ['vacuum', 'lawn_mower', 'feeder', 'fan', 'humidifier', 'valve'];

/** Les classes de capteur binaire qui disent une presence : la fiche d'edition
 * les nomme ; sous les filtres, ce sont des capteurs comme les autres. */
export const CLASSES_PRESENCE = ['motion', 'occupancy', 'presence'];

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
 */
export function filtresObjet({ domaine, type = 'entite', estLumiere = false, epingle = false }) {
  const dom = type === 'zone' ? 'climate' : type === 'feeder' ? 'feeder' : type === 'plant' ? 'plant' : String(domaine || '');
  const principal = dom === 'light' || (dom === 'switch' && estLumiere) ? 'lumieres'
    : dom === 'cover' ? 'volets'
      : dom === 'climate' || dom === 'water_heater' ? 'chauffage'
        : dom === 'switch' || dom === 'input_boolean' ? 'prises'
          : dom === 'media_player' ? 'multimedia'
            : DOMAINES_IOT.indexOf(dom) >= 0 ? 'iot'
              : dom === 'binary_sensor' || dom === 'sensor' || dom === 'plant' ? 'capteurs'
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
  if (dom === 'climate' || dom === 'water_heater') {
    const action = String(attributs.hvac_action || '').toLowerCase();
    if (action) return action !== 'off' && action !== 'idle';
    return s !== 'off';
  }
  if (dom === 'cover') {
    const pos = attributs.current_position;
    if (typeof pos === 'number') return pos > 0;
    return s === 'open' || s === 'opening';
  }
  if (dom === 'vacuum') return s === 'cleaning';
  if (dom === 'lawn_mower') return s === 'mowing';
  if (dom === 'valve') return s === 'open';
  if (dom === 'lock' || dom === 'camera' || dom === 'alarm_control_panel') return false;
  return s === 'on';
}

/** Les chiffres de tete : appareils, pieces distinctes, actifs, absents. */
export function statsObjets(objets) {
  const pieces = new Set();
  let actifs = 0, absentes = 0;
  (objets || []).forEach(o => {
    if (o.piece) pieces.add(String(o.piece));
    if (o.actif) actifs += 1;
    if (o.absent) absentes += 1;
  });
  return { appareils: (objets || []).length, pieces: pieces.size, actifs, absentes };
}

/**
 * Les puces a montrer : « Tous » toujours, « Favoris » s'il y a une epingle,
 * puis chaque filtre non vide, dans l'ordre. Chacune porte son compte.
 */
export function pucesObjets(objets) {
  const n = {};
  (objets || []).forEach(o => (o.filtres || []).forEach(f => { n[f] = (n[f] || 0) + 1; }));
  const out = [{ id: 'tous', n: (objets || []).length }];
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
    || String(a.nom || '').localeCompare(String(b.nom || '')));
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
export function verdictsPlante({ hum = null, temp = null, lux = null, cond = null } = {}) {
  const v = (x, bas, haut, mots) => (x == null || isNaN(x)) ? null : x < bas ? mots[0] : x > haut ? mots[2] : mots[1];
  const out = {
    hum: v(hum, 15, 70, ['sec', 'ok', 'humide']),
    temp: v(temp, 10, 32, ['froid', 'ok', 'chaud']),
    lux: v(lux, 500, 20000, ['faible', 'ok', 'plein']),
    cond: v(cond, 350, 2000, ['peu', 'ok', 'trop']),
  };
  const presse = [];
  if (out.hum === 'sec') presse.push('arroser');
  if (out.lux === 'faible') presse.push('lumiere');
  if (out.temp === 'froid' || out.temp === 'chaud') presse.push('temperature');
  out.presse = presse;
  return out;
}

