/**
 * Ce qui ne va pas — dit une fois, et seulement si c'est vrai.
 *
 * Une installation ordinaire contient en permanence des centaines d'entités qui
 * ne répondent pas, sans que rien n'aille mal. Un tableau de bord qui les
 * compte et affiche « 934 problèmes » n'informe personne : il apprend à ignorer
 * ses propres alertes.
 *
 * Ce module ne compte pas, il regroupe. Quatre distinctions, chacune tirée de
 * mesures faites sur une installation réelle :
 *
 * `unavailable` n'est pas `unknown`. La première dit que l'intégration ne
 * répond pas ; la seconde, que l'entité existe mais n'a pas encore de valeur —
 * une entité qui n'a rien reçu depuis le démarrage est dans ce cas, et ce n'est
 * pas une panne. Sur l'installation d'essai : 934 contre 162.
 *
 * Une intégration entièrement muette est UN incident, pas cent. Quand toutes
 * les entités d'une même plateforme se taisent, c'est la plateforme qui est
 * tombée, et le dire cent fois ne rend pas le message plus clair.
 *
 * Une chute simultanée a une cause commune. Sur l'installation d'essai, 109
 * entités locales — automatisations, minuteries, cases à cocher — sont
 * devenues indisponibles À LA MÊME MINUTE, deux minutes après qu'un fichier de
 * panne a été écrit. Ce sont 109 symptômes d'un seul événement.
 *
 * Un appareil qui dépend d'un autre tombe avec lui. Si une passerelle ne
 * répond plus, ses trente capteurs non plus : la nouvelle utile est la
 * passerelle.
 *
 * Enfin, la durée. `last_changed` est remis à zéro au démarrage de Home
 * Assistant : « indisponible depuis deux heures » peut vouloir dire « n'a
 * jamais répondu depuis le démarrage, il y a deux heures ». On ne prétend donc
 * pas dater une panne — mais la SIMULTANÉITÉ, elle, reste un signal solide.
 */

import { locale } from './i18n.js';

const domaineDe = (id) => (typeof id === 'string' ? id.slice(0, id.indexOf('.')) : '');

/** Les domaines qui vivent dans la configuration, sans matériel derrière. */
const DOMAINES_LOCAUX = new Set(['automation', 'script', 'scene', 'input_boolean',
  'input_number', 'input_select', 'input_text', 'input_datetime', 'input_button',
  'timer', 'counter', 'schedule', 'template', 'group']);

/** Fenêtre dans laquelle deux chutes comptent comme simultanées. */
const SIMULTANE_MIN = 3;

const estMuette = (st) => !!(st && st.state === 'unavailable');
const estSansValeur = (st) => !!(st && st.state === 'unknown');

/** Minute à laquelle une entité a pris son état actuel, ou null. */
function minuteDe(st) {
  const t = st && (st.last_changed || st.last_updated);
  if (!t) return null;
  const ms = new Date(t).getTime();
  return isFinite(ms) ? Math.floor(ms / 60000) : null;
}

/**
 * La minute où Home Assistant a démarré, si elle se laisse reconnaître.
 *
 * Au démarrage, TOUT bascule à la même seconde — sur l'installation d'essai,
 * 2040 entités sur 2442. Aucune panne ne ressemble à cela : une intégration qui
 * tombe emporte ses entités, pas celles des autres. La minute qui concentre la
 * majorité des changements est donc le démarrage, et la confondre avec un
 * incident revient à annoncer une catastrophe à chaque redémarrage.
 *
 * Rend `null` si rien ne se détache : sur une installation qui tourne depuis
 * longtemps, les changements sont étalés et il n'y a plus de démarrage récent à
 * reconnaître.
 */
export function bootMinute(states, part = 0.5) {
  const total = Object.keys(states).length;
  if (total < 20) return null;   // trop peu pour qu'une proportion signifie quoi que ce soit
  const parMinute = new Map();
  Object.keys(states).forEach(id => {
    const m = minuteDe(states[id]);
    if (m != null) parMinute.set(m, (parMinute.get(m) || 0) + 1);
  });
  let minute = null, n = 0;
  parMinute.forEach((c, m) => { if (c > n) { n = c; minute = m; } });
  return n >= total * part ? minute : null;
}

/**
 * Les entités qui ne répondent pas, écartant ce qui n'a rien à dire.
 *
 * Les entités de diagnostic et de configuration sont exclues : elles sont
 * nombreuses, souvent muettes par nature, et personne ne veut être alerté pour
 * une case « activer les journaux détaillés ».
 */
function muettes(states, meta) {
  const out = [];
  Object.keys(states).forEach(id => {
    if (!estMuette(states[id])) return;
    const m = meta && meta.get ? meta.get(id) : null;
    if (m && (m.category === 'config' || m.category === 'diagnostic')) return;
    out.push(id);
  });
  return out;
}

/**
 * Intégrations dont TOUTES les entités se taisent.
 *
 * On exige un minimum d'entités : une intégration qui n'en expose qu'une seule
 * ne permet pas de distinguer une panne de plateforme d'un appareil éteint.
 */
function integrationsTombees(states, meta, seuil = 3) {
  const parPlateforme = new Map();
  Object.keys(states).forEach(id => {
    const m = meta && meta.get ? meta.get(id) : null;
    const p = m && m.platform;
    if (!p) return;
    if (m.category === 'config' || m.category === 'diagnostic') return;
    const e = parPlateforme.get(p) || { total: 0, muettes: 0, entities: [] };
    e.total += 1;
    if (estMuette(states[id])) { e.muettes += 1; e.entities.push(id); }
    parPlateforme.set(p, e);
  });
  const out = [];
  parPlateforme.forEach((e, p) => {
    if (e.total >= seuil && e.muettes === e.total) {
      out.push({ kind: 'integration', scope: p, count: e.total, entities: e.entities });
    }
  });
  return out;
}

/**
 * Chutes simultanées : plusieurs entités devenues muettes à la même minute.
 *
 * C'est le signal le plus fiable dont on dispose, parce qu'il ne dépend pas de
 * savoir depuis quand Home Assistant tourne. Une seule cause, un seul message.
 */
function chutesSimultanees(states, ids, seuil = 5) {
  const parMinute = new Map();
  ids.forEach(id => {
    const min = minuteDe(states[id]);
    if (min == null) return;
    if (!parMinute.has(min)) parMinute.set(min, []);
    parMinute.get(min).push(id);
  });

  // Les minutes voisines décrivent le même événement : on les rassemble.
  const minutes = [...parMinute.keys()].sort((a, b) => a - b);
  const groupes = [];
  let courant = null;
  minutes.forEach(min => {
    if (courant && min - courant.fin <= SIMULTANE_MIN) {
      courant.fin = min;
      courant.entities = courant.entities.concat(parMinute.get(min));
    } else {
      courant = { debut: min, fin: min, entities: parMinute.get(min).slice() };
      groupes.push(courant);
    }
  });

  return groupes.filter(g => g.entities.length >= seuil).map(g => {
    const domaines = {};
    g.entities.forEach(id => {
      const d = domaineDe(id);
      domaines[d] = (domaines[d] || 0) + 1;
    });
    const locales = g.entities.filter(id => DOMAINES_LOCAUX.has(domaineDe(id))).length;
    return {
      kind: 'simultane',
      count: g.entities.length,
      at: new Date(g.debut * 60000).toISOString(),
      domains: domaines,
      local: locales === g.entities.length,
      // Qu'UNE SEULE entité locale soit tombée suffit à mettre Home Assistant
      // en cause : une automatisation ou une case à cocher ne dépend d'aucune
      // intégration, d'aucun réseau et d'aucun matériel. Si elle se tait, c'est
      // que Home Assistant lui-même a cessé de la porter — et les entités
      // d'intégration tombées à la même seconde suivent la même cause.
      core: locales > 0,
      coreCount: locales,
      entities: g.entities,
    };
  });
}

/**
 * Résidus : des entités qui n'ont plus de définition.
 *
 * Une automatisation, un script, une case à cocher ne dépendent d'aucun réseau
 * ni d'aucun matériel : ils sont créés au démarrage à partir de la
 * configuration. Si l'un d'eux est muet DEPUIS le démarrage, ce n'est pas qu'il
 * est tombé — c'est que sa définition n'existe plus, et que seule son entrée de
 * registre a survécu à une suppression ou à un renommage.
 *
 * Sur l'installation d'essai, 89 entités sont dans ce cas. Les compter comme
 * des pannes revenait à annoncer une centaine de problèmes permanents, dont
 * aucun n'en était un. Elles ne reviendront jamais : la seule issue est de
 * supprimer leur entrée dans le registre des entités.
 */
function residus(states, ids, boot) {
  if (boot == null) return null;
  const liste = ids.filter(id => DOMAINES_LOCAUX.has(domaineDe(id)) && minuteDe(states[id]) === boot);
  if (!liste.length) return null;
  const domaines = {};
  liste.forEach(id => { const d = domaineDe(id); domaines[d] = (domaines[d] || 0) + 1; });
  return { kind: 'residus', count: liste.length, domains: domaines, entities: liste };
}

/**
 * Passerelles tombées : un appareil muet dont d'autres dépendent.
 *
 * Le lien `via` vient du registre. Quand il est renseigné, un pont hors service
 * explique à lui seul le silence de tout ce qu'il porte.
 */
function passerellesTombees(devices) {
  const enfants = new Map();
  devices.forEach(d => {
    if (!d.via) return;
    if (!enfants.has(d.via)) enfants.set(d.via, []);
    enfants.get(d.via).push(d.id);
  });
  const out = [];
  enfants.forEach((liste, parentId) => {
    const parent = devices.get ? devices.get(parentId) : null;
    if (!parent || parent.available) return;
    const muets = liste.filter(id => {
      const e = devices.get ? devices.get(id) : null;
      return e && !e.available;
    });
    if (!muets.length) return;
    out.push({
      kind: 'passerelle', scope: parent.name || parentId,
      deviceId: parentId, count: muets.length, devices: muets,
    });
  });
  return out;
}

/**
 * L'état de santé de l'installation : des incidents, pas des symptômes.
 *
 * @param {Map} devices  les appareils de `buildDevices`
 * @param {object} ctx   { states, meta }
 */
export function healthReport(devices, ctx = {}) {
  const states = ctx.states || {};
  const meta = ctx.meta || null;

  const listeMuettes = muettes(states, meta);
  const incidents = [];

  // Ordre de lecture : du plus englobant au plus précis. Les entités déjà
  // expliquées par un incident large ne sont pas recomptées dans un plus étroit.
  const expliquees = new Set();

  passerellesTombees(devices).forEach(i => {
    incidents.push(i);
    i.devices.forEach(id => {
      const d = devices.get ? devices.get(id) : null;
      if (d) d.entities.forEach(e => expliquees.add(e));
    });
  });

  integrationsTombees(states, meta).forEach(i => {
    if (i.entities.every(e => expliquees.has(e))) return;
    incidents.push(i);
    i.entities.forEach(e => expliquees.add(e));
  });

  // Le démarrage, reconnu avant tout le reste : ce qui a basculé à cette
  // minute-là a basculé parce que Home Assistant démarrait, pas parce qu'une
  // panne survenait.
  const boot = bootMinute(states);

  const orphelines = residus(states, listeMuettes.filter(e => !expliquees.has(e)), boot);
  if (orphelines) {
    incidents.push(orphelines);
    orphelines.entities.forEach(e => expliquees.add(e));
  }

  chutesSimultanees(states, listeMuettes.filter(e => !expliquees.has(e))).forEach(i => {
    // Une chute à la minute du démarrage n'est pas une chute : tout bascule au
    // démarrage, y compris ce qui va très bien.
    if (boot != null && Math.abs(new Date(i.at).getTime() / 60000 - boot) <= SIMULTANE_MIN) {
      i.entities.forEach(e => expliquees.add(e));
      return;
    }
    incidents.push(i);
    i.entities.forEach(e => expliquees.add(e));
  });

  // Ce qui reste : des appareils isolés, sans cause commune identifiable.
  const isoles = [];
  devices.forEach(d => {
    if (d.available) return;
    if ((d.entities || []).every(e => expliquees.has(e))) return;
    isoles.push({ id: d.id, name: d.name, integration: d.integration });
  });
  if (isoles.length) {
    incidents.push({ kind: 'appareils', count: isoles.length, devices: isoles });
  }

  const sansValeur = Object.keys(states).filter(id => estSansValeur(states[id])).length;
  const tousLesAppareils = devices.values ? [...devices.values()] : [...devices];

  return {
    incidents,
    stats: {
      entities: Object.keys(states).length,
      unavailable: listeMuettes.length,
      // Comptée à part : une entité qui n'a pas encore de valeur n'est pas en
      // panne, et la confondre avec une panne gonfle les chiffres pour rien.
      unknown: sansValeur,
      devices: tousLesAppareils.length,
      offline: tousLesAppareils.filter(d => !d.available).length,
    },
  };
}

/** Rendu lisible, pour la console de diagnostic et la vue Système. */
export function healthText(rapport) {
  if (!rapport) return 'Aucun diagnostic';
  const s = rapport.stats;
  const L = [];
  L.push(`${s.entities} entités · ${s.unavailable} sans réponse · ${s.unknown} sans valeur`);
  L.push(`${s.devices} appareils · ${s.offline} hors ligne`);
  L.push('');
  if (!rapport.incidents.length) { L.push('Aucun incident.'); return L.join('\n'); }
  L.push(`${rapport.incidents.length} incident(s) :`);
  rapport.incidents.forEach(i => {
    if (i.kind === 'integration') {
      L.push(`  · ${i.scope} : l’intégration entière ne répond pas (${i.count} entités)`);
    } else if (i.kind === 'passerelle') {
      L.push(`  · ${i.scope} : passerelle hors service, ${i.count} appareil(s) derrière`);
    } else if (i.kind === 'simultane') {
      const quoi = Object.entries(i.domains).sort((a, b) => b[1] - a[1])
        .slice(0, 4).map(([d, n]) => `${n} ${d}`).join(', ');
      const heure = new Date(i.at).toLocaleTimeString(locale(),
        { hour: '2-digit', minute: '2-digit' });
      L.push(`  · ${i.count} entités tombées ensemble à ${heure}`
        + (i.core ? ` — dont ${i.coreCount} locales, donc Home Assistant lui-même` : ''));
      L.push(`      ${quoi}`);
    } else if (i.kind === 'residus') {
      const quoi = Object.entries(i.domains).sort((a, b) => b[1] - a[1])
        .map(([d, n]) => `${n} ${d}`).join(', ');
      L.push(`  · ${i.count} entités sans définition — anciennes configurations `
        + 'dont seule l’entrée de registre subsiste, à supprimer dans '
        + 'Paramètres → Entités');
      L.push(`      ${quoi}`);
    } else if (i.kind === 'appareils') {
      L.push(`  · ${i.count} appareil(s) hors ligne sans cause commune`);
    }
  });
  return L.join('\n');
}
