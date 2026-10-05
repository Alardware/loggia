// ─────────────────────────────────────────────────────────────────────────────
// Ce qui se clique doit pouvoir s'atteindre au clavier.
//
// Le titre d'une vue personnalisée était un `<h1>` porteur d'un `onClick` : en
// mode édition, cliquer dessus ouvrait le renommage. C'était le SEUL chemin —
// aucun bouton ailleurs. Un titre ne reçoit pas le focus, ne répond ni à Entrée
// ni à Espace, et n'est annoncé que comme un titre : au clavier, une vue
// personnalisée n'était donc pas renommable du tout.
//
// Le crayon posé à côté du texte donnait l'indice visuel, ce qui a suffi à
// masquer le manque : à la souris, tout marchait.
//
// Le titre reste un titre. Ce qui se clique est devenu un vrai bouton.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Les sources JSX du produit — et elles seules : `src/` garde des copies de
 *  travail ignorées par git, qui ne sont pas du code livré. */
function sources() {
  const out = [];
  for (const [dossier, sous] of [[join(RACINE, 'src'), 'src'], [join(RACINE, 'src', 'views'), 'src/views']]) {
    for (const f of readdirSync(dossier)) {
      if (f.endsWith('.jsx')) out.push([sous + '/' + f, readFileSync(join(dossier, f), 'utf8')]);
    }
  }
  return out;
}

test('aucun titre ne porte de clic', () => {
  // Limite assumée : la fenêtre s'arrête au premier `>`, donc une flèche
  // (`=>`) placée AVANT le `onClick` dans la même balise passerait au travers.
  // Ce n'est pas la forme qui s'écrit, et c'est exactement celle qui avait
  // échappé à la relecture.
  const fautes = [];
  for (const [nom, src] of sources()) {
    for (const m of src.match(/<h[1-6][^>]*onClick/g) || []) fautes.push(`${nom} → ${m.slice(0, 60)}`);
  }
  assert.deepEqual(fautes, [],
    'un titre redevient cliquable : ce qu’il déclenche ne sera atteignable qu’à la souris');
});

test('le renommage d’une vue passe par un vrai bouton', () => {
  const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const i = src.indexOf('setRenaming(true)');
  assert.notEqual(i, -1, 'le renommage d’une vue personnalisée a disparu');
  // On remonte à la balise qui le porte : ce doit être un <button>, pas un
  // conteneur à qui on aurait rajouté un rôle à la main.
  const ouvre = src.lastIndexOf('<', i);
  assert.equal(src.slice(ouvre, ouvre + 7), '<button',
    'le renommage est de nouveau déclenché par autre chose qu’un bouton');
});

test('le bouton de renommage dit ce qu’il fait', () => {
  const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const i = src.indexOf('setRenaming(true)');
  const balise = src.slice(src.lastIndexOf('<', i), src.indexOf('>', i));
  // Son contenu est le nom de la vue : sans étiquette, une synthèse vocale
  // annoncerait « Chalet, bouton » — le nom, jamais l’action.
  assert.match(balise, /aria-label=\{tr\(/,
    'le bouton n’annonce que le nom de la vue, pas ce qu’un clic déclenche');
});

test('les étiquettes de la feuille d’édition désignent un champ existant', () => {
  const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const cibles = (src.match(/htmlFor=\{([A-Za-z0-9_]+)\}/g) || []).map(m => m.match(/\{(\w+)\}/)[1]);
  assert.ok(cibles.length >= 2, `seulement ${cibles.length} étiquette(s) reliée(s) : « NOM » et « ENTITÉ » l’étaient`);
  for (const c of cibles) {
    // Une étiquette qui désigne un identifiant que personne ne porte ne relie
    // rien : elle a l'air correcte et se comporte comme le `<div>` d'avant.
    // `ChampSuggere` pose son `id` sur son propre <input> (ui.jsx).
    assert.match(src, new RegExp('<(input|ChampSuggere) id=\\{' + c + '\\}'),
      `aucun champ ne porte l’identifiant « ${c} » : l’étiquette ne désigne rien`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Un nom passé n'est pas un nom reçu.
//
// Trois appels écrivaient `<Bascule nom={…} on={…} cb={…} />`. Le composant, lui,
// ne déclarait que `{ on, cb }` : le nom était accepté par JSX, ignoré par la
// fonction, et jeté sans un mot. À l'écran tout allait bien — c'est le libellé
// voisin qu'on lit. Une synthèse vocale, elle, annonçait « interrupteur, activé »
// sans jamais dire de quoi.
//
// C'est la forme la plus discrète d'un réglage manquant : le code de l'appelant
// a l'air correct, et il l'est.
// ─────────────────────────────────────────────────────────────────────────────

test('l’interrupteur des règles reçoit vraiment le nom qu’on lui passe', () => {
  const ui = readFileSync(join(RACINE, 'src', 'ui.jsx'), 'utf8');
  const i = ui.indexOf('export function Bascule(');
  assert.notEqual(i, -1, 'l’interrupteur partagé a disparu');
  const corps = ui.slice(i, ui.indexOf('\n}', i));
  assert.match(corps, /export function Bascule\(\{[^}]*\bnom\b/,
    'le composant ne déclare plus « nom » : les appels le passeront dans le vide');
  assert.match(corps, /aria-label=\{nom/,
    'le nom est déclaré mais jamais porté : l’interrupteur reste anonyme');
});

test('tous les appels nomment leur interrupteur', () => {
  const fautes = [];
  for (const [nom, src] of sources()) {
    for (const m of src.match(/<Bascule[\s\S]*?\/>/g) || []) {
      if (!/\bnom=/.test(m)) fautes.push(`${nom} → ${m.replace(/\s+/g, ' ').slice(0, 60)}`);
    }
  }
  assert.deepEqual(fautes, [],
    'un interrupteur s’annonce sans dire ce qu’il commande');
});

test('un résultat de recherche d’entité se choisit au clavier', () => {
  const ui = readFileSync(join(RACINE, 'src', 'ui.jsx'), 'utf8');
  const i = ui.indexOf('onPick(e.id)');
  assert.notEqual(i, -1, 'le choix d’une entité a disparu');
  // On pouvait taper la recherche, mais pas retenir un résultat : la
  // tabulation sautait la liste entière.
  const ouvre = ui.lastIndexOf('<', i);
  assert.equal(ui.slice(ouvre, ouvre + 7), '<button',
    'les résultats redeviennent des conteneurs cliquables : la liste sort du parcours clavier');
});

// ── Le point 6 de l'audit du 27/09 : ce qui se lit et ce qui se vise ────────

test('une feuille ouverte rend le reste de la page INERTE', () => {
  // Le piège à focus ne retenait que Tab. Le curseur virtuel d'un lecteur
  // d'écran ne passe pas par le clavier : il lit le document. On sortait donc
  // de la feuille par en dessous, on atteignait une carte derrière le voile,
  // et on l'activait — sans code, dans le cas de la modale du code.
  //
  // Mesuré dans la démonstration après correction : 118 contrôles dans la
  // page, 5 joignables, 0 hors de la feuille. Et 0 élément inerte une fois
  // refermée — la page entière revient.
  const ui = readFileSync(join(RACINE, 'src', 'ui.jsx'), 'utf8');
  assert.match(ui, /export function inerterAutour\(noeud\)/, 'la mise en inertie a disparu');
  assert.match(ui, /frere\.hasAttribute\('inert'\)/,
    'un frère déjà inerte n’est plus épargné : une feuille sur une autre réveillerait ce que la première a éteint');
  // L'ORDRE compte : réveiller AVANT de rendre le focus, sinon on le rend à un
  // élément encore inerte, qui le refuse.
  for (const [nom, f] of [['ui.jsx', 'ui.jsx'], ['pinmodal.jsx', 'pinmodal.jsx']]) {
    const s = readFileSync(join(RACINE, 'src', f), 'utf8');
    assert.match(s, /const reveiller = inerterAutour\(voileRef\.current\)/, nom + ' : le fond ne devient plus inerte');
    // ui.jsx rend par `rendreFocus` (focus.js, relecture du lot 13), qui pose `preventScroll` : lot13r_focus_feuilles le joue.
    assert.match(s, f === 'ui.jsx' ? /reveiller\(\);[^\n]*rendreFocus\(prev, hote\)/ : /reveiller\(\);[^\n]*focus\(\{ preventScroll: true \}\)/,
      nom + ' : le focus est rendu AVANT le réveil — l’élément inerte le refusera');
  }
});

test('une feuille dit son nom', () => {
  // `role="dialog"` sans nom fait annoncer « dialogue », et rien d'autre, à
  // l'ouverture de n'importe quelle fiche. Une seule feuille sur quatre-vingts
  // passait un `title` ; les autres bâtissent leur en-tête avec `TitreFeuille`
  // ou `FicheEntete`. C'est donc la ligne de titre qui nomme.
  const ui = readFileSync(join(RACINE, 'src', 'ui.jsx'), 'utf8');
  const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  assert.match(ui, /aria-labelledby=\{idTitre\}/, 'la feuille ne se nomme plus par sa ligne de titre');
  assert.match(ui, /export function useIdTitreFeuille\(\)/, 'le crochet du nom a disparu');
  assert.match(ui, /prendre: \(jeton\) =>/,
    'sans jeton, deux lignes de titre porteraient le même id — et le double montage de React ferait passer la première pour une seconde');
  assert.match(ui, /export function TitreFeuille[\s\S]{0,400}id=\{idTitre \|\| undefined\}/, 'TitreFeuille ne porte plus l’id');
  assert.match(app, /function FicheEntete[\s\S]{0,700}id=\{idTitre \|\| undefined\}/, 'FicheEntete ne porte plus l’id');
});

test('le tiroir hors écran sort du parcours, le rail de l’ordinateur y reste', () => {
  // Au tactile, `is-closed` pousse le tiroir par `translateX(-100%)` : il reste
  // `display: flex`, et ses onze boutons restaient tabulables et lisibles à
  // l'aveugle. Sur ORDINATEUR, `is-closed` n'est qu'un rail de 72 px, bien
  // visible et bien utile — on n'y touche pas.
  const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  assert.match(app, /inert=\{tactile && !open \? '' : undefined\}/,
    'le tiroir fermé n’est plus retiré du parcours, ou il l’est aussi sur ordinateur');
  const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
  assert.match(css, /html\.loggia-tactile \.loggia-aside\.is-closed \{[^}]*translateX\(-100%\)/,
    'le tiroir tactile ne sort plus par la gauche : la condition de l’inertie ne veut plus rien dire');
});

test('rien ne se vise sous 24 px', () => {
  // WCAG 2.5.8. Sur une tablette murale, une main qui tremble ne vise pas un
  // point de 8 px — et ces points-là changent de page. Mesuré après
  // correction : zéro cible sous 24 px sur six vues, à 390 comme à 1280.
  const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  /* Les points de page des grilles d'icones ont disparu le 29/09 : la grille
   * cherche et se range par famille, elle ne se feuillette plus. Ce qui reste
   * a verifier, c'est qu'aucun point de 8 px ne revienne a decouvert. */
  assert.ok(!/width: 8, height: 8, padding: 0, borderRadius: 4/.test(app), 'un point de 8 px est revenu à découvert');
  // Les deux points de page de l'Accueil : gabarit 24, rangée toujours à 6.
  assert.match(app, /minWidth: 24, height: 24, margin: '-9px 0'/, 'les points de l’Accueil ont reperdu leur zone');
  // L'interrupteur d'une tuile pièce : zone de 24, pastille de 21.
  assert.match(app, /alignItems: 'center', height: 24, cursor: 'pointer', flexShrink: 0, margin: '-1\.5px 0'/,
    'l’interrupteur d’une tuile pièce a reperdu sa zone de 24');
  // Les boutons « − / + » : 22 avant, 24 depuis.
  assert.ok(!/width: 22, height: 22, borderRadius: 10/.test(app), 'un bouton « − / + » est retombé à 22 px');
});

// ─────────────────────────────────────────────────────────────────────────────
// La touche d'un bouton n'est pas la touche de sa carte (audit du 03/10).
//
// Une carte qui s'ouvre est un bouton : Entrée et Espace ouvrent sa fiche. La
// touche d'un bouton INTÉRIEUR — « Fermer » d'un volet, « Pause » d'un
// lecteur, − / + d'un thermostat, « Renvoyer au dock » — remonte jusqu'à elle.
// Ces boutons n'arrêtaient que le clic : la carte prenait la touche, appelait
// `preventDefault` — le bouton ne s'activait donc plus — et ouvrait la fiche.
// Dix cartes, plus le kit d'édition, où Entrée sur « Supprimer » ouvrait
// Modifier. À la souris, tout marchait.
//
// LE CRITÈRE. Un gestionnaire qui fait `preventDefault` sur Entrée ET Espace
// commence par `if (e.target !== e.currentTarget) return;` (le motif de
// l'ADR 0068) dès que l'élément qui le porte CONTIENT quelque chose qui prend
// le focus ou le clic : <button>, <input>, <select>, <textarea>, <a>, un
// `onClick`, `onKeyDown`, `onPointerDown`, `onChange`, `href` ou `tabIndex`,
// un rôle interactif, un curseur `kbSlider` — ou un composant qui n'est pas un
// pur dessin (`Fi`, `Ico`, `WeatherIco`, `PlugIcon`) : ce qu'il rend ne se lit
// pas d'ici, on le tient pour interactif. Sans rien de tout cela — un lien du
// menu, un interrupteur, la carte météo, la barre de confort —, la touche ne
// peut venir que de l'élément lui-même : la garde n'y changerait rien, on ne
// l'exige pas. Un gestionnaire en OBJET (`onKeyDown:`, étalé par
// `{...prise}`) ne sait pas sur quoi il sera posé : il la porte toujours.
//
// Limites assumées : une expression (`{extra}`, `{comp}`) ne se lit pas, un
// gestionnaire nommé (`onKeyDown={surTouche}`) non plus. Ces deux formes
// restent à la relecture.
// ─────────────────────────────────────────────────────────────────────────────

/** L'indice qui ferme la chaîne ouverte en `k` (', " ou `). */
function finChaine(s, k) {
  const q = s[k];
  for (k++; k < s.length; k++) {
    if (s[k] === '\\') { k++; continue; }
    if (s[k] === q) return k;
  }
  return k;
}

/** Le bloc qui s'ouvre sur l'accolade `i`, jusqu'à sa fermante. Chaînes et
 *  commentaires sont sautés : le « s'y » d'un commentaire ouvrirait sinon une
 *  chaîne qui ne se referme jamais. */
function blocAccolade(s, i) {
  let p = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '"' || c === "'" || c === '`') k = finChaine(s, k);
    else if (c === '/' && s[k + 1] === '/') { k = s.indexOf('\n', k); if (k < 0) break; }
    else if (c === '/' && s[k + 1] === '*') { k = s.indexOf('*/', k) + 1; if (k < 1) break; }
    else if (c === '{') p++;
    else if (c === '}' && --p === 0) return s.slice(i, k + 1);
  }
  return s.slice(i);
}

/** La balise ouvrante qui commence en `d` : son nom, l'indice de son `>`, et
 *  si elle se ferme d'elle-même. Avec `cible`, elle n'est retenue que si
 *  `cible` en est un attribut de premier niveau : un `<` croisé dans une
 *  expression n'ouvre pas de balise. */
function baliseOuvrante(s, d, cible = -1) {
  const m = /^<([A-Za-z][\w.]*)/.exec(s.slice(d, d + 80));
  if (!m) return null;
  let vu = cible < 0;
  for (let k = d + m[0].length; k < s.length; k++) {
    if (k === cible) vu = true;
    const c = s[k];
    if (c === '{') k += blocAccolade(s, k).length - 1;
    else if (c === '"' || c === "'") k = finChaine(s, k);
    else if (c === '}' || c === '<') return null;
    else if (c === '>') return vu ? { nom: m[1], fin: k, seule: s[k - 1] === '/' } : null;
  }
  return null;
}

/** L'élément qui porte l'attribut placé en `i`. */
function porteur(s, i) {
  for (let d = s.lastIndexOf('<', i); d >= 0 && i - d < 6000; d = s.lastIndexOf('<', d - 1)) {
    const b = baliseOuvrante(s, d, i);
    if (b) return { debut: d, ...b };
  }
  return null;
}

/** Ce que l'élément contient, jusqu'à SA fermante — les balises du même nom
 *  imbriquées sont comptées. `null` si elle manque. */
function contenu(s, b) {
  if (b.seule) return '';
  const re = new RegExp('<(/?)' + b.nom.replace(/\./g, '\\.') + '(?=[\\s>/])', 'g');
  re.lastIndex = b.fin + 1;
  let prof = 1;
  for (let m; (m = re.exec(s)); ) {
    if (m[1]) { if (--prof === 0) return s.slice(b.fin + 1, m.index); continue; }
    const o = baliseOuvrante(s, m.index);
    if (o) { if (!o.seule) prof++; re.lastIndex = o.fin + 1; }
  }
  return null;
}

const DESSINS = new Set(['Fi', 'Ico', 'WeatherIco', 'PlugIcon']);
const MARQUES_INTERACTIVES = /<(button|input|select|textarea|a)[\s>/]|\b(onClick|onKeyDown|onPointerDown|onChange|href|tabIndex)=|role="(button|switch|slider|checkbox|radio|link|menuitem|tab|option)"|\.\.\.kbSlider\(/;

/** Le contenu renferme-t-il quelque chose qui prend le focus ou le clic ? */
function interactif(c) {
  const sans = c.replace(/\/\*[\s\S]*?\*\//g, '');
  if (MARQUES_INTERACTIVES.test(sans)) return true;
  return (sans.match(/<[A-Z]\w*/g) || []).some(m => !DESSINS.has(m.slice(1)));
}

/** Les gestionnaires `onKeyDown` écrits en ligne, en attribut JSX ou en objet. */
function gestionnaires(s) {
  const out = [];
  for (const re of [/onKeyDown=(?=\{)/g, /onKeyDown:\s*\(?\w*\)?\s*=>\s*(?=\{)/g]) {
    for (const m of s.matchAll(re)) {
      const h = blocAccolade(s, m.index + m[0].length);
      const garde = h.search(/if \((\w+)\.target !== \1\.currentTarget\) return;/);
      out.push({
        i: m.index,
        ligne: s.slice(0, m.index).split('\n').length,
        objet: m[0].startsWith('onKeyDown:'),
        // Entrée ET Espace, et la touche avalée : c'est une activation.
        active: /\.key === 'Enter'/.test(h) && /\.key === ' '/.test(h) && /preventDefault\(\)/.test(h),
        // EN TÊTE : avant la première touche lue.
        garde: garde >= 0 && garde < h.search(/\.key === /),
      });
    }
  }
  return out;
}

test('Entrée sur un bouton d’une carte n’ouvre pas la carte', () => {
  const fautes = [];
  for (const [nom, src] of sources()) {
    for (const g of gestionnaires(src)) {
      if (!g.active || g.garde) continue;
      if (g.objet) { fautes.push(`${nom}:${g.ligne} → onKeyDown en objet, sans garde`); continue; }
      const b = porteur(src, g.i);
      assert.ok(b, `${nom}:${g.ligne} : balise introuvable — le lecteur du test ne suit plus le code`);
      const c = contenu(src, b);
      assert.notEqual(c, null, `${nom}:${g.ligne} : <${b.nom}> sans fermante — le lecteur du test ne suit plus le code`);
      if (interactif(c)) fautes.push(`${nom}:${g.ligne} → <${b.nom}> contient un contrôle`);
    }
  }
  assert.deepEqual(fautes, [],
    'Entrée ou Espace sur un bouton intérieur ouvre la carte, et le bouton n’agit plus : « if (e.target !== e.currentTarget) return; » en tête du gestionnaire');
});

test('le lecteur de la garde distingue un conteneur d’une feuille', () => {
  // Un lecteur qui ne trouverait plus rien laisserait tout passer : zéro
  // faute, faute de gestionnaire lu. On le vérifie sur trois cas connus.
  const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const lus = gestionnaires(app).filter(g => g.active && !g.objet).map(g => {
    const b = porteur(app, g.i);
    return { g, balise: b ? app.slice(b.debut, b.fin + 1) : '', dedans: (b && contenu(app, b)) || '' };
  });
  assert.ok(lus.length >= 20, `seulement ${lus.length} activations au clavier lues dans App.jsx`);
  // Un conteneur : une carte et son bouton « Fermer ». La carte volet servait
  // d'exemple ; depuis le lot 13 de l'audit du 03/10, sa fiche s'ouvre par un
  // bouton de surface (`Surface`, ui.jsx) et elle n'a plus de touche à
  // garder. Le cas est donc écrit ici, à sa forme d'avant : un lecteur qui ne
  // verrait plus ses boutons laisserait passer toute carte de ce genre.
  const carte = '<div role="button" tabIndex={0} onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === \'Enter\' || e.key === \' \') { e.preventDefault(); onOpen(id); } }} onClick={() => onOpen(id)}>\n'
    + '  <button aria-label={tr(\'Fermer\') + \' \' + nom} onClick={(e) => { e.stopPropagation(); commander(hass, id, \'close\'); }}><Fi i="angle-down" size={14} /></button>\n'
    + '</div>';
  const [volet] = gestionnaires(carte);
  const bv = volet && porteur(carte, volet.i);
  assert.ok(bv && bv.nom === 'div', 'la carte d’exemple n’est plus lue');
  assert.ok(interactif(contenu(carte, bv)), 'une carte passe pour une feuille : ses boutons ne sont plus vus');
  assert.ok(volet.active && volet.garde, 'la garde de la carte d’exemple n’est plus reconnue');
  // Sans la garde, la même carte est une faute : le lecteur ne voit pas une
  // garde partout.
  const [nue] = gestionnaires(carte.replace('if (e.target !== e.currentTarget) return; ', ''));
  assert.ok(nue.active && !nue.garde, 'une carte sans garde passe pour gardée');
  // Une feuille : la barre de recherche de l'en-tête, un dessin et deux
  // textes. Rien à garder — elle ne doit pas passer pour fautive.
  const recherche = lus.find(x => x.balise.includes("tr('Rechercher (Ctrl+K)')"));
  assert.ok(recherche, 'la barre de recherche n’est plus lue');
  assert.ok(!interactif(recherche.dedans), 'faux positif : une feuille sans contrôle passe pour un conteneur');
  // Le kit d'édition : un gestionnaire en objet, étalé sur la carte.
  const kit = gestionnaires(app).filter(g => g.objet && g.active);
  assert.ok(kit.length >= 1 && kit.every(g => g.garde), 'la carte d’édition reprend la touche de « Supprimer »');
});
