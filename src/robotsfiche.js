/* ── Ce que la popup d'un robot seule calcule (ADR 0042 ; chantier IoT, tâche 1) ──────────────
 *
 * La fiche d'un robot — aspirateur ou tondeuse — lit ici ses entités sœurs, ses pièces et ses aires, son
 * entretien, ses compteurs, ses sessions, ses réglages, sa fiche technique et ce que vise un passage
 * planifié. Tout cela vivait dans `robots.js`, au démarrage, quand la seule popup l'emploie : chargé avec
 * elle (`ficherobot.jsx`, à la demande), il rend sa place aux cartes (§ 12 de la conception).
 *
 * Deux robots ne se ressemblent pas. Un aspirateur annonce des pièces et cinq consommables en
 * pourcentage ; une tondeuse, des zones qui sont des interrupteurs, des lames comptées en heures, une
 * hauteur de coupe. Rien n'est donc écrit en dur : tout se lit dans les entités SŒURS du robot — celles du
 * même appareil —, reconnues à leur clé de traduction (la même dans toutes les langues), à défaut à leur
 * identifiant. Et rien ne s'invente : une mesure que l'appareil ne publie pas ne se dessine pas.
 */
import { tr, trN, trSens, locale, comparerTextes } from './i18n.js';
import { sansAccents } from './outils.js';
import { phaseRobot, dureeLisible, heureValide } from './robots.js';
import { quandLumiere } from './lumieres.js';
import { mot } from './journalmots.js';

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
  return out.sort((x, y) => comparerTextes(x.id, y.id));
}

const vivant = (s) => s && s.etat != null && s.etat !== 'unavailable' && s.etat !== 'unknown' && s.etat !== '';

/* ════════════ Le geste ════════════ */

/* Le bit `VacuumEntityFeature.CLEAN_AREA` (Home Assistant ≥ 2026.3) : le seul signal public qu'un robot sait viser des pièces. */
export const CLEAN_AREA = 16384;
/* Home Assistant ≥ 2026.3 : `vacuum.clean_area`, l'association pièces ↔ zones, et deebot-client 18 (une LISTE pour `spot_area`). */
const VERSION_ZONES = [2026, 3];

/** `hass.config.version` (« 2026.10.1 ») est-elle ≥ 2026.3 ? Inconnue — un stub, une démo — : le monde d'aujourd'hui, oui. */
export function versionRecente(version) {
  const m = /^\s*(\d+)\.(\d+)/.exec(String(version == null ? '' : version));
  if (!m) return true;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a > VERSION_ZONES[0] || (a === VERSION_ZONES[0] && b >= VERSION_ZONES[1]);
}

/**
 * La commande qui nettoie des PIÈCES, telle que l'intégration du robot
 * l'attend. Il n'existe pas de service commun : chaque intégration a le sien.
 * Inconnue, ou service absent de l'installation : `null` — la vue ne propose
 * alors pas de départ par pièces plutôt que d'envoyer une commande au hasard.
 *
 * Ecovacs (tranche robots 2 ; R1, R4, sa réponse Q2 A) : `spot_area` avec une LISTE sur un Home Assistant récent quand le robot
 * a le bit CLEAN_AREA — deebot-client 18 parcourait la chaîne « 1,3 » caractère par caractère —, une chaîne avant 2026.3 ; sans le
 * bit sur un Home Assistant récent, l'intégration refuse `spot_area` : s'il PUBLIE ses pièces (`rooms`), l'exception NOMMÉE de ses
 * scripts — `clean_V2` / `freeClean`, « <passages>,<segment>,… », le compteur de passages de l'appareil en tête —, sinon rien.
 * Roborock, Dreame et Xiaomi ne changent pas : le bit ne conditionne pas leur service.
 */
export function commandeZones({ plateforme = null, services = null, idRobot = null, segments = [], bits = 0, versionHa = null, publie = false, passages = 1 } = {}) {
  const segs = (segments || []).map(Number).filter(n => !isNaN(n));
  if (!idRobot || !segs.length) return null;
  // Sans liste de services (composant absent), on ne peut pas vérifier : on fait confiance à la plateforme.
  const existe = (domaine, service) => !services || !services[domaine] || !!services[domaine][service];
  if (plateforme === 'ecovacs') {
    const envoi = (command, params) => ({ domaine: 'vacuum', service: 'send_command', data: { entity_id: idRobot, command, params } });
    if (!versionRecente(versionHa)) return envoi('spot_area', { rooms: segs.join(','), cleanings: 1 });
    if ((Number(bits) || 0) & CLEAN_AREA) return envoi('spot_area', { rooms: segs, cleanings: 1 });
    if (!publie) return null;
    const n = Number.isInteger(passages) && passages >= 1 && passages <= 10 ? passages : 1;
    return envoi('clean_V2', { act: 'start', content: { type: 'freeClean', value: [n, ...segs].join(',') } });
  }
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

/** Le niveau d'une pièce d'usure (I20, sa maquette 1d) : bas sous 15 % (le rouge), moyen sous 35 % (l'ambre), bon au-delà (neutre). */
export function niveauUsure(pct) {
  if (pct == null) return null;
  return pct < 15 ? 'bas' : pct < 35 ? 'moyen' : 'bon';
}

const heures = (n) => { const r = n >= 10 ? Math.round(n) : Math.round(n * 10) / 10; return r.toLocaleString(locale(), { maximumFractionDigits: 1 }); };

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

const presse = (p) => p && (p.niveau === 'bas' || p.niveau === 'moyen');

/** Ce qui presse : la pièce la plus usée, si elle est sous 35 % — la rouge comme l'ambre (I16, I20). */
export function alerteEntretien(pieces) {
  const bas = (pieces || []).filter(presse).sort((a, b) => a.pct - b.pct);
  return bas.length ? bas[0] : null;
}

/**
 * La phrase de l'Entretien (I20 ; sa maquette 1d, au vouvoiement) : « 2 pièces à changer bientôt. » sous 35 %, et sa seconde
 * moitié — « Touchez « Remplacé » … » — seulement si l'appareil a un bouton de remise à zéro. Tout au-dessus de 35 % : RIEN (null),
 * jamais un « Tout va bien » permanent (passe bis du 18/10, point 15) — « Tout est en ordre. » part.
 */
export function phraseEntretien(pieces) {
  const liste = pieces || [];
  const n = liste.filter(presse).length;
  const bouton = liste.some(p => p && p.reset);
  if (!n) return null;
  return trN(n, '{n} pièce à changer bientôt.', '{n} pièces à changer bientôt.') + (bouton ? ' ' + tr('Touchez « Remplacé » après l’intervention : son compteur repart à 100 %.') : '');
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

/** L'étiquette d'un jour de session : « Auj. », « Hier », sinon le jour court. */
export function etiquetteJour(t, maintenant = Date.now(), loc = 'fr-FR') {
  const ecart = Math.round((minuit(maintenant).getTime() - minuit(t).getTime()) / 86400000);
  if (ecart === 0) return tr('Auj.');
  if (ecart === 1) return tr('Hier');
  const mot = new Date(t).toLocaleDateString(loc, { weekday: 'short' }).replace(/\./g, '');
  return mot.charAt(0).toUpperCase() + mot.slice(1);
}

/**
 * Les rangées de l'Historique (I19 ; sa maquette 1d) : la session en cours en tête, puis chaque passage, du plus récent au plus
 * ancien. `quoi` : ses pièces (« Salon · Cuisine »), « Tout le logement » (« Tout le jardin »), sinon « Nettoyage » (« Tonte ») —
 * des pièces que la source ne sait pas ne s'inventent pas ; `ligne` : « 08:30 · 51 min », « Depuis 16:40 » pour la session en
 * cours ; `motif` : pourquoi il s'est arrêté, s'il est connu ; `mot` et `encre` : « Terminé » neutre, « Interrompu » ambre,
 * « Erreur » rouge — en cours, « En cours », « En pause » ou « Retour », dans la teinte du robot.
 */
export function rangeesHistorique(sessions, { domaine = 'vacuum', maintenant = Date.now(), loc = 'fr-FR' } = {}) {
  const tondeuse = domaine === 'lawn_mower';
  const rang = (s) => (s.issue === 'en_cours' ? 1 : 0);
  return (sessions || []).filter(Boolean).slice().sort((a, b) => rang(b) - rang(a) || b.debut - a.debut).map(s => {
    const zones = (Array.isArray(s.zones) ? s.zones : []).map(z => z && z.nom).filter(Boolean);
    /* « Tout le jardin » l'emporte sur la liste quand ce sont toutes ses aires (passe bis du 18/10, point 2) ; le nom du script maison
     * qui l'a lancé (point A) dit un passage dont les pièces ne se savent pas. */
    const quoi = s.tout ? (tondeuse ? tr('Tout le jardin') : tr('Tout le logement')) : zones.length ? zones.join(' · ')
      : s.libelle ? s.libelle : tondeuse ? tr('Tonte') : tr('Nettoyage');
    // L'heure dans la langue choisie (`heureDe`, par `locale()`), pas dans celle du navigateur.
    const heure = heureDe(s.debut);
    const cours = s.issue === 'en_cours';
    const mot = !cours ? motIssue(s.issue) : s.phase === 'pause' ? tr('En pause') : s.phase === 'retour' ? trSens('Retour · vers la base') : tr('En cours');
    const encre = cours ? 'var(--rb-doux)' : s.issue === 'termine' ? 'var(--o-text2)' : s.issue === 'erreur' ? 'var(--o-bad)' : 'var(--o-warn)';
    return { cle: String(s.debut), badge: etiquetteJour(s.debut, maintenant, loc), quoi, ligne: cours ? tr('Depuis {h}', { h: heure }) : heure + ' · ' + dureeLisible(s.dureeMin),
      motif: s.motif || null, surface: s.surface == null ? null : s.surface, mot, encre };
  });
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

/* ════════════ Ce que vise un passage planifié (ADR 0043) ════════════ */

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

/** Une zone de la vue, telle que le planning la garde : ses segments — ou, pour une zone de Home Assistant, l'identifiant de la
 *  zone (`zone`, R5), qui ne change jamais, quand les segments changent avec la carte. */
export const zonePlanning = (z) => (z.piece && typeof z.piece.zone === 'string' && z.piece.zone
  ? { id: z.id, nom: z.nom, segments: [], zone: z.piece.zone }
  : { id: z.id, nom: z.nom, segments: ((z.piece && z.piece.segments) || []).map(Number).filter(n => Number.isInteger(n)) });

/** Une heure « HH:MM » décalée de `minutes` sur le cadran de 24 h : « De − 22:00 + à − 07:00 + » va par pas de 30 min (I18). Une
 * heure illisible revient telle quelle. */
export function decalerHeure(hhmm, minutes) {
  if (!heureValide(hhmm)) return hhmm;
  const [h, m] = String(hhmm).split(':').map(Number);
  const n = (((h * 60 + m + Math.round(Number(minutes) || 0)) % 1440) + 1440) % 1440;
  return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
}

/** Un planning neuf : les jours ouvrés, neuf heures, tout le logement. */
export function nouveauPlanning(idRobot, maintenant = Date.now()) {
  return { id: 'p' + Math.floor(Number(maintenant)).toString(36), robot: idRobot, heure: '09:00', jours: [0, 1, 2, 3, 4], zones: [], actif: true };
}

/** « Auj. 18:30 », « Demain 09:30 », « Mar. 09:30 » — le jour court de la langue, son point compris, comme sa maquette (passe bis
 *  du 18/10, point 13 ; l'anglais n'en met pas : « Tue 09:30 »). */
export function etiquetteProchain(t, maintenant = Date.now(), loc = 'fr-FR') {
  const ecart = Math.round((minuit(t).getTime() - minuit(maintenant).getTime()) / 86400000);
  const heure = new Date(t).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  const jour = () => { const mot = new Date(t).toLocaleDateString(loc, { weekday: 'short' }); return mot.charAt(0).toUpperCase() + mot.slice(1); };
  return (ecart === 0 ? tr('Auj.') : ecart === 1 ? tr('Demain') : jour()) + ' ' + heure;
}

/* ════════════ L'Accueil (chantier IoT, I16 ; § 7.6) ════════════ */

const heureDe = (t) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

/**
 * Le panneau de tête de l'Accueil : le mot d'état (24 / 800, en teinte au travail) et sa phrase (12,5, `--o-text2`) — ce que
 * fait le robot, avec ce qu'en sait le carnet (§ 7.6) :
 *  - sur la base, ou arrêté ailleurs : « Choisissez où, ou lancez tout. » quand la popup offre « Où » (`choisir`) ;
 *  - au travail : « Salon, Cuisine · 42 m² depuis 16:40 » ; sans surface, « Salon, Cuisine · depuis 16:40 » ; sans pièces connues,
 *    « 42 m² depuis 16:40 », ou « depuis 16:40 » seul ;
 *  - en pause : « Salon, Cuisine · 42 m² faits », ses pièces seules, ou la surface seule ;
 *  - au retour : « Il rentre se recharger » ; il bipe : « Suivez le son » ; en erreur : le message de l'appareil ;
 *  - muet : « Indisponible » et depuis quand — sans couleur d'alerte : le liseré le dit, seul (ADR 0048).
 * `pieces`, `tout`, `libelle` : le passage selon le carnet (ou l'onglet qui l'a lancé) ; `surface` : la sienne, ou celle que publie son
 * capteur ; `depuis` : le début du passage (ms) — pour un robot muet, l'instant où il s'est tu. Rend `{ mot, encre, phrase }`.
 */
export function etatAccueil({ domaine = 'vacuum', phase = 'absent', bipe = false, erreur = null, pieces = null, tout = false, libelle = null, charge = false,
  surface = null, unite = 'm²', depuis = null, choisir = false, maintenant = Date.now() } = {}) {
  const tondeuse = domaine === 'lawn_mower';
  // Au repos, le mot d'état prend l'encre de sa maquette, le texte (`stateInk`, passe bis du 18/10, point 13).
  const gris = 'var(--o-text)';
  if (phase === 'absent') {
    const q = depuis != null ? quandLumiere(new Date(depuis).toISOString(), maintenant) : null;
    return { mot: tr('Indisponible'), encre: 'var(--o-text2)', phrase: q ? tr('Depuis {h}', { h: q }) : null };
  }
  if (bipe) return { mot: tr('Il bipe'), encre: 'var(--o-accent-soft)', phrase: tr('Suivez le son') };
  if (phase === 'erreur') return { mot: tr('En erreur'), encre: 'var(--o-bad)', phrase: erreur || null };
  // Le nom du script maison qui l'a lancé (point A) dit un passage dont les pièces ne se savent pas.
  const p = Array.isArray(pieces) && pieces.length ? pieces.join(', ') : tout ? (tondeuse ? tr('Tout le jardin') : tr('Tout le logement')) : libelle || null;
  const s = surface != null ? surface + ' ' + unite : null;
  if (phase === 'travail') {
    const h = depuis != null ? heureDe(depuis) : null;
    const phrase = !h ? (p && s ? tr('{p} · {s}', { p, s }) : p || s)
      : p && s ? tr('{p} · {s} depuis {h}', { p, s, h }) : p ? tr('{p} · depuis {h}', { p, h }) : s ? tr('{s} depuis {h}', { s, h }) : tr('depuis {h}', { h });
    return { mot: tondeuse ? tr('Tonte en cours') : tr('Nettoyage en cours'), encre: tondeuse ? 'var(--o-ok)' : 'var(--o-accent-soft)', phrase: phrase || null };
  }
  if (phase === 'pause') return { mot: tr('En pause'), encre: gris, phrase: p && s ? tr('{p} · {s} faits', { p, s }) : s ? tr('{s} faits', { s }) : p };
  if (phase === 'retour') return { mot: tr('Retour à la base'), encre: gris, phrase: tr('Il rentre se recharger') };
  const choix = choisir ? tr('Choisissez où, ou lancez tout.') : null;
  if (phase === 'base') return { mot: charge ? tr('Sur la base · en charge') : tr('Sur la base'), encre: gris, phrase: choix };
  return { mot: tr('À l’arrêt'), encre: gris, phrase: choix };
}

/** La puce principale d'un départ (I16) : « Nettoyer tout le logement », « Nettoyer 2 pièces » ; « Tondre tout le jardin », « Tondre 1 zone ». */
export function libelleDepart(domaine, n = 0) {
  if (domaine === 'lawn_mower') return n ? trN(n, 'Tondre {n} zone', 'Tondre {n} zones') : tr('Tondre tout le jardin');
  return n ? trN(n, 'Nettoyer {n} pièce', 'Nettoyer {n} pièces') : tr('Nettoyer tout le logement');
}

/**
 * Les passages du carnet d'un robot (robots_carnet.py, en secondes), en sessions de l'écran (ms) : la session en cours d'abord
 * (`fin` null, issue `en_cours`), puis les passages, du plus récent au plus ancien. `null` : le serveur n'a pas de carnet — un
 * composant d'avant ce chantier —, l'écran lit alors l'historique d'état (`sessionsRobot`).
 */
export function sessionsCarnet(etat, robot) {
  const e = etat && typeof etat === 'object' ? etat : null;
  if (!e || !Array.isArray(e.passages)) return null;
  const s = e.en_cours && typeof e.en_cours === 'object' ? e.en_cours[robot] : null;
  const zones = (z) => (Array.isArray(z) ? z : []);
  const libelle = (x) => (typeof x.libelle === 'string' && x.libelle) || null;
  const cours = s ? [{ debut: s.debut * 1000, fin: null, dureeMin: Number(s.duree_min) || 0, surface: s.surface == null ? null : Math.round(s.surface), issue: 'en_cours',
    phase: s.phase, zones: zones(s.zones), tout: !!s.tout, source: s.source || null, motif: null, libelle: libelle(s) }] : [];
  return [...cours, ...e.passages.filter(p => p && p.robot === robot).map(p => ({ debut: p.debut * 1000, fin: p.fin * 1000, dureeMin: Number(p.duree_min) || 0,
    surface: p.surface == null ? null : Math.round(p.surface), issue: p.issue, zones: zones(p.zones), tout: !!p.tout, source: p.source || null, motif: p.motif || null, libelle: libelle(p) }))];
}

/** Le nom d'un script maison de l'aspirateur, tel que le passage le dit (passe bis du 18/10, point A) : son nom dans Home Assistant,
 *  sans celui du robot devant (« Robot - Nettoyer partout » se dit « Nettoyer partout »), la première lettre en capitale — la règle
 *  du serveur (`nom_de_script`, robots.py). */
export function nomDeScript(st, nomRobot = '') {
  const a = (st && st.attributes) || {};
  const objet = st && typeof st.entity_id === 'string' ? st.entity_id.slice(st.entity_id.indexOf('.') + 1).replace(/_/g, ' ') : '';
  let nom = String(a.friendly_name || objet).trim();
  const robot = String(nomRobot || '').trim();
  if (robot && sansAccents(nom).indexOf(sansAccents(robot)) === 0 && nom.length > robot.length + 1) nom = nom.slice(robot.length).replace(/^[\s·:–-]+/, '');
  return nom ? (nom.charAt(0).toUpperCase() + nom.slice(1)).slice(0, 60) : null;
}

/**
 * Les sept derniers jours (I19) : les 7 × 24 h qui finissent maintenant, la session en cours comprise — un passage compte s'il
 * finit dans la fenêtre. Rend `{ n, dureeMin, surface, sessions }` ; `surface` vaut null si aucun passage n'en publie.
 */
export function septJours(sessions, maintenant = Date.now()) {
  const depuis = maintenant - 7 * 86400000;
  const dans = (sessions || []).filter(s => s && (s.fin == null || s.fin >= depuis));
  const aSurface = dans.some(s => s.surface != null);
  return { n: dans.length, dureeMin: dans.reduce((a, s) => a + (s.dureeMin || 0), 0), surface: aSurface ? Math.round(dans.reduce((a, s) => a + (s.surface || 0), 0)) : null, sessions: dans };
}

/**
 * Le dernier passage du planning que le serveur a RETENU, s'il date de moins de `fenetre` ms (un jour) : `{ heure, pourquoi }` — l'heure
 * du passage et sa cause, dans la langue de l'écran (le journal du module, `loggia/robots/etat`) —, ou null. Un passage parti depuis
 * l'efface : seul le DERNIER passage du planning de ce robot compte (passe bis 2 du 18/10, point I — « pourquoi n'est-il pas parti ce
 * matin ? » se lisait au Journal seulement).
 */
export function passageRetenu(etat, robot, maintenant = Date.now(), fenetre = 86400000) {
  const journal = etat && Array.isArray(etat.journal) ? etat.journal : [];
  const e = journal.find(x => x && x.regle === 'planning' && Array.isArray(x.cibles) && x.cibles.indexOf(robot) >= 0);
  const age = e ? maintenant - Number(e.ts) * 1000 : NaN;
  if (!e || e.quoi !== 'retenu' || !(age >= 0 && age <= fenetre)) return null;
  const g = e.g && Array.isArray(e.g.motif) && Array.isArray(e.g.motif[0]) ? e.g.motif[0][1] : null;
  const pourquoi = mot(e, 'detail');
  return pourquoi ? { heure: (g && heureValide(g.heure) && g.heure) || heureDe(Number(e.ts) * 1000), pourquoi } : null;
}

/** La tuile « Prochain passage » (I16) : « Auj. 09:30 » et ce qu'il nettoie — le premier qui PARTIRA —, sinon « Aucun » · « Rien de planifié ». */
export function tuileProchain(prochain, { domaine = 'vacuum', aDesAires = false, maintenant = Date.now(), loc = 'fr-FR' } = {}) {
  if (!prochain || !prochain.date) return { titre: tr('Aucun'), sous: tr('Rien de planifié') };
  return { titre: etiquetteProchain(prochain.date, maintenant, loc), sous: resumeZones(prochain.planning, { domaine, aDesAires }) };
}

/** La tuile « 7 derniers jours » (I16, I19) : « 129 m² » · « 3 passages · 2 h 47 » ; sans surface, la durée · « 3 passages ». */
export function tuileSemaine(resume, unite = 'm²') {
  const r = resume || { n: 0, dureeMin: 0, surface: null };
  const passages = trN(r.n, '{n} passage', '{n} passages');
  return r.surface != null ? { titre: r.surface + ' ' + unite, sous: passages + ' · ' + dureeLisible(r.dureeMin) } : { titre: dureeLisible(r.dureeMin), sous: passages };
}

/** L'interrupteur de pluie de l'appareil, s'il en a un : le robot rentre alors de lui-même. Celui de clé `rain_detection` passe
 * avant tout autre (I18) : un appareil en a parfois plusieurs, et le premier venu — « pendant la tonte », éteint — n'est pas la
 * détection. */
export function capteurPluie(soeurs) {
  const pluies = (soeurs || []).filter(x => x.domaine === 'switch' && vivant(x) && /rain|pluie/.test(x.texte));
  const s = pluies.find(x => x.cle === 'rain_detection') || pluies[0];
  return s ? { id: s.id, nom: s.nom, actif: s.etat === 'on' } : null;
}

/* ════════════ Les pièces sans rien configurer (tranche robots 2 ; ADR 0218) ════════════
 *
 * Depuis Home Assistant 2026.3, les pièces d'un robot sont les ZONES de Home Assistant que l'on a associées à ses segments, une
 * fois, dans les réglages de l'entité ; le serveur les lit (`loggia/robots/etat`, `pieces` par robot — R3) et le départ part par
 * `vacuum.clean_area` (R4). Trois sources, dans cet ordre (R2 ; sa réponse Q1 A) : ses interrupteurs et son script (la règle
 * d'aujourd'hui, `parInterrupteurs` — ils gardent la main), les zones de Home Assistant, ce que le robot publie (`rooms`). Rien ici
 * ne touche au démarrage : la popup seule lit ces fonctions. */

/* La palette des pièces nouvelles (I17 ; `MED_COLORS`, state.js) : des jetons, les mêmes, dans le même ordre — un test de source les
 * tient ensemble (tests/robots_pieces.test.mjs). Recopiée plutôt qu'exportée de state.js : l'export y entrait au démarrage. */
export const COULEURS_ZONES = ['var(--o-cyan)', 'var(--o-cold)', 'var(--o-purple)', 'var(--o-ok)', 'var(--o-piece-ambre)', 'var(--o-piece-tendre)', 'var(--o-piece-bain)', 'var(--o-accent)'];

/** Le compteur de passages de l'appareil (`number` de clé `clean_count`, Ecovacs) : le nombre en tête de l'exception `clean_V2`
 *  (Q2 A) ; illisible, un passage. */
export function passagesRobot(soeurs) {
  const s = (soeurs || []).find(x => x.domaine === 'number' && x.cle === 'clean_count' && vivant(x));
  const n = s ? Math.round(nombre(s.etat)) : null;
  return n != null && n >= 1 && n <= 10 ? n : 1;
}

/** Le robot publie-t-il ses pièces en ce moment (`rooms`, des numéros de segment) ? Un `rooms` intermittent vide ne publie rien (Q2) ;
 *  ni `null`, ni une chaîne, ni un booléen ne sont un numéro — comme le serveur (`_entiers`, passe bis du 20/10, point 7). */
export function publieRooms(st) {
  const brut = st && st.attributes && st.attributes.rooms;
  if (!brut || typeof brut !== 'object') return false;
  return Object.values(brut).some(v => (Array.isArray(v) ? v : [v]).some(x => typeof x === 'number' && Number.isInteger(x)));
}

const plat = (s) => sansAccents(s).trim();

/* Les teintes qu'une pièce de Loggia peut choisir (`TEINTES_PIECE`, App.jsx ; la fiche « Ajouter une pièce ») : les mêmes
 * identifiants, les mêmes jetons — un test de source les tient ensemble (tests/robots_pieces.test.mjs). Recopiée plutôt
 * qu'exportée d'App.jsx : l'export y entrait au démarrage (R6, passe bis du 20/10, point 10). */
export const TEINTES_ZONES = { accent: 'var(--o-accent-soft)', ambre: 'var(--o-piece-ambre)', tendre: 'var(--o-piece-tendre)', chambre: 'var(--o-piece-chambre)', bain: 'var(--o-piece-bain)', vert: 'var(--o-piece-vert)' };

/**
 * Les puces de « Où » depuis les zones de Home Assistant (`etat.pieces[robot].zones`, R6) : le nom de la zone, telle que Home
 * Assistant la nomme ; sa couleur et son icône sont celles CHOISIES d'une pièce de Loggia du même NOM (`loggia_rooms[].teinte`, `.icon`
 * — une pièce de Loggia n'a pas d'`area`, elle se rattache par son nom, sans accents ni casse — ou par la ZONE de ses capteurs,
 * `haid.temp` et `haid.humidity` lus dans l'index (`areaOf`), comme la barre des pièces (`RoomNav`, App.jsx) : une pièce de Loggia
 * nommée autrement que sa zone garde sa teinte — passe bis 2 du 20/10, sans un octet au démarrage : l'index est déjà là), sinon
 * celles d'une pièce configurée du même nom (`vacuumRooms`, par son nom ou par la zone), sinon la palette des pièces dans l'ordre
 * des puces — stable tant que la liste ne change pas. L'ordre (§ 3.1) : les pièces de Loggia d'abord, dans leur ordre, puis celui du
 * serveur (étage, nom). `piece` porte ce que le planning garde (R5) et ce que la migration du plan lit (R7).
 */
export function piecesDeLaVue(pieces, rooms = [], loggiaRooms = null, index = null) {
  const zones = pieces && Array.isArray(pieces.zones) ? pieces.zones : [];
  const configurees = Array.isArray(rooms) ? rooms.filter(Boolean) : [];
  const loggia = (Array.isArray(loggiaRooms) ? loggiaRooms : []).filter(r => r && typeof r.room === 'string' && r.room);
  const zonesDe = (r) => (index && typeof index.areaOf === 'function' && r.haid && typeof r.haid === 'object'
    ? [r.haid.temp, r.haid.humidity].filter(Boolean).map(h => index.areaOf(h)).filter(Boolean) : []);
  const lie = (r, z) => plat(r.room) === plat(z.nom) || zonesDe(r).indexOf(z.zone) >= 0;
  const rang = (z) => { const i = loggia.findIndex(r => lie(r, z)); return i < 0 ? loggia.length : i; };
  const propres = zones.filter(z => z && typeof z.id === 'string' && typeof z.zone === 'string');
  return propres.map((z, i) => ({ z, i })).sort((a, b) => rang(a.z) - rang(b.z) || a.i - b.i).map(({ z }, i) => {
    const segments = Array.isArray(z.segments) ? z.segments.map(String) : [];
    const perso = loggia.find(r => lie(r, z)) || null;
    const teinte = perso && typeof perso.teinte === 'string' ? TEINTES_ZONES[perso.teinte] || null : null;
    const conf = configurees.find(r => plat(r.name) === plat(z.nom) || plat(r.id) === plat(z.zone)) || null;
    return { id: z.id, nom: String(z.nom || z.zone), zone: z.zone, segments, couleur: teinte || (conf && conf.color) || COULEURS_ZONES[i % COULEURS_ZONES.length],
      icone: (perso && typeof perso.icon === 'string' && perso.icon) || (conf && conf.icon) || null, piece: { zone: z.zone, segments } };
  });
}

/**
 * Les lignes sous — ou à la place de — « Où » (§ 3.1 de la conception) : `[{ cle, glyphe, encre, texte }]`, dans l'ordre où elles
 * se disent. Rien sans raison (jamais un « Tout va bien ») :
 *  - `scripts` : ses interrupteurs et son script gardent la main (Q1 A) alors qu'une association existe — pour qu'on sache pourquoi
 *    les puces sont les siens et non ses zones ;
 *  - `designer` (sa décision du 20/10) : un script de DÉPART est désigné (`scriptDepart`) sans celui des pièces (`scriptPieces`) —
 *    Loggia ne prend pas la main, aucune puce ; un administrateur lit où désigner son script des pièces (la roue) ;
 *  - `interrupteurs` : le script des pièces est désigné, mais aucune pièce de la maison n'a d'interrupteur (`parInterrupteurs` faux) —
 *    un administrateur lit pourquoi les puces manquent ;
 *  - `association` : le robot sait viser des pièces (le bit), rien n'est associé, et il ne publie pas ses pièces : à un administrateur,
 *    le chemin exact dans Home Assistant ; à un compte ordinaire, la phrase sobre — comme le dialogue de Home Assistant, qui ne lui
 *    montre pas « Configurer » (R14) ;
 *  - `nommer` : le robot publie ses pièces, qui s'offrent par leur commande ; un administrateur lit comment les nommer comme ses
 *    pièces ;
 *  - `carte` : la carte du robot a changé (la réparation de Home Assistant, R9), en ambre, pour tout compte ; les puces restent ;
 *  - `ailleurs` : des pièces sur une autre carte (R11), une ligne par carte, au pluriel de la langue.
 * Avec un script de départ désigné, « carte » et « ailleurs » ne se disent pas (passe bis du 20/10, point 8) : les puces ne sont pas
 * les zones de Home Assistant, il n'y a rien à refaire ni à changer. Sans le bit, Home Assistant n'offre rien à associer : aucune
 * ligne — son cas, un jour sans carte comme un jour avec.
 */
export function lignesPieces({ pieces = null, admin = false, nomRobot = '', parInterrupteurs = false, scriptDepart = false, scriptPieces = false } = {}) {
  if (!pieces || typeof pieces !== 'object') return [];
  const zones = Array.isArray(pieces.zones) ? pieces.zones : [];
  const gris = 'var(--o-text2)';
  const out = [];
  const info = (cle, texte) => out.push({ cle, glyphe: 'info', encre: gris, texte });
  if (scriptDepart || parInterrupteurs) {
    if (parInterrupteurs) { if (zones.length) info('scripts', tr('Vos scripts gardent la main pour les pièces.')); }
    else if (!admin) return out;
    else if (!scriptPieces) info('designer', tr('Désignez votre script des pièces sélectionnées dans la roue : les puces de « Où » seront vos interrupteurs.'));
    else info('interrupteurs', tr('Votre script des pièces est désigné, mais aucune pièce de la maison n’a d’interrupteur : les puces de « Où » ne peuvent pas être les vôtres.'));
    return out;
  }
  if (pieces.capable && !pieces.association) {
    if (pieces.source === 'segments') { if (admin) info('nommer', tr('Associez les pièces aux zones de Home Assistant pour les nommer comme vos pièces.')); }
    else info('association', admin
      ? tr('Associez une fois les pièces du robot aux zones de Home Assistant : Paramètres › Appareils et services › Entités › {robot} › roue › « Associer les segments aux zones ».', { robot: nomRobot || '' })
      : tr('Les pièces du robot ne sont pas encore associées aux zones de Home Assistant.'));
  }
  if (pieces.carte_changee) out.push({ cle: 'carte', glyphe: 'triangle-warning', encre: 'var(--o-warn)', texte: tr('La carte du robot a changé : refaites l’association dans Home Assistant.') });
  (Array.isArray(pieces.autres_cartes) ? pieces.autres_cartes : []).forEach(c => {
    const n = Number(c && c.n) || 0;
    if (n > 0) info('ailleurs', trN(n, '{n} pièce sur une autre carte ({carte}) — changez de carte dans les réglages du robot.', '{n} pièces sur une autre carte ({carte}) — changez de carte dans les réglages du robot.', { carte: String(c.carte || '') }));
  });
  return out;
}

/**
 * La migration du plan coloré (R7) : une association écrite par numéro de segment (`seg:1`, `seg:2-7`) devient la zone de Home
 * Assistant dont un segment porte ce numéro — chez Ecovacs le suffixe « _1 », ailleurs l'identifiant nu — quand UNE seule zone y
 * répond. Aucune n'y répond : elle RESTE telle quelle (un autre étage, un autre aspirateur — passe bis du 20/10, point 6) ; plusieurs
 * y répondent : elle est oubliée et la région redit « ? ». Ce qui est déjà une zone reste. Sans zones de Home Assistant dans `pieces`
 * (la source 3, un serveur d'avant), rien ne bouge. Rend `{ assoc, change }` ; `change` dit si quelque chose a changé, et s'il faut l'écrire.
 */
export function migrerAssociationPlan(assoc, pieces) {
  const entrees = assoc && typeof assoc === 'object' ? Object.entries(assoc) : [];
  const zones = (pieces || []).filter(p => p && typeof p.id === 'string' && p.id.indexOf('zone:') === 0);
  if (!zones.length) return { assoc: Object.fromEntries(entrees), change: false };
  const suffixe = (s) => { const t = String(s); return Number(t.indexOf('_') >= 0 ? t.slice(t.lastIndexOf('_') + 1) : t); };
  const out = {};
  let change = false;
  entrees.forEach(([couleur, id]) => {
    if (typeof id !== 'string' || id.indexOf('seg:') !== 0) { out[couleur] = id; return; }
    const nums = id.slice(4).split('-').map(Number).filter(Number.isInteger);
    const repond = zones.filter(z => (z.segments || []).some(s => nums.indexOf(suffixe(s)) >= 0));
    if (repond.length === 1) { out[couleur] = repond[0].id; change = true; }
    else if (repond.length === 0) out[couleur] = id;
    else change = true;
  });
  return { assoc: out, change };
}

/* ── Les scripts de la maison, par rôle (sa décision du 20/10 : « Mon script garde la main ») ──
 *
 * La roue de la popup désigne un script par rôle dans `loggia_entities.vacuumScripts` — ceux de l'aspirateur PRINCIPAL. Les deux
 * premiers LANCENT un passage (`SCRIPTS_DEPART` du serveur) ; dès que l'un est désigné et présent, Loggia ne prend plus la main sur
 * les pièces. Les quatre autres sont les gestes d'un passage. */
export const ROLES_SCRIPTS = ['nettoyer_tout', 'pieces_selectionnees', 'pause', 'reprendre', 'retour_base', 'localiser'];

/** Le nom d'un rôle, dans la langue de l'écran. */
export function libelleRole(role) {
  return role === 'nettoyer_tout' ? tr('Nettoyer tout le logement') : role === 'pieces_selectionnees' ? tr('Pièces sélectionnées')
    : role === 'pause' ? tr('Mettre en pause') : role === 'reprendre' ? tr('Reprendre') : role === 'retour_base' ? tr('Retour à la base') : tr('Localiser');
}

/** Un script maison qui RÉPOND : désigné (`script.…`), présent dans la maison (`states`), ni `unavailable` ni `unknown` — la règle du
 *  serveur (`_etat_script`) : Home Assistant saute en silence une entité indisponible d'un service d'entité, et rien ne bipait
 *  (passe bis 2 du 20/10, sonde S2c). Un script muet est un script absent : le service du domaine part à sa place. */
export function scriptVivant(states, id) {
  const st = typeof id === 'string' && /^script\./.test(id) && states ? states[id] : null;
  return !!st && !/^(unavailable|unknown)$/.test(String(st.state));
}

/** Le script de DÉPART désigné et qui répond dans la maison (`states`) : `'pieces'` (celui des pièces sélectionnées — les puces peuvent
 *  être ses interrupteurs), `'depart'` (« nettoyer tout » seul), `null` sans aucun — la règle du serveur (`_script_depart`). */
export function scriptDepartDesigne(scripts, states) {
  const s = scripts && typeof scripts === 'object' ? scripts : {};
  return scriptVivant(states, s.pieces_selectionnees) ? 'pieces' : scriptVivant(states, s.nettoyer_tout) ? 'depart' : null;
}

/** Le préfixe commun des scripts déjà désignés (« script.robot_ »), coupé au dernier « _ » — la règle de `vacPrefixe` pour les
 *  interrupteurs ; un seul désigné suffit ici. */
function prefixeScripts(ids) {
  const liste = ids.filter(id => typeof id === 'string' && id.indexOf('script.') === 0);
  if (!liste.length) return null;
  let p = liste[0];
  liste.forEach(id => { let i = 0; while (i < p.length && i < id.length && p[i] === id[i]) i++; p = p.slice(0, i); });
  const c = p.lastIndexOf('_');
  return c > 'script.'.length ? p.slice(0, c + 1) : null;
}

/**
 * Les options d'une rangée de la roue (`ListeChoix`) : « Aucun » en tête, puis les scripts de Home Assistant — ceux qui partagent
 * le préfixe des scripts déjà désignés sous « Scripts du robot », les autres sous « Autres scripts » —, par nom ; l'identifiant se lit
 * en petit (`sub`).
 */
export function optionsScripts(states, scripts) {
  const S = states || {};
  const designes = Object.values(scripts && typeof scripts === 'object' ? scripts : {});
  const prefixe = prefixeScripts(designes);
  const nom = (id) => String((S[id] && S[id].attributes && S[id].attributes.friendly_name) || id.slice(7).replace(/_/g, ' '));
  const tous = Object.keys(S).filter(id => id.indexOf('script.') === 0).map(id => ({ id, label: nom(id), sub: id, robot: !!prefixe && id.indexOf(prefixe) === 0 }))
    .sort((a, b) => (b.robot - a.robot) || comparerTextes(a.label, b.label));
  return [{ id: '', label: tr('Aucun') }, ...tous.map(o => ({ id: o.id, label: o.label, sub: o.sub, groupe: o.robot ? tr('Scripts du robot') : tr('Autres scripts') }))];
}

/** `vacuum.clean_area { cleaning_area_id: [zones] }` : le contrat commun de Home Assistant ≥ 2026.3 (R4), pour le repli direct d'un
 *  départ par zones quand le serveur n'a pas `lancer`. */
export function commandeZonesHA({ idRobot = null, zones = [] } = {}) {
  const ids = (zones || []).map(z => z && z.zone).filter(z => typeof z === 'string' && z);
  return idRobot && ids.length ? { domaine: 'vacuum', service: 'clean_area', data: { entity_id: idRobot, cleaning_area_id: ids } } : null;
}
