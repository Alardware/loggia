/* TEST AJOUTÉ (01/11, lot 10 Gladys, D17, D18, K2, K3, K4 ; ADR 0314) — ce que l'administrateur doit savoir.
 *
 * K2 / D17 : la sauvegarde automatique qui a ÉCHOUÉ (la dernière tentative est plus récente que la dernière réussite) ou qui a
 * pris du RETARD (la prochaine programmée est passée), lue dans les entités de l'intégration `backup`, reconnues à leur
 * plateforme et à leur clé, jamais à leur nom. Au rail de l'Accueil pour un administrateur ; la pastille de la vue Système passe
 * à l'ambre, et l'icône de la dernière sauvegarde n'est plus toujours verte.
 * K3 : le disque au-dessus du seuil critique de la vue (`SEUILS.disque`), une ligne pour tous ses points de montage.
 * K4 / D18 : les mises à jour, aux administrateurs SEULS, en une ligne : « 12 mises à jour ».
 * Le « maintenant » des tests : dimanche 01/11/2026, 14:30, à Paris. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const Sy = await import('../src/systemecalc.js');
const { buildIndex, registresDuComposant } = await import('../src/discovery.js');
const { deriveNotifs } = await import('../src/app/derive.jsx');
const { maisonCapteursDemo } = await import('../src/demo.js');
const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const MAINTENANT = new Date(2026, 10, 1, 14, 30).getTime();
const H = 3600000, J = 24 * H;
const iso = (t) => new Date(t).toISOString();
const nuit = new Date(2026, 10, 1, 4, 55).getTime();   // la tentative de cette nuit
const st = (state, attributes = {}) => ({ state: String(state), attributes });

/* Les cinq entités de l'intégration `backup`, sous des identifiants TRADUITS (une installation allemande) : seules la plateforme
 * et la clé les désignent. */
const CLE_ID = {
  last_successful_automatic_backup: 'sensor.sicherung_letzte_erfolgreiche', last_attempted_automatic_backup: 'sensor.sicherung_letzter_versuch',
  next_scheduled_automatic_backup: 'sensor.sicherung_naechste', backup_manager_state: 'sensor.sicherung_zustand',
};
function maison({ reussie = nuit + 90000, tentee = nuit, prochaine = nuit + J, etat = 'idle', disques = {}, autres = [], plateforme = 'backup' } = {}) {
  const valeurs = { last_successful_automatic_backup: reussie, last_attempted_automatic_backup: tentee, next_scheduled_automatic_backup: prochaine };
  const entities = [], states = {};
  Object.keys(CLE_ID).forEach(cle => {
    const id = CLE_ID[cle];
    entities.push({ entity_id: id, device_id: 'd_backup', platform: plateforme, translation_key: cle });
    const v = cle === 'backup_manager_state' ? etat : valeurs[cle];
    states[id] = st(v == null ? 'unknown' : typeof v === 'number' ? iso(v) : v, { friendly_name: id });
  });
  Object.keys(disques).forEach(id => {
    const [pct, cle, x] = disques[id];
    entities.push({ entity_id: id, device_id: 'd_sysmon', platform: 'systemmonitor', translation_key: cle, ...(x || {}) });
    states[id] = st(pct, { friendly_name: 'Disque ' + id.split('_').pop(), unit_of_measurement: '%' });
  });
  autres.forEach(([id, e, s]) => { entities.push({ entity_id: id, ...e }); states[id] = s; });
  const index = buildIndex({ devices: [{ id: 'd_backup', name: 'Backup', entry_type: 'service' }, { id: 'd_sysmon', name: 'System Monitor' }], entities, states });
  return { index, states };
}

test('K2 : une sauvegarde réussie après sa tentative ne dit rien', () => {
  const m = maison();
  assert.equal(Sy.etatSauvegarde(m.states, m.index, MAINTENANT), null);
  assert.deepEqual(Sy.lignesAdmin(m.states, m.index, MAINTENANT), []);
});

test('K2 : la tentative plus récente que la réussite, c’est un échec — « cette nuit » si c’est vrai', () => {
  const m = maison({ reussie: nuit - J + 90000 });
  const s = Sy.etatSauvegarde(m.states, m.index, MAINTENANT);
  assert.equal(s.etat, 'echec');
  assert.equal(s.texte, 'La sauvegarde de cette nuit a échoué');
  assert.equal(s.quand, nuit);
  // La même tentative, l'après-midi : ce n'était pas « cette nuit ».
  const aprem = new Date(2026, 10, 1, 13, 0).getTime();
  const m2 = maison({ tentee: aprem, reussie: nuit - J });
  assert.equal(Sy.etatSauvegarde(m2.states, m2.index, MAINTENANT).texte, 'La dernière sauvegarde a échoué');
  // Une nuit d'il y a trois jours n'est plus « cette nuit ».
  const m3 = maison({ tentee: nuit - 3 * J, reussie: nuit - 4 * J, prochaine: MAINTENANT + 10 * H });
  assert.equal(Sy.etatSauvegarde(m3.states, m3.index, MAINTENANT).texte, 'La dernière sauvegarde a échoué');
});

test('K2 : une tentative sans aucune réussite est un échec', () => {
  const m = maison({ reussie: null });
  assert.equal(Sy.etatSauvegarde(m.states, m.index, MAINTENANT).etat, 'echec');
});

test('K2 : une sauvegarde EN COURS n’a pas échoué — Home Assistant note la tentative au départ', () => {
  const m = maison({ reussie: nuit - J, etat: 'create_backup' });
  assert.equal(Sy.etatSauvegarde(m.states, m.index, MAINTENANT), null);
  // Sans entité d'état du gestionnaire, la règle s'applique quand même.
  const sans = maison({ reussie: nuit - J });
  delete sans.states[CLE_ID.backup_manager_state];
  assert.equal(Sy.etatSauvegarde(sans.states, sans.index, MAINTENANT).etat, 'echec');
});

test('K2 : la prochaine programmée est passée — « Dernière sauvegarde il y a 4 jours »', () => {
  const m = maison({ reussie: nuit - 4 * J + 60000, tentee: nuit - 4 * J, prochaine: nuit - 3 * J });
  const s = Sy.etatSauvegarde(m.states, m.index, MAINTENANT);
  assert.equal(s.etat, 'ancienne');
  assert.equal(s.texte, 'Dernière sauvegarde il y a 4 jours');
  // Une heure de grâce : à l'heure dite, la sauvegarde a le temps de se faire.
  const juste = maison({ reussie: MAINTENANT - 2 * J + 120000, tentee: MAINTENANT - 2 * J, prochaine: MAINTENANT - 30 * 60000 });
  assert.equal(Sy.etatSauvegarde(juste.states, juste.index, MAINTENANT), null);
  const passe = maison({ reussie: MAINTENANT - J - 2 * H, tentee: MAINTENANT - J - 2 * H - 60000, prochaine: MAINTENANT - 2 * H });
  assert.equal(Sy.etatSauvegarde(passe.states, passe.index, MAINTENANT).texte, 'Dernière sauvegarde il y a 1 jour');
  // Pas de programme (« jamais ») : la prochaine est `unknown`, rien à dire.
  const jamais = maison({ reussie: nuit - 9 * J + 60000, tentee: nuit - 9 * J, prochaine: null });
  assert.equal(Sy.etatSauvegarde(jamais.states, jamais.index, MAINTENANT), null);
  // Une réussite de moins d'un jour n'est pas ancienne, même si l'échéance est passée (un programme changé depuis).
  const recente = maison({ reussie: MAINTENANT - 5 * H, tentee: MAINTENANT - 5 * H - 60000, prochaine: MAINTENANT - 2 * H });
  assert.equal(Sy.etatSauvegarde(recente.states, recente.index, MAINTENANT), null);
  // L'échéance passée sans aucune réussite.
  const aucune = maison({ reussie: null, tentee: null, prochaine: nuit - J });
  assert.equal(Sy.etatSauvegarde(aucune.states, aucune.index, MAINTENANT).texte, 'Aucune sauvegarde automatique réussie');
});

test('K2 : l’échec passe avant le retard', () => {
  const m = maison({ reussie: nuit - 4 * J, tentee: nuit - 2 * J, prochaine: nuit - J });
  assert.equal(Sy.etatSauvegarde(m.states, m.index, MAINTENANT).etat, 'echec');
});

test('K2 : reconnues à la PLATEFORME et à la CLÉ, jamais au nom', () => {
  // Les mêmes clés sous une autre plateforme ne sont pas des sauvegardes.
  const autre = maison({ reussie: nuit - J, plateforme: 'template' });
  assert.equal(Sy.etatSauvegarde(autre.states, autre.index, MAINTENANT), null);
  // Un capteur NOMMÉ comme celui de Home Assistant, sans clé : ignoré.
  const m = maison({ autres: [['sensor.backup_last_attempted_automatic_backup', { platform: 'template' }, st(iso(MAINTENANT - H))]] });
  assert.equal(Sy.etatSauvegarde(m.states, m.index, MAINTENANT), null);
  const r = Sy.entitesAdmin(m.index).sauvegarde;
  // Une entité DÉSACTIVÉE de même clé, lue après la vraie, ne lui prend pas sa place (les registres de Home Assistant les gardent).
  const desactivee = maison({ reussie: nuit - J, autres: [['sensor.zz_ancienne_tentative', { platform: 'backup', translation_key: 'last_attempted_automatic_backup', disabled_by: 'user' }, st('unknown')]] });
  assert.equal(Sy.entitesAdmin(desactivee.index).sauvegarde.tentee, CLE_ID.last_attempted_automatic_backup);
  assert.equal(Sy.etatSauvegarde(desactivee.states, desactivee.index, MAINTENANT).etat, 'echec');
  assert.equal(r.tentee, CLE_ID.last_attempted_automatic_backup);
  assert.equal(r.etat, CLE_ID.backup_manager_state);
  assert.equal(Sy.entitesAdmin(null).disques.length, 0, 'sans index, rien');
});

test('K3 : le disque au-dessus du seuil CRITIQUE de la vue, une seule ligne pour ses points de montage', () => {
  assert.equal(Sy.SEUILS.disque[1], 92, 'le seuil existant de la vue Système, pas un seuil neuf');
  const m = maison({ disques: {
    'sensor.sm_disque_config': [93, 'disk_use_percent'], 'sensor.sm_disque_media': [95.4, 'disk_use_percent'],
    'sensor.sm_disque_share': [40, 'disk_use_percent'],
    // Le même pourcentage sans la clé : pas un disque. Caché par l'utilisateur : pas lu.
    'sensor.sm_disque_x': [99, null], 'sensor.sm_disque_cache': [99, 'disk_use_percent', { hidden_by: 'user' }],
  } });
  assert.deepEqual(Sy.disquePlein(m.states, m.index), { id: 'sensor.sm_disque_media', pct: 95.4, nom: 'Disque media' });
  const lignes = Sy.lignesAdmin(m.states, m.index, MAINTENANT);
  assert.deepEqual(lignes, [{ cle: 'admin:disque', icone: 'hdd', rgb: 'var(--o-warn2-rgb)', nom: 'Disque plein à 95 %', sous: 'Disque media' }]);
  const sous = maison({ disques: { 'sensor.sm_disque_config': [91.9, 'disk_use_percent'], 'sensor.glances_disque': [91, 'disk_usage'] } });
  assert.equal(Sy.disquePlein(sous.states, sous.index), null, 'sous 92 % : rien');
  const glances = maison({ disques: { 'sensor.glances_disque': [97, 'disk_usage'], 'sensor.nas_volume': [96, 'volume_percentage_used'] } });
  assert.equal(Sy.disquePlein(glances.states, glances.index).id, 'sensor.glances_disque', 'Glances et Synology aussi');
});

test('K2 + K3 : les lignes du rail, la sauvegarde d’abord, avec l’heure de la tentative', () => {
  const m = maison({ reussie: nuit - J, disques: { 'sensor.sm_disque_config': [94, 'disk_use_percent'] } });
  const l = Sy.lignesAdmin(m.states, m.index, MAINTENANT);
  assert.deepEqual(l.map(x => x.cle), ['admin:sauvegarde', 'admin:disque']);
  assert.deepEqual(l[0], { cle: 'admin:sauvegarde', icone: 'cloud-disabled', rgb: 'var(--o-warn2-rgb)', nom: 'La sauvegarde de cette nuit a échoué', sous: 'aujourd’hui, 04:55' });
});

test('K2 : la vue Système — l’alerte qui passe la pastille à l’ambre, l’icône qui n’est plus toujours verte', () => {
  const s = { etat: 'echec', texte: 'La sauvegarde de cette nuit a échoué', quand: nuit };
  assert.deepEqual(Sy.alertesSysteme({ sauvegarde: s }), [{ cle: 'sauvegarde', niveau: 'warn', texte: 'La sauvegarde de cette nuit a échoué' }]);
  assert.deepEqual(Sy.alertesSysteme({}), []);
  const vue = lire('src/views/systeme.jsx');
  assert.ok(vue.includes('const defautSauvegarde = etatSauvegarde(S, LOGGIA_INDEX, maintenant);'));
  assert.ok(vue.includes('modules: modules.liste, sauvegarde: defautSauvegarde });'), 'l’alerte compte dans la pastille');
  assert.ok(vue.includes("<Fi i={enDefaut ? 'cloud-disabled' : 'cloud-check'} size={16} color={enDefaut ? 'var(--o-warn2)' : 'var(--o-ok)'} />"));
  assert.ok(vue.includes('enDefaut={!!defautSauvegarde}'));
  assert.ok(!vue.includes('<Fi i="cloud-check" size={16} color="var(--o-ok)" />'), 'plus de vert en dur');
});

test('K2 + K3 : le rail ne les montre qu’à un ADMINISTRATEUR, et charge la règle à la demande', () => {
  const d = lire('src/accueil/dashboard.jsx');
  assert.ok(d.includes('const admin = dashHass && dashHass.user && dashHass.user.is_admin;'));
  assert.ok(d.includes("useEffect(() => { if (admin) import('../systemecalc.js').then(setSys, () => {}); }, [admin]);"));
  assert.ok(d.includes("if (sys) sys.lignesAdmin(S0).forEach(x => momentRows.push(<LigneMoment key={x.cle} {...x} onOpen={onNav ? () => onNav('systeme') : null} />));"));
  assert.ok(!/^import .*'\.\.\/systeme\.js'/m.test(d), 'jamais importé au boot');
  // Ni point d'attention, ni téléphone.
  assert.ok(!lire('src/attention.js').includes('etatSauvegarde'));
  assert.ok(!lire('scripts/textes_serveur.mjs').includes('sauvegarde de cette nuit'));
});

const majs = (n, base = Date.parse('2026-10-30T10:00:00Z')) => {
  const S = {};
  for (let i = 0; i < n; i++) S['update.appareil_' + i] = { state: 'on', last_changed: new Date(base + i * 60000).toISOString(), attributes: { title: 'Appareil ' + i, latest_version: '1.' + i } };
  S['update.a_jour'] = { state: 'off', last_changed: new Date(base + 99 * 60000).toISOString(), attributes: {} };
  return S;
};
const lignesMaj = (hass) => deriveNotifs(hass).filter(n => n.k.indexOf('maj:') === 0);

test('K4 / D18 : un administrateur voit UNE ligne, « 12 mises à jour »', () => {
  const l = lignesMaj({ states: majs(12), user: { is_admin: true } });
  assert.equal(l.length, 1);
  assert.equal(l[0].t, 'Mises à jour');
  assert.equal(l[0].m, '12 mises à jour');
  assert.equal(lignesMaj({ states: majs(1), user: { is_admin: true } })[0].m, '1 mise à jour');
  assert.equal(lignesMaj({ states: majs(0), user: { is_admin: true } }).length, 0, 'aucune en attente : rien');
});

test('K4 / D18 : un compte ordinaire, ou un compte inconnu, n’en voit aucune', () => {
  assert.equal(lignesMaj({ states: majs(12), user: { is_admin: false } }).length, 0);
  assert.equal(lignesMaj({ states: majs(12) }).length, 0, 'sans compte connu, rien : réservé, pas « sauf refus »');
});

test('K4 : la clé suit la plus récente — une mise à jour neuve rentre au journal, en installer une n’y remet rien', () => {
  const S = majs(3);
  const k = lignesMaj({ states: S, user: { is_admin: true } })[0].k;
  assert.equal(k, 'maj:' + S['update.appareil_2'].last_changed);
  // Une installée (la plus ancienne) : même clé, le journal ne la reprend pas.
  const apres = { ...S, 'update.appareil_0': { ...S['update.appareil_0'], state: 'off' } };
  assert.equal(lignesMaj({ states: apres, user: { is_admin: true } })[0].k, k);
  // Une neuve : clé neuve.
  const neuve = { ...S, 'update.neuve': { state: 'on', last_changed: '2026-10-31T08:00:00.000Z', attributes: {} } };
  assert.notEqual(lignesMaj({ states: neuve, user: { is_admin: true } })[0].k, k);
});

test('Démo : la sauvegarde de cette nuit a échoué, et l’administrateur le lit au rail', async () => {
  const m = maisonCapteursDemo();
  const reg = await registresDuComposant({ callWS: async () => ({ index: m.index() }) });
  const index = buildIndex({ ...reg, states: m.states });
  const r = Sy.entitesAdmin(index).sauvegarde;
  assert.ok(r.reussie && r.tentee && r.prochaine && r.etat, 'les quatre entités, à leur clé');
  const l = Sy.lignesAdmin(m.states, index, Date.now());
  assert.equal(l.length, 1);
  assert.equal(l[0].nom, 'La sauvegarde de cette nuit a échoué');
  assert.equal(Sy.disquePlein(m.states, index), null, 'le disque de la démo est à 46 %');
});
