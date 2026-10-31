// ─────────────────────────────────────────────────────────────────────────────
// Le mode clair tenu, un seul signal pour le hors-ligne, les identités en
// jetons (v3.50.0, ADR 0048).
//
// Trois garde-fous. Les couleurs qui servent de TEXTE en clair tiennent le
// contraste (4,5:1 sur blanc, 3:1 sur le fond de page pour les identités qui
// ne s'écrivent qu'en gros ou en gras) — calculé ici, pas promis. Ce qui se
// dessine sur du noir quel que soit le thème (veille, caméra) vit dans un
// îlot sombre. Et « ne répond plus » se dit d'une seule façon : le liseré.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MONOLITHE, VUES_SORTIES } from './monolithe.mjs'; // App.jsx + les vues sorties du boot (ADR 0274)

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const compter = (s, motif) => s.split(motif).length - 1;
const css = lire('src', 'index.css');
  /* + l'ecran de veille et la modale du code : sortis d'App.jsx le 23/09
   * (plan M1). Ce que ce fichier verifie n'a pas bouge, seulement son
   * adresse — on relit donc le monolithe ET ce qui en est sorti. */
const app = ([MONOLITHE, ...['ecranveille.jsx', 'pinmodal.jsx', 'theme.js'].map(f => lire('src', f))].join(String.fromCharCode(10)) + VUES_SORTIES);

const bloc = (debut) => { const i = css.indexOf(debut); return css.slice(i, css.indexOf('\n}', i)); };
const jetons = (texte) => { const m = {}; for (const [, k, v] of texte.matchAll(/(--o-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) m[k] = v; return m; };
const SOMBRE = jetons(bloc(':root {'));
const CLAIR = { ...SOMBRE, ...jetons(bloc('html.loggia-light {')) };

const lum = (hex) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; const n = parseInt(hex.slice(1), 16); return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); };
const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('en clair, chaque couleur qui sert de texte tient le contraste', () => {
  const texte = ['--o-text', '--o-text1', '--o-text2', '--o-text3', '--o-ok', '--o-warn', '--o-warn2', '--o-bad', '--o-cold', '--o-accent-soft', '--o-purple', '--o-cyan', '--o-gold'];
  for (const k of texte) {
    assert.ok(CLAIR[k], k + ' défini en clair');
    assert.ok(contraste(CLAIR[k], '#ffffff') >= 4.5, k + ' sur blanc : ' + contraste(CLAIR[k], '#ffffff').toFixed(2));
    assert.ok(contraste(CLAIR[k], CLAIR['--o-bg']) >= 4.5, k + ' sur le fond : ' + contraste(CLAIR[k], CLAIR['--o-bg']).toFixed(2));
  }
  // Les identités s'écrivent en gros (la température d'une pièce, 25 px) ou
  // colorent une icône : 3:1 sur le fond, 4,5:1 sur une carte blanche.
  const identites = ['--o-piece-ambre', '--o-piece-tendre', '--o-piece-chambre', '--o-piece-bain', '--o-piece-vert', '--o-lampe', '--o-orange', '--o-rose'];
  for (const k of identites) {
    assert.ok(CLAIR[k] !== SOMBRE[k], k + ' redéfini en clair');
    assert.ok(contraste(CLAIR[k], '#ffffff') >= 4.5, k + ' sur blanc : ' + contraste(CLAIR[k], '#ffffff').toFixed(2));
    assert.ok(contraste(CLAIR[k], CLAIR['--o-bg']) >= 3, k + ' sur le fond : ' + contraste(CLAIR[k], CLAIR['--o-bg']).toFixed(2));
  }
});

test('en sombre aussi, le texte et les identités se lisent', () => {
  for (const k of ['--o-text2', '--o-text3', '--o-ok', '--o-warn', '--o-bad', '--o-cold', '--o-accent-soft', '--o-lampe', '--o-orange', '--o-rose', '--o-piece-ambre', '--o-piece-chambre']) {
    assert.ok(contraste(SOMBRE[k], SOMBRE['--o-bg']) >= 4.5, k + ' : ' + contraste(SOMBRE[k], SOMBRE['--o-bg']).toFixed(2));
  }
});

test('les identités ont leurs jetons, et l’écran ne les écrit plus en dur', () => {
  for (const k of ['--o-lampe', '--o-lampe-b', '--o-lampe-rgb', '--o-orange', '--o-orange-rgb', '--o-rose', '--o-rose-rgb', '--o-flux-solaire', '--o-flux-maison', '--o-flux-reseau', '--o-flux-ve', '--o-flux-batterie', '--o-text3-rgb']) {
    assert.ok(bloc(':root {').includes(k + ':'), k);
  }
  const ui = lire('src', 'ui.jsx');
  for (const k of ['orange', 'rose', 'lampe']) assert.ok(ui.includes("'var(--o-" + k + ")': '--o-" + k + "-rgb'"), 'hx connaît ' + k);
  for (const brut of ["'#ff8a4c'", '"#ff8a4c"', "'#ffce73'", '"#ffce73"', '#FF2D78', "'52,211,153'", 'rgba(52,211,153,', "'140,152,180'", 'rgba(140,152,180,', 'linear-gradient(135deg,#ffb347,#f87171)', "solar: '#fbbf24'", 'linear-gradient(90deg,#ffce73,#f59e0b)', 'rgba(255,138,76,', "'255,45,120'"]) {
    assert.equal(compter(app, brut), 0, brut);
  }
  assert.ok(app.includes("const RM_ROSE = 'var(--o-rose)';"));
  assert.ok(app.includes("const C = { solar: 'var(--o-flux-solaire)', home: 'var(--o-flux-maison)', grid: 'var(--o-flux-reseau)', ev: 'var(--o-flux-ve)', bat: 'var(--o-flux-batterie)' };"));
  assert.ok(app.includes("function ViewHead({ titre, sous, badge, rgb = 'var(--o-ok-rgb)' })"), 'le vert de l’en-tête suit le thème');
  assert.ok(app.includes("{ id: 'accent', label: 'Accent', col: 'var(--o-accent-soft)', rgb: 'var(--o-accent-soft-rgb)' },"), 'l’accent d’une pièce, en texte, prend la variante lisible');
  // Restent en dur, par nature : les palettes des thèmes, les couleurs de
  // profil et d’accent choisies (une valeur enregistrée doit être une couleur).
  assert.ok(ui.includes("export const USER_COLORS = ['#4f8cff',"));
});

test('un îlot sombre garde les jetons sombres sous n’importe quel thème', () => {
  const ilot = bloc('.o-sombre {');
  for (const k of ['--o-text', '--o-text2', '--o-ok', '--o-warn', '--o-bad', '--o-lampe', '--o-accent-soft']) assert.ok(ilot.includes(k + ':'), k);
  assert.equal(jetons(ilot)['--o-bad'], SOMBRE['--o-bad']);
  // La veille n'est plus un `role="button"` qui englobe ses scènes (lot 13 de
  // l'audit du 03/10) : l'îlot sombre reste sa racine, son geste passe par un
  // bouton de surface.
  assert.ok(app.includes(`<div className="o-sombre" style={{ position: 'fixed', inset: 0, zIndex: 500,`) && app.includes(`<Surface onClick={reveiller} label={tr('Toucher pour réveiller')} popup={false} />`), 'la veille');
  assert.ok(app.includes("className={'o-sombre o-cam-tuile' + (c.online === false ? ' o-panne' : '')}"), 'la tuile caméra');
});

test('le thème est posé AVANT la première peinture', () => {
  // Audit du 27/09 : le sombre est `:root`, le clair `html.loggia-light`, et
  // `html` prend `var(--o-bg)`. La classe n'arrivait qu'avec React : tout
  // écran réglé en clair s'allumait SOMBRE une fraction de seconde à chaque
  // chargement. Un script en ligne dans `<head>` la pose avant.
  const index = lire('index.html');
  const i = index.indexOf('<script>');
  assert.notEqual(i, -1, 'le script de thème a disparu d’index.html');
  const amorce = index.slice(i, index.indexOf('</script>', i));
  assert.ok(amorce.includes("classList.add('loggia-light')"), 'le script ne pose plus la classe');
  // Il doit lire les MÊMES clés et les mêmes défauts qu'App.jsx, sinon il
  // devinerait autre chose que ce que l'application appliquera ensuite.
  assert.ok(amorce.includes("localStorage.getItem('loggia-mode')"), 'le script ne lit plus le mode enregistré');
  assert.ok(/m !== 'light' && m !== 'dark' && m !== 'auto'/.test(amorce) && /= 'dark'/.test(amorce),
    'le script ne retombe plus sur le sombre par défaut, comme App.jsx');
  assert.ok(amorce.includes('prefers-color-scheme: light'), 'le mode « auto » n’interroge plus le système');
  // Et il S'ABSTIENT quand il ne peut pas savoir : « suivre Home Assistant »
  // ne se tranche qu'une fois HA joignable. Se tromper coûterait un éclair
  // CLAIR sur un écran sombre, la nuit — plus cher que de ne rien faire.
  assert.ok(/loggia-ha'\) === 'FOLLOW'\) return/.test(amorce),
    'le script ne s’abstient plus quand le thème suit Home Assistant');
  assert.ok(amorce.includes('try'), 'le script n’encaisse plus un stockage refusé');
  // Le montage d'App.jsx lit la même clé avec le même repli : les deux
  // doivent rester d'accord.
  assert.ok(app.includes("localStorage.getItem('loggia-mode')") && app.includes("? m : 'dark'"),
    'App.jsx ne lit plus `loggia-mode` de la même façon : le script d’amorce dirait autre chose');
});

test('« ne répond plus » se dit d’une seule façon : le liseré', async () => {
  // ASSERTION MODIFIÉE (étape 2 IoT, 19/10 ; I5, I12) : la carte du distributeur lit sa vue (`v`) ; muette, `v.mort` — sa compacte comme la large.
  assert.ok(app.includes("function RoomFeederCard({ v, onOpen, chip = false }) {"));
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 10 ; C30) : la carte d'une plante lit sa plante (`pl`) ; muette (`pl.mort`), le liseré.
  assert.ok(app.includes("function RoomPlantCard({ pl, nom, onOpen, chip = false }) {") && app.includes("mort: muet(c.hum)") && app.includes('const mort = v.muette;'));
  assert.equal(compter(app, "className={'o-piece o-cvdense' + (mort ? ' o-panne' : '')}"), 1, 'la plante, compacte');
  assert.equal(compter(app, "className={'o-piece o-cvdense' + (v.mort ? ' o-panne' : '')}"), 1, 'le distributeur, compact');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : le thermostat et le fil pilote portent aussi la classe de la grille commune (`o-gabarit`) — les huit cartes, six et deux.
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 10 ; C30) : la carte d'une plante prend la grille commune — cinq et trois.
  // ASSERTION MODIFIÉE (chantier Médias, tâche 4 ; M5) : la carte d'un lecteur passe dans la grille commune (`o-rmcard o-gabarit`, sa panne nommée `v.indispo`) — quatre cartes gardent cette écriture.
  // ASSERTION MODIFIÉE (chantier IoT, tâche 6, 18/10 ; I5) : la carte d'un robot passe dans la grille commune (`o-rmcard o-gabarit`, sa panne nommée `v.panne`) — trois cartes gardent cette écriture.
  // ASSERTION MODIFIÉE (étape 2 IoT, 19/10 ; I5) : la carte du distributeur passe dans la grille commune (`o-rmcard o-gabarit`, sa panne lue dans sa vue, `v.mort`) — deux cartes gardent cette écriture.
  assert.equal(compter(app, "className={'o-rmcard' + (mort ? ' o-panne' : '')}"), 2, 'toutes les cartes de pièce (la lampe porte aussi o-light-card)');
  assert.equal(compter(app, "className={'o-rmcard o-gabarit' + (v.panne ? ' o-panne' : '')}"), 1, 'le robot, dans la grille commune');
  assert.equal(compter(app, "className={'o-rmcard o-gabarit' + (v.indispo ? ' o-panne' : '')}"), 1, 'le lecteur, dans la grille commune');
  assert.equal(compter(app, "className={'o-rmcard o-gabarit' + (mort ? ' o-panne' : '')}"), 3, 'le thermostat, le fil pilote et la plante');
  assert.ok(app.includes("const mort = !!(estClimate(zone) && (!S || !S[zone.haid] || S[zone.haid].state === 'unavailable'));"), 'la zone de chauffage');
  /* Le distributeur (05/10, ADR 0155) : le réservoir muet ne suffisait pas —
   * chez l'utilisateur, c'est une aide `input_number` qui ne tombe jamais, et
   * son distributeur débranché n'aurait jamais eu de liseré. `enLigne` y ajoute
   * la commande muette et la connectivité de l'appareil. */
  // ASSERTION MODIFIÉE (étape 2 IoT, 19/10 ; I5) : la carte au gabarit commun lit la panne de sa vue (`carteDistributeur` : `mort`, d'`enLigne`).
  assert.ok(app.includes("className={'o-rmcard o-gabarit' + (v.mort ? ' o-panne' : '')}") && readFileSync(new URL('../src/distributeur.js', import.meta.url), 'utf8').includes('const { mort, raison } = lecture.enLigne;'), 'le distributeur');
  const { enLigne } = await import('../src/distributeur.js');
  const RES = 'input_number.bac', FEED = 'select.distributeur_feed';
  const commande = { domaine: 'select', entity_id: FEED };
  const cfg = { haids: { reservoir: RES } };
  const vivant = { [RES]: { state: '700' }, [FEED]: { state: 'unknown' } };
  assert.equal(enLigne([], vivant, cfg, commande).mort, false, 'un select feed `unknown` est son état normal sous Zigbee2MQTT');
  assert.equal(enLigne([], { ...vivant, [RES]: { state: 'unavailable' } }, cfg, commande).mort, true, 'le réservoir muet');
  assert.equal(enLigne([], { ...vivant, [FEED]: { state: 'unavailable' } }, cfg, commande).mort, true, 'la commande muette, réservoir vivant');
  assert.equal(enLigne([{ domaine: 'binary_sensor', classe: 'connectivity', etat: 'off' }], vivant, cfg, commande).mort, true, 'l’appareil hors ligne');
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 2 ; C29) : le sol d'une plante se lit par son appareil, ou par sa base.
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 10 ; C30) : la carte lit `pl.mort` à travers sa vue (`v.muette`).
  assert.ok(app.includes("mort: muet(c.hum)") && app.includes("const mort = v.muette;"), 'la plante');
  assert.ok(app.includes("<div className={mort ? 'o-panne' : undefined} style={{ ...CV_CADRE, opacity: mort ? .55 : 1 }}>"), 'le hero d’une machine');
  // La croix, en dernier sur la ligne (19/09) : le rembourrage passe à gauche.
  /* ASSERTION MODIFIÉE (chantier IoT, tâche 8, 18/10 ; I15, I16) : la fiche du robot passe sur le socle commun. Muet, c'est le panneau
   * de tête de son Accueil qui porte le liseré ; un robot que Home Assistant ne connaît plus, l'en-tête commun (`EnteteFiche`), au
   * même rembourrage, la croix en dernier. */
  const robot = lire('src', 'ficherobot.jsx');
  assert.ok(robot.includes("<div className={'rb-a-hero' + (vue.panne ? ' o-panne' : '')} style={PANNEAU}>") && robot.includes("panne={tr('Ce robot ne répond plus.')} />"), 'la fiche du robot');
  assert.ok(lire('src', 'fichecommune.jsx').includes("...(panne ? { padding: '6px 6px 6px 14px', borderRadius: 30 } : null)"), 'l’en-tête commun en panne');
  assert.ok(css.includes('.o-cam-tuile.o-panne::before { inset: 0; }'), 'le liseré de la caméra reste dans ses coins');
});

/* La police des TITRES suit le thème, comme le reste du texte (10/10).
 *
 * « Et le texte, pourquoi il est pas adapté au thème ? » Mesuré : 39 endroits
 * écrivaient la police en dur et 2 seulement passaient par `--o-serif`, un
 * jeton qui n'était défini nulle part — il ne marchait que par son repli. Les
 * thèmes posent pourtant leur police (`applyVars` → `--o-font`) : sur iOS tout
 * le corps de texte changeait, et les titres restaient en Newsreader.
 *
 * Le jeton existe maintenant, un preset le pose depuis SA police faute de
 * serif à lui, et il est purgé au changement de thème comme `--o-font`. */
test('aucun titre n’écrit sa police en dur : ils suivent tous le thème', () => {
  const dur = [];
  const parcourir = (dir) => {
    for (const e of readdirSync(join(RACINE, dir), { withFileTypes: true })) {
      if (e.isDirectory()) { parcourir(join(dir, e.name)); continue; }
      if (!/\.(jsx?|mjs)$/.test(e.name)) continue;
      const src = lire(dir, e.name);
      const n = compter(src, 'fontFamily: "\'Newsreader\',serif"');
      if (n) dur.push(join(dir, e.name) + ' × ' + n);
    }
  };
  parcourir('src');
  assert.deepEqual(dur, [], 'une police de titre est écrite en dur : elle ne suivra aucun thème');

  // Le jeton est défini, sinon les `var()` ne tiendraient que par leur repli.
  assert.ok(lire('src', 'index.css').includes("--o-serif:'Newsreader', serif;"), '--o-serif a disparu de :root');
  const theme = lire('src', 'theme.js');
  assert.ok(theme.includes("set('--o-serif', v.serif || v.font);"),
    'un preset ne pose plus le serif : ses titres resteraient en Newsreader');
  assert.ok(/const THEME_KEYS = \[[^\]]*'--o-serif'/.test(theme),
    '--o-serif n’est plus purgé : le serif d’un thème survivrait au suivant');
});

/* `body` pose la couleur du texte, et ça ne se perd pas (10/10).
 *
 * En remplaçant les trois blocs de jetons pour le thème v2, j'ai avalé la
 * règle qui les suivait — elle vivait ENTRE `html.loggia-light` et `.o-sombre`.
 * Sans `color: var(--o-text)` sur `body`, tout le texte retombe sur le noir par
 * défaut du navigateur : « c'est noir partout », sur un fond sombre.
 *
 * Trois jours de thème peuvent partir sur une ligne perdue au milieu d'un
 * remplacement de bloc. Ce test la tient. */
test('body pose le fond, la police et la couleur du texte', () => {
  const css = lire('src', 'index.css');
  const regle = /^body \{[^}]*\}/m.exec(css.slice(css.indexOf('html.loggia-light')));
  assert.ok(regle, 'la règle `body` du thème a disparu : le texte retomberait au noir du navigateur');
  for (const [quoi, attendu] of [
    ['la couleur du texte', 'color: var(--o-text)'],
    ['le fond', 'background: var(--o-bggrad, var(--o-bg))'],
    ['la police', 'font-family: var(--o-font)'],
  ]) assert.ok(regle[0].includes(attendu), '`body` ne pose plus ' + quoi);
});
