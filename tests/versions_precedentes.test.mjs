// ─────────────────────────────────────────────────────────────────────────────
// « Revenir à la version d’avant » (29/10, ADR 0285).
//
// Le composant garde une copie de la configuration avant les écritures (au
// plus une par quart d’heure, les dix dernières) ; Paramètres › À propos les
// montre à qui peut importer, et un bouton en remet une, en deux temps comme
// la remise à zéro. Ici : la date lisible, la ligne de chaque copie, l’envoi
// au composant et le ménage du navigateur après le retour, les refus qu’il
// nomme, la place dans Paramètres, et la démo.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composant, rendre } from './rendu.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');

const V = await import('../src/versions.js');
const { versionsDemo } = await import('../src/demo.js');
const ListeVersions = await composant('views/versions.jsx', 'ListeVersions');

const MAINTENANT = Date.parse('2026-10-29T15:00:00Z');
const ilYA = (min) => new Date(MAINTENANT - min * 60000).toISOString();
// `Intl` sépare « 2 h » d’une espace insécable, et c’est juste : les tests la lisent comme une espace.
const INSECABLES = new RegExp('[' + String.fromCharCode(0xa0, 0x202f) + ']', 'g');
const blanc = (t) => String(t).replace(INSECABLES, ' ');
const quand = (iso) => blanc(V.quandVersion(iso, MAINTENANT));
const texte = (html) => blanc(html).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/\s+/g, ' ').trim();

// ── La date, lisible ────────────────────────────────────────────────────────

test('la date d’une copie : « il y a 2 h », sinon le jour et l’heure', () => {
  assert.equal(quand(ilYA(0.5)), 'À l’instant');
  assert.equal(quand(ilYA(12)), 'il y a 12 min');
  assert.equal(quand(ilYA(125)), 'il y a 2 h');
  assert.equal(quand(ilYA(23 * 60 + 59)), 'il y a 23 h');
  // Au-delà d’une journée : le jour et l’heure, à l’heure de l’écran (Paris).
  assert.equal(quand('2026-10-27T13:05:00Z'), 'mardi 27 octobre à 14:05');
  assert.equal(quand('pas une date'), '—');
  // Une horloge en avance sur le serveur : jamais « dans 3 min ».
  assert.equal(quand(ilYA(-3)), 'À l’instant');
});

test('qui : le compte avant lequel la copie a été prise, ou le retour qu’elle précède', () => {
  assert.equal(V.motifVersion({ motif: 'ecriture', compte: 'Camille' }), 'Avant un enregistrement de Camille');
  assert.equal(V.motifVersion({ motif: 'ecriture', compte: null }), 'Avant un enregistrement');
  assert.equal(V.motifVersion({ motif: 'retour', compte: 'Camille' }), 'Avant un retour en arrière de Camille');
  assert.equal(V.motifVersion({ motif: 'retour', compte: null }), 'Avant un retour en arrière');
});

test('la réponse du composant : dix au plus, des champs sûrs, rien d’autre', () => {
  const brut = { versions: [
    ...Array.from({ length: 12 }, (_, i) => ({ id: 'v' + i, date: ilYA(i * 20), compte: i % 2 ? 'Papa' : null, taille: 70000, motif: i === 0 ? 'retour' : 'ecriture', contenu: 'jamais' })),
  ] };
  const liste = V.versionsDe(brut);
  assert.equal(liste.length, 10);
  assert.deepEqual(liste[0], { id: 'v0', date: ilYA(0), compte: null, taille: 70000, motif: 'retour' });
  assert.equal(liste[1].compte, 'Papa');
  assert.deepEqual(V.versionsDe(null), []);
  assert.deepEqual(V.versionsDe({ versions: [{ id: 3 }, null, { id: 'x', date: ilYA(1), motif: 'autre' }] }),
    [{ id: 'x', date: ilYA(1), compte: null, taille: 0, motif: 'ecriture' }]);
});

// ── Les envois ──────────────────────────────────────────────────────────────

function stockage(depart = {}) {
  const m = new Map(Object.entries(depart));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    cles: () => [...m.keys()].sort(),
  };
}

test('lister puis rendre : les deux commandes, et le navigateur oublie ce que le retour a changé', async () => {
  const envois = [];
  const rendue = { rendue: 'a1', cles: ['loggia-theme', 'loggia_rooms', 'loggia_vues'], versions: [] };
  const hass = { callWS: async (msg) => { envois.push(msg); return msg.type === V.WS_VERSIONS_LISTE ? { versions: [{ id: 'a1', date: ilYA(5), compte: 'Papa', taille: 1, motif: 'ecriture' }] } : rendue; } };
  assert.deepEqual((await V.listerVersions(hass)).map((v) => v.id), ['a1']);
  const ls = stockage({ loggia_rooms: '[]', 'loggia-theme': 'nuit', loggia_enattente: '{}', loggia_look: '{}', 'loggia-appareil': 'tablette', 'loggia-ha-fr': '{}' });
  globalThis.localStorage = ls;
  try {
    assert.equal(await V.rendreVersion(hass, 'a1'), rendue);
  } finally { delete globalThis.localStorage; }
  assert.deepEqual(envois, [{ type: 'loggia/versions/liste' }, { type: 'loggia/versions/rendre', version: 'a1' }],
    'l’identifiant s’appelle `version` : `id` est le numéro du message');
  // Les clés que le composant nomme, et le carnet des réglages en attente, partent ; le reste — ce que
  // l’appareil sait de lui-même, une clé que le retour n’a pas changée — reste.
  assert.deepEqual(ls.cles(), ['loggia-appareil', 'loggia-ha-fr', 'loggia_look']);
});

test('le carnet oublié est bien celui des réglages en attente', () => {
  assert.ok(lire('src', 'enattente.js').includes("const CLE = '" + V.CLE_CARNET + "';"));
});

test('rien de plus exporté par le démarrage : les versions n’importent de lui que ce que Paramètres lit déjà', () => {
  /* Chaque nom que le démarrage exporte vers un morceau à la demande le fait grossir (mesuré : `getHass`,
   * `enregistrerRefus` et `estCleAppareil` ajoutaient 15 octets au boot). */
  const imports = (f) => [...lire('src', ...f).matchAll(/^import \{([^}]*)\} from '([^']+)';$/gm)].map((m) => [m[2], m[1].split(',').map((x) => x.trim()).sort()]);
  assert.deepEqual(imports(['versions.js']), [['./i18n.js', ['locale', 'tr']]]);
  assert.deepEqual(imports(['views', 'versions.jsx']).map(([de]) => de), ['react', '../i18n.js', './parcommun.jsx', '../versions.js']);
});

test('un retour refusé ne touche pas au navigateur', async () => {
  const ls = stockage({ loggia_rooms: '[]' });
  globalThis.localStorage = ls;
  try {
    await assert.rejects(V.rendreVersion({ callWS: async () => { throw { code: 'version_inconnue', message: 'version inconnue : a1' }; } }, 'a1'));
  } finally { delete globalThis.localStorage; }
  assert.deepEqual(ls.cles(), ['loggia_rooms']);
});

test('les refus du composant se disent dans la langue de l’écran', () => {
  assert.equal(V.texteVersion({ code: 'version_inconnue', message: 'version inconnue : a1' }), 'Version introuvable — une plus récente l’a remplacée');
  assert.equal(V.texteVersion({ code: 'version_illisible', message: 'copie illisible : a1' }), 'Version illisible — cette copie est abîmée');
  assert.equal(V.texteVersion({ code: 'versions_indisponibles', message: 'x' }), 'Versions précédentes indisponibles — leur fichier est illisible');
  // Le reste n’est pas à lui : `motifEchec` de Paramètres le dit.
  for (const e of [{ code: 'payload_too_large', message: 'x' }, { code: 'toString' }, new Error('x'), null]) assert.equal(V.texteVersion(e), null);
  const vue = lire('src', 'views', 'versions.jsx');
  assert.equal((vue.match(/texteVersion\(err\) \|\| /g) || []).length, 2, 'la liste et le retour disent ces refus par leur phrase');
});

// ── L’écran ─────────────────────────────────────────────────────────────────

const LISTE = [
  { id: 'a1', date: ilYA(125), compte: 'Camille', taille: 1, motif: 'ecriture' },
  { id: 'a0', date: '2026-10-27T13:05:00Z', compte: null, taille: 1, motif: 'retour' },
];

test('chaque copie : sa date, son compte, et « Revenir à celle-ci »', () => {
  const html = rendre(ListeVersions, { etat: { charge: true, liste: LISTE, erreur: null }, maintenant: MAINTENANT });
  const t = texte(html);
  assert.ok(t.startsWith('Versions précédentes'), t);
  assert.ok(t.includes('il y a 2 h Avant un enregistrement de Camille Revenir à celle-ci'), t);
  assert.ok(t.includes('mardi 27 octobre à 14:05 Avant un retour en arrière Revenir à celle-ci'), t);
  assert.equal((html.match(/<button/g) || []).length, 2);
  assert.ok(!html.includes('<select'), 'jamais de <select> natif');
  assert.ok(!/#(?!fff\b)[0-9a-f]{3,8}\b/i.test(html), 'aucune couleur en dur, hors le blanc');
});

test('la confirmation en deux temps, puis « Retour… » ; les autres boutons attendent', () => {
  const arme = rendre(ListeVersions, { etat: { charge: true, liste: LISTE, erreur: null }, arme: 'a1', maintenant: MAINTENANT });
  assert.ok(texte(arme).includes('Avant un enregistrement de Camille Confirmer ?'));
  assert.ok(arme.includes('var(--o-bad)'), 'armé, le bouton passe au rouge, comme la remise à zéro');
  const parti = rendre(ListeVersions, { etat: { charge: true, liste: LISTE, erreur: null }, enCours: 'a1', maintenant: MAINTENANT });
  assert.ok(texte(parti).includes('Retour…'));
  assert.equal((parti.match(/disabled=""/g) || []).length, 2, 'un seul retour à la fois');
});

test('rien encore, une lecture, une panne : la ligne le dit', () => {
  const lu = (etat) => texte(rendre(ListeVersions, { etat, maintenant: MAINTENANT }));
  assert.equal(lu({ charge: false, liste: [], erreur: null }), 'Versions précédentes Lecture…');
  assert.equal(lu({ charge: true, liste: [], erreur: null }),
    'Versions précédentes Aucune copie pour l’instant : la première se fera au prochain enregistrement.');
  assert.equal(lu({ charge: true, liste: [], erreur: 'Home Assistant n’a pas répondu.' }), 'Versions précédentes Home Assistant n’a pas répondu.');
});

test('dans Paramètres › À propos, sous la même garde que l’import, et à la demande', () => {
  const par = lire('src', 'views', 'parametres.jsx');
  assert.ok(par.includes("import { VersionsPrecedentes } from './versions.jsx';"));
  const installation = par.slice(par.indexOf("<Panneau titre={tr('Installation')}"), par.indexOf("[tr('Dépôt GitHub')"));
  assert.ok(installation.includes('{isAdmin && <VersionsPrecedentes hass={hass} motif={motifEchec} alerter={alerter} />}'),
    'la ligne vit avec Exporter et Importer, pour les mêmes comptes que l’import');
  assert.ok(installation.includes('{isAdmin && <ImportConfigBtn />}'));
  // Rien de tout cela dans le démarrage : Paramètres se charge à la demande.
  for (const f of ['main.jsx', 'boot.jsx', 'state.js', 'App.jsx']) {
    assert.ok(!lire('src', f).includes('versions.js'), f + ' importe les versions : le démarrage grossirait');
  }
  const vue = lire('src', 'views', 'versions.jsx');
  assert.ok(vue.includes('window.location.reload()'), 'après le retour, Loggia se recharge comme après un import');
});

// ── La démo ─────────────────────────────────────────────────────────────────

test('la démo montre deux ou trois copies, et rend comme toute écriture de configuration', () => {
  const { versions } = versionsDemo(MAINTENANT);
  assert.ok(versions.length >= 2 && versions.length <= 3);
  const liste = V.versionsDe({ versions });
  assert.equal(liste.length, versions.length, 'des copies que l’écran sait lire');
  assert.ok(versions.every((v) => !('contenu' in v)));
  assert.equal(quand(liste[0].date), 'il y a 2 h');
  const demo = lire('src', 'demo.js');
  assert.ok(demo.includes("if (msg && msg.type === 'loggia/versions/liste') return Promise.resolve(versionsDemo());"));
  // `loggia/config/set` n’a pas de réponse dans la démo : elle tombe sur le refus final. `rendre` dit la même chose.
  assert.ok(!demo.includes("'loggia/config/set'"));
  assert.ok(demo.includes("if (msg && msg.type === 'loggia/versions/rendre') return Promise.reject(new Error('démonstration : pas de composant serveur'));"));
  assert.ok(demo.includes("return Promise.reject(new Error('démonstration : pas de composant serveur'));\n    },"));
});
