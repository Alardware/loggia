// Le rail de l'Accueil : une colonne qui défile seule (04/10).
//
// Demande de l'utilisateur : sur ordinateur et tablette en paysage, avec peu
// ou pas de caméras, le rail faisait une grande bande à droite et du vide à
// gauche. Choix retenu : « la colonne qui défile simplement, tous les widgets
// restant dépliés ». Mesuré dans la démo (1440 × 900) : page de 2 069 px
// quel que soit le nombre de caméras avant ; 1 294, 1 140 et 948 px avec 4, 2
// et 0 caméras après. Ces tests tiennent la conception corrigée par la
// contre-étude : pas de masque (il éteignait le verre dépoli), deux bornes
// écrites sans état React, ombre courte des rangées, `contain` au doigt seulement.
// La contre-relecture du 04/10 y ajoute : la hauteur et `top` glissent ENSEMBLE
// quand l'en-tête se masque (propriété enregistrée), et « Ombres portées »
// coupé coupe aussi l'ombre courte. La relecture du 04/10 : Neumorphix garde
// son relief (en petit), un indice de suite quand le bord tombe entre deux
// cartes, et l'en-tête ne glisse plus en mouvement réduit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bornesRail, AIR_HAUT, SANS_FIN } from '../src/railcolonne.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const theme = readFileSync(join(RACINE, 'src', 'theme.js'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (texte, debut, fin) => { const d = texte.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = texte.indexOf(fin, d + debut.length); return texte.slice(d, f < 0 ? undefined : f); };
const home = bloc(src, 'function Dashboard(', NL + 'function ');
// En début de ligne : `.o-rail-cell {` est aussi la fin de `html.loggia-tactile .o-rail-cell {`.
const regle = (sel) => bloc(css, NL + sel + ' {', '}');
// Les blocs CSS dont le sélecteur parle du rail (commentaires retirés).
const cssNu = css.replace(/\/\*[\s\S]*?\*\//g, '');
const blocsRail = [...cssNu.matchAll(/([^{}]*\.o-rail[^{}]*)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), corps: m[2] }));

test('les bornes de la colonne : où la grille commence, où la cellule finit', () => {
  assert.equal(AIR_HAUT, 6);
  assert.equal(SANS_FIN, 100000);
  // Page en haut (1440 × 900) : la grille à 281, la cellule (remontée de 6) à 275.
  assert.deepEqual(bornesRail({ top: 275, bottom: 1252 }, 900), { depart: 281, fin: 1252 });
  // Cellule encore loin de finir : rien à borner en bas.
  assert.deepEqual(bornesRail({ top: 275, bottom: 2000 }, 900), { depart: 281, fin: SANS_FIN });
  assert.equal(bornesRail({ top: 275, bottom: 1800 }, 900).fin, SANS_FIN, 'deux écrans pile : pas encore');
  // Grille passée au-dessus du bord : le départ ne compte plus, la fin approche.
  assert.deepEqual(bornesRail({ top: -400, bottom: 760 }, 820), { depart: 0, fin: 760 });
  assert.equal(bornesRail({ top: 0, bottom: 900 }, 900).depart, 0, 'au bord pile');
  assert.equal(bornesRail({ top: -0.4, bottom: 900 }, 900).depart, 0);
  // Sous-pixels arrondis : une valeur qui tremble d'un dixième ne réécrit rien.
  assert.deepEqual(bornesRail({ top: 274.6, bottom: 1251.4 }, 900), { depart: 281, fin: 1251 });
  // Sans mesure exploitable : aucune borne plutôt qu'une borne fausse.
  assert.deepEqual(bornesRail(null, 900), { depart: 0, fin: SANS_FIN });
  assert.deepEqual(bornesRail({ top: 100, bottom: 500 }, 0), { depart: 106, fin: SANS_FIN });
});

test('la grille : une cellule qui ne compte pas, une colonne qui défile ; le téléphone ne change pas', () => {
  assert.ok(home.includes('<div className="o-acc-grid" style={{ display: \'grid\', gridTemplateColumns: wideXL ? \'1fr 330px\' : \'1fr 276px\', gap: wideXL ? 18 : 14 }}>'), 'la grille garde ses deux colonnes');
  assert.ok(home.includes("<div ref={poserRail} className={'o-rail-cell' + (editMode ? ' o-rail-edit' : '')}>"), 'la cellule, rendue au flux en édition');
  assert.ok(home.includes('<div className="o-rail-col" style={{ display: \'flex\', flexDirection: \'column\', gap: 12, minWidth: 0 }}>'), 'la colonne et son écart de 12 px');
  const onglets = home.indexOf('if (!wide) return <OngletsAccueil');
  assert.ok(onglets >= 0 && onglets < home.indexOf('o-acc-grid'), 'sous 1180 px, les deux pages comme avant');
});

test('la colonne : collante, bornée à l’écran et au contenu principal, sans masque', () => {
  const base = regle('.o-rail-cell');
  ['min-width: 0', '--o-rail-haut: calc(var(--o-hdrh, 0px) + 16px);', '--o-rail-bas: calc(var(--o-navh, 0px) + 16px);'].forEach(t => assert.ok(base.includes(t), 'cellule, même en édition : ' + t));
  const cel = regle('.o-rail-cell:not(.o-rail-edit)');
  ['align-self: stretch', 'contain: size', 'margin: -6px -8px -14px'].forEach(t => assert.ok(cel.includes(t), 'cellule : ' + t));
  // `size` SEUL : layout / paint / content / strict feraient de la cellule le
  // bloc conteneur des position: fixed (une feuille ouverte depuis un widget).
  blocsRail.forEach(b => assert.ok(!/contain:\s*(strict|content|layout|paint)/.test(b.corps), b.sel + ' : contain size seulement'));
  const col = regle('.o-rail-cell:not(.o-rail-edit) > .o-rail-col');
  ['position: sticky', 'top: calc(var(--o-rail-haut) - 6px)', 'overflow-y: auto', 'overflow-x: hidden', 'scrollbar-width: none', 'padding: 6px 8px 14px', 'var(--o-rail-depart, 0px)', 'var(--o-rail-fin, 100000px)', 'max(240px, min(100%,'].forEach(t => assert.ok(col.includes(t), 'colonne : ' + t));
  const vh = col.indexOf('100vh - '), dvh = col.indexOf('100dvh - ');
  assert.ok(vh > 0 && dvh > vh, 'le repli en vh AVANT la règle en dvh');
  // `top` et `max-height` suivent la MÊME variable, qui glisse : le bas de la
  // colonne ne saute plus quand l'en-tête se masque ou revient (mesuré : 30 à
  // 70 px avec `transition: top` seul). Rien ne glisse sur la colonne elle-même
  // : les bornes du défilement doivent suivre trame par trame.
  assert.ok(css.includes("@property --o-rail-haut { syntax: '<length>'; inherits: true; initial-value: 16px; }"), 'une longueur enregistrée, donc animable');
  assert.ok(base.includes('transition: --o-rail-haut .3s ease;'), 'elle glisse comme l’en-tête (transform .3s ease)');
  assert.ok(!/transition/.test(col), 'rien ne glisse sur la colonne');
  assert.ok(!/transition/.test(cel), 'ni sur la cellule hors édition (la sortie d’édition ne fait rien glisser)');
  // Le verre dépoli : un masque ferait de la colonne la racine du flou, et
  // les cartes du rail ne flouteraient plus rien (mesuré le 04/10).
  // Seul le pseudo-élément de l'indice de suite en porte (relecture du
  // 04/10) : FRÈRE des cartes, pas leur ancêtre, il n'est la racine du flou
  // de personne. Tout le reste — cellule, colonne — reste nu.
  const nus = blocsRail.filter(b => !b.sel.endsWith('::after'));
  assert.ok(nus.some(b => b.sel.endsWith('> .o-rail-col')) && nus.some(b => b.sel === '.o-rail-cell'), 'la colonne et la cellule sont bien contrôlées');
  nus.forEach(b => assert.ok(!/mask/.test(b.corps) && !/(^|[^-])filter:/.test(b.corps) && !/opacity:/.test(b.corps), b.sel + ' : rien qui éteigne le verre dépoli'));
  blocsRail.filter(b => b.sel.endsWith('::after')).forEach(b => assert.equal(b.sel, '.o-rail-cell:not(.o-rail-edit) > .o-rail-col::after', 'aucun autre pseudo-élément masqué'));
  assert.ok(css.includes('PAS de masque de fondu') && css.includes('verre dépoli'), 'la raison reste écrite');
});

test('l’ombre courte des rangées qui défilent (ADR 0059), aucune couleur nouvelle', () => {
  const col = regle('.o-rail-cell:not(.o-rail-edit) > .o-rail-col');
  assert.ok(col.includes('--o-shadow: var(--o-shadow-rangee, 0 1px 2px rgba(0,0,0,.16), 0 3px 8px rgba(0,0,0,.12));'), 'la grande ombre serait rognée en halo carré');
  assert.ok(css.includes('html.loggia-light .o-rail-cell:not(.o-rail-edit) > .o-rail-col { --o-shadow: var(--o-shadow-rangee, 0 1px 2px rgba(16,24,40,.10), 0 3px 8px rgba(16,24,40,.10)); }'), 'et sa variante claire');
  // Les seules couleurs du bloc sont les replis déjà admis de `.grid-qscenes`.
  blocsRail.forEach(b => {
    const sans = b.corps.replace('0 1px 2px rgba(0,0,0,.16), 0 3px 8px rgba(0,0,0,.12)', '').replace('0 1px 2px rgba(16,24,40,.10), 0 3px 8px rgba(16,24,40,.10)', '');
    assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(sans), b.sel + ' : pas de couleur en dur');
  });
  assert.ok(css.includes('.grid-qscenes > button { box-shadow: var(--o-shadow-rangee, 0 1px 2px rgba(0,0,0,.16), 0 3px 8px rgba(0,0,0,.12)) !important; }'), 'le précédent, intact');
});

test('l’en-tête masqué, le doigt, le mouvement réduit', () => {
  const cache = css.indexOf('html.loggia-hdr-cache .o-rail-cell { --o-rail-haut: 16px; }');
  const doigt = css.indexOf('html.loggia-tactile .o-rail-cell { --o-rail-haut: max(16px, var(--o-safe-top, 0px)); }');
  assert.ok(cache > 0 && doigt > cache, 'même spécificité : la règle du doigt APRÈS celle de l’en-tête masqué');
  assert.ok(css.includes('html.loggia-tactile .o-rail-cell:not(.o-rail-edit) > .o-rail-col { overscroll-behavior-y: contain; }'), 'au doigt, le bout de la colonne n’entraîne pas la page');
  blocsRail.filter(b => !b.sel.startsWith('html.loggia-tactile')).forEach(b => assert.ok(!b.corps.includes('overscroll-behavior'), b.sel + ' : à la souris, la molette enchaîne sur la page'));
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce) { .o-rail-cell { transition: none !important; } }'));
});

test('« Ombres portées » coupé coupe aussi l’ombre courte du rail', () => {
  // La colonne redéfinit `--o-shadow` par `--o-shadow-rangee` : sans ce vide,
  // l'interrupteur de l'Apparence laissait une ombre sous chaque carte du rail
  // (et sous les scénarios, qui la lisent en `!important`).
  const sans = bloc(theme, 'if (!L.shadow) {', '}');
  ["root.style.setProperty('--o-shadow', 'none');", "root.style.setProperty('--o-shadow-hover', 'none');", "root.style.setProperty('--o-shadow-rangee', 'none');"].forEach(t => assert.ok(sans.includes(t), t));
  // Purgé à chaque application du thème : rallumer les ombres le rend.
  assert.ok(theme.includes("'--o-shadow-hover', '--o-shadow-rangee',"));
});

test('l’en-tête publie sa hauteur et son état, et les retire en partant', () => {
  const h = bloc(src, 'function Header(', NL + '}');
  assert.ok(h.includes('<header ref={hdrRef} className="loggia-hdr"'), 'la ref sur le bandeau');
  assert.ok(h.includes("racine.style.setProperty('--o-hdrh', Math.round(el ? el.getBoundingClientRect().height : 0) + 'px')"), 'la hauteur mesurée');
  assert.ok(h.includes("racine.style.removeProperty('--o-hdrh')"), 'retirée au démontage (l’en-tête est monté par vue)');
  assert.ok(h.includes('ro = new ResizeObserver(poser)') && h.includes("window.addEventListener('resize', poser);"), 'suivie');
  assert.ok(h.includes("racine.classList.toggle('loggia-hdr-cache', hidden);") && h.includes("return () => racine.classList.remove('loggia-hdr-cache');"), 'l’état masqué, nettoyé');
  assert.equal((h.match(/useLayoutEffect\(/g) || []).length, 2, 'avant la peinture, pas une trame après');
});

test('les bornes s’écrivent sans état React, une fois par trame', () => {
  const p = bloc(home, '  const poserRail = useCallback((el) => {', NL + '  }, []);');
  ["window.addEventListener('scroll', demander, { passive: true });", "window.addEventListener('resize', demander);", 'cancelAnimationFrame(raf)', 'ro.disconnect()', "window.removeEventListener('scroll', demander)",
    "el.style.setProperty('--o-rail-depart', b.depart + 'px')", "el.style.setProperty('--o-rail-fin', b.fin + 'px')", 'if (!raf) raf = requestAnimationFrame(lire);', 'ro.observe(document.body)',
    'bornesRail(el.getBoundingClientRect(), window.innerHeight)'].forEach(t => assert.ok(p.includes(t), t));
  assert.ok(!/(^|[^.\w])set[A-Z]\w*\(/.test(p), 'aucun setState : le défilement ne refait pas le rendu de l’Accueil');
  assert.ok(!/railBords|useState\([^)]*rail/i.test(home), 'pas d’état du rail');
  assert.ok(src.includes("import { bornesRail } from './railcolonne.js';"));
});

test('« appareils actifs » fait défiler la colonne, pas la page', () => {
  const v = bloc(home, '  const voirMoment = () => {', NL + '  };');
  const col = v.indexOf("const col = el && el.closest('.o-rail-col');");
  const defile = v.indexOf("col.scrollTo({ top: Math.max(0, el.offsetTop - 6), behavior: REDUCE_MOTION ? 'auto' : 'smooth' })");
  const repli = v.indexOf("el.scrollIntoView({ behavior: REDUCE_MOTION ? 'auto' : 'smooth', block: 'start' })");
  assert.ok(col > 0 && defile > col && repli > defile, 'la colonne d’abord, l’ancien geste en repli (édition)');
  assert.ok(v.includes("getComputedStyle(col).overflowY !== 'visible'") && v.includes('col.scrollHeight > col.clientHeight + 1'), 'seulement si elle défile vraiment');
  // Le décalage suit le rembourrage du haut de la colonne.
  assert.ok(regle('.o-rail-cell:not(.o-rail-edit) > .o-rail-col').includes('padding: ' + AIR_HAUT + 'px 8px 14px'));
});

test('l’indice de suite quand le bord tombe entre deux cartes (relecture du 04/10)', () => {
  // Mesuré à 1440 × 845 : Météo finit à 835, CO₂ commence à 847, la colonne
  // s'arrête à 843 — rien de coupé, quatre widgets cachés sans indice.
  const ind = regle('.o-rail-cell:not(.o-rail-edit) > .o-rail-col::after');
  ["content: ''", 'position: sticky', 'bottom: -14px', 'height: 28px', 'margin-top: -40px', 'margin-inline: -8px', 'pointer-events: none', 'opacity: 0',
    '-webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);', '-webkit-mask-composite: source-in; mask-composite: intersect;'].forEach(t => assert.ok(ind.includes(t), 'indice : ' + t));
  // Il ne PEINT rien : un voile color-mix(--o-bg) laissait une marche de 12 à
  // 66 niveaux au bord (Frosted, The Projekt clair, fond photo) ; le flou
  // reprend le vrai fond.
  assert.ok(!/background/.test(ind), 'pas de fond peint');
  // Effacé sur TOUS ses bords : coupé net, le flou dessinait sur une photo
  // détaillée un rectangle (marche jusqu'à 28 niveaux au bord gauche, 29 au bas
  // en fin de page) ; effacé, 3 au plus sur seize fonds. Le dégradé vertical
  // FINIT transparent, le latéral couvre le rembourrage ; `intersect` les croise.
  const vert = 'linear-gradient(to bottom, transparent, black 65%, black 80%, transparent)';
  const lat = 'linear-gradient(to right, transparent, black 8px, black calc(100% - 8px), transparent)';
  assert.ok(ind.includes(NL + '  mask-image: ' + vert + ', ' + lat + ';'), 'le masque croisé');
  assert.ok(ind.includes('-webkit-mask-image: ' + vert + ', ' + lat + ';'), 'le même, préfixé (Safari)');
  // Élargi au rembourrage latéral de la colonne, et effacé sur cette largeur.
  const pad = regle('.o-rail-cell:not(.o-rail-edit) > .o-rail-col').match(/padding: \d+px (\d+)px \d+px;/);
  assert.ok(pad && ind.includes('margin-inline: -' + pad[1] + 'px;') && lat.includes('black ' + pad[1] + 'px, black calc(100% - ' + pad[1] + 'px)'), 'élargi au rembourrage, effacé dessus');
  // Hors du flux : marge = −(écart de la colonne + hauteur), le défilement ne s'allonge pas.
  assert.ok(home.includes("<div className=\"o-rail-col\" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>"));
  assert.equal(-Number(ind.match(/margin-top: (-\d+)px/)[1]), 12 + Number(ind.match(/height: (\d+)px/)[1]));
  // Éteint au bout de la colonne ; inactif (donc à 0) quand rien ne dépasse.
  assert.ok(css.includes('@supports (animation-timeline: scroll()) {' + NL + '  .o-rail-cell:not(.o-rail-edit) > .o-rail-col::after { animation: o-rail-suite linear both; animation-timeline: scroll(nearest block); }'), 'la frise du défilement de la colonne, après le raccourci');
  assert.ok(css.includes('@keyframes o-rail-suite { 0%, 96% { opacity: 1; } 100% { opacity: 0; } }'));
  // Une carte atteinte au clavier s'arrête au-dessus de lui.
  const sp = regle('.o-rail-cell:not(.o-rail-edit) > .o-rail-col').match(/scroll-padding: 10px 0 (\d+)px/);
  assert.ok(sp && Number(sp[1]) >= 28 + 4, 'scroll-padding du bas au-delà de l’indice');
  // Rien en édition : chaque règle de l'indice passe par `:not(.o-rail-edit)`.
  const indices = [...cssNu.matchAll(/([^{}]*)::after\s*\{/g)].map(m => m[1].trim()).filter(s => s.includes('o-rail'));
  assert.ok(indices.length === 2 && indices.every(s => s === '.o-rail-cell:not(.o-rail-edit) > .o-rail-col'), 'rien en édition : ' + indices.join(' | '));
});

test('Neumorphix garde son relief dans le rail, en petit (relecture du 04/10)', () => {
  // Sans `--o-shadow-rangee`, le rail prenait l'ombre portée générique : le
  // thème sans liseré y perdait ce qui le distingue (mesuré en clair et sombre).
  const neu = bloc(theme, '  neumorphix: {', NL + '  },');
  const r = [...neu.matchAll(/'--o-shadow-rangee': '([^']+)'/g)].map(m => m[1]);
  assert.equal(r.length, 2, 'clair et sombre');
  r.forEach(v => {
    const ombres = v.split(', ');
    assert.equal(ombres.length, 2, 'la lumière et l’ombre, comme le grand relief');
    // Décalage + flou ≤ 7 px : tient dans le rembourrage de la colonne (6 / 8 / 14).
    ombres.forEach(o => { const [x, y, f] = o.match(/-?\d+px/g).map(parseFloat); assert.ok(Math.abs(x) + f <= 7 && Math.abs(y) + f <= 7, o); });
  });
  assert.ok(r[0].includes('#d3d6e1') && r[0].includes('#ffffff'), 'les teintes du relief clair');
  assert.ok(r[1].includes('#13161c') && r[1].includes('#2d3340'), 'les teintes du relief sombre');
});

test('en mouvement réduit, l’en-tête ne glisse plus par-dessus la colonne (relecture du 04/10)', () => {
  // Mesuré : la colonne sautait de 83 à 10 px, l'en-tête glissait encore
  // 0,3 s et recouvrait jusqu'à 58 px de la première carte pendant 150 ms.
  const h = bloc(src, 'function Header(', NL + '}');
  const ligne = h.split(NL).find(l => l.includes('<header ref={hdrRef} className="loggia-hdr"'));
  assert.ok(ligne.includes("transition: REDUCE_MOTION ? 'none' : 'transform .3s ease'"), 'les deux bougent d’un coup');
  assert.ok(!ligne.includes("transition: 'transform"), 'plus de glissade en dur');
  assert.ok(src.includes('  REDUCE_MOTION, Fi, Anim,'), 'importé');
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce) { .o-rail-cell { transition: none !important; } }'), 'la colonne, elle, saute déjà');
});
