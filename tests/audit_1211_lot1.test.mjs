// ─────────────────────────────────────────────────
// Ce qu'on voyait à l'écran (audit du 12/11, lot 1).
//
// Des avatars vides dans le bandeau de l'Accueil, une caméra hors ligne
// marquée « LIVE », une vue Sécurité qui comptait d'autres caméras que celles
// qu'elle montrait et se disait calme porte ouverte, « °C » seul à la ligne,
// deux noms pour une même bascule ou une même section, « 1 scénarios », et des
// onglets de rappels rognés sur tablette. Chaque cas reprend ce qu'on lisait.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DASHBOARD } from './monolithe.mjs'; // l'Accueil en entier, ses hooks compris (ADR 0283)
// La langue AVANT l'import, comme les autres suites qui chargent src/.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { cameraEnLigne, camerasDeLaMaison, etatSecurite, comptesSecurite } = await import('../src/attention.js');
const { seuleSurSaRangee } = await import('../src/placement.js');
const { initialesPersonne } = await import('../src/presence.js');
const { SECTIONS_REGLAGES } = await import('../src/reglagesindex.js');
const { trN } = await import('../src/i18n.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
const LANGUES = ['en', 'de', 'nl', 'it', 'es', 'pl'];

// ── E1 : les avatars du bandeau ──────────────────────────────────────────────

test('une personne sans photo a ses initiales, deux lettres au plus', () => {
  assert.equal(initialesPersonne('Camille'), 'CA', 'un prénom seul ne donne plus ses deux premières lettres');
  assert.equal(initialesPersonne('jean pierre martin'), 'JP', 'trois mots donnent plus de deux lettres, ou en minuscules');
  assert.equal(initialesPersonne('  Léa   Dupont '), 'LD', 'les espaces en trop cassent les initiales');
  assert.equal(initialesPersonne(''), '', 'un nom vide écrit quelque chose');
  assert.equal(initialesPersonne(null), '', 'un nom absent lève ou écrit « N »');
});

test('l’avatar sans photo montre ses initiales sur une teinte du thème, et se nomme', () => {
  const d = DASHBOARD;
  assert.ok(d.includes('initiales: p.img ? null : initialesPersonne(p.name)'), 'une personne sans photo redevient un anneau vide');
  assert.ok(d.includes('teinte: TEINTES_AVATAR[i % TEINTES_AVATAR.length]'), 'les avatars sans photo ont tous la même teinte');
  assert.ok(d.includes("color-mix(in srgb, var(${a}) 42%, var(--o-bg2))") && d.includes("teinteAvatar('--o-rose', '--o-purple'), teinteAvatar('--o-accent', '--o-ok'), teinteAvatar('--o-lampe-b', '--o-bad')"), 'le fond des initiales a quitté le thème ou ses trois teintes de repli');
  assert.ok(d.includes("background: u.img ? `url(${u.img}) center/cover` : u.initiales ? u.teinte : u.grad, color: 'var(--o-text1)'"), 'les initiales ne s’écrivent plus en couleur du thème');
  assert.ok(d.includes("role={u.title ? 'img' : undefined} aria-label={u.title || undefined}"), 'le nom et l’état ne vivent plus que dans `title`, muets au lecteur d’écran');
  assert.ok(!d.includes("import { initiales } from '../cartegeo.js'"), 'cartegeo.js (et traceur.js) entrent dans le démarrage pour une ligne');
});

// ── E3 : la tuile caméra de l'Accueil ────────────────────────────────────────

test('une caméra hors ligne n’est plus marquée « LIVE » sur l’Accueil', () => {
  const c = lire('src/cartescustom/cartes.jsx');
  assert.ok(c.includes("tag: cam.online === false ? tr('HORS LIGNE') : 'LIVE · ' + (cam.name || '').toUpperCase()"), 'la tuile de l’Accueil écrit « LIVE » sur une caméra hors ligne');
});

// ── E4 : une liste et une règle pour les caméras ─────────────────────────────

test('une caméra est en ligne selon une seule règle', () => {
  const S = { 'camera.a': { state: 'idle' }, 'camera.b': { state: 'unavailable' }, 'camera.c': { state: 'unknown' } };
  assert.equal(cameraEnLigne({ haid: 'camera.a' }, S), true, 'une caméra qui répond est dite hors ligne');
  assert.equal(cameraEnLigne({ haid: 'camera.b', online: true }, S), false, 'une caméra indisponible est dite en ligne');
  assert.equal(cameraEnLigne({ haid: 'camera.c' }, S), false, '« unknown » compte encore en ligne d’un côté et hors ligne de l’autre');
  assert.equal(cameraEnLigne({ name: 'Jardin' }, S), false, 'une caméra sans entité est dite en ligne');
  assert.equal(cameraEnLigne({ name: 'Jardin', online: true }, S), false, 'une caméra sans entité est dite en ligne par son drapeau');
  assert.equal(cameraEnLigne({ haid: 'camera.d' }, S), true, 'une entité absente de l’instant ne suit plus son drapeau gardé');
  assert.equal(cameraEnLigne({ haid: 'camera.d', online: false }, S), false, 'le drapeau « hors ligne » gardé est ignoré');
});

test('le compteur et les tuiles de la vue Sécurité comptent les mêmes caméras', () => {
  // La démo : quatre caméras choisies, dont le Jardin sans entité ; seule l'entrée a un état.
  const choisies = [{ name: 'Jardin', online: false }, { name: 'Entrée', haid: 'camera.entree', online: true },
    { name: 'Garage', haid: 'camera.garage', online: true }, { name: 'Terrasse', haid: 'camera.terrasse', online: true }];
  const resolues = [{ id: 'camera.entree', haid: 'camera.entree', name: 'Entrée', motion: 'binary_sensor.mouvement_entree' }];
  const S = { 'camera.entree': { state: 'idle' } };
  const liste = camerasDeLaMaison(choisies, resolues);
  assert.equal(liste.length, 4, 'la caméra en panne, sans entité, a disparu des tuiles');
  assert.deepEqual(liste.map(c => cameraEnLigne(c, S)), [false, true, true, true], 'les tuiles ne disent plus ce que dit le compteur');
  assert.equal(liste[1].motion, 'binary_sensor.mouvement_entree', 'la caméra choisie a perdu les détecteurs que la résolution lui connaît');
  const comptes = comptesSecurite({}, liste.map(c => ({ nom: c.name, online: cameraEnLigne(c, S) })));
  assert.deepEqual([comptes.cameras.enLigne, comptes.cameras.total], [3, 4], '« 3/4 en ligne » ne correspond plus aux tuiles');
  // Sans liste choisie, la résolution.
  assert.deepEqual(camerasDeLaMaison(null, resolues).map(c => c.haid), ['camera.entree'], 'sans liste choisie, la vue perd les caméras résolues');
  const vue = lire('src/views/securite.jsx');
  assert.ok(vue.includes('const camsInfoSec = camList.map(c => ({ nom: c.label, online: c.online }));') && vue.includes('const online = c.online;'), 'le compteur et les tuiles relisent chacun leur liste');
  assert.ok(lire('src/app/derive.jsx').includes('online: cameraEnLigne(c, S)'), 'l’Accueil garde sa propre règle');
});

// ── E5 : la pastille de la vue Sécurité ──────────────────────────────────────

test('la pastille ne dit « Tout est calme » que lorsque rien ne bouge ni n’est ouvert', () => {
  const ouverts = { portes: { ouverts: 1 }, fenetres: { ouverts: 1 }, mouvement: { actifs: 0 } };
  assert.deepEqual(etatSecurite({ alarme: 'off', comptes: ouverts }), { titre: '2 ouvrants ouverts', rgb: 'var(--o-warn-rgb)' }, '« Tout est calme » porte et fenêtre ouvertes');
  assert.equal(etatSecurite({ alarme: 'off', comptes: { portes: { ouverts: 1 } } }).titre, '1 ouvrant ouvert', 'un ouvrant seul s’écrit au pluriel');
  assert.deepEqual(etatSecurite({ alarme: 'off', comptes: { mouvement: { actifs: 1 }, portes: { ouverts: 1 } } }), { titre: 'Mouvement détecté', rgb: 'var(--o-warn-rgb)' }, 'un détecteur de mouvement ne compte pas, ou passe après les ouvrants');
  assert.equal(etatSecurite({ alarme: 'home', mouvementCamera: true }).titre, 'Mouvement détecté', 'le mouvement d’une caméra ne compte plus');
  assert.deepEqual(etatSecurite({ alarme: 'triggered', comptes: ouverts }), { titre: 'Alarme déclenchée', rgb: 'var(--o-bad-rgb)' }, 'une alarme déclenchée passe après les ouvrants');
  assert.equal(etatSecurite({ alarme: 'unknown', mouvementCamera: true }).titre, 'État inconnu', 'un état inconnu passe après le mouvement');
  assert.deepEqual(etatSecurite({ alarme: 'off', comptes: { portes: { ouverts: 0 } } }), { titre: 'Tout est calme', rgb: 'var(--o-ok-rgb)' }, 'le calme, alarme désarmée, n’est plus vert');
  assert.deepEqual(etatSecurite({ alarme: 'away', comptes: { portes: { ouverts: 0 } } }), { titre: 'Tout est calme', rgb: 'var(--o-warn-rgb)' }, 'une alarme armée au calme a perdu son ambre');
  assert.ok(lire('src/views/securite.jsx').includes('etatSecurite({ alarme: alarm, mouvementCamera: anyMotion, comptes: comptesSecVue })'), 'la vue décide encore seule de sa pastille');
});

// ── E9 : l'unité ne part plus seule ──────────────────────────────────────────

test('le nombre et son unité restent sur la même ligne', () => {
  assert.ok(DASHBOARD.includes('${dec(a.inTemp, 1)}\\u00a0°${a.inTempUnite}'), '« °C » peut repartir seul à la ligne dans le bandeau');
  assert.ok(lire('src/fichetraceur.jsx').includes("v.pile + '\u00a0%'"), '« % » peut partir seul à la ligne dans la fiche du traceur');
});

// ── E12 : un seul nom pour la bascule ────────────────────────────────────────

test('la bascule de l’historique se nomme « Comparer » partout', () => {
  const h = lire('src/views/energiehisto.jsx');
  assert.ok(!h.includes("tr('Veille')"), 'le téléphone dit encore « Veille » pour « Comparer »');
  assert.equal(h.split("{tr('Comparer')}").length - 1, 2, 'la bascule n’a pas le même nom à l’ordinateur et au téléphone');
});

// ── E15 : la vue Sécurité ────────────────────────────────────────────────────

test('la Présence seule sur sa rangée est repérée, à côté de l’alarme et de la sirène elle ne l’est pas', () => {
  // La démo : l'alarme élargie, la sirène, la Présence.
  assert.deepEqual(seuleSurSaRangee([2, 1, 1], 2), [3], 'à trois colonnes la Présence tombe seule sans être repérée, ou l’est à côté de l’alarme');
  assert.deepEqual(seuleSurSaRangee([2, 1], 1), [2], 'sans sirène, à deux colonnes, la Présence seule n’est pas repérée');
  assert.deepEqual(seuleSurSaRangee([1, 1, 1], 2), [2], 'trois cartes simples : la Présence seule sur la deuxième rangée n’est pas repérée');
  assert.deepEqual(seuleSurSaRangee([1, 1, 1], 1), [], 'une carte suivie d’une autre sur sa rangée est dite seule');
  assert.deepEqual(seuleSurSaRangee([2, 1, 1], 9), [], 'un indice hors de la liste est dit seul');
  const vue = lire('src/views/securite.jsx');
  assert.ok(vue.includes("seuleSurSaRangee(bloc.cartes.map(k => (ed.estLarge(k) ? 2 : 1)), iPres)") && vue.includes("seule.map(n => CLASSES_SEULE[n])") && vue.includes("3: 'o-seule-k3'") && vue.includes('className="o-sec-bloc"'), 'la vue ne pose plus les classes de la rangée seule');
  const css = lire('src/index.css');
  assert.ok(css.includes('.o-sec-bloc { container: secbloc / inline-size; }') && css.includes('@media (max-width: 820px) { .o-seule-k2 { grid-column: 1 / -1; } }')
    && css.includes('@container secbloc (min-width: 707px) and (max-width: 947.98px) { .o-seule-k3 { grid-column: 1 / -1; } }'), 'la Présence seule ne prend plus toute la rangée');
  assert.ok(css.includes('@container (min-width: 420px) { .o-presence-grille { --pres-av: 34px; grid-template-columns: repeat(auto-fill, 88px) !important;') && lire('src/cartescustom/galerie.jsx').includes("avatar(p, 'var(--pres-av, 26px)')"), 'les avatars restent minuscules dans une carte large');
});

test('l’icône du test sonore a son écart, le journal son point médian', () => {
  assert.ok(lire('src/cartescustom/cartes.jsx').includes("display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Fi i=\"volume\" size={12} />{test ?"), 'l’icône du « Test sonore » touche de nouveau le texte');
  const h = lire('src/historique.jsx');
  assert.ok(h.includes("' · ×' + e.n") && !h.includes("' ·×'"), 'le journal écrit encore « RAS ·×2 »');
});

// ── E16 : un nom par section des Paramètres ──────────────────────────────────

test('les sections « Menu » et « Écrans » portent le même nom partout', () => {
  assert.equal(SECTIONS_REGLAGES.vues, 'Menu', 'la recherche des réglages dit encore « Vues »');
  assert.equal(SECTIONS_REGLAGES.appareils, 'Écrans', 'la recherche des réglages dit encore « Appareils »');
  const p = lire('src/views/parametres.jsx');
  assert.ok(p.includes("{ id: 'vues', name: tr('Menu')") && p.includes("{ id: 'appareils', name: tr('Écrans')"), 'les cartes des Paramètres ne disent plus le nom du rail');
  assert.ok(!p.includes("vues: tr('Menu'), appareils: tr('Écrans')"), 'le rail redit un nom que la section porte déjà');
});

// ── E21 : les pluriels au singulier ──────────────────────────────────────────

test('un scénario, un appareil, une pièce s’écrivent au singulier', () => {
  assert.equal(trN(1, '{n} scénario · dernier lancement {x}', '{n} scénarios · dernier lancement {x}', { x: 'hier' }), '1 scénario · dernier lancement hier', '« 1 scénarios »');
  const o = lire('src/vues/objets.jsx');
  assert.ok(o.includes("trN(stats.appareils, '{n} appareil réparti', '{n} appareils répartis') + ' ' + trN(stats.pieces, 'dans {n} pièce', 'dans {n} pièces') + ' · ' + trN(stats.actifs, '{n} actif', '{n} actifs')"), '« 1 appareils répartis dans 1 pièces · 1 actifs »');
  assert.ok(lire('src/vues/scenarios.jsx').includes("trN(liste.length, '{n} scénario · dernier lancement {x}', '{n} scénarios · dernier lancement {x}'"), 'les Scénarios écrivent « 1 scénarios »');
  const neuves = ['{n} scénario · dernier lancement {x}', '{n} appareil réparti', '{n} appareils répartis', 'dans {n} pièce', 'dans {n} pièces'];
  for (const code of LANGUES) {
    const cat = lire('src/langues/' + code + '.js');
    for (const cle of neuves) assert.ok(cat.includes("\n  '" + cle + "':"), code + ' : « ' + cle + ' » s’affiche en français');
  }
});

// ── E8 : les onglets des Rappels ─────────────────────────────────────────────

test('les trois onglets des Rappels tiennent dans le rail d’une tablette', () => {
  const r = lire('src/rappelsrail.jsx');
  assert.ok(r.includes("height: 32, padding: '0 4px', borderRadius: 10") && r.includes("justifyContent: 'center', gap: 4, whiteSpace: 'nowrap'"), 'les onglets ont repris leurs marges de 8 px');
  // Relevé du 12/11 (rail ≈ 276 px) : 61 px pour 68, 40 pour 44, 47 pour 52 — 16 px manquaient.
  const manque = (68 - 61) + (44 - 40) + (52 - 47);
  const rendu = 3 * 2 * (8 - 4) + 2 * (6 - 4); // les marges des trois onglets, l'écart avant deux comptes
  assert.ok(rendu >= manque, 'les onglets restent rognés : ' + rendu + ' px rendus pour ' + manque + ' manquants');
  assert.ok(r.includes('height: 32') && r.includes('fontSize: 12, fontWeight: 700'), 'la hauteur ou la taille du texte des onglets a changé');
});
