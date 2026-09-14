/* ── Les objets de la maison ─────────────────────────────────────────────────
 *
 * La vue Objets montre tout ce qui se pilote, aux cartes de la Vue Piece, avec
 * des filtres (maquette du 14/09/2026). Ce fichier dit ce qui range un
 * appareil sous ses filtres, ce qui compte comme « actif », les chiffres de
 * tete et l'ordre de la grille. Pas de React, pas de Home Assistant : le
 * dashboard lui passe des objets deja lus, les tests aussi. */

/** Les filtres, dans l'ordre des puces — « Tous » et « Favoris » a part. */
export const OBJ_ORDRE = ['lumieres', 'volets', 'chauffage', 'prises', 'multimedia', 'capteurs', 'cameras', 'menager', 'jardin', 'plantes'];

/**
 * Les filtres d'un objet. Le premier est son filtre principal, tire du
 * domaine ; « jardin » s'ajoute a ce qui vit dehors, « favoris » a ce qui est
 * epingle. Un domaine que l'on ne sait pas ranger n'a aucun filtre : il ne
 * s'affiche que sous « Tous » — les serrures, sirenes et alarmes aussi : la
 * maquette n'a pas de puce « Securite » (retour user du 14/09).
 */
export function filtresObjet({ domaine, type = 'entite', estLumiere = false, dehors = false, epingle = false }) {
  const dom = type === 'zone' ? 'climate' : type === 'feeder' ? 'feeder' : type === 'plant' ? 'plant' : String(domaine || '');
  const principal = dom === 'light' || (dom === 'switch' && estLumiere) ? 'lumieres'
    : dom === 'cover' ? 'volets'
      : dom === 'climate' || dom === 'water_heater' ? 'chauffage'
        : dom === 'switch' || dom === 'input_boolean' ? 'prises'
          : dom === 'media_player' ? 'multimedia'
            : dom === 'binary_sensor' || dom === 'sensor' ? 'capteurs'
              : dom === 'camera' ? 'cameras'
                : dom === 'vacuum' || dom === 'fan' || dom === 'humidifier' || dom === 'valve' || dom === 'feeder' ? 'menager'
                  : dom === 'lawn_mower' ? 'jardin'
                    : dom === 'plant' ? 'plantes'
                      : null;
  const f = principal ? [principal] : [];
  if (dehors && principal !== 'jardin') f.push('jardin');
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
