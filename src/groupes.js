/* ── Les groupes de capteurs binaires (chantier Capteurs, étape 2 ; C20, C21, § 19.3) ──────────────
 *
 * Dans Objets, trois cartes remplacent les binaires de leurs familles (C20) :
 * Ouvertures, Sécurité, Présence. Qui entre dans un groupe, la CLASSE le dit,
 * jamais le nom (C21) :
 *  - Ouvertures : `door`, `window`, `garage_door`, `opening` ;
 *  - Sécurité : `smoke`, `carbon_monoxide`, `gas`, `moisture`, `safety` — et un capteur de monoxyde
 *    en ppm (un `sensor` de classe `carbon_monoxide`, audit du 19/10, H10), qui « sonne » au palier
 *    Danger de la table (`coDanger`, confort.js) ;
 *  - Présence : `motion`, `occupancy`, `presence` — les caméras comprises (§ 19.3,
 *    tranché le 16/10 : leur mouvement, et la sonnette en `occupancy`).
 * Le binaire est porté par un APPAREIL PHYSIQUE — un appareil du registre qui
 * n'est pas un service, la règle de C14 —, et n'est ni masqué, ni désactivé, ni
 * de catégorie. Un modèle sans appareil (ses « Besoin Eau ») n'entre nulle part ;
 * la vigilance météo non plus (C28) : elle a sa carte, dans Dehors. Le sabotage
 * (`tamper`) n'est d'aucun groupe : il se dit sur la ligne de sa porte.
 *
 * Le nom d'un membre (§ 3) : sa pièce de Loggia, s'il est seul de son groupe dans
 * cette pièce ; sinon le nom de son appareil ; sinon son nom de Home Assistant.
 *
 * Ce que chaque carte dit (§ 3) — sa vue : la glyphe de sa plaque, sa phrase et
 * son ton (`null` : le neutre ; 'warn' : l'ambre ; 'bad' : le rouge ; un mouvement
 * allume la plaque par `accent`), ses puces, et si elle est « à regarder » — ce qui demande un geste
 * ou signale une panne (§ 19.1, tranché le 16/10) : un état CHOISI, une porte qu'on
 * a ouverte, ne compte pas ; un ouvrant ou un détecteur muet, un détecteur qui
 * sonne, si. Jamais « Tout va bien ».
 *
 * Pur : pas de React, pas de Home Assistant. L'écran passe ce que l'index de la
 * découverte sait de chaque entité (`ctx`) : `meta(id)` — `{ deviceId, hidden,
 * disabled, category }` —, `physique(deviceId)`, `piece(id)` — sa pièce de Loggia,
 * '' sinon — et `appareil(id)`, le nom de son appareil.
 */
import { tr, trN } from './i18n.js';
import { motsSurete, ICONES_ATTENTION, CLASSES_OUVRANT, CLASSES_SURETE, CLASSES_MOUVEMENT } from './attention.js';
import { coDanger } from './confort.js';
import { uniteCo } from './unites.js';

export const GROUPES = ['ouvertures', 'securite', 'presence'];
// Les familles, tirées de LA table des classes (attention.js) : le sabotage (`tamper`) n'est d'aucun groupe.
export const FAMILLES_GROUPES = {
  ouvertures: CLASSES_OUVRANT,
  securite: CLASSES_SURETE.filter(c => c !== 'tamper'),
  presence: CLASSES_MOUVEMENT,
};

/** Le groupe d'une classe de capteur binaire, ou null : `tamper`, `vibration`, `problem` n'en ont pas. */
export function groupeDeClasse(classe) {
  return GROUPES.find(g => FAMILLES_GROUPES[g].indexOf(classe) >= 0) || null;
}

/** MeteoAlarm, reconnue par la règle de l'Accueil (attention.js, `pointsAttention`) : un `safety` qui porte
 *  `awareness_level`, ou dont l'identifiant ou l'attribution nomment MeteoAlarm. */
export function estMeteoAlarm(id, a) {
  const x = a || {};
  return x.device_class === 'safety' && (x.awareness_level != null || /meteoalarm/i.test(String(id)) || /meteoalarm/i.test(x.attribution || ''));
}

const attrs = (S, id) => (S && S[id] && S[id].attributes) || {};

/** Un binaire peut-il entrer dans un groupe (C21) : un appareil physique, ni masqué, ni désactivé, ni de catégorie. */
function membrePossible(id, ctx) {
  const m = ctx.meta(id) || {};
  return !m.hidden && !m.disabled && !m.category && !!m.deviceId && !!ctx.physique(m.deviceId);
}

/** Un capteur de monoxyde CHIFFRÉ : un `sensor` de classe `carbon_monoxide` (audit du 19/10, H10), en ppm ou dans une unité qui
 *  s'y ramène — mg/m³, µg/m³, ppb (G1-D6, 30/10 ; `uniteCo`). Dans une autre, rien ne dit des ppm : il n'entre pas. */
const coPpm = (id, a) => id.indexOf('sensor.') === 0 && a.device_class === 'carbon_monoxide' && !!uniteCo(a.unit_of_measurement);

/** Les membres de chaque groupe, rangés par identifiant : `{ ouvertures: [id…], securite: [id…], presence: [id…] }`. */
export function membresGroupes(S, ctx) {
  const out = { ouvertures: [], securite: [], presence: [] };
  Object.keys(S || {}).sort().forEach(id => {
    const a = attrs(S, id);
    if (coPpm(id, a)) { if (membrePossible(id, ctx)) out.securite.push(id); return; }
    if (id.indexOf('binary_sensor.') !== 0) return;
    const g = groupeDeClasse(a.device_class);
    if (!g || estMeteoAlarm(id, a) || !membrePossible(id, ctx)) return;
    out[g].push(id);
  });
  return out;
}

/** Le nom de chaque membre d'un groupe (§ 3) : `Map(id → nom)`. */
export function nomsMembres(ids, S, ctx) {
  const pieces = ids.map(id => ctx.piece(id) || '');
  const compte = new Map();
  pieces.forEach(p => { if (p) compte.set(p, (compte.get(p) || 0) + 1); });
  const out = new Map();
  ids.forEach((id, i) => {
    const p = pieces[i];
    out.set(id, p && compte.get(p) === 1 ? p : (ctx.appareil(id) || attrs(S, id).friendly_name || id));
  });
  return out;
}

/** Muet : absent, `unavailable` ou `unknown` — il ne compte ni ouvert ni fermé. */
export const estMuet = (st) => !st || st.state === 'unavailable' || st.state === 'unknown';
/** Une SONNETTE (§ 19.3) : un binaire `occupancy` dont la clé de traduction est `doorbell` — celle qu'UniFi Protect donne au bouton
 *  de sa G6 Entry. La clé est la même dans toutes les langues ; jamais le nom. Sans elle, rien n'est deviné. */
export const estSonnette = (id, S, ctx) => id.indexOf('binary_sensor.') === 0 && attrs(S, id).device_class === 'occupancy'
  && !!ctx && (ctx.meta(id) || {}).translationKey === 'doorbell';
/** Un membre qui sonne : un binaire allumé, ou un monoxyde chiffré au palier Danger (H10), ramené au ppm (G1-D6). */
export const sonne = (S, id) => !estMuet(S[id]) && (coPpm(id, attrs(S, id)) ? coDanger(S[id].state, attrs(S, id).unit_of_measurement) : S[id].state === 'on');

/**
 * Ouvertures (C22, § 3.1) : « {n} ouverte(s) sur {total} » en ambre dès qu'une est ouverte, de jour comme de nuit ; sinon
 * « {nom} ne répond plus » ou « {k} ne répondent plus », en ambre ; sinon « Tout est fermé », en neutre. Le total compte les
 * ouvertures qui répondent, comme les tuiles de Sécurité. Les puces : les ouvertes « {nom} · 22:25 », les muettes
 * « {nom} · muette », puis « {k} fermées ». À regarder : une muette seulement (§ 19.1). `heure(t)` écrit l'heure d'un instant (ms).
 * `depuis(id)` : l'instant du dernier VRAI changement — celui de l'historique du jour (`depuisQuand`, journeelue.js), la source de la
 * popup —, ou null ; alors la puce tait l'heure. Jamais `last_changed` seul : il vaut l'heure du redémarrage de Home Assistant, et la
 * puce disait « Baie · 23:48 » au matin (audit du 19/10, lot 4).
 */
export function vueOuvertures(ids, S, noms, heure, depuis = null) {
  const nom = (id) => noms.get(id) || id;
  const ouvertes = ids.filter(id => !estMuet(S[id]) && S[id].state === 'on');
  const muettes = ids.filter(id => estMuet(S[id]));
  const fermees = ids.length - ouvertes.length - muettes.length;
  const total = ids.length - muettes.length;
  const phrase = ouvertes.length ? trN(ouvertes.length, '{n} ouverte sur {total}', '{n} ouvertes sur {total}', { total })
    : muettes.length === 1 ? tr('{nom} ne répond plus', { nom: nom(muettes[0]) })
      : muettes.length ? tr('{n} ne répondent plus', { n: muettes.length }) : tr('Tout est fermé');
  const fenetre = (id) => ((S[id] && S[id].attributes) || {}).device_class === 'window';
  const quand = (id) => { const t = depuis ? depuis(id) : null; return t != null ? nom(id) + ' · ' + heure(t) : nom(id); };
  const puces = [
    ...ouvertes.map(id => ({ t: quand(id), glyphe: fenetre(id) ? 'window-alt' : 'door-open', ton: 'warn' })),
    ...muettes.map(id => ({ t: nom(id) + ' · ' + tr('muette'), glyphe: fenetre(id) ? 'window-alt' : 'door-closed', ton: 'warn' })),
    ...(fermees ? [{ t: trN(fermees, '{n} fermée', '{n} fermées'), glyphe: 'check', ton: null }] : []),
  ];
  return { glyphe: ouvertes.length ? 'door-open' : 'door-closed', phrase, ton: ouvertes.length || muettes.length ? 'warn' : null, regarder: muettes.length > 0, puces, ouvertes, muettes };
}

/**
 * Sécurité (C23, C4, § 3.2) : un détecteur qui sonne — « Fumée détectée · {nom} », les mots de l'Accueil (`motsSurete`), en rouge ;
 * sinon un muet — « {nom} ne répond plus », « {k} détecteurs ne répondent plus », en ambre ; sinon « {n} détecteurs · rien à
 * signaler », en neutre. Jamais « Tout va bien ». Une pile faible n'y change rien : la carte Piles la dit. La glyphe :
 * `shield-check` au calme, celle de la famille qui sonne (`ICONES_ATTENTION`), `shield-exclamation` pour un muet. Les puces : au
 * calme, une par famille (« Monoxyde de carbone · 2 ») ; en alerte, celui qui sonne d'abord (rouge), puis les muets (ambre), puis
 * les familles au calme. À regarder : un qui sonne, ou un muet (C4).
 */
export function vueSecurite(ids, S, noms) {
  const nom = (id) => noms.get(id) || id;
  const classe = (id) => ((S[id] && S[id].attributes) || {}).device_class;
  const mots = (id) => motsSurete(classe(id)) || ['Sécurité', 'Alerte de sécurité'];
  const glyphe = (id) => ICONES_ATTENTION[classe(id)] || ICONES_ATTENTION.safety;
  const sonnent = ids.filter(id => sonne(S, id));
  const muets = ids.filter(id => estMuet(S[id]));
  const familles = new Map();
  ids.filter(id => sonnent.indexOf(id) < 0 && muets.indexOf(id) < 0).forEach(id => { const f = tr(mots(id)[0]); familles.set(f, (familles.get(f) || 0) + 1); });
  const phrase = sonnent.length ? tr(mots(sonnent[0])[1]) + ' · ' + nom(sonnent[0])
    : muets.length === 1 ? tr('{nom} ne répond plus', { nom: nom(muets[0]) })
      : muets.length ? tr('{n} détecteurs ne répondent plus', { n: muets.length })
        : trN(ids.length, '{n} détecteur · rien à signaler', '{n} détecteurs · rien à signaler');
  const puces = [
    ...sonnent.map(id => ({ t: tr(mots(id)[1]) + ' · ' + nom(id), glyphe: glyphe(id), ton: 'bad' })),
    ...muets.map(id => ({ t: nom(id) + ' · ' + tr('muet'), glyphe: 'shield-exclamation', ton: 'warn' })),
    ...[...familles].map(([f, n]) => ({ t: n > 1 ? f + ' · ' + n : f, glyphe: 'check', ton: null })),
  ];
  return { glyphe: sonnent.length ? glyphe(sonnent[0]) : muets.length ? 'shield-exclamation' : 'shield-check', phrase, ton: sonnent.length ? 'bad' : muets.length ? 'warn' : null,
    regarder: sonnent.length > 0 || muets.length > 0, puces, sonnent, muets };
}

const PRESENCES = ['occupancy', 'presence'];
/** Un délai court, « 3 min », « 2 h » : ce que disent les puces et la forme courte d'une phrase. */
export function delaiCourt(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  return m < 60 ? tr('{n} min', { n: m }) : tr('{n} h', { n: Math.round(m / 60) });
}

/**
 * Présence (C24, § 3.3 ; § 19.3 : les caméras comprises) : un détecteur allumé — « Mouvement · {pièce} · en ce moment », une
 * présence « Quelqu'un · {pièce} » ; sinon le dernier mouvement du journal dans l'heure — « Mouvement · {pièce} · il y a {n}
 * min » ; sinon « Rien depuis {durée} », et sans rien dans les 24 h du journal, « Rien depuis plus de 24 h ». Sans préposition
 * devant la pièce : « dans {pièce} » demanderait au polonais de décliner un nom. Toujours en neutre — du mouvement chez soi
 * n'est pas un problème — : la plaque prend l'accent pendant un mouvement, et rien n'est « à regarder ». La forme courte, pour
 * la carte étroite : « {pièce} · {n} min ». `derniers` : { id → instant (ms) } du JOURNAL, jamais `last_changed` (ADR 0031) — la
 * carte ET la popup le lisent (audit du 19/10, M19).
 * La SONNETTE (§ 19.3) : « Quelqu’un à la porte · en ce moment », puis « … · il y a {n} min » dans l'heure — elle passe devant le
 * mouvement de sa propre caméra, qui la suit toujours ; un mouvement AILLEURS, plus récent, reprend la phrase. `ctx` (celui de
 * `membresGroupes`) la reconnaît (`estSonnette`) ; sans lui, une `occupancy` reste une présence.
 */
export function vuePresence(ids, S, noms, derniers, maintenant, ctx = null) {
  const nom = (id) => noms.get(id) || id;
  const presence = (id) => PRESENCES.indexOf(((S[id] && S[id].attributes) || {}).device_class) >= 0;
  const quand = (id) => (derniers && derniers[id] != null ? derniers[id] : null);
  const actifs = ids.filter(id => !estMuet(S[id]) && S[id].state === 'on');
  const sonnettes = ctx ? ids.filter(id => estSonnette(id, S, ctx)) : [];
  const actif = actifs.find(id => !presence(id)) || actifs[0] || null;
  const dernier = ids.map(id => [id, quand(id)]).filter(x => x[1] != null).sort((a, b) => b[1] - a[1])[0] || null;
  // La sonnette qui sonne, ou qui a sonné dans l'heure sans qu'un appareil AUTRE que le sien ait vu bouger depuis.
  const appareil = (id) => (ctx ? (ctx.meta(id) || {}).deviceId || id : id);
  const sonneEnCours = sonnettes.find(id => actifs.indexOf(id) >= 0) || null;
  const sonnee = sonnettes.map(id => [id, quand(id)]).filter(x => x[1] != null && maintenant - x[1] < 3600000).sort((a, b) => b[1] - a[1])[0] || null;
  const ailleurs = (id) => sonnee && appareil(id) !== appareil(sonnee[0]);
  /* Ailleurs, seul compte ce qui est arrivé APRÈS la sonnerie (ADR 0252 § 4 ; relecture du lot 4) : une présence du salon allumée
   * depuis deux heures ne fait pas disparaître la sonnette d'il y a trois minutes. Allumé ou non, c'est l'instant du journal qui juge. */
  const porte = !sonneEnCours && sonnee && !ids.some(id => ailleurs(id) && quand(id) != null && quand(id) > sonnee[1]) ? sonnee : null;
  let phrase, courte;
  if (sonneEnCours) {
    phrase = tr('Quelqu’un à la porte · en ce moment');
    courte = tr('À la porte') + ' · ' + tr('en ce moment');
  } else if (porte) {
    const n = Math.max(1, Math.round((maintenant - porte[1]) / 60000));
    phrase = tr('Quelqu’un à la porte · il y a {n} min', { n });
    courte = tr('À la porte') + ' · ' + tr('{n} min', { n });
  } else if (actif) {
    phrase = presence(actif) ? tr('Quelqu’un · {piece}', { piece: nom(actif) }) : tr('Mouvement · {piece} · en ce moment', { piece: nom(actif) });
    courte = nom(actif) + ' · ' + (presence(actif) ? tr('occupé') : tr('en ce moment'));
  } else if (dernier && maintenant - dernier[1] < 3600000) {
    const n = Math.max(1, Math.round((maintenant - dernier[1]) / 60000));
    phrase = tr('Mouvement · {piece} · il y a {n} min', { piece: nom(dernier[0]), n });
    courte = nom(dernier[0]) + ' · ' + tr('{n} min', { n });
  } else phrase = courte = dernier && maintenant - dernier[1] < 86400000 ? tr('Rien depuis {d}', { d: delaiCourt(maintenant - dernier[1]) }) : tr('Rien depuis plus de 24 h');
  const etat = (id) => (estMuet(S[id]) ? tr('muet') : S[id].state === 'on' ? (presence(id) ? tr('occupé') : tr('en ce moment')) : quand(id) != null ? delaiCourt(maintenant - quand(id)) : null);
  const puces = ids.map(id => ({ t: etat(id) ? nom(id) + ' · ' + etat(id) : nom(id), glyphe: presence(id) ? 'user' : 'signal-stream', ton: null }));
  return { glyphe: 'signal-stream', phrase, phraseCourte: courte !== phrase ? courte : null, ton: null, accent: actifs.length > 0, regarder: false, puces, actifs, dernier };
}
