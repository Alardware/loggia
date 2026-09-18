/* ── Les robots de la maison : aspirateur et tondeuse (ADR 0042) ─────────────
 *
 * Une fiche par robot, en onglets (maquettes du 17/09) : l'accueil du robot,
 * ses zones, son planning, son historique, son entretien, ses réglages. Ce fichier porte tout ce
 * qui se CALCULE ; pas de React, pas de Home Assistant : la vue lui passe des
 * entités déjà lues, les tests aussi.
 *
 * Deux robots ne se ressemblent pas. Un aspirateur annonce des pièces et cinq
 * consommables en pourcentage ; une tondeuse, des zones qui sont des
 * interrupteurs, des lames comptées en heures, une hauteur de coupe. Rien n'est
 * donc écrit en dur : tout se lit dans les entités SŒURS du robot — celles du
 * même appareil —, reconnues à leur clé de traduction (la même dans toutes les
 * langues), à défaut à leur identifiant. Et rien ne s'invente : une mesure que
 * l'appareil ne publie pas ne se dessine pas.
 */
import { tr } from './i18n.js';

export const DOMAINES_ROBOT = ['vacuum', 'lawn_mower'];

const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const nombre = (v) => { const n = typeof v === 'number' ? v : parseFloat(v); return isNaN(n) ? null : n; };
const borne = (n, a, b) => Math.min(b, Math.max(a, n));

/* ════════════ Les entités sœurs ════════════ */

/**
 * Les sœurs d'un robot, décrites une fois : domaine, clé de traduction,
 * identifiant court, catégorie, classe, unité, état, nom SANS celui de
 * l'appareil (« Aspirateur Filtre » se lit « Filtre »). `texte` est ce que les
 * motifs regardent : la clé et l'identifiant, sans accents.
 */
export function decrireSoeurs(index, states, idRobot) {
  if (!index || !index.entityMeta || !idRobot) return [];
  const moi = index.entityMeta.get(idRobot);
  if (!moi || !moi.deviceId) return [];
  const appareil = sansAccents(moi.device || '');
  const out = [];
  index.entityMeta.forEach((m, id) => {
    if (m.deviceId !== moi.deviceId || id === idRobot || m.hidden || m.disabled) return;
    const st = (states || {})[id];
    if (!st) return;
    const a = st.attributes || {};
    const objet = id.slice(id.indexOf('.') + 1);
    let nom = String(a.friendly_name || m.name || objet);
    if (appareil && sansAccents(nom).indexOf(appareil) === 0 && nom.length > appareil.length + 1) nom = nom.slice(appareil.length).replace(/^[\s·:–-]+/, '');
    out.push({
      id, domaine: id.slice(0, id.indexOf('.')), objet, cle: m.translationKey || null, categorie: m.category || null,
      classe: a.device_class || m.deviceClass || null, unite: a.unit_of_measurement || null,
      etat: st.state, attributs: a, plateforme: m.platform || null,
      nom: nom.charAt(0).toUpperCase() + nom.slice(1),
      texte: sansAccents((m.translationKey || '') + ' ' + objet),
    });
  });
  return out.sort((x, y) => x.id.localeCompare(y.id));
}

const vivant = (s) => s && s.etat != null && s.etat !== 'unavailable' && s.etat !== 'unknown' && s.etat !== '';

/* ════════════ L'état et le geste ════════════ */

/** La phase d'un robot, d'après l'état normalisé par Home Assistant. */
export function phaseRobot(domaine, etat) {
  const s = String(etat == null ? '' : etat).toLowerCase();
  if (!s || s === 'unavailable' || s === 'unknown') return 'absent';
  if (s === 'cleaning' || s === 'mowing') return 'travail';
  if (s === 'paused') return 'pause';
  if (s === 'returning') return 'retour';
  if (s === 'docked') return 'base';
  if (s === 'error') return 'erreur';
  return 'repos';
}

/** Le mot de l'état. « En charge » ne se dit que si un capteur le dit. */
export function motEtatRobot(domaine, etat, { enCharge: charge = false } = {}) {
  const p = phaseRobot(domaine, etat);
  if (p === 'base') return charge ? tr('À la base · en charge') : tr('À la base');
  if (p === 'travail') return domaine === 'lawn_mower' ? tr('Tonte en cours') : tr('Nettoyage en cours');
  if (p === 'pause') return tr('En pause');
  if (p === 'retour') return tr('Retour à la base');
  if (p === 'erreur') return tr('Erreur');
  if (p === 'absent') return tr('Injoignable');
  return tr('Au repos');
}

/** Un capteur binaire « en charge » parmi les sœurs, et allumé. */
export function enCharge(soeurs) {
  return (soeurs || []).some(s => s.domaine === 'binary_sensor' && s.classe === 'battery_charging' && s.etat === 'on');
}

/** La batterie : l'attribut du robot d'abord, le capteur de l'appareil ensuite. */
export function batterieRobot(etatRobot, soeurs) {
  const a = (etatRobot && etatRobot.attributes) || {};
  const direct = nombre(a.battery_level);
  if (direct != null) return Math.round(borne(direct, 0, 100));
  const c = (soeurs || []).find(s => s.domaine === 'sensor' && s.classe === 'battery' && vivant(s) && nombre(s.etat) != null);
  return c ? Math.round(borne(nombre(c.etat), 0, 100)) : null;
}

/**
 * Le bouton principal : pause quand le robot travaille, reprise quand il est
 * en pause, départ sinon — avec le compte des zones choisies, s'il y en a.
 */
export function actionPrincipale(domaine, etat, nZones = 0) {
  const p = phaseRobot(domaine, etat);
  const depart = domaine === 'lawn_mower' ? 'start_mowing' : 'start';
  if (p === 'travail') return { cle: 'pause', service: 'pause', libelle: tr('Mettre en pause') };
  if (p === 'pause') return { cle: 'reprendre', service: depart, libelle: tr('Reprendre') };
  if (p === 'absent') return { cle: 'absent', service: null, libelle: tr('Injoignable') };
  const libelle = nZones > 1 ? tr('Démarrer · {n} zones', { n: nZones }) : nZones === 1 ? tr('Démarrer · 1 zone') : tr('Démarrer');
  return { cle: 'demarrer', service: depart, libelle };
}

/** Le service du retour à la base. */
export const serviceRetour = (domaine) => (domaine === 'lawn_mower' ? 'dock' : 'return_to_base');

/**
 * La commande qui nettoie des PIÈCES, telle que l'intégration du robot
 * l'attend. Il n'existe pas de service commun : chaque intégration a le sien.
 * Inconnue, ou service absent de l'installation : `null` — la vue ne propose
 * alors pas de départ par pièces plutôt que d'envoyer une commande au hasard.
 */
export function commandeZones({ plateforme = null, services = null, idRobot = null, segments = [] } = {}) {
  const segs = (segments || []).map(Number).filter(n => !isNaN(n));
  if (!idRobot || !segs.length) return null;
  // Sans liste de services (composant absent), on ne peut pas vérifier : on fait confiance à la plateforme.
  const existe = (domaine, service) => !services || !services[domaine] || !!services[domaine][service];
  if (plateforme === 'ecovacs') return { domaine: 'vacuum', service: 'send_command', data: { entity_id: idRobot, command: 'spot_area', params: { rooms: segs.join(','), cleanings: 1 } } };
  if (plateforme === 'roborock') return { domaine: 'vacuum', service: 'send_command', data: { entity_id: idRobot, command: 'app_segment_clean', params: segs } };
  if (plateforme === 'dreame_vacuum' && existe('dreame_vacuum', 'vacuum_clean_segment')) return { domaine: 'dreame_vacuum', service: 'vacuum_clean_segment', data: { entity_id: idRobot, segments: segs } };
  if (plateforme === 'xiaomi_miio' && existe('xiaomi_miio', 'vacuum_clean_segment')) return { domaine: 'xiaomi_miio', service: 'vacuum_clean_segment', data: { entity_id: idRobot, segments: segs } };
  return null;
}

/**
 * Les zones d'une tondeuse : les interrupteurs de son appareil qui désignent
 * une aire de tonte. Les allumer, c'est les choisir ; « Démarrer » tond alors
 * celles qui sont allumées. Sans interrupteur de zone, pas de zones.
 */
export function zonesTondeuse(soeurs) {
  return (soeurs || [])
    .filter(s => s.domaine === 'switch' && vivant(s) && (s.cle === 'area' || /(^|_)(zone|area)_/.test(s.objet)))
    .map(s => ({ id: s.id, nom: s.nom.replace(/^(zone|area)\s+/i, ''), actif: s.etat === 'on' }));
}

/* ════════════ L'entretien ════════════ */

/* L'ordre est celui de la lecture ; il sert aussi à l'attribution : « brosse
 * latérale » passe avant « brosse », qui sinon la prendrait. */
const ROLES_USURE = [
  ['filtre', () => tr('Filtre'), /filter|filtre/],
  ['brosse_laterale', () => tr('Brosse latérale'), /side_?brush|brosse_laterale/],
  ['brosse_principale', () => tr('Brosse principale'), /main_?brush|lifespan_brush|brosse_principale|(^|[_ ])brush([_ ]|$)/],
  ['serpilliere', () => tr('Serpillière'), /mop|serpilliere/],
  ['capteurs', () => tr('Capteurs'), /sensor_dirty|sensor_time|sensors?_left|capteurs?_(sales?|restant)/],
  ['sac', () => tr('Sac à poussière'), /dust_?bag|sac_a_poussiere/],
  ['entretien', () => tr('Entretien du robot'), /unit_care|entretien/],
  ['lames', () => tr('Lames'), /blade|(^|[_ ])lames?([_ ]|$)/],
  ['detergent', () => tr('Détergent'), /detergent/],
  ['ions', () => tr('Ions d’argent'), /silver_ion/],
];
/* L'ordre de LECTURE, lui, est celui des maquettes : la brosse principale avant la latérale. */
const ORDRE_LECTURE = ['filtre', 'brosse_principale', 'brosse_laterale', 'serpilliere', 'capteurs', 'sac', 'entretien', 'lames', 'detergent', 'ions'];
/* Ce qui parle d'une lame ou d'une brosse sans dire son usure. */
const PAS_UNE_USURE = /height|hauteur|angle|speed|vitesse|mode|inch|pouce|spacing|espacement/;
const EN_HEURES = { h: 1, min: 1 / 60, s: 1 / 3600, d: 24, j: 24 };
/* Les durées de vie que ces intégrations ne publient pas, mais que leur
 * fabricant documente : sans elles, « 45 h restantes » n'a pas de jauge. */
const VIE_NOMINALE_H = {
  roborock: { brosse_principale: 300, brosse_laterale: 200, filtre: 150, capteurs: 30 },
  xiaomi_miio: { brosse_principale: 300, brosse_laterale: 200, filtre: 150, capteurs: 30 },
};

const roleDe = (s) => { if (PAS_UNE_USURE.test(s.texte)) return null; const r = ROLES_USURE.find(x => x[2].test(s.texte)); return r ? r[0] : null; };

/** Le niveau d'une pièce d'usure : bas sous 35 %, moyen sous 65 %, bon au-delà. */
export function niveauUsure(pct) {
  if (pct == null) return null;
  return pct < 35 ? 'bas' : pct < 65 ? 'moyen' : 'bon';
}

const heures = (n) => { const r = n >= 10 ? Math.round(n) : Math.round(n * 10) / 10; return String(r).replace('.', ','); };

/**
 * Les pièces d'usure : ce qu'il reste, en pourcentage quand on le sait.
 *   - un capteur en % : c'est la jauge ;
 *   - un temps d'usage ET son seuil d'alerte (les lames d'une tondeuse) : la
 *     jauge est ce qu'il reste avant le seuil ;
 *   - un temps restant dont le fabricant documente la durée de vie : idem ;
 *   - sinon le temps seul, sans jauge — on ne devine pas un total.
 * `reset` est le bouton de l'appareil qui remet le compteur à neuf, s'il existe.
 */
export function piecesUsure(soeurs) {
  // Un état qui n'est pas un nombre (« unavailable », « unknown ») s'écarte de lui-même.
  const capteurs = (soeurs || []).filter(s => s.domaine === 'sensor' && nombre(s.etat) != null && (s.unite === '%' || EN_HEURES[s.unite] != null));
  // Un bouton vaut « unknown » tant qu'il n'a jamais servi : seul « unavailable » l'écarte.
  const boutons = (soeurs || []).filter(s => s.domaine === 'button' && s.etat !== 'unavailable' && /reset|reinitialis/.test(s.texte));
  const out = [];
  ROLES_USURE.forEach(([role, nom]) => {
    const duRole = capteurs.filter(s => roleDe(s) === role);
    if (!duRole.length) return;
    const bouton = boutons.find(b => roleDe(b) === role);
    const reset = bouton ? bouton.id : null;
    const enPct = duRole.filter(s => s.unite === '%');
    if (enPct.length) {
      enPct.forEach(s => {
        const pct = Math.round(borne(nombre(s.etat), 0, 100));
        out.push({ id: s.id, role, nom: enPct.length > 1 ? s.nom : nom(), pct, texte: null, niveau: niveauUsure(pct), reset });
      });
      return;
    }
    const h = (s) => nombre(s.etat) * EN_HEURES[s.unite];
    const seuil = duRole.find(s => /warn|avertissement|limit|seuil/.test(s.texte));
    const use = duRole.find(s => s !== seuil && /used|usage|utilis/.test(s.texte));
    const restant = duRole.find(s => s !== seuil && /left|remaining|restant/.test(s.texte));
    if (use && seuil && h(seuil) > 0) {
      const pct = Math.round(borne(100 * (1 - h(use) / h(seuil)), 0, 100));
      out.push({ id: use.id, role, nom: nom(), pct, texte: tr('{n} h sur {m} h', { n: heures(h(use)), m: heures(h(seuil)) }), niveau: niveauUsure(pct), reset });
    } else if (restant) {
      const vie = (VIE_NOMINALE_H[restant.plateforme] || {})[role] || null;
      const pct = vie ? Math.round(borne(100 * h(restant) / vie, 0, 100)) : null;
      out.push({ id: restant.id, role, nom: nom(), pct, texte: tr('{n} h restantes', { n: heures(h(restant)) }), niveau: niveauUsure(pct), reset });
    } else if (use) {
      out.push({ id: use.id, role, nom: nom(), pct: null, texte: tr('{n} h d’utilisation', { n: heures(h(use)) }), niveau: null, reset });
    }
  });
  return out.sort((a, b) => ORDRE_LECTURE.indexOf(a.role) - ORDRE_LECTURE.indexOf(b.role));
}

/** Ce qui presse : la pièce la plus usée, si elle est sous le seuil bas. */
export function alerteEntretien(pieces) {
  const bas = (pieces || []).filter(p => p.niveau === 'bas').sort((a, b) => a.pct - b.pct);
  return bas.length ? bas[0] : null;
}

/** Les compteurs de l'appareil : totaux, cycles, kilomètres — tels qu'il les nomme. */
export function compteursRobot(soeurs) {
  return (soeurs || [])
    .filter(s => s.domaine === 'sensor' && vivant(s) && nombre(s.etat) != null && /(^|[_ ])total|maintenance|cycles|kilometrage|mileage|odometer|cleaning_count/.test(s.texte) && roleDe(s) == null)
    .map(s => ({ id: s.id, nom: s.nom, valeur: nombre(s.etat), unite: s.unite || null }));
}

/* ════════════ L'historique ════════════ */

/**
 * Les sessions d'un robot, tirées de l'historique de SON état : une session
 * commence quand il se met au travail et dure tant qu'il travaille, fait une
 * pause ou rentre. Elle est « terminée » si le robot a regagné sa base,
 * « interrompue » s'il s'est arrêté ailleurs, en « erreur » s'il l'a dit.
 * La durée est celle du TRAVAIL ; une session de moins d'une minute est un
 * faux départ, elle ne compte pas.
 *
 * `surfaces` est l'historique du capteur de surface, s'il existe : la surface
 * d'une session est le maximum atteint pendant qu'elle durait.
 */
export function sessionsRobot(etats, { domaine = 'vacuum', maintenant = Date.now(), surfaces = [] } = {}) {
  const pts = (etats || [])
    .map(e => ({ t: Date.parse(e.last_changed || e.last_updated || ''), p: phaseRobot(domaine, e.state) }))
    .filter(e => !isNaN(e.t))
    .sort((a, b) => a.t - b.t);
  const mesures = (surfaces || []).map(e => ({ t: Date.parse(e.last_changed || e.last_updated || ''), v: nombre(e.state) })).filter(e => !isNaN(e.t) && e.v != null);
  const fin = maintenant instanceof Date ? maintenant.getTime() : Number(maintenant);
  const sessions = [];
  let cours = null;
  const clore = (t, issue) => {
    if (!cours) return;
    if (cours.travail >= 60000) {
      const debut = cours.debut;
      const dans = mesures.filter(m => m.t >= debut && m.t <= t + 120000);
      sessions.push({
        debut, fin: t, dureeMin: Math.round(cours.travail / 60000), issue,
        surface: dans.length ? Math.round(Math.max(...dans.map(m => m.v))) : null,
      });
    }
    cours = null;
  };
  pts.forEach((e, i) => {
    const suivant = i + 1 < pts.length ? pts[i + 1].t : fin;
    const actif = e.p === 'travail' || e.p === 'pause' || e.p === 'retour';
    if (actif) {
      if (!cours) { if (e.p !== 'travail') return; cours = { debut: e.t, travail: 0 }; }
      if (e.p === 'travail') cours.travail += Math.max(0, suivant - e.t);
    } else if (cours) {
      clore(e.t, e.p === 'base' ? 'termine' : e.p === 'erreur' ? 'erreur' : 'interrompu');
    }
  });
  if (cours) clore(fin, 'en_cours');
  return sessions.sort((a, b) => b.debut - a.debut);
}

/** Le mot d'une issue. */
export function motIssue(issue) {
  return issue === 'termine' ? tr('Terminé') : issue === 'erreur' ? tr('Erreur') : issue === 'en_cours' ? tr('En cours') : tr('Interrompu');
}

const minuit = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; };

/**
 * La semaine en cours (du premier jour de la langue au dernier) : le total et
 * un jour par barre. La surface ne s'additionne que si le robot la publie.
 */
export function resumeSemaine(sessions, maintenant = Date.now(), premier = 1) {
  const auj = minuit(maintenant);
  const recul = (auj.getDay() - (premier % 7) + 7) % 7;
  const debut = new Date(auj); debut.setDate(debut.getDate() - recul);
  const jours = Array.from({ length: 7 }, (_, i) => { const d = new Date(debut); d.setDate(d.getDate() + i); return { date: d, dureeMin: 0, surface: 0, n: 0, aujourdhui: d.getTime() === auj.getTime() }; });
  const limite = new Date(debut); limite.setDate(limite.getDate() + 7);
  const dans = (sessions || []).filter(s => s.debut >= debut.getTime() && s.debut < limite.getTime());
  const aSurface = dans.some(s => s.surface != null);
  dans.forEach(s => {
    const j = jours.find(x => minuit(s.debut).getTime() === x.date.getTime());
    if (!j) return;
    j.dureeMin += s.dureeMin; j.surface += s.surface || 0; j.n += 1;
  });
  return {
    jours, n: dans.length, dureeMin: dans.reduce((a, s) => a + s.dureeMin, 0),
    surface: aSurface ? dans.reduce((a, s) => a + (s.surface || 0), 0) : null,
  };
}

/** « 2 h 15 », « 48 min ». */
export function dureeLisible(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m < 60) return tr('{n} min', { n: m });
  const h = Math.floor(m / 60), r = m % 60;
  return r ? tr('{h} h {m}', { h, m: String(r).padStart(2, '0') }) : tr('{h} h', { h });
}

/** L'étiquette d'un jour de session : « Auj. », « Hier », sinon le jour court. */
export function etiquetteJour(t, maintenant = Date.now(), loc = 'fr-FR') {
  const ecart = Math.round((minuit(maintenant).getTime() - minuit(t).getTime()) / 86400000);
  if (ecart === 0) return tr('Auj.');
  if (ecart === 1) return tr('Hier');
  const mot = new Date(t).toLocaleDateString(loc, { weekday: 'short' }).replace(/\./g, '');
  return mot.charAt(0).toUpperCase() + mot.slice(1);
}

/* ════════════ Les réglages et la fiche technique ════════════ */

/* Ce qu'on règle d'abord sur un robot ; le reste existe, replié. */
const REGLAGE_PRINCIPAL = /work_mode|mode_de_travail|water|(^|[_ ])eau([_ ]|$)|debit|suction|aspiration|carpet|tapis|obstacle|resume|reprise|blade_height|hauteur_des_lames|cutting_height|rain|pluie|wildlife|faune|night|nuit|dnd|do_not_disturb|child_lock|edge|border|bordure|clean_preference|preference/;
/* Ce qui n'est pas un réglage du travail du robot. */
const REGLAGE_SECONDAIRE = /voice|voix|volume|bluetooth|cloud|led|light|eclairage|map_offset|decalage|update|mise_a_jour|inch|pouce|webrtc|camera/;

/**
 * Les réglages du robot : les interrupteurs, listes et nombres de son appareil.
 * Les zones d'une tondeuse n'en sont pas (ce sont des choix de départ). Les
 * `principaux` sont ceux qui changent le travail ; les `autres` se déplient.
 */
export function reglagesRobot(soeurs) {
  const zones = new Set(zonesTondeuse(soeurs).map(z => z.id));
  const tous = (soeurs || []).filter(s => vivant(s) && !zones.has(s.id) && ['switch', 'select', 'number'].indexOf(s.domaine) >= 0).map(s => {
    const a = s.attributs || {};
    if (s.domaine === 'switch') return { id: s.id, type: 'bascule', nom: s.nom, texte: s.texte, actif: s.etat === 'on' };
    if (s.domaine === 'select') return { id: s.id, type: 'choix', nom: s.nom, texte: s.texte, valeur: s.etat, options: Array.isArray(a.options) ? a.options : [] };
    return { id: s.id, type: 'nombre', nom: s.nom, texte: s.texte, valeur: nombre(s.etat), min: nombre(a.min), max: nombre(a.max), pas: nombre(a.step) || 1, unite: s.unite || null };
  }).filter(r => r.type !== 'choix' || r.options.length > 1).filter(r => r.type !== 'nombre' || r.valeur != null);
  const principaux = tous.filter(r => REGLAGE_PRINCIPAL.test(r.texte) && !REGLAGE_SECONDAIRE.test(r.texte)).slice(0, 8);
  const pris = new Set(principaux.map(r => r.id));
  return { principaux, autres: tous.filter(r => !pris.has(r.id)) };
}

/** La qualité d'un signal Wi-Fi, en mots. */
export function qualiteSignal(dbm) {
  const n = nombre(dbm);
  if (n == null) return null;
  return n >= -60 ? tr('excellent') : n >= -70 ? tr('bon') : n >= -80 ? tr('moyen') : tr('faible');
}

/** La fiche technique : modèle, micrologiciel, Wi-Fi — ce que l'appareil en dit. */
export function ficheTechnique(appareil, soeurs) {
  const lignes = [];
  const a = appareil || {};
  const modele = [a.manufacturer, a.model].filter(Boolean).join(' ');
  if (modele) lignes.push({ cle: 'modele', nom: tr('Modèle'), valeur: modele });
  const maj = (soeurs || []).find(s => s.domaine === 'update' && s.attributs && s.attributs.installed_version);
  const micro = a.firmware || (maj && maj.attributs.installed_version) || null;
  if (micro) lignes.push({ cle: 'micrologiciel', nom: tr('Micrologiciel'), valeur: String(micro) });
  const wifi = (soeurs || []).find(s => s.domaine === 'sensor' && s.classe === 'signal_strength' && vivant(s) && /wi_?fi|wlan|rssi/.test(s.texte) && !/ble|bluetooth|mnet|mobile/.test(s.texte));
  if (wifi && nombre(wifi.etat) != null) lignes.push({ cle: 'wifi', nom: tr('Wi-Fi'), valeur: Math.round(nombre(wifi.etat)) + ' ' + (wifi.unite || 'dBm') + ' · ' + qualiteSignal(wifi.etat) });
  return lignes;
}

/* ════════════ Le planning (ADR 0043) ════════════
 *
 * Aucun robot ne publie son planning : c'est Loggia qui le tient, côté serveur
 * (`custom_components/loggia/robots.py`), et qui lance le robot à l'heure. Ici,
 * seulement ce que l'écran en calcule. Côté serveur lundi vaut 0 — le
 * `weekday()` de Python —, et non dimanche comme le `getDay()` du navigateur.
 */

/** Le jour d'une date, lundi = 0. */
export const jourPlanning = (date) => (new Date(date).getDay() + 6) % 7;

/** Les sept jours dans l'ordre de la langue : `premier` vaut 1 (lundi) à 7 (dimanche). */
export function ordreJours(premier = 1) {
  const d = (((Number(premier) || 1) - 1) % 7 + 7) % 7;
  return Array.from({ length: 7 }, (_, i) => (d + i) % 7);
}

/** Le nom d'un jour (0 = lundi) dans la langue : « L », « lun », « lundi ». */
export function nomJour(j, loc = 'fr-FR', forme = 'narrow') {
  // Le 1er janvier 2024 est un lundi.
  const mot = new Date(2024, 0, 1 + j).toLocaleDateString(loc, { weekday: forme }).replace(/\./g, '');
  return mot.charAt(0).toUpperCase() + mot.slice(1);
}

export const heureValide = (hhmm) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(hhmm == null ? '' : hhmm));
const minutesDe = (hhmm) => { if (!heureValide(hhmm)) return null; const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };

/** « Tous les jours », « En semaine », « Le week-end », sinon les jours courts dans l'ordre de la langue. */
export function resumeJours(jours, premier = 1, loc = 'fr-FR') {
  const retenus = new Set((jours || []).filter(j => Number.isInteger(j) && j >= 0 && j <= 6));
  if (!retenus.size) return tr('Aucun jour');
  if (retenus.size === 7) return tr('Tous les jours');
  const cle = [...retenus].sort().join('');
  if (cle === '01234') return tr('En semaine');
  if (cle === '56') return tr('Le week-end');
  return ordreJours(premier).filter(j => retenus.has(j)).map(j => nomJour(j, loc, 'short')).join(' · ');
}

/**
 * Ce qu'un planning vise : ses zones par leur nom ; sans zone, tout — sauf une
 * tondeuse à interrupteurs d'aire, qui tond alors celles qui sont allumées.
 */
export function resumeZones(planning, { domaine = 'vacuum', aDesAires = false } = {}) {
  const zones = (planning && planning.zones) || [];
  if (zones.length) return zones.map(z => z.nom).join(' · ');
  if (domaine === 'lawn_mower') return aDesAires ? tr('Les zones allumées') : tr('Tout le jardin');
  return tr('Tout le logement');
}

/** Une zone de la vue, telle que le planning la garde. */
export const zonePlanning = (z) => ({ id: z.id, nom: z.nom, segments: ((z.piece && z.piece.segments) || []).map(Number).filter(n => Number.isInteger(n)) });

/** Un planning neuf : les jours ouvrés, neuf heures, tout le logement. */
export function nouveauPlanning(idRobot, maintenant = Date.now()) {
  return { id: 'p' + Math.floor(Number(maintenant)).toString(36), robot: idRobot, heure: '09:00', jours: [0, 1, 2, 3, 4], zones: [], actif: true };
}

/** Le prochain départ d'un robot : la première échéance STRICTEMENT après maintenant. */
export function prochainPassage(plannings, idRobot, maintenant = Date.now()) {
  const m = new Date(maintenant);
  let mieux = null;
  (plannings || []).forEach(p => {
    if (!p || !p.actif || p.robot !== idRobot) return;
    const min = minutesDe(p.heure);
    if (min == null) return;
    const jours = new Set(p.jours || []);
    const dans = (k) => new Date(m.getFullYear(), m.getMonth(), m.getDate() + k, Math.floor(min / 60), min % 60, 0, 0);
    // Huit jours : si l'heure d'aujourd'hui est passée, le même jour revient dans sept.
    const k = [0, 1, 2, 3, 4, 5, 6, 7].find(n => dans(n).getTime() > m.getTime() && jours.has(jourPlanning(dans(n))));
    if (k == null) return;
    if (!mieux || dans(k).getTime() < mieux.date.getTime()) mieux = { date: dans(k), planning: p };
  });
  return mieux;
}

/** « Auj. 18:30 », « Demain 09:30 », « Lun 09:30 ». */
export function etiquetteProchain(t, maintenant = Date.now(), loc = 'fr-FR') {
  const ecart = Math.round((minuit(t).getTime() - minuit(maintenant).getTime()) / 86400000);
  const heure = new Date(t).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  return (ecart === 0 ? tr('Auj.') : ecart === 1 ? tr('Demain') : nomJour(jourPlanning(t), loc, 'short')) + ' ' + heure;
}

/** Une heure tombe-t-elle dans une plage {actif, debut, fin} ? La plage peut enjamber minuit. */
export function dansLaPlage(plage, hhmm) {
  if (!plage || !plage.actif) return false;
  const d = minutesDe(plage.debut), f = minutesDe(plage.fin), t = minutesDe(hhmm);
  if (d == null || f == null || t == null || d === f) return false;
  return d < f ? (t >= d && t < f) : (t >= d || t < f);
}

/** L'interrupteur de pluie de l'appareil, s'il en a un : le robot rentre alors de lui-même. */
export function capteurPluie(soeurs) {
  const s = (soeurs || []).find(x => x.domaine === 'switch' && vivant(x) && /rain|pluie/.test(x.texte));
  return s ? { id: s.id, nom: s.nom, actif: s.etat === 'on' } : null;
}
