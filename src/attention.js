/* Ce qui demande un regard : la rangée sûreté et le centre d'attention de
 * l'Accueil (refonte, étape 1).
 *
 * L'Accueil ne doit pas ÊTRE une liste d'alertes. Il doit dire en une ligne si
 * tout va bien et, sinon, quoi regarder d'abord. Ce module tire cette ligne de
 * ce que l'installation sait déjà — les états de Home Assistant, le rapport de
 * santé (`health.js`), les veilles et la règle des fenêtres du serveur
 * (`veilles.py`, `fenetres.py`) — sans rien demander de plus.
 *
 * Trois niveaux, pas dix : `danger` quand un détecteur ou l'alarme parlent,
 * `alerte` quand quelque chose cloche sans brûler, `info` quand la maison a
 * agi seule ou qu'une pile se vide. Un point par fait, jamais un total :
 * « 934 problèmes » n'apprend rien à personne (voir `health.js`).
 *
 * Les règles de sûreté sont CELLES de `deriveNotifs` (App.jsx) — même table,
 * mêmes mots, mêmes exclusions — pour que le centre d'attention et les
 * notifications ne se contredisent jamais. Elles sont copiées, pas importées :
 * App.jsx n'est pas un module pur, et tests/attention.test.mjs relit les deux
 * sources pour garantir qu'elles restent identiques.
 *
 * Pur : pas de React, pas de Home Assistant, testable à sec. Le seul import
 * est `tr`, le test le vérifie aussi.
 */
import { tr } from './i18n.js';

export const CLASSES_PORTE = ['door', 'garage_door', 'gate'];
export const CLASSES_FENETRE = ['window', 'opening'];
export const CLASSES_MOUVEMENT = ['motion', 'occupancy', 'presence'];
/* Les clés de la table de sûreté de `deriveNotifs`, dans son ordre : c'est à
 * ces binaires-là que l'Accueil s'abonne. */
export const CLASSES_SURETE = ['smoke', 'carbon_monoxide', 'gas', 'moisture', 'safety', 'tamper'];
/* « Élevé » : le palier de la table de `confort.js` où le CO₂ passe à
 * l'orange (captures du 19/09 : 1 400 ppm), et le palier haut d'`airPalier`
 * (App.jsx). Un seul chiffre pour toute la maison, sinon l'Accueil et la carte
 * se contrediraient. C'est aussi le défaut de la veille CO₂ du serveur ; un
 * seuil qu'on y règle reste le sien. */
export const SEUIL_CO2 = 1400;
/* Une pile : visible (ambre) à 20 %, rouge à 5 % — les mêmes chiffres pour la
 * plante, le robot et le point d'attention (v3.49.0). */
export const SEUILS_PILE = { alerte: 20, danger: 5 };
/* Du plus grave au plus doux : c'est aussi l'ordre de tri des points.
 * C'est le vocabulaire de TOUT l'écran : `danger` = action nécessaire (rouge,
 * lavis, point qui bat), `alerte` = attention (ambre, visible, sans battre),
 * `info` = la maison a agi (accent). Le normal n'a pas de niveau : il reste
 * discret, dans la couleur du texte. */
export const NIVEAUX = ['danger', 'alerte', 'info'];

/* Les mots de `deriveNotifs`, à l'identique : [le danger, ce qui s'est passé].
 * Le titre d'un point est la seconde forme — « Fumée détectée » se lit seul,
 * « Fumée » non. */
const TABLE_SURETE = {
  smoke: ['Fumée', 'Fumée détectée'],
  carbon_monoxide: ['Monoxyde de carbone', 'CO détecté'],
  gas: ['Gaz', 'Gaz détecté'],
  moisture: ["Fuite d'eau", 'Fuite détectée'],
  safety: ['Sécurité', 'Alerte de sécurité'],
  tamper: ['Sabotage', 'Boîtier ouvert ou déplacé'],
};
/* Ce qui brûle ou empoisonne est un danger ; l'eau et le sabotage, une alerte :
 * on ne réveille pas la maison pour une fuite sous l'évier, on la lui montre. */
const NIVEAU_SURETE = { smoke: 'danger', carbon_monoxide: 'danger', gas: 'danger', moisture: 'alerte', safety: 'alerte', tamper: 'alerte' };

/* Toutes dans la police regular — tests/attention.test.mjs le vérifie. Cette
 * police n'a ni `siren` ni `plug` : la cloche qui sonne dit l'alarme, le point
 * d'exclamation la santé de l'installation. */
export const ICONES_ATTENTION = {
  portes: 'door-closed', fenetres: 'window-alt', mouvement: 'eye', cameras: 'camera',
  alarme: 'bell-ring', smoke: 'fire-smoke', carbon_monoxide: 'flame', gas: 'flame',
  moisture: 'water', safety: 'shield-exclamation', tamper: 'shield-exclamation', meteo: 'umbrella',
  ouvrant: 'door-open', co2: 'wind', camera: 'camera', chauffage: 'flame', pile: 'battery-quarter', sante: 'exclamation',
};

/* Une entité muette ne dit rien : elle ne compte ni fermée ni ouverte. Sans
 * cette garde, un détecteur à plat passerait pour une porte fermée — la panne
 * la plus silencieuse d'une installation (voir `veilles.py`). */
const MUETS = ['unavailable', 'unknown'];
const estObjet = (v) => !!v && typeof v === 'object';
const estMuet = (st) => !estObjet(st) || st.state == null || MUETS.indexOf(String(st.state)) >= 0;
const attrs = (st) => (estObjet(st) && estObjet(st.attributes)) ? st.attributes : {};
const nombre = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const idsDe = (S) => (estObjet(S) ? Object.keys(S) : []);

function nomDe(id, st) {
  const n = attrs(st).friendly_name;
  return (n != null && String(n).trim() !== '') ? String(n) : id;
}

/* Les caméras de l'Accueil s'appellent `name` dans `deriveAccueil` et `nom`
 * ici : on lit les deux, pour ne pas imposer un renommage à l'intégration. */
function nomCamera(cam, i) {
  const n = cam.nom != null ? cam.nom : cam.name;
  if (n != null && String(n) !== '') return String(n);
  return (typeof cam.haid === 'string' && cam.haid) ? cam.haid : tr('Caméra') + ' ' + (i + 1);
}

export function familleOuvrant(deviceClass) {
  if (CLASSES_PORTE.indexOf(deviceClass) >= 0) return 'portes';
  if (CLASSES_FENETRE.indexOf(deviceClass) >= 0) return 'fenetres';
  return null;
}

/** Les comptes de la rangée sûreté. `S` est `hass.states` (ou n'importe quel
 * objet {id: {state, attributes}}), `cams` la liste de l'Accueil.
 *
 * Une famille sans capteur vaut `null` : une maison sans caméra n'a pas
 * « 0/0 caméras en ligne », elle n'a pas de tuile. `ok` ne regarde que ce qui
 * doit être clos ou joignable : du mouvement chez soi n'est pas un problème. */
export function comptesSecurite(S, cams = []) {
  const portes = { total: 0, ouverts: 0, noms: [] };
  const fenetres = { total: 0, ouverts: 0, noms: [] };
  const mouvement = { total: 0, actifs: 0, noms: [] };
  idsDe(S).forEach(id => {
    if (id.indexOf('binary_sensor.') !== 0) return;
    const st = S[id];
    if (estMuet(st)) return;
    const dc = attrs(st).device_class;
    const on = st.state === 'on';
    const fam = familleOuvrant(dc);
    if (fam) {
      const c = fam === 'portes' ? portes : fenetres;
      c.total += 1;
      if (on) { c.ouverts += 1; c.noms.push(nomDe(id, st)); }
    } else if (CLASSES_MOUVEMENT.indexOf(dc) >= 0) {
      mouvement.total += 1;
      if (on) { mouvement.actifs += 1; mouvement.noms.push(nomDe(id, st)); }
    }
  });
  /* `online === false` seulement : une caméra dont on ne sait rien est
   * réputée joignable, comme dans `deriveAccueil` (`c.online !== false`). */
  const liste = (Array.isArray(cams) ? cams : []).filter(estObjet);
  const cameras = { total: liste.length, enLigne: 0, noms: [] };
  liste.forEach((cam, i) => {
    if (cam.online === false) cameras.noms.push(nomCamera(cam, i));
    else cameras.enLigne += 1;
  });
  const ou = (c) => (c.total ? c : null);
  return {
    portes: ou(portes), fenetres: ou(fenetres), mouvement: ou(mouvement), cameras: ou(cameras),
    ok: portes.ouverts === 0 && fenetres.ouverts === 0 && cameras.enLigne === cameras.total,
  };
}

/** La sous-ligne de la sécurité, en un mot : « Tout est sécurisé », sinon ce
 * qui ne l'est pas — les ouvrants ouverts d'abord, une caméra injoignable
 * ensuite. La même phrase sur l'Accueil et dans la vue Sécurité (ADR 0033). */
export function resumeSecurite(comptes) {
  const c = estObjet(comptes) ? comptes : {};
  if (c.ok) return tr('Tout est sécurisé');
  const n = (v) => Number(v) || 0;
  const ouverts = n(c.portes && c.portes.ouverts) + n(c.fenetres && c.fenetres.ouverts);
  return ouverts > 1 ? tr('{n} ouvrants ouverts', { n: ouverts }) : ouverts === 1 ? tr('{n} ouvrant ouvert', { n: 1 }) : tr('Caméra hors ligne');
}

/** Ce que la carte Alarme dit entre son nom et ses boutons — ou rien (ADR 0034).
 *  - déclenchée : par quel(s) capteur(s), si le panneau le dit (`open_sensors`
 *    d'Alarmo), sinon « Alarme déclenchée » ;
 *  - armée ou en cours d'armement avec un ouvrant ouvert : lesquels — d'après
 *    le panneau, sinon d'après nos comptes — et ce que le panneau contourne
 *    (`bypassed_sensors`) ;
 *  - désarmée : rien. Un ouvrant ouvert de jour n'est pas un message.
 *  `S` sert à nommer les capteurs que le panneau cite par leur identifiant.
 *  → { niveau: 'danger' | 'warn', texte } | null */
export function messageAlarme(st, comptes, S) {
  if (!estObjet(st) || !st.state) return null;
  const a = attrs(st);
  const etats = estObjet(S) ? S : {};
  const nom = (x) => estObjet(x) ? String(x.name || x.entity_id || '') : nomDe(String(x), etats[String(x)]);
  const noms = (v) => Array.isArray(v) ? v.map(nom).filter(Boolean) : estObjet(v) ? Object.keys(v).map(k => nomDe(k, etats[k])).filter(Boolean) : [];
  const ouvertsPanneau = noms(a.open_sensors);
  const contournes = noms(a.bypassed_sensors);
  const etat = String(st.state);
  if (etat === 'triggered') {
    return { niveau: 'danger', texte: ouvertsPanneau.length ? tr('Déclenchée par {noms}', { noms: ouvertsPanneau.join(', ') }) : tr('Alarme déclenchée') };
  }
  const armee = etat === 'arming' || etat === 'pending' || etat.indexOf('armed_') === 0;
  if (!armee) return null;
  const c = estObjet(comptes) ? comptes : {};
  const nosOuverts = [].concat((c.portes && c.portes.noms) || [], (c.fenetres && c.fenetres.noms) || []);
  const ouverts = ouvertsPanneau.length ? ouvertsPanneau : nosOuverts;
  const parts = [];
  if (ouverts.length) parts.push(ouverts.length > 1 ? tr('{n} ouvrants ouverts : {noms}', { n: ouverts.length, noms: ouverts.join(', ') }) : tr('1 ouvrant ouvert : {noms}', { noms: ouverts[0] }));
  if (contournes.length) parts.push(contournes.length > 1 ? tr('{n} capteurs contournés', { n: contournes.length }) : tr('1 capteur contourné'));
  return parts.length ? { niveau: 'warn', texte: parts.join(' · ') } : null;
}

/** L'icône de chaque armement — la même sur les boutons de la carte Alarme et
 * sur la tuile de la bannière (ADR 0035). */
export const ICONES_ARMEMENT = { alarm_disarm: 'shield', alarm_arm_home: 'home', alarm_arm_away: 'plane-departure', alarm_arm_night: 'moon', alarm_arm_vacation: 'umbrella-beach' };

/** La tuile ALARME de la bannière : l'état et le mode en trois mots, l'icône
 * du mode, la couleur — d'après l'état du panneau. Sans panneau, ou muet :
 * null, pas de tuile. */
export function tuileAlarme(st) {
  if (!estObjet(st) || !st.state || st.state === 'unavailable' || st.state === 'unknown') return null;
  const s = String(st.state);
  // `rgb` : la teinte du verre de la tuile — vert désarmée, bleu maison, orange
  // absent et vacances, violet nuit, ambre en cours d'armement, rouge déclenchée.
  if (s === 'triggered') return { texte: tr('Déclenchée'), icone: 'bell-ring', couleur: 'var(--o-bad)', rgb: 'var(--o-bad-rgb)' };
  if (s === 'arming' || s === 'pending') return { texte: tr('Activation…'), icone: 'shield', couleur: 'var(--o-warn)', rgb: 'var(--o-warn-rgb)' };
  if (s === 'disarmed') return { texte: tr('Désarmée'), icone: ICONES_ARMEMENT.alarm_disarm, couleur: 'var(--o-ok)', rgb: 'var(--o-ok-rgb)' };
  const modes = {
    armed_home: [tr('Armée · Maison'), ICONES_ARMEMENT.alarm_arm_home, 'var(--o-accent-soft)', 'var(--o-accent-rgb)'],
    armed_away: [tr('Armée · Absent'), ICONES_ARMEMENT.alarm_arm_away, 'var(--o-warn2)', 'var(--o-warn2-rgb)'],
    armed_night: [tr('Armée · Nuit'), ICONES_ARMEMENT.alarm_arm_night, 'var(--o-purple)', 'var(--o-purple-rgb)'],
    armed_vacation: [tr('Armée · Vacances'), ICONES_ARMEMENT.alarm_arm_vacation, 'var(--o-warn2)', 'var(--o-warn2-rgb)'],
  }[s];
  if (modes) return { texte: modes[0], icone: modes[1], couleur: modes[2], rgb: modes[3] };
  return { texte: tr('Armée'), icone: 'shield-check', couleur: 'var(--o-warn2)', rgb: 'var(--o-warn2-rgb)' };
}

/** Une sirène : le domaine `siren`, ou un interrupteur qui se nomme ainsi —
 * beaucoup de sirènes Zigbee n'arrivent dans Home Assistant qu'en `switch`
 * (ADR 0035). Le nom se lit sans accent ni casse, dans l'identifiant et le
 * nom affiché. */
export function estSirene(id, st) {
  const dom = String(id || '').split('.')[0];
  if (dom === 'siren') return true;
  if (dom !== 'switch' && dom !== 'input_boolean') return false;
  const texte = (String(id) + ' ' + String(attrs(st).friendly_name || '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /siren/.test(texte);
}

/** Les tuiles de la rangée, dans l'ordre de lecture : portes, fenêtres,
 * mouvement, caméras — seulement les familles présentes. `nom` est le titre
 * au-dessus de la valeur ; `alerte` : quelque chose d'ouvert ou d'injoignable ;
 * `actif` : du mouvement, qui se montre sans inquiéter. */
export function tuilesSecurite(comptes) {
  if (!estObjet(comptes)) return [];
  const out = [];
  const p = comptes.portes, f = comptes.fenetres, m = comptes.mouvement, c = comptes.cameras;
  const n = (v) => Number(v) || 0;
  if (estObjet(p) && n(p.total)) {
    out.push({ cle: 'portes', nom: tr('Portes'), icone: ICONES_ATTENTION.portes, valeur: (n(p.total) - n(p.ouverts)) + '/' + n(p.total), libelle: tr('fermées'), alerte: n(p.ouverts) > 0, actif: false });
  }
  if (estObjet(f) && n(f.total)) {
    out.push({ cle: 'fenetres', nom: tr('Fenêtres'), icone: ICONES_ATTENTION.fenetres, valeur: (n(f.total) - n(f.ouverts)) + '/' + n(f.total), libelle: tr('fermées'), alerte: n(f.ouverts) > 0, actif: false });
  }
  if (estObjet(m) && n(m.total)) {
    const a = n(m.actifs);
    out.push({ cle: 'mouvement', nom: tr('Mouvement'), icone: ICONES_ATTENTION.mouvement, valeur: a ? String(a) : tr('Aucun'), libelle: a ? (a > 1 ? tr('détectés') : tr('détecté')) : tr('mouvement'), alerte: false, actif: a > 0 });
  }
  if (estObjet(c) && n(c.total)) {
    out.push({ cle: 'cameras', nom: tr('Caméras'), icone: ICONES_ATTENTION.cameras, valeur: n(c.enLigne) + '/' + n(c.total), libelle: tr('en ligne'), alerte: n(c.enLigne) < n(c.total), actif: false });
  }
  return out;
}

/** L'icône d'un point, d'après sa clé : `genre:détail…`. Le genre suffit,
 * sauf pour la sûreté où la classe du capteur fait l'icône. */
export function iconePoint(point) {
  const cle = String((estObjet(point) && point.cle) || '');
  const morceaux = cle.split(':');
  const genre = morceaux[0];
  if (genre === 'surete') return ICONES_ATTENTION[morceaux[1]] || ICONES_ATTENTION.safety;
  if (genre === 'fenetre') return ICONES_ATTENTION.chauffage;
  return ICONES_ATTENTION[genre] || ICONES_ATTENTION.sante;
}

/* Un incident dit son compte ; à défaut, ses entités ou ses appareils. */
function compteIncident(i) {
  const n = Number(i.count);
  if (Number.isFinite(n) && n > 0) return n;
  const liste = Array.isArray(i.entities) ? i.entities : (Array.isArray(i.devices) ? i.devices : []);
  return liste.length;
}

/** Les points d'attention, du plus grave au plus doux puis par titre.
 *
 * ctx = { S, cams, pieces, sante, veilles, fenetres, plantes } — chaque
 * morceau peut manquer : l'Accueil se dessine avant que le serveur ait répondu,
 * et un ctx vide donne simplement une liste vide.
 *
 * Chaque point : { cle, niveau, icone, titre, sous, vue, haid }. La clé est
 * stable d'un rendu à l'autre (React s'en sert) et unique : un fait déjà
 * porté par une règle n'est pas redit par une autre. */
export function pointsAttention(ctx) {
  const c = estObjet(ctx) ? ctx : {};
  const S = estObjet(c.S) ? c.S : {};
  const ids = idsDe(S);
  const cles = new Set();
  const out = [];
  const ajouter = (cle, niveau, titre, sous, vue, haid) => {
    if (cles.has(cle)) return;
    cles.add(cle);
    const p = { cle, niveau, icone: null, titre, sous, vue: vue || null, haid: haid || null };
    p.icone = iconePoint(p);
    out.push(p);
  };

  /* 1. L'alarme qui sonne passe avant tout. Au passage, on retient si un
   * panneau est armé : la règle 3 en dépend. */
  let armee = false;
  ids.forEach(id => {
    if (id.indexOf('alarm_control_panel.') !== 0) return;
    const st = S[id];
    const etat = estObjet(st) && st.state != null ? String(st.state) : '';
    if (etat === 'triggered') ajouter('alarme:' + id, 'danger', tr('Alarme déclenchée'), nomDe(id, st), 'securite', id);
    else if (etat.indexOf('armed') === 0) armee = true;
  });

  /* 2. La sûreté, sans configuration : la device_class porte le sens, jamais
   * le nom. Deux exclusions, celles de `deriveNotifs` :
   * — `moisture` d'une plante (binaire `<base>_besoin_eau`) : une dracaena
   *   assoiffée n'est pas un dégât des eaux ;
   * — `safety` de MeteoAlarm, `on` des jours entiers en vigilance jaune : une
   *   vigilance à part, rouge seulement en Severe/Extreme.
   * 3. Un ouvrant ouvert PENDANT que l'alarme est armée : de jour, alarme
   *   désarmée, une fenêtre ouverte n'est qu'une fenêtre ouverte. */
  const bases = (Array.isArray(c.plantes) ? c.plantes : []).filter(b => typeof b === 'string' && b);
  const estPlante = (id) => bases.some(b => id.indexOf(b) === 0 && (id.length === b.length || id.charAt(b.length) === '_'));
  ids.forEach(id => {
    if (id.indexOf('binary_sensor.') !== 0) return;
    const st = S[id];
    if (!estObjet(st) || st.state !== 'on') return;
    const a = attrs(st);
    const dc = a.device_class;
    const nom = nomDe(id, st);
    if (CLASSES_SURETE.indexOf(dc) >= 0) {
      if (dc === 'safety' && (a.awareness_level != null || /meteoalarm/i.test(id) || /meteoalarm/i.test(a.attribution || ''))) {
        const grave = a.severity === 'Severe' || a.severity === 'Extreme';
        ajouter('meteo:' + id, grave ? 'danger' : 'alerte', tr('Vigilance météo'), a.event || a.headline || tr('Alerte météo en cours'), 'securite', id);
        return;
      }
      if (dc === 'moisture' && estPlante(id)) return;
      ajouter('surete:' + dc + ':' + id, NIVEAU_SURETE[dc], tr(TABLE_SURETE[dc][1]), nom, 'securite', id);
      return;
    }
    if (armee && familleOuvrant(dc)) ajouter('ouvrant:' + id, 'alerte', tr('Ouvert, alarme armée'), nom, 'securite', id);
  });

  /* 4. L'air d'une pièce : au palier « chargé », on le dit. `haid` (le capteur
   * de la pièce) sert à ne pas redire la même chose depuis la veille du
   * serveur, règle 7. */
  const co2Haids = new Set();
  (Array.isArray(c.pieces) ? c.pieces : []).forEach(p => {
    if (!estObjet(p)) return;
    const nom = p.nom != null ? String(p.nom) : (p.name != null ? String(p.name) : '');
    const co2 = nombre(p.co2);
    const niv = niveauCo2(co2);
    if (!nom || !niv) return;
    const haid = typeof p.haid === 'string' ? p.haid : null;
    if (haid) co2Haids.add(haid);
    ajouter('co2:' + nom, niv, tr('CO₂ élevé'), nom + ' · ' + Math.round(co2) + ' ppm', 'room:' + nom, haid);
  });

  /* 5. Une caméra injoignable : on ne voit plus, c'est une alerte. */
  (Array.isArray(c.cams) ? c.cams : []).forEach((cam, i) => {
    if (!estObjet(cam) || cam.online !== false) return;
    const nom = nomCamera(cam, i);
    ajouter('camera:' + nom, 'alerte', tr('Caméra hors ligne'), nom, 'securite', typeof cam.haid === 'string' ? cam.haid : null);
  });

  /* 6. La maison a agi seule : le chauffage coupé d'une pièce dont la fenêtre
   * est ouverte (`fenetres.py`, `coupes` = {pièce: [chauffages coupés]}). Une
   * info, pour qu'on ne cherche pas pourquoi le radiateur est froid. */
  const coupes = (estObjet(c.fenetres) && estObjet(c.fenetres.coupes)) ? c.fenetres.coupes : {};
  Object.keys(coupes).forEach(piece => {
    const liste = coupes[piece];
    if (!Array.isArray(liste) || !liste.length) return;
    ajouter('fenetre:' + piece, 'info', tr('Chauffage coupé'), tr('{x} · fenêtre ouverte', { x: piece }), 'room:' + piece, null);
  });

  /* 7. Les veilles du serveur (`veilles.py`) : `signales` liste des clés
   * `bat:<haid>` et `co2:<haid>`. La pile est une info qui attend ; le CO₂ une
   * alerte, sauf si la pièce l'a déjà dit (règle 4). */
  const signales = (estObjet(c.veilles) && Array.isArray(c.veilles.signales)) ? c.veilles.signales : [];
  signales.forEach(cle => {
    if (typeof cle !== 'string') return;
    const sep = cle.indexOf(':');
    if (sep < 0) return;
    const genre = cle.slice(0, sep), haid = cle.slice(sep + 1);
    if (!haid) return;
    const st = S[haid];
    const nom = nomDe(haid, st);
    const val = estObjet(st) ? nombre(st.state) : null;
    if (genre === 'bat') {
      // Le serveur signale au seuil réglé ; la couleur suit la charge réelle :
      // une pile à 4 % est une action, pas une information.
      ajouter('pile:' + haid, niveauPile(val) || 'info', tr('Pile faible'), val != null ? nom + ' · ' + Math.round(val) + ' %' : nom, 'objets', haid);
    } else if (genre === 'co2') {
      if (co2Haids.has(haid) || cles.has('co2:' + haid)) return;
      ajouter('co2:' + haid, 'alerte', tr('CO₂ élevé'), val != null ? nom + ' · ' + Math.round(val) + ' ppm' : nom, null, haid);
    }
  });

  /* 8. La santé de l'installation (`health.js`) : des incidents, pas des
   * symptômes. Seuls comptent une intégration entière qui ne répond plus et
   * une passerelle hors service. Les `residus` (entrées de registre sans
   * définition) sont du bruit ; « appareils hors ligne » et « chute
   * simultanée » ont été retirés le 16/09 à la demande de l'utilisateur —
   * « prend de la place pour rien » : un appareil à piles ou une imprimante
   * qui dort n'est pas une panne, et une pile faible, la veille le dit. */
  const incidents = (estObjet(c.sante) && Array.isArray(c.sante.incidents)) ? c.sante.incidents : [];
  incidents.forEach((i) => {
    if (!estObjet(i)) return;
    const n = compteIncident(i);
    const scope = i.scope != null ? String(i.scope) : '';
    if (i.kind === 'integration') {
      ajouter('sante:integration:' + scope, 'alerte', tr('Intégration muette'), tr('{x} · {n} entités', { x: scope, n }), 'systeme', null);
    } else if (i.kind === 'passerelle') {
      ajouter('sante:passerelle:' + (i.deviceId || scope), 'alerte', tr('Passerelle hors service'), scope, 'systeme', null);
    }
  });

  /* Du plus grave au plus doux, puis par titre — puis par sous-titre et clé :
   * un ordre entièrement déterminé, pour que la liste ne saute pas d'un rendu
   * à l'autre quand Home Assistant réordonne ses états. */
  const rang = (niveau) => { const r = NIVEAUX.indexOf(niveau); return r < 0 ? NIVEAUX.length : r; };
  const cmp = (a, b) => String(a).localeCompare(String(b), 'fr');
  out.sort((a, b) => (rang(a.niveau) - rang(b.niveau)) || cmp(a.titre, b.titre) || cmp(a.sous, b.sous) || cmp(a.cle, b.cle));
  return out;
}

/** Le niveau d'une pile d'après sa charge, ou null si elle tient. */
export function niveauPile(pct) {
  const n = nombre(pct);
  if (n == null) return null;
  if (n <= SEUILS_PILE.danger) return 'danger';
  if (n <= SEUILS_PILE.alerte) return 'alerte';
  return null;
}

/** Le niveau d'un CO₂ : une alerte au palier « chargé », sinon rien. */
export function niveauCo2(ppm) {
  const n = nombre(ppm);
  return n != null && n >= SEUIL_CO2 ? 'alerte' : null;
}

/** Le point qui bat est réservé à l'action : ailleurs, l'œil n'a rien à
 * rattraper. `pulse` est défini dans index.css. */
export function animationNiveau(niveau) {
  return niveau === 'danger' ? 'pulse 1.2s infinite' : 'none';
}

export function niveauMax(points) {
  const liste = Array.isArray(points) ? points : [];
  for (const n of NIVEAUX) if (liste.some(p => estObjet(p) && p.niveau === n)) return n;
  return null;
}

export function resumeAttention(points) {
  const n = (Array.isArray(points) ? points : []).filter(estObjet).length;
  if (n === 0) return tr('Tout va bien');
  return n === 1 ? tr('{n} point à surveiller', { n }) : tr('{n} points à surveiller', { n });
}

/* Les jetons du thème, jamais une couleur en dur : le mode clair et les thèmes
 * d'utilisateur les redéfinissent. Sans niveau, c'est que tout va bien. */
export function couleurNiveau(niveau) {
  if (niveau === 'danger') return { col: 'var(--o-bad)', rgb: 'var(--o-bad-rgb)' };
  if (niveau === 'alerte') return { col: 'var(--o-warn)', rgb: 'var(--o-warn-rgb)' };
  if (niveau === 'info') return { col: 'var(--o-accent)', rgb: 'var(--o-accent-rgb)' };
  return { col: 'var(--o-ok)', rgb: 'var(--o-ok-rgb)' };
}
