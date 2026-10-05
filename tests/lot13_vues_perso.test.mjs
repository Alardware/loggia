// ─────────────────────────────────────────────────────────────────────────────
// Les cartes des vues personnalisées n'englobent plus leurs commandes, et se
// nomment de ce qu'elles affichent (lot 13 de l'audit du 03/10, ADR 0074).
//
// La carte d'entité (`CvCard`) était un `role="button"` qui contenait son
// interrupteur, son curseur, « Armer », « Verrouiller », les flèches d'un
// volet : un rôle bouton rend sa descendance présentationnelle, et ces
// commandes disparaissaient d'un lecteur d'écran (axe : `nested-interactive`).
// Son nom, « Ouvrir Volet salon », taisait l'état affiché et prenait celui du
// bouton « Ouvrir » du volet (WCAG 2.5.3). Les cartes capteur s'appelaient
// « Ouvrir sensor.co2_sejour » — l'identifiant, épelé. En mode édition, la
// carte d'une vue personnalisée était un bouton qui englobait sa barre
// d'outils ET la carte vivante ; dans la galerie d'ajout, chaque aperçu
// tabulait ses commandes DANS le bouton du choix.
//
// Le motif : le geste « ouvrir » passe par une `Surface` (ui.jsx), sœur des
// commandes, nommée `nomCarte(nom, état affiché)` ; chaque commande est
// positionnée — peinte après la surface, elle reçoit son clic — et nomme
// l'appareil. Une carte sans commande reste le bouton, sous le même nom.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const NL = '\n';

/** Le corps d'une fonction de premier niveau, par son nom. */
const fonction = (nom) => {
  const i = app.indexOf(NL + 'function ' + nom + '(');
  assert.ok(i >= 0, nom + ' introuvable');
  const j = app.indexOf(NL + 'function ', i + 1);
  return app.slice(i, j < 0 ? undefined : j);
};

/* ── Un lecteur de balises JSX, le même que tests/clavier.test.mjs ──────────
 * Chaînes et commentaires sautés, accolades comptées : assez pour trouver la
 * balise qui porte un attribut et ce qu'elle contient jusqu'à SA fermante. */
function finChaine(s, k) {
  const q = s[k];
  for (k++; k < s.length; k++) {
    if (s[k] === '\\') { k++; continue; }
    if (s[k] === q) return k;
  }
  return k;
}
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
    else if (c === '>') return vu ? { debut: d, nom: m[1], fin: k, seule: s[k - 1] === '/' } : null;
  }
  return null;
}
function porteur(s, i) {
  for (let d = s.lastIndexOf('<', i); d >= 0 && i - d < 6000; d = s.lastIndexOf('<', d - 1)) {
    const b = baliseOuvrante(s, d, i);
    if (b) return b;
  }
  return null;
}
function contenu(s, b) {
  if (b.seule) return '';
  const re = new RegExp('<(/?)' + b.nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[\\s>/])', 'g');
  re.lastIndex = b.fin + 1;
  let prof = 1;
  for (let m; (m = re.exec(s)); ) {
    if (m[1]) { if (--prof === 0) return s.slice(b.fin + 1, m.index); continue; }
    const o = baliseOuvrante(s, m.index);
    if (o) { if (!o.seule) prof++; re.lastIndex = o.fin + 1; }
  }
  return null;
}
const balise = (s, b) => s.slice(b.debut, b.fin + 1);
/** La valeur `{…}` de l'attribut `nom` dans une balise ouvrante, ou null. */
const attribut = (tag, nom) => {
  const m = new RegExp('\\s' + nom + '=\\{').exec(tag);
  return m ? blocAccolade(tag, m.index + m[0].length - 1) : null;
};

/* Les purs dessins : ce qu'ils rendent ne prend ni le focus ni le clic. */
const DESSINS = new Set(['Fi', 'Ico', 'WeatherIco', 'PlugIcon', 'ArmAnneau']);
const MARQUES = /<(button|input|select|textarea|a)[\s>/]|\b(onClick|onKeyDown|onPointerDown|onChange|href|tabIndex)=|role="(button|switch|slider|checkbox|radio|link|menuitem|tab|option)"|\.\.\.kbSlider\(/;
const interactif = (c) => {
  const sans = c.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return MARQUES.test(sans) || (sans.match(/<[A-Z]\w*/g) || []).some(m => !DESSINS.has(m.slice(1)));
};

/** Les boutons d'un morceau de source : `<button>`, et tout élément qui prend
 *  `role="button"`, même sous condition (`role={x ? 'button' : undefined}`). */
function boutons(src) {
  const out = [];
  for (const m of src.matchAll(/<button[\s>]/g)) {
    const b = baliseOuvrante(src, m.index);
    if (b) out.push(b);
  }
  for (const m of src.matchAll(/\srole=(?:"button"|\{[^}]*'button'[^}]*\})/g)) {
    const b = porteur(src, m.index + 1);
    if (b) out.push(b);
  }
  return out;
}

test('aucune carte des vues personnalisées n’englobe une commande', () => {
  const noms = [...app.matchAll(/\nfunction (Cv\w+)\(/g)].map(m => m[1]).concat(['CustomView']);
  assert.ok(noms.length >= 20, 'les cartes Cv* ne sont plus lues : ' + noms.length);
  const fautes = [];
  for (const nom of noms) {
    const src = fonction(nom);
    for (const b of boutons(src)) {
      const c = contenu(src, b);
      assert.notEqual(c, null, nom + ' : <' + b.nom + '> sans fermante — le lecteur du test ne suit plus le code');
      if (interactif(c)) fautes.push(nom + ' → ' + balise(src, b).replace(/\s+/g, ' ').slice(0, 90));
    }
  }
  assert.deepEqual(fautes, [], 'un bouton contient une commande : elle disparaît d’un lecteur d’écran (nested-interactive)');
});

test('la carte d’entité : une surface nommée de ce qu’elle affiche, sœur de ses commandes', () => {
  const c = fonction('CvCard');
  const i = c.indexOf("<div className={'o-piece' + (dense ? ' o-cvdense' : '')");
  assert.ok(i >= 0, 'la racine de la carte a changé de forme');
  const racine = balise(c, baliseOuvrante(c, i));
  for (const a of ['role=', 'tabIndex=', 'onClick=', 'onKeyDown=', 'aria-label=']) assert.ok(!racine.includes(a), 'la racine porte encore ' + a);
  assert.ok(racine.includes("style={{ position: 'relative',"), 'la surface se pose sur une racine positionnée');
  // Le nom : la MÊME variable que le sous-titre affiché.
  assert.ok(c.includes('const sousTitre = '), 'le sous-titre n’est plus une variable');
  assert.ok(c.includes('{sousTitre}'), 'le sous-titre affiché n’est plus celui qu’on nomme');
  const s = c.indexOf('{ouvrable && <Surface onClick={() => onOpen(id)} label={nomCarte(name, sousTitre)} />}');
  assert.ok(s > i, 'la surface manque, ou ne porte pas le nom affiché');
  assert.ok(s < c.indexOf('className="o-cvrow"'), 'la surface doit être le PREMIER enfant : les commandes passent après elle');
  assert.ok(!c.includes("tr('Ouvrir') + ' ' + name :"), 'l’ancien nom « Ouvrir … » est revenu');
  // La rangée n'est plus positionnée : un clic sur le nom ou l'état ouvre la fiche.
  assert.ok(c.includes(`<div className="o-cvrow" style={{ display: 'flex',`), 'la rangée repasse au-dessus de la surface : son texte n’ouvrirait plus la fiche');
});

test('la carte d’entité : chaque commande passe sur la surface et nomme l’appareil', () => {
  const c = fonction('CvCard');
  assert.ok(c.includes("const mini = { position: 'relative',"), 'les minis de la compacte');
  /* Les variantes partent de `mini` : elles en héritent la position, et sans
   * elle le bouton passerait SOUS la surface qui ouvre la fiche. */
  for (const v of ['miniAccent', 'miniClim']) {
    assert.ok(c.includes('const ' + v + ' = { ...mini,'), v + ' ne dérive plus de mini : il perdrait sa position');
  }
  const tags = [...c.matchAll(/<button[\s>]/g)].map(m => balise(c, baliseOuvrante(c, m.index)));
  assert.ok(tags.length >= 14, 'les boutons de la carte ne sont plus lus : ' + tags.length);
  for (const t of tags) {
    const court = t.replace(/\s+/g, ' ').slice(0, 80);
    assert.ok(t.includes("position: 'relative'") || /style=\{mini(Accent|Clim)?\}/.test(t), 'non positionné, il passe sous la surface : ' + court);
    const nom = attribut(t, 'aria-label');
    assert.ok(nom && /\bname\b/.test(nom), 'sans le nom de l’appareil : ' + court);
  }
  // Ce qui n'est pas un <button> : l'interrupteur, le curseur, les épingles.
  const bascule = c.indexOf('<span role="switch"');
  assert.ok(bascule >= 0 && balise(c, baliseOuvrante(c, bascule)).includes("position: 'relative'"), 'l’interrupteur');
  assert.ok(c.includes(`<div className="o-cvrange" role="presentation" style={{ position: 'relative',`), 'le curseur de luminosité');
  assert.ok(c.includes("<div style={{ position: 'relative' }}><Epingles pourId={id} hass={hass} /></div>"), 'les épingles');
});

test('les cartes capteur sont leur propre bouton, nommé du nom et de la valeur', () => {
  const t = fonction('CvTyped');
  assert.ok(!t.includes('role="button"') && !t.includes("tr('Ouvrir') + ' ' + id"), 'l’enveloppe « Ouvrir sensor.… » est revenue');
  for (const [type, comp] of [['chiffre', 'CvBigSensor'], ['jauge', 'CvGauge'], ['graph', 'CvHistory']]) {
    assert.ok(t.includes(`if (t === '${type}') return <${comp} id={id} hass={hass} onOpen={ouvreCapteur} />;`), comp + ' ne reçoit plus le geste');
    const c = fonction(comp);
    assert.match(c, /onOpen = null \}\) \{/, comp + ' : `onOpen` manque');
    // Relecture du lot 13 : en panne, le nom dit « Indisponible », jamais le
    // tiret de l'écran (« CO2 salon, — ppm ») ; l'unité ne suit qu'une vraie
    // valeur. Le graphique tait un état inconnu, qu'il ne marque pas en panne.
    const vu = "(unite ? valeur + ' ' + unite : valeur)";
    // Le graphique d'un capteur DATÉ se nomme de sa date (05/10, suite « dates
    // partout ») : `cur` y est NaN, la date est la valeur affichée.
    const lu = comp === 'CvHistory' ? "date == null && isNaN(cur) ? (mort ? tr('Indisponible') : null) : " + vu : "mort ? tr('Indisponible') : " + vu;
    assert.ok(c.includes('aria-label={onOpen ? nomCarte(nom, ' + lu + ") : undefined} aria-haspopup={onOpen ? 'dialog' : undefined}"), comp + ' : le nom n’est plus le nom et la valeur, ou il lit le tiret d’une panne');
    assert.ok(c.includes("role={onOpen ? 'button' : undefined}"), comp + ' : le rôle');
    assert.ok(c.includes('>{nom}</div>'), comp + ' : le nom affiché n’est plus celui qu’on lit');
  }
  assert.ok(fonction('CvGauge').includes('>{valeur}</span>') && fonction('CvHistory').includes('>{valeur}<span'), 'la valeur affichée est celle qu’on lit');
});

test('présence, calendrier et pastilles : le nom affiché, et la fiche annoncée', () => {
  const p = fonction('CvPresence');
  assert.ok(p.includes("aria-label={ouvrable ? nomCarte(tr('Présence'), compteur) : undefined} aria-haspopup={ouvrable ? 'dialog' : undefined}"), 'la carte Présence');
  // Relecture du lot 13 : qui est là, que le rôle bouton taisait, se lit en
  // description — les lignes affichées, sinon la grille.
  assert.ok(p.includes("aria-haspopup={ouvrable ? 'dialog' : undefined} aria-describedby={decrit}"), 'la carte Présence tait qui est là');
  assert.ok(p.includes("liste.map(p => did + p.haid).join(' ')") && p.includes('}} id={did + p.haid}>{p.name}<span className="o-presence-ou"') && p.includes(`id={did + '-g'} role="list"`), 'la description ne pointe plus vers ce que la carte affiche');
  assert.ok(p.includes('}}>{compteur}</span>}'), 'le compteur nommé est celui qu’on voit');
  const k = fonction('CvCalendrier');
  assert.ok(k.includes("aria-label={onOpen ? nomCarte(tr('Calendrier'), mois + ' ' + auj.getDate()) : undefined} aria-haspopup={onOpen ? 'dialog' : undefined}"), 'la carte Calendrier dit la date qu’elle montre');
  assert.ok(!k.includes("aria-label={onOpen ? tr('Ouvrir"), 'un geste a repris la place du nom');
  // La chip se nomme de son texte, déjà le nom puis la valeur : un nom posé
  // par-dessus n'apporterait qu'un écart avec ce qu'on lit.
  const chip = fonction('CvChip');
  assert.ok(chip.includes("aria-haspopup={dc && dc.ouvrir ? 'dialog' : undefined}") && !chip.includes('aria-label='), 'la chip');
  assert.ok(fonction('CvChips').includes("aria-label={nomCarte(cvName(S[c.id], c.id), c.txt)} aria-haspopup={dc && dc.ouvrir ? 'dialog' : undefined}"), 'une pastille ne dit plus seulement « 65 % »');
});

test('vue personnalisée en édition : la carte est inerte, sa poignée est une surface sœur de la barre', () => {
  const v = fonction('CustomView');
  const i = v.indexOf('<div key={cvKey(x)} data-cvk={cvKey(x)}');
  assert.ok(i >= 0, 'la carte de la grille a changé de forme');
  const env = balise(v, baliseOuvrante(v, i));
  assert.ok(!env.includes('role=') && !env.includes('tabIndex=') && !env.includes('aria-label='), 'l’enveloppe est redevenue un bouton qui englobe la barre');
  assert.ok(env.includes('onPointerDown={edit ? (e) => debutDrag(e, x) : undefined}'), 'le glisser reste sur la carte entière');
  assert.ok(v.includes(`<div className="o-cvfit" inert={edit ? '' : undefined} style={{ height: '100%', pointerEvents: edit ? 'none' : 'auto' }}>`), 'en édition, les commandes de la carte se tabulent encore');
  const s = v.indexOf("{edit && <Surface popup={false} label={nomCarte(x) + ' · ' + tr('Déplacer avec les flèches')} onKeyDown={(e) => clavierCv(e, x)}");
  assert.ok(s > v.indexOf('<CvTyped x={x} hass={hass} dc={dc} />'), 'la poignée se pose APRÈS la carte : sinon la carte couvre son anneau de focus');
  assert.ok(s < v.indexOf('<EditBarre>'), 'la barre d’outils reste au-dessus de la poignée');
  assert.ok(v.includes("e.target.closest('button:not(.o-surface)')"), 'saisir la poignée doit encore déplacer la carte');
  // Le nom lu : jamais une clé épelée, jamais deux fois le même pour deux cartes.
  /* Relecture du lot 13 : le corps est sorti en `nomCv`, fonction de module,
   * pour que la barre des favoris de l'Accueil nomme ses cartes de même. */
  assert.ok(v.includes('const nomCarte = (x) => nomCv(x, hass);'), 'la vue ne lit plus le nom commun de ses cartes');
  const n = fonction('nomCv');
  assert.ok(n.includes("if (String(id).indexOf('.') < 0) return type || id;"), 'une carte sans entité s’appelle encore « presence:1791… »');
  assert.ok(n.includes("return cvTypeDe(x) === 'compacte' || !type ? nom : nom + ', ' + type;"), 'la compacte et le graphique d’une même entité portent le même nom');
  assert.ok(v.includes("aria-label={tr('Renommer la vue') + ' ' + cv.name"), 'le bouton de renommage tait le nom qu’il affiche');
  for (const geste of ["tr('Changer la carte'))", "tr('Largeur double')", "tr('Retirer')"]) {
    assert.ok(v.includes(geste + " + ' · ' + nomCarte(x)}"), 'un outil de la barre ne dit pas quelle carte il touche : ' + geste);
  }
  // Un bouton à bascule garde UN nom, son état passe par aria-pressed : « Largeur
  // simple », enfoncé, se lisait comme le contraire de ce qu'il était.
  assert.ok(v.includes("aria-label={tr('Largeur double') + ' · ' + nomCarte(x)} aria-pressed={cvW(x) === 2}"), 'le nom de la bascule de largeur change avec son état');
});

test('la galerie d’ajout : l’aperçu ne se tabule pas dans le bouton du choix', () => {
  const g = fonction('CarteApercu');
  assert.ok(g.includes(`<span className="o-cvfit" inert="" style={{ display: 'block', height: h, pointerEvents: 'none',`), 'l’aperçu porte encore ses commandes dans le bouton');
  // Relecture du lot 13 (04/10) : `ouvrir: null` ne suffisait pas — la carte
  // riche (`dc.card`) ferme sur son propre geste et pose sa surface ; la chip,
  // la caméra, l'alarme, le volet gardent leurs boutons : autant de <button>
  // dans le <button> du choix. Le choix n'englobe donc plus l'aperçu.
  const sans = g.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.deepEqual(boutons(sans).map(b => balise(sans, b).slice(0, 60)), [], 'le choix est redevenu un bouton qui englobe l’aperçu');
  const racine = g.indexOf(`<div className="o-apercu" style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center',`);
  assert.ok(racine >= 0, 'la racine : positionnée pour la surface, et l’aperçu centré quand la rangée l’étire, comme le faisait le bouton');
  const s = g.indexOf('<Surface popup={false} onClick={onClick} label={lbl} aria-pressed={actif} style={{ inset: -1 }} />');
  assert.ok(s > racine && s < g.indexOf('<span className="o-cvfit"'), 'la surface du choix manque, ou suit l’aperçu : le premier focus d’une feuille irait à un bouton inerte');
  assert.ok(g.includes('<CvTyped x={x} hass={hass} dc={{ ...dc, ouvrir: null }} />'), 'l’aperçu reçoit de nouveau le geste « ouvrir »');
  // Ce que la règle des boutons donnait à l'ancien choix : l'enfoncement (à
  // la souris ET à Espace, qui n'active que la surface), son rebond, et
  // l'anneau de focus 2 px dehors.
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  for (const r of ['.o-apercu { transition: transform .16s cubic-bezier(.34, 1.45, .56, 1); }', '.o-apercu:active { transform: scale(.955); }',
    '.o-apercu:has(> .o-surface:active) { transform: scale(.955); }',
    '.o-apercu:has(> .o-surface:focus-visible) { outline: 2px solid var(--o-accent); outline-offset: 2px; }', '.o-apercu > .o-surface:focus-visible { outline: none; }',
    '.o-apercu { transition: none; } .o-apercu:active { transform: none; }', '.o-apercu:has(> .o-surface:active) { transform: none; }']) assert.ok(css.includes(r), 'index.css : ' + r);
});
