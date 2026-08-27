/**
 * L'appareil comme unité, et non ses entités éparpillées.
 *
 * Home Assistant expose des entités ; un thermostat en a cinq, une caméra huit.
 * Le dashboard raisonnait entité par entité et domaine par domaine, ce qui suffit
 * pour afficher une valeur, mais pas pour répondre à « de quoi cet appareil est-il
 * capable ». Deux robots sont tous deux des `vacuum` : seuls le fabricant, le
 * modèle et l'intégration disent lequel accepte quelle commande.
 *
 * Ce module rassemble donc, pour chaque appareil : ce que les registres en
 * savent, les entités qui lui appartiennent, les domaines qu'elles couvrent, et
 * s'il répond. Rien de plus : ni capacités, ni actions — elles viendront se
 * greffer ici, une fois qu'il y aura de quoi les déduire.
 *
 * Aucun identifiant d'entité n'est écrit dans ce fichier, et aucune marque n'y
 * est citée.
 */

const domaineDe = (id) => (typeof id === 'string' ? id.slice(0, id.indexOf('.')) : '');

/* Une entité muette, c'est `unavailable` — et rien d'autre.
 *
 * `unknown` dit seulement qu'aucune valeur n'a encore été publiée : un bouton
 * jamais pressé, une scène jamais activée, un événement qui n'a pas tiré. Le
 * compter comme une panne rendait « hors ligne » des appareils qui vont très
 * bien — une télécommande, une sonnette — et, juste après un redémarrage de Home
 * Assistant, une bonne part de l'installation.
 *
 * `health.js` fait déjà cette distinction (`estMuette` / `estSansValeur`) tout
 * en consommant `d.available` : les deux se contredisaient, et le diagnostic
 * annonçait des pannes qui n'existaient pas.
 *
 * Une entité absente du tout ne prouve toujours rien.
 */
const repond = (st) => !!(st && st.state != null && st.state !== 'unavailable');

/**
 * Les appareils de l'installation, chacun avec ce qui lui appartient.
 *
 * @param {object} index   sortie de `buildIndex`
 * @param {object} states  `hass.states`
 * @returns {Map<string, object>} device_id → appareil
 */
export function buildDevices(index, states = {}) {
  const out = new Map();
  if (!index || !index.entityMeta) return out;

  const meta = index.deviceMeta || new Map();
  const zone = (id) => {
    const o = id && index.areaById ? index.areaById.get(id) : null;
    return (o && (o.name || o.area_id)) || null;
  };

  index.entityMeta.forEach((m, entityId) => {
    if (!m || !m.deviceId) return;   // entité sans appareil : YAML, template, groupe
    let d = out.get(m.deviceId);
    if (!d) {
      const info = meta.get(m.deviceId) || {};
      d = {
        id: m.deviceId,
        // Le nom donné par l'utilisateur prime, puis celui de l'intégration.
        name: info.name || m.device || null,
        manufacturer: info.manufacturer || null,
        model: info.model || null,
        firmware: info.firmware || null,
        integration: info.integration || null,
        area: info.area || null,
        areaName: zone(info.area),
        // Un appareil peut en dépendre d'un autre : une ampoule passe par son
        // pont, un capteur par sa passerelle. Le savoir évite de déclarer un
        // appareil en panne quand c'est son pont qui est tombé.
        via: info.via || null,
        entryType: info.entryType || null,
        entities: [],
        domains: [],
        // Les intégrations qui ont créé ses entités. Un même appareil peut en
        // avoir plusieurs : un enregistreur vidéo apparaît sous l'intégration
        // réseau du fabricant et sous celle de ses caméras.
        platforms: [],
        // Compte des entités qui ne répondent pas, pour le moteur de santé.
        unavailable: 0,
      };
      out.set(m.deviceId, d);
    }
    d.entities.push(entityId);
    const dom = domaineDe(entityId);
    if (dom && d.domains.indexOf(dom) < 0) d.domains.push(dom);
    if (m.platform && d.platforms.indexOf(m.platform) < 0) d.platforms.push(m.platform);
    if (!repond(states[entityId])) d.unavailable += 1;
  });

  out.forEach(d => {
    d.entities.sort();
    d.domains.sort();
    // L'intégration manque au registre pour un appareil sur dix — il a été créé
    // sans `identifiers`, ou par une intégration qui n'en pose pas. Ses entités,
    // elles, portent toujours leur plateforme. Sans ce rattrapage, aucun profil
    // ne peut s'appliquer à ces appareils.
    if (!d.integration && d.platforms.length) {
      // Plusieurs plateformes : celle qui a créé le plus d'entités décrit le
      // mieux l'appareil. À égalité, l'ordre de rencontre tranche, ce qui est
      // stable puisque les entités sont triées.
      const compte = new Map();
      d.entities.forEach(id => {
        const p = index.entityMeta.get(id);
        if (p && p.platform) compte.set(p.platform, (compte.get(p.platform) || 0) + 1);
      });
      let meilleure = null, n = 0;
      compte.forEach((c, p) => { if (c > n) { n = c; meilleure = p; } });
      d.integration = meilleure;
      d.integrationDeduite = true;   // pour qui veut savoir d'où vient la valeur
    }
    // Disponible dès qu'une entité répond : un appareil dont seul le capteur de
    // signal est muet n'est pas hors ligne. Aucune n'ayant répondu, il l'est.
    d.available = d.entities.length > d.unavailable;
    // La zone de l'appareil peut manquer alors que ses entités en ont une :
    // Home Assistant autorise à ranger une entité sans ranger son appareil.
    if (!d.area && index.areaOf) {
      const trouvee = d.entities.map(index.areaOf).find(Boolean);
      if (trouvee) { d.area = trouvee; d.areaName = zone(trouvee); }
    }
  });
  return out;
}

/** Les appareils d'une zone, triés par nom. */
export function devicesByArea(devices, areaId) {
  return [...devices.values()]
    .filter(d => d.area === areaId)
    .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'fr'));
}

/**
 * Résumé par intégration : combien d'appareils, combien d'entités, combien
 * répondent. C'est la matière de la vue « Intégrations » et du moteur de santé.
 */
export function byIntegration(devices) {
  const out = new Map();
  devices.forEach(d => {
    const cle = d.integration || 'inconnue';
    let e = out.get(cle);
    if (!e) { e = { integration: cle, devices: 0, entities: 0, unavailable: 0, offline: 0 }; out.set(cle, e); }
    e.devices += 1;
    e.entities += d.entities.length;
    e.unavailable += d.unavailable;
    if (!d.available) e.offline += 1;
  });
  return out;
}
