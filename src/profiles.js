/**
 * Ce que les attributs ne disent pas.
 *
 * Les deux moteurs précédents lisent ce que Home Assistant publie, et cela
 * couvre l'essentiel. Restent des situations où une entité déclare une chose et
 * en fait une autre, ou bien où plusieurs entités décrivent un seul objet :
 *
 *   — une caméra publie trois flux (haute définition, basse définition, cliché)
 *     et le dashboard en fait trois cartes, pour une seule caméra au mur ;
 *   — une enceinte connectée déclare `volume_set` mais ne publie jamais de
 *     titre, tandis qu'un autre appareil publie le titre sans accepter le
 *     volume — chacun ne sait qu'une moitié de ce qu'il faut afficher ;
 *   — une intégration expose des services propres qu'aucun attribut ne laisse
 *     deviner.
 *
 * Un profil décrit ce savoir, par INTÉGRATION, FABRICANT, MODÈLE ou par
 * comportement observé — jamais par identifiant d'entité. Le même profil doit
 * valoir sur l'installation d'un inconnu qui possède le même matériel, et ne
 * rien faire chez celui qui ne l'a pas. Un profil qui ne s'applique à personne
 * est simplement inerte.
 *
 * Les profils sont des DONNÉES, pas du code : ajouter du matériel se fait en
 * ajoutant une entrée, et cette entrée est lisible sans connaître le reste.
 */

/**
 * Les règles qu'un profil peut porter.
 *
 *   merge         plusieurs entités d'un même domaine ne décrivent qu'un objet :
 *                 on en présente une, les autres restent accessibles.
 *   roles         quelle entité porte quoi, quand l'information est éparpillée.
 *   hide          entités que l'appareil publie mais qui n'ont rien à montrer.
 *   commands      services propres à l'intégration, avec ce qu'ils attendent.
 *   presentation  ce que la vue doit savoir avant de dessiner.
 *   notes         ce qu'un humain doit savoir, affiché tel quel en diagnostic.
 *
 * Chaque champ est facultatif : un profil qui ne porte qu'une note est valable.
 */

const PROFILS = [
  {
    id: 'camera-multi-flux',
    // Reconnu au comportement, pas à la marque : toute caméra qui publie
    // plusieurs flux est concernée, quel que soit son fabricant.
    match: { domain: 'camera', minEntitiesInDomain: 2 },
    merge: {
      domain: 'camera',
      // Le flux principal est celui dont le nom ne porte aucune mention de
      // repli. À défaut, le premier par ordre alphabétique, ce qui est stable.
      prefer: [/haute|high|main|principal/i],
      avoid: [/basse|low|sub|package|clich|snapshot|still/i],
    },
    notes: 'Cette caméra publie plusieurs flux ; un seul est présenté.',
  },
  {
    id: 'lecteur-sans-metadonnees',
    // Une enceinte qui accepte le volume mais ne publie jamais ce qu'elle joue.
    // Le dashboard affichait une carte vide, en laissant croire à une panne.
    match: { domain: 'media_player', can: ['set_volume'], lacks: ['media'] },
    roles: { transport: 'self', volume: 'self', metadata: null },
    notes: 'Cet appareil ne publie pas ce qu’il diffuse : la carte reste sobre.',
  },
  {
    id: 'lecteur-sans-volume',
    // L'inverse : le titre et la pochette sont là, le volume ne répond pas.
    match: { domain: 'media_player', reads: ['media'], lacksCan: ['set_volume'] },
    roles: { transport: 'self', metadata: 'self', volume: null },
    notes: 'Cet appareil ne règle pas son volume depuis Home Assistant.',
  },
  {
    id: 'robot-aspirateur-segments',
    // Les robots qui acceptent `send_command` savent nettoyer une pièce
    // précise, mais la façon de la désigner n'est normalisée nulle part : un
    // numéro de segment ici, un nom là. On signale la capacité sans prétendre
    // connaître la table, qui appartient à l'installation.
    match: { domain: 'vacuum', can: ['send_command'] },
    commands: {
      clean_segment: {
        capability: 'send_command',
        note: 'Le découpage en pièces dépend du robot ; la table est propre à '
            + 'chaque installation et n’est pas déduite ici.',
      },
    },
  },
  {
    id: 'appareil-de-service',
    // Les gestionnaires de dépôts et les intégrations sans matériel créent un
    // appareil chacun. Ils sont légitimes, mais ce ne sont pas des objets de la
    // maison, et ils sont assez nombreux pour noyer ceux qui le sont.
    match: { entryType: 'service' },
    presentation: { physical: false },
    notes: 'Entrée de service, sans matériel derrière.',
  },
];

const domaineDe = (id) => (typeof id === 'string' ? id.slice(0, id.indexOf('.')) : '');

/** Compare une valeur à un motif : chaîne exacte, expression, ou liste. */
function correspond(valeur, motif) {
  if (motif == null) return true;
  const v = valeur == null ? '' : String(valeur);
  if (Array.isArray(motif)) return motif.some(m => correspond(v, m));
  if (motif instanceof RegExp) return motif.test(v);
  return String(motif).toLowerCase() === v.toLowerCase();
}

/**
 * Le profil s'applique-t-il à cet appareil ?
 *
 * @param {object} match  la clause du profil
 * @param {object} device un appareil de `buildDevices`
 * @param {object} caps   ses capacités, de `deviceCaps`
 */
function sApplique(match, device, caps) {
  if (!match) return false;
  if (match.integration && !correspond(device.integration, match.integration)) return false;
  if (match.manufacturer && !correspond(device.manufacturer, match.manufacturer)) return false;
  if (match.model && !correspond(device.model, match.model)) return false;
  if (match.entryType && !correspond(device.entryType, match.entryType)) return false;

  if (match.domain) {
    const dansLeDomaine = (device.entities || []).filter(id => domaineDe(id) === match.domain);
    if (!dansLeDomaine.length) return false;
    if (match.minEntitiesInDomain && dansLeDomaine.length < match.minEntitiesInDomain) return false;
  }
  if (match.can && !match.can.every(c => caps && caps.can.has(c))) return false;
  if (match.lacksCan && match.lacksCan.some(c => caps && caps.can.has(c))) return false;
  if (match.reads && !match.reads.every(r => caps && caps.reads.has(r))) return false;
  if (match.lacks && match.lacks.some(r => caps && caps.reads.has(r))) return false;
  return true;
}

/**
 * Les profils qui s'appliquent à un appareil, dans l'ordre de la table.
 *
 * Plusieurs profils peuvent valoir en même temps — une caméra multi-flux d'une
 * intégration connue en est un cas. C'est voulu : chacun apporte ce qu'il sait,
 * et `mergedProfile` les réunit.
 */
export function profilesFor(device, caps = null) {
  if (!device) return [];
  return PROFILS.filter(p => sApplique(p.match, device, caps));
}

/**
 * Ce que l'ensemble des profils dit d'un appareil, en un seul objet.
 *
 * Les règles se cumulent ; en cas de conflit, le profil le plus tardif de la
 * table l'emporte, ce qui permet de placer les profils précis après les
 * généraux sans avoir à les défaire.
 */
export function mergedProfile(device, caps = null) {
  const liste = profilesFor(device, caps);
  if (!liste.length) return null;
  const out = { ids: [], notes: [] };
  liste.forEach(p => {
    out.ids.push(p.id);
    if (p.notes) out.notes.push(p.notes);
    if (p.merge) out.merge = { ...(out.merge || {}), ...p.merge };
    if (p.roles) out.roles = { ...(out.roles || {}), ...p.roles };
    if (p.hide) out.hide = [...(out.hide || []), ...p.hide];
    if (p.commands) out.commands = { ...(out.commands || {}), ...p.commands };
    if (p.presentation) out.presentation = { ...(out.presentation || {}), ...p.presentation };
  });
  return out;
}

/**
 * L'entité à présenter parmi celles d'un même domaine, quand un profil dit
 * qu'elles n'en décrivent qu'une.
 *
 * Rien n'est supprimé : les autres restent accessibles à qui les demande. Le
 * choix se fait sur les noms, jamais sur un identifiant écrit ici.
 */
export function primaryEntity(device, merge, names = null) {
  if (!device || !merge || !merge.domain) return null;
  const candidates = (device.entities || []).filter(id => domaineDe(id) === merge.domain);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const nomDe = (id) => String((names && names(id)) || id);
  const evite = (id) => (merge.avoid || []).some(r => r.test(nomDe(id)));
  const prefere = (id) => (merge.prefer || []).some(r => r.test(nomDe(id)));

  const retenus = candidates.filter(id => !evite(id));
  const pool = retenus.length ? retenus : candidates;
  return pool.find(prefere) || pool[0];
}

/**
 * Inventaire : quels profils s'appliquent, et à combien d'appareils.
 *
 * Un profil qui ne s'applique à personne n'est pas une anomalie — c'est du
 * matériel que cette installation n'a pas.
 */
export function profilesSummary(devices, capsOf) {
  const out = new Map();
  PROFILS.forEach(p => out.set(p.id, { id: p.id, devices: 0 }));
  devices.forEach(d => {
    profilesFor(d, capsOf ? capsOf(d) : null).forEach(p => { out.get(p.id).devices += 1; });
  });
  return out;
}

/** La table elle-même, pour la documentation et le diagnostic. */
export const profiles = PROFILS;
