/* Les petits utilitaires que plusieurs modules recopiaient (lot 15 de l'audit
 * du 03/10).
 *
 * `domaineDe` vivait en sept copies (actions, capabilities, devices, health,
 * present, profiles, et `domainOf` dans discovery) ; `sansAccents` en sept
 * (choix, discovery, robots, `sansAccent` dans autos, `norm` dans
 * views/parametres.jsx, `srNorm` et `aplatiIcone` dans App.jsx). Une copie
 * qui dérive ne se voit pas : on corrige l'une, les autres gardent le défaut.
 * tests/lot15_outils.test.mjs refuse qu'une nouvelle copie revienne.
 *
 * AUCUN import : ce module est une feuille. L'amorce, les moteurs de
 * découverte et les vues chargées à la demande le prennent sans cycle
 * (state.js ↔ i18n.js) et sans tirer un morceau du paquet avec lui.
 *
 * Ailleurs, et pas ici : RGB → hexadécimal est `versHex` (contraste.js, le
 * module des couleurs, sans import lui non plus) ; la clé d'un jour est
 * `cleJour` (agenda.js) ; l'icône `Fi` est dans ui.jsx. */

/** Le domaine d'une entité : « light.salon » → « light » ; '' pour ce qui
 *  n'est pas une chaîne. Le corps est celui des sept copies, au caractère
 *  près — sans point, la chaîne perd son dernier caractère, comme avant. */
export const domaineDe = (id) => (typeof id === 'string' ? id.slice(0, id.indexOf('.')) : '');

/* Les domaines SANS ÉTAT (05/10) : leur état est l'horodatage de leur dernier
 * déclenchement. Une scène jamais lancée, un bouton jamais pressé, un
 * événement qui n'a jamais tiré valent `unknown` — leur état NORMAL, qui peut
 * durer toujours. `CvCard` les disait « Indisponible », liseré de panne et
 * SANS bouton : toute scène jamais lancée paraissait morte, et ne se lançait
 * plus (mesuré dans la démo, où les quatre scènes sont à `unknown`). */
const DOMAINES_SANS_ETAT = Object.freeze(['scene', 'button', 'input_button', 'event']);

/** En panne : absente, `unavailable`, ou `unknown` — sauf pour un domaine sans
 *  état, où `unknown` veut dire « jamais déclenché ». Pour tous les autres
 *  domaines, la règle d'avant au caractère près : un capteur `unknown` reste
 *  « Indisponible » (devices.js et health.js, eux, comptent l'appareil et le
 *  diagnostic sur `unavailable` seul — ils ne changent pas). */
export const enPanne = (id, st) => !st || st.state === 'unavailable'
  || (st.state === 'unknown' && DOMAINES_SANS_ETAT.indexOf(domaineDe(id)) < 0);

/** Minuscules sans accents : « Éclairage Séjour » → « eclairage sejour ».
 *  `null` et `undefined` donnent '' ; tout le reste passe par String() — un
 *  0 reste « 0 », là où l'ancien `s || ''` l'effaçait (aucun appelant n'en
 *  passait : tous donnent une chaîne). Le « ł » polonais n'a pas de
 *  décomposition et reste tel quel : prises.js le traite à part. */
export function sansAccents(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/* \u2500\u2500 Ce qu'un cover accepte, d'apr\u00e8s SON `supported_features` (19/10) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
 *
 * OPEN 1, CLOSE 2, SET_POSITION 4, STOP 8, OPEN_TILT 16, CLOSE_TILT 32,
 * STOP_TILT 64, SET_TILT_POSITION 128 \u2014 les bits que `capabilities.js` lit
 * pour le moteur d'actions : une carte ne propose QUE ce que `commander`
 * accepterait, sinon le toast \u00ab Commande non ex\u00e9cut\u00e9e \u00bb tombait sur un bouton
 * qu'elle n'aurait pas d\u00fb montrer. Sans OPEN / CLOSE mais avec SET_POSITION,
 * Monter et Descendre passent par la position (100, 0). Un store qui ne fait
 * que s'INCLINER (aucun des trois premiers bits) se commande par ses lames,
 * et sa position est celle des lames. Chaque geste : `{ capacite, valeur }`
 * (la valeur pour `commander`), ou null s'il n'existe pas. `placer` : la
 * capacit\u00e9 qui vise un pourcentage, ou null. */
const geste = (capacite, valeur) => ({ capacite, valeur });
export function gestesCover(st) {
  const a = (st && st.attributes) || {};
  const f = typeof a.supported_features === 'number' ? a.supported_features : 0;
  if (!(f & 7) && (f & 176)) {
    const placer = f & 128 ? 'set_tilt_position' : null;
    return { lames: true, placer, stop: f & 64 ? geste('stop_tilt') : null,
      monter: f & 16 ? geste('open_tilt') : placer ? geste(placer, 100) : null,
      descendre: f & 32 ? geste('close_tilt') : placer ? geste(placer, 0) : null };
  }
  const placer = f & 4 ? 'set_position' : null;
  return { lames: false, placer, stop: f & 8 ? geste('stop') : null,
    monter: f & 1 ? geste('open') : placer ? geste(placer, 100) : null,
    descendre: f & 2 ? geste('close') : placer ? geste(placer, 0) : null };
}

/** La position PUBLI\u00c9E d'un cover, brute : `current_position`, ou celle des
 *  lames d'un store qui ne fait que s'incliner ; null s'il n'en publie pas. */
export function positionPubliee(st) {
  const a = (st && st.attributes) || {};
  const ok = (x) => typeof x === 'number' && Number.isFinite(x);
  if (ok(a.current_position)) return a.current_position;
  return ok(a.current_tilt_position) && gestesCover(st).lames ? a.current_tilt_position : null;
}
