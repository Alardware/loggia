// ─────────────────────────────────────────────────────────────────────────────
// Le geste d'une carte d'appareil cède la place au nom (lot 16, point 8a de
// l'audit de Luna, 05/10).
//
// Sur une carte `CvCard` — compacte (pièce ou vue perso) comme STANDARD —,
// les boutons Exécuter, serrure et alarme avaient un rembourrage fixe en
// ligne, ne rétrécissaient pas et n'avaient pas d'ellipse. Mesuré dans la
// démo, vue perso de sept compactes et trois standards : au téléphone (cartes
// de 173, 158 et 138 px à 390, 360 et 320 px), « Déverrouiller », « Zamknij
// na klucz », « Ontgrendelen » ou « Scharf schalten » ramenaient le nom à
// 0 px ; « Unscharf schalten » (130 px) sortait de la compacte de 24, 39 puis
// 59 px — plus que l'écart de 10 px, il mordait sur la voisine —, et la
// STANDARD, même rangée, débordait aussi (« Scharf schalten » +22 / +37 /
// +57 px, « Otwórz zamek » +12 / +27 / +47, « Unlock » +5 à 320 px).
//
// La mise en page cède, pas les mots (les valeurs de Seba882 restent telles
// quelles, aucune forme courte) : chaque bouton porte son icône ET son mot ;
// toute CvCard est un conteneur (`o-cvcarte`), et sous 200 px de contenu la
// requête ne montre plus que l'icône — comme les modes de l'alarme
// (ADR 0035). À 1440 px (cartes de 268), le mot reste.
//
// La mise en page ne se calcule pas sous Node : ce fichier épingle ce qui la
// tient, comme tests/mise_en_page_lot7.test.mjs.
//
// Relecture du lot 16 (05/10), mesurée dans la démo de 320 à 1440 px, sept
// langues :
// - une serrure DÉVERROUILLÉE montrait au téléphone deux cadenas FERMÉS (la
//   pastille, toujours `lock`, et le geste « verrouiller » passé en icône) :
//   elle se lisait verrouillée. La pastille dit l'ÉTAT, le bouton le GESTE —
//   épinglé en EXÉCUTANT `cvIcoEntite` sur les sept états de HA ;
// - le bouton en icône seule n'avait pas d'infobulle : `title` = le mot du
//   geste, comme les modes de l'alarme (`o-armchip`) ;
// - la STANDARD à 320 px ne gardait que 16 px de nom : sa pastille de 40 px et
//   son écart de 11 px étaient en ligne, hors de portée de la requête. Ils
//   vivent dans index.css et descendent à 34 et 9 px sous le seuil (26 px de
//   nom à 320, 46 à 360, 61 à 390 ; 1440 identique au pixel) ;
// - les favoris de l'Accueil (cases FIXES de 225 px) sont toujours en icône,
//   même à 1440 : c'est voulu, et épinglé ;
// - une règle de même poids ajoutée plus loin dans index.css annulait la
//   requête sans faire rougir ce fichier (mot revenu au téléphone, carte plus
//   conteneur) : les sélecteurs du geste ne vivent plus QUE dans leur bloc.
//   Les épingles trop strictes (ordre des attributs, `type="button"`, distance
//   de 40 caractères) lisent désormais la balise, pas sa forme.
// Contre-relecture (05/10) : l'état ÉCRIT de la serrure suit sa pastille (plus
// de « jammed » brut, en anglais dans toutes les langues), et le raccourci
// `container:` est lu comme `container-type`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const app = lire('src/App.jsx');
const css = lire('src/index.css');
const police = lire('public/fonts/uicons-regular-rounded.css');

const fonction = (nom) => {
  const i = app.indexOf('\nfunction ' + nom + '(');
  assert.ok(i >= 0, nom + ' introuvable');
  return app.slice(i, app.indexOf('\nfunction ', i + 1));
};
const cvCard = fonction('CvCard');

/** Le bouton qui porte ce nom accessible : de SA balise `<button` (la
 *  dernière ouverte avant le nom, sans fermante entre les deux) à sa fermante.
 *  L'ordre des attributs et ce qui s'y ajoute (`type`, `title`) ne comptent
 *  pas. */
const bouton = (nom) => {
  const a = cvCard.indexOf('aria-label={' + nom + '}');
  assert.ok(a >= 0, 'bouton introuvable : ' + nom);
  const d = cvCard.lastIndexOf('<button', a);
  assert.ok(d >= 0 && cvCard.slice(d, a).indexOf('</button>') < 0, 'le nom n’est plus sur une balise <button> : ' + nom);
  const f = cvCard.indexOf('</button>', a);
  const tout = cvCard.slice(d, f + 9);
  const corps = tout.indexOf('<span className="o-cvact-ico">');
  return { tout, balise: corps >= 0 ? tout.slice(0, corps) : tout };
};

const GESTES = [
  ['Exécuter / Activer / Appuyer', "runnable[2] + ' ' + name", 'runnable[2]'],
  ['serrure', "(s === 'locked' ? tr('Déverrouiller') : tr('Verrouiller')) + ' ' + name", "s === 'locked' ? tr('Déverrouiller') : tr('Verrouiller')"],
  ['alarme', "(dormante ? tr('Armer') : tr('Désarmer')) + ' ' + name", "dormante ? tr('Armer') : tr('Désarmer')"],
];

test('les trois gestes d’une carte portent leur icône ET leur mot', () => {
  for (const [quoi, nom, mot] of GESTES) {
    const { tout, balise } = bouton(nom);
    assert.match(balise, /\bclassName="o-cvact"/, quoi + ' : la classe qui laisse la requête de conteneur agir');
    assert.match(tout, /<span className="o-cvact-ico">\s*<Ico name=\{[^}]+\} size=\{14\} \/>\s*<\/span>\s*<span className="o-cvact-mot">/, quoi + ' : l’icône, puis le mot');
    assert.ok(tout.includes('<span className="o-cvact-mot">{' + mot + '}</span>'), quoi + ' : le mot affiché n’est plus le geste traduit');
    // Le rembourrage et l'affichage vivent dans la classe : en ligne, la
    // requête ne pourrait pas les changer sans `!important`.
    assert.ok(!/padding:|display:/.test(balise), quoi + ' : rembourrage ou affichage en ligne revenu');
    assert.ok(balise.includes("position: 'relative'"), quoi + ' : plus positionné, il passe sous la surface');
  }
});

test('le bouton en icône garde le mot du geste en infobulle', () => {
  // Comme les modes de l'alarme (`o-armchip`, ADR 0035) et le geste en icône
  // du robot : à la souris, un bouclier ou un avion seuls ne disent pas ce
  // qu'ils font. Le nom accessible, lui, reste « geste + appareil ».
  for (const [quoi, nom, mot] of GESTES) {
    assert.ok(bouton(nom).balise.includes('title={' + mot + '}'), quoi + ' : pas d’infobulle, ou elle ne dit plus le geste');
  }
  assert.ok(app.includes('className="o-armchip" title={lbl}'), 'le modèle (les modes de l’alarme) a changé : réaligner');
});

test('l’icône dit le geste : jouer, cadenas selon l’état, modes de l’alarme', () => {
  assert.match(cvCard, /const icoRun = \{ button: 'cursor-finger', input_button: 'cursor-finger' \}\[dom\] \|\| 'play';/);
  assert.ok(bouton("runnable[2] + ' ' + name").tout.includes('<Ico name={icoRun} size={14} />'));
  assert.ok(bouton("(dormante ? tr('Armer') : tr('Désarmer')) + ' ' + name").tout.includes('<Ico name={dormante ? (ICONES_ARMEMENT[svcArm] || ICONES_ARMEMENT.alarm_arm_away) : ICONES_ARMEMENT.alarm_disarm} size={14} />'), 'les icônes des modes (attention.js), comme les puces de l’alarme');
  // Toutes existent dans la police : une icône absente laisserait un bouton vide.
  const armement = [...lire('src/attention.js').match(/export const ICONES_ARMEMENT = \{([^}]+)\}/)[1].matchAll(/\w+: '([\w-]+)'/g)].map(m => m[1]);
  assert.ok(armement.length >= 5, 'ICONES_ARMEMENT n’est plus lu');
  for (const n of ['play', 'cursor-finger', 'lock', 'unlock', ...armement]) {
    assert.ok(police.includes('.fi-rr-' + n + ':before'), 'icône absente de la police : ' + n);
  }
});

/** `cvIcoEntite` EXÉCUTÉE : sa source, sans JSX, avec des doublures pour ce
 *  qu'elle lit ailleurs (le choix de l'utilisateur en premier). */
const icoEntite = (choisie = null) => {
  const i = app.indexOf('\nfunction cvIcoEntite(');
  assert.ok(i >= 0, 'cvIcoEntite introuvable');
  const src = app.slice(i, app.indexOf('\n}\n', i) + 2);
  return new Function('iconeChoisie', 'LIGHT_TYPE_ICON', 'lightType', 'CV_DOM_ICON', src + '\nreturn cvIcoEntite;')(() => choisie, {}, () => '', {});
};
/** Le glyphe du GESTE de la serrure, lu sur son bouton et exécuté. */
const icoGeste = () => {
  const t = bouton("(s === 'locked' ? tr('Déverrouiller') : tr('Verrouiller')) + ' ' + name").tout;
  const m = t.match(/<span className="o-cvact-ico">\s*<Ico name=\{([^}]+)\} size=\{14\} \/>/);
  assert.ok(m, 'le geste de la serrure n’a plus d’icône');
  return new Function('s', 'return ' + m[1] + ';');
};

test('serrure : la pastille dit l’ÉTAT, le bouton le GESTE — jamais deux cadenas fermés sur une porte ouverte', () => {
  const ico = icoEntite();
  const geste = icoGeste();
  const st = (state) => ({ state, attributes: {} });
  // Les sept états de HA (LockState) : seul `locked` tient le pêne fermé.
  const ouverts = ['unlocked', 'unlocking', 'locking', 'open', 'opening', 'jammed'];
  for (const s of ouverts) assert.equal(ico('lock', 'lock.x', st(s), 'X'), 'unlock', s + ' : la pastille doit montrer le cadenas OUVERT');
  assert.equal(ico('lock', 'lock.x', st('locked'), 'X'), 'lock');
  // Inconnu ou absent : l'icône du domaine — la panne a déjà son liseré, un
  // cadenas ouvert y affirmerait une porte ouverte.
  for (const s of ['unavailable', 'unknown']) assert.equal(ico('lock', 'lock.x', st(s), 'X'), 'lock', s);
  assert.equal(ico('lock', 'lock.x', null, 'X'), 'lock', 'entité absente');
  // Le geste est l'inverse de l'état : la pastille et le bouton ne montrent
  // jamais le même cadenas, quel que soit l'état où le bouton existe.
  for (const s of ['locked', ...ouverts]) assert.notEqual(ico('lock', 'lock.x', st(s), 'X'), geste(s), s + ' : pastille et geste montrent le même cadenas');
  // Le choix de l'utilisateur passe toujours devant.
  assert.equal(icoEntite('star')('lock', 'lock.x', st('unlocked'), 'X'), 'star');
});

test('serrure : l’état ÉCRIT suit la pastille — aucun état brut de HA', () => {
  // Exécuté, pas lu : la forme de l'expression ne compte pas. `tr` doublé par
  // l'identité, la clé française ressort.
  const m = cvCard.match(/else if \(dom === 'lock'\) stateTxt = ([^\n]+);\n/);
  assert.ok(m, 'l’état écrit de la serrure n’est plus lu : réaligner');
  const ecrit = new Function('s', 'tr', 'return ' + m[1] + ';');
  const mots = { locked: 'Verrouillée', unlocked: 'Déverrouillée', locking: 'Verrouillage…', unlocking: 'Déverrouillage…', jammed: 'Bloquée', open: 'Ouverte', opening: 'Ouverture…' };
  for (const [s, mot] of Object.entries(mots)) assert.equal(ecrit(s, (k) => k), mot, s + ' : état brut ou mot changé');
  // Les mots sont ceux de la fiche serrure et des ouvrants : déjà traduits.
  for (const l of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const t = lire('src/langues/' + l + '.js');
    for (const mot of Object.values(mots)) assert.ok(t.includes("'" + mot + "':"), l + ' : « ' + mot + ' » sans traduction');
  }
});

test('toute CvCard est un conteneur, pastille et écart sans taille en ligne', () => {
  // La classe est posée SANS condition, en dernier : compacte et standard, en
  // panne ou non.
  const i = cvCard.indexOf("<div className={'o-piece'");
  assert.ok(i >= 0, 'la racine de CvCard a changé de forme');
  assert.match(cvCard.slice(i, cvCard.indexOf('\n', i)), /\+ ' o-cvcarte'\}/, 'la racine de CvCard n’est plus un conteneur dans les deux formats');
  // La rangée et la pastille : leurs tailles ne sont plus en ligne, sinon la
  // requête ne pourrait pas les réduire sans `!important`.
  const r = cvCard.indexOf('<div className="o-cvrow"');
  assert.ok(r >= 0, 'la rangée de CvCard n’est plus lue');
  const rangee = cvCard.slice(r, cvCard.indexOf('}}>', r));
  assert.ok(!/\bgap:/.test(rangee), 'l’écart de la rangée est revenu en ligne');
  const p = cvCard.indexOf('<span className="o-cvpastille"');
  assert.ok(p >= 0, 'la pastille n’a plus sa classe');
  const styleP = cvCard.slice(p, cvCard.indexOf('}}>', p));
  assert.ok(!/\b(width|height|borderRadius):/.test(styleP), 'la taille de la pastille est revenue en ligne');
});

/* index.css lu comme des règles : commentaires blanchis (positions gardées),
 * chaque `sélecteur { corps }` avec sa place et sa règle parente. */
const blanc = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const regles = (() => {
  const out = []; const pile = []; let debut = 0;
  for (let i = 0; i < blanc.length; i++) {
    const c = blanc[i];
    if (c === '{') { pile.push({ sel: blanc.slice(debut, i).trim().replace(/\s+/g, ' '), ouvre: i }); debut = i + 1; }
    else if (c === '}') { const r = pile.pop(); out.push({ sel: r.sel, corps: blanc.slice(r.ouvre + 1, i), de: r.ouvre, a: i, parent: pile.length ? pile[pile.length - 1].sel : null }); debut = i + 1; }
    else if (c === ';' && pile.length === 0) debut = i + 1;
  }
  return out;
})();
const decls = (corps) => Object.fromEntries(corps.split(';').map(d => { const k = d.indexOf(':'); return k < 0 ? [] : [d.slice(0, k).trim(), d.slice(k + 1).trim()]; }).filter(d => d.length === 2 && d[0]));
const blocGeste = () => {
  const de = blanc.indexOf('.o-cvcarte { container-type: inline-size; }');
  assert.ok(de >= 0, 'la carte n’est plus un conteneur');
  const requete = regles.find(r => /^@container \(max-width: \d+px\)$/.test(r.sel) && /\.o-cvact-mot/.test(r.corps));
  assert.ok(requete && requete.de > de, 'la requête du geste a disparu');
  return { de, a: requete.a, requete };
};
const dans = (sel, parent) => regles.find(r => r.sel === sel && r.parent === parent);

test('sous 200 px de contenu, la carte ne montre que l’icône — pastille et écart de la compacte', () => {
  const bloc = blocGeste();
  assert.equal(bloc.requete.sel, '@container (max-width: 200px)', 'le seuil a changé : remesurer (cartes de 138, 158, 173 px au téléphone, 268 à 1440)');
  const R = bloc.requete.sel;
  const attendu = {
    '.o-cvcarte .o-cvact': { padding: '7px 9px' },
    '.o-cvcarte .o-cvact-mot': { display: 'none' },
    '.o-cvcarte .o-cvact-ico': { display: 'inline-flex' },
    '.o-cvcarte > .o-cvrow': { gap: '9px' },
    '.o-cvcarte:not(.o-cvdense) .o-cvpastille': { width: '34px', height: '34px' },
  };
  for (const [sel, d] of Object.entries(attendu)) {
    const r = dans(sel, R);
    assert.ok(r, 'la requête ne règle plus ' + sel);
    for (const [k, v] of Object.entries(d)) assert.equal(decls(r.corps)[k], v, sel + ' { ' + k + ' }');
  }
  // Hors requête : la carte large garde le mot, la standard ses 40 px et 11 px.
  const hors = (sel, k) => { const r = dans(sel, null); assert.ok(r, sel + ' introuvable'); return decls(r.corps)[k]; };
  assert.equal(hors('.o-cvact-ico', 'display'), 'none', 'l’icône est cachée par défaut : la carte large garde le mot');
  assert.equal(hors('.o-cvact', 'padding'), '7px 12px');
  assert.equal(hors('.o-cvact', 'display'), 'inline-flex', 'le bouton ne centre plus son icône');
  assert.equal(hors('.o-cvpastille', 'width'), '40px');
  assert.equal(hors('.o-cvdense .o-cvpastille, .o-cvico', 'width'), '26px', 'la compacte a SA pastille : deux rangees dans 88 px');
  assert.equal(hors('.o-cvcarte > .o-cvrow', 'gap'), '11px');
  assert.equal(hors('.o-cvcarte.o-cvdense > .o-cvrow', 'gap'), '9px');
  assert.equal(hors('.o-cvcarte.o-cvdense > .o-cvrow', 'row-gap'), '4px', 'sinon le gap de 9 px rouvre les 88 px de la compacte');
  // La compacte reste un conteneur pour la règle du climat.
  assert.equal(hors('.o-cvdense', 'container-type'), 'inline-size');
  assert.ok(!blanc.slice(bloc.de, bloc.a).includes('!important'), 'pas de !important dans le bloc');
});

test('rien, plus loin, n’annule la requête : les sélecteurs du geste ne vivent que dans leur bloc', () => {
  /* Relecture du lot 16 : `.o-piece .o-cvact-mot { display: inline }` posé en
   * fin de fichier (même poids, déclaré plus tard) ramenait le mot au
   * téléphone, et `.o-piece.o-cvcarte { container-type: normal }` ôtait le
   * conteneur — ce fichier restait vert. */
  const bloc = blocGeste();
  const vise = /\.o-cvact\b|\.o-cvpastille\b|\.o-cvcarte\b|\.o-cvrow\b/;
  for (const r of regles) {
    if (!vise.test(r.sel)) continue;
    assert.ok(r.de >= bloc.de && r.a <= bloc.a, 'règle hors du bloc du geste : « ' + r.sel + ' »' + (r.parent ? ' dans « ' + r.parent + ' »' : ''));
  }
  // Ni la carte ni la compacte ne perdent leur conteneur ailleurs, quel que
  // soit le sélecteur qui les vise (la racine porte aussi `o-piece`).
  // `container:` est le raccourci de `container-type` : il l'annule aussi.
  for (const r of regles) {
    if (!/\.o-piece\b|\.o-cvdense\b|\.o-cvcarte\b/.test(r.sel)) continue;
    for (const k of ['container-type', 'container']) {
      const ct = decls(r.corps)[k];
      if (ct === undefined) continue;
      assert.ok(k === 'container-type' && ['.o-cvdense', '.o-cvcarte'].includes(r.sel) && ct === 'inline-size' && r.parent === null, 'conteneur redéfini : « ' + r.sel + ' { ' + k + ': ' + ct + ' } »');
    }
  }
  // Aucun autre fichier de src/ ne les touche, et dans App.jsx seule CvCard.
  const autres = [];
  const visite = (dossier) => {
    for (const e of readdirSync(new URL('../' + dossier, import.meta.url), { withFileTypes: true })) {
      const p = dossier + '/' + e.name;
      if (e.isDirectory()) visite(p);
      else if (/\.(jsx?|css)$/.test(e.name) && p !== 'src/App.jsx' && p !== 'src/index.css' && /o-cvact|o-cvpastille/.test(lire(p))) autres.push(p);
    }
  };
  visite('src');
  assert.deepEqual(autres, [], 'le geste ou la pastille sont stylés hors d’index.css');
  for (const c of ['o-cvact', 'o-cvpastille']) {
    assert.equal(app.split(c).length, cvCard.split(c).length, c + ' sert hors de CvCard');
  }
});

test('les favoris de l’Accueil sont TOUJOURS en icône, ordinateur compris — c’est voulu', () => {
  /* Cases FIXES (225 px, quelle que soit la fenêtre) : 197 px de contenu sur
   * la compacte, 193 sur la standard, sous le seuil de 200. L'icône y rend 50
   * à 100 px de nom en allemand et en polonais (« Unscharf schalten » n'en
   * laissait que 13) : à 1440 aussi, mesuré. Si la case s'élargit ou si le
   * seuil baisse, le mot revient sur ordinateur — à décider, pas à subir. */
  const bloc = blocGeste();
  /* La case est sortie en objet le 06/10 (`taille`), l'edition et le rendu
   * la partageant : memes chiffres, autre forme. */
  const m = app.match(/width: cvW\(x\) === 2 \? \d+ : (\d+), height: cvRowsDe\(x\) === 1 \? 88 : 184 \}/);
  assert.ok(m, 'la case des favoris n’est plus lue : réaligner');
  const seuil = Number(bloc.requete.sel.match(/\d+/)[0]);
  const pad = cvCard.match(/padding: dense \? '12px (\d+)px' : (\d+)/);
  assert.ok(pad, 'le rembourrage de CvCard n’est plus lu');
  const contenu = Number(m[1]) - 2 * Math.min(Number(pad[1]), Number(pad[2]));
  assert.ok(contenu <= seuil, 'favoris : ' + contenu + ' px de contenu, au-dessus du seuil (' + seuil + ') — le mot revient à 1440');
  const fin = css.indexOf('.o-cvcarte { container-type');
  const commentaire = css.slice(css.lastIndexOf('/*', fin), fin);
  assert.ok(/FAVORIS/.test(commentaire) && /1440/.test(commentaire), 'le commentaire d’index.css ne dit plus que les favoris restent en icône');
});
