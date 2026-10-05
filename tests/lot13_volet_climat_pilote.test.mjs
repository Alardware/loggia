// ─────────────────────────────────────────────────────────────────────────────
// Le volet, le thermostat et le fil pilote ne sont plus des boutons qui en
// contiennent d'autres (lot 13 de l'audit du 03/10).
//
// Les trois cartes étaient un `<div role="button">` autour d'une glissière,
// d'un interrupteur, des boutons « Ouvrir / Stop / Fermer » ou « − / + ». Un
// rôle bouton rend sa descendance présentationnelle : axe-core relevait
// `nested-interactive` sur chacune (×3 sur Volets, dans chaque pièce, sur
// Objets), et un lecteur d'écran ne voyait plus les commandes. Leur nom,
// « Ouvrir Volet salon », taisait l'état affiché — « Ouvert à 60 % » — et se
// confondait avec le bouton « Ouvrir », qui LÈVE le volet (WCAG 2.5.3).
//
// Le motif de l'ADR 0074 : la fiche s'ouvre par un bouton de SURFACE
// (`Surface`, ui.jsx), premier enfant de la carte, nommé de ce qu'elle
// affiche (`nomCarte(nom, sub)`) ; les commandes, positionnées, passent
// au-dessus de lui et nomment l'appareil. Rien ne bouge à l'œil.
//
// Les cartes ne sont pas exportées : leur source se lit comme texte. La
// surface, elle, se rend.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composant, rendre } from './rendu.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('src', 'App.jsx');
const compter = (s, motif) => s.split(motif).length - 1;

/** Le corps d'une fonction de premier niveau d'App.jsx. */
const corps = (nom) => {
  const i = APP.indexOf('\nfunction ' + nom + '(');
  assert.ok(i >= 0, nom + ' a disparu');
  return APP.slice(i + 1, APP.indexOf('\n}\n', i) + 2);
};

/** La balise ouvrante de la carte — de `<div className={'o-rmcard'` à la fin
 *  de son style — et ce qui la suit. */
const FIN = "border: LISERE }}>";
const racine = (f, nom) => {
  const i = f.indexOf("<div className={'o-rmcard'");
  assert.ok(i >= 0, nom + ' : la carte a perdu sa classe o-rmcard');
  const j = f.indexOf(FIN, i);
  assert.ok(j > i, nom + ' : la fin de la balise de la carte ne se lit plus');
  return { balise: f.slice(i, j + FIN.length), apres: f.slice(j + FIN.length) };
};

const CARTES = [
  { nom: 'RoomCoverCard', ouvre: 'onOpen(id)' },
  { nom: 'RoomClimateCard', ouvre: 'onOpen(id)' },
  { nom: 'RoomPilotCard', ouvre: 'onOpen(zone.id)' },
];

test('la carte n’est plus un bouton : ni rôle, ni tabulation, ni nom, ni clic, ni touche', () => {
  for (const { nom } of CARTES) {
    const { balise } = racine(corps(nom), nom);
    for (const attr of ['role=', 'tabIndex=', 'aria-label=', 'onClick=', 'onKeyDown=']) {
      assert.ok(!balise.includes(attr),
        `${nom} : la racine porte de nouveau ${attr} — ses commandes redeviennent présentationnelles (nested-interactive)`);
    }
    // Le repère de la surface, qui la couvre en `inset: 0`.
    assert.ok(balise.includes("position: 'relative'"), nom + ' : la carte n’est plus le repère de sa surface');
  }
});

test('la fiche s’ouvre par la surface, premier enfant, nommée de ce que la carte affiche', () => {
  for (const { nom, ouvre } of CARTES) {
    const f = corps(nom);
    const attendu = `{onOpen && <Surface onClick={() => ${ouvre}} label={nomCarte(nom, sub)} />}`;
    assert.ok(racine(f, nom).apres.trimStart().startsWith(attendu),
      `${nom} : la surface n’est plus le premier enfant de la carte — attendu ${attendu}`);
    // `nom` et `sub` sont ce que la carte ÉCRIT, sous l'icône : le nom de la
    // surface est le texte affiché, pas un résumé fait pour l'occasion.
    assert.ok(f.includes('<div style={RM_NAME}>{nom}</div>'), nom + ' : le nom affiché n’est plus `nom`');
    assert.ok(/<div style=\{\{ \.\.\.RM_SUB, [^\n]*\}\}>\{sub\}<\/div>/.test(f), nom + ' : l’état affiché n’est plus `sub`');
  }
});

test('« Ouvrir Volet salon » est le bouton qui lève le volet, et lui seul', () => {
  const volet = corps('RoomCoverCard');
  for (const [mot, geste] of [['Ouvrir', "setOv(100); commander(hass, id, 'open');"], ['Stop', "commander(hass, id, 'stop');"], ['Fermer', "setOv(0); commander(hass, id, 'close');"]]) {
    assert.ok(volet.includes(`<button aria-label={tr('${mot}') + ' ' + nom} title={tr('${mot}')} onClick={(e) => { e.stopPropagation(); ${geste} }}`),
      `« ${mot} » ne commence plus par le mot de sa bulle, ne nomme plus le volet, ou n’est plus son propre geste`);
  }
  assert.equal(compter(volet, "tr('Ouvrir') + ' ' + nom"), 1, 'la carte et le bouton « Ouvrir » portent de nouveau le même nom');
  for (const nom of ['RoomClimateCard', 'RoomPilotCard']) {
    const f = corps(nom);
    assert.ok(!f.includes("tr('Ouvrir')"), nom + ' : la carte s’appelle de nouveau « Ouvrir … »');
    assert.ok(f.includes("<button aria-label={tr('Baisser la consigne') + ' ' + nom} disabled={!reglable}"), nom + ' : « − » ne nomme plus l’appareil');
    assert.ok(f.includes("<button aria-label={tr('Monter la consigne') + ' ' + nom} disabled={!reglable}"), nom + ' : « + » ne nomme plus l’appareil');
  }
});

test('les commandes passent au-dessus de la surface, le dessin laisse passer le clic', () => {
  // Un bouton non positionné serait peint SOUS la surface : « Fermer » ou
  // « + » ouvriraient la fiche au lieu d'agir. Mais une rangée positionnée en
  // entier la couvrait : l'écart entre deux boutons et la consigne « 19 °C »
  // ne faisaient plus rien. Les boutons SEULS (RM_BTN), donc (relecture du lot 13).
  const rangee = (f, repere) => {
    const j = f.indexOf(repere);
    assert.ok(j > 0, 'commande introuvable : ' + repere);
    const d = f.lastIndexOf('<div style={{', j);
    return f.slice(d, f.indexOf('}}>', d));
  };
  const volet = corps('RoomCoverCard');
  assert.ok(/\nconst RM_BTN = \{ position: 'relative', /.test(APP), 'RM_BTN n’est plus positionné : chaque bouton passerait sous la surface');
  assert.ok(!rangee(volet, "commander(hass, id, 'open')").includes("position: 'relative'"), 'la rangée Ouvrir / Stop / Fermer couvre la surface : l’écart entre deux boutons ne fait plus rien');
  assert.equal(compter(volet, 'className="o-rmbtn" style={{ ...RM_BTN,'), 3, 'Ouvrir, Stop ou Fermer ne tient plus sa position de RM_BTN');
  for (const nom of ['RoomClimateCard', 'RoomPilotCard']) {
    const f = corps(nom);
    assert.ok(!rangee(f, 'setT(-0.5)').includes("position: 'relative'"), nom + ' : la rangée repasse au-dessus de la surface, la consigne n’ouvre plus la fiche');
    assert.equal(compter(f, 'className="o-rmbtn" style={{ ...RM_BTN,'), 2, nom + ' : − ou + ne tient plus sa position de RM_BTN, il passerait sous la surface');
    const sp = f.indexOf("<span style={{ flex: '0 0 auto', minWidth: 58,");
    assert.ok(sp > 0 && !f.slice(sp, f.indexOf('}}>', sp)).includes('position'), nom + ' : la consigne se positionne, un appui sur elle n’ouvrirait plus la fiche');
  }
  // La glissière et l'interrupteur sont positionnés d'eux-mêmes.
  assert.ok(corps('RmJauge').includes("position: 'relative'"), 'la glissière n’est plus positionnée : elle passerait sous la surface');
  assert.ok(corps('RmBascule').includes("position: 'relative'"), 'l’interrupteur n’est plus positionné : il passerait sous la surface');
  // L'icône du volet, positionnée pour son store, passerait AU-DESSUS de la
  // surface : sans `pointerEvents: 'none'`, un appui sur elle ne ferait rien.
  assert.ok(volet.includes("position: 'relative', overflow: 'hidden', pointerEvents: 'none' }}>"), 'l’icône du volet garde le clic : un appui sur elle n’ouvre plus la fiche');
});

test('la consigne se lit telle qu’elle s’affiche', () => {
  // Un `aria-label` sur un <span> sans rôle est interdit (ARIA 1.2) : selon
  // le lecteur, il était ignoré, ou il cachait « 19 °C » sous « Consigne ».
  for (const nom of ['RoomClimateCard', 'RoomPilotCard']) {
    const f = corps(nom);
    assert.ok(!f.includes("aria-label={tr('Consigne')}"), nom + ' : la consigne cache de nouveau son chiffre');
    assert.ok(f.includes("<span className=\"o-vh\">{tr('Consigne') + ' '}</span>{consigne}</span>"), nom + ' : la consigne ne s’annonce plus « Consigne 19 °C »');
  }
  // Le mot masqué sort du flux : la rangée « − 19 °C + » ne bouge pas.
  assert.match(lire('src', 'index.css'), /\.o-vh \{ position: absolute !important;/, 'le texte masqué reprend de la place dans la rangée');
});

test('ce que la surface annonce : le nom puis l’état, et une fiche', async () => {
  const Surface = await composant('ui.jsx', 'Surface');
  const nomCarte = await composant('ui.jsx', 'nomCarte');
  const html = rendre(Surface, { onClick: () => {}, label: nomCarte('Volet salon', 'Ouvert à 60 %') });
  assert.ok(html.startsWith('<button type="button" class="o-surface"'), html);
  assert.ok(html.includes('aria-label="Volet salon, Ouvert à 60 %"'), 'la surface ne dit plus le nom puis l’état : ' + html);
  assert.ok(html.includes('aria-haspopup="dialog"'), 'la surface ne dit plus qu’elle ouvre une fiche');
  assert.equal(nomCarte('Thermostat salon', 'Chauffe'), 'Thermostat salon, Chauffe');
});

test('la carte s’enfonce encore sous le doigt, comme quand elle était un bouton', () => {
  // `[role="button"]:active` (index.css) enfonçait la carte à chaque appui —
  // sur elle ou sur une de ses commandes. Sans rôle, plus aucune règle ne la
  // touchait : mesuré en démo, `transform` restait à `none` pendant l'appui.
  const css = lire('src', 'index.css');
  assert.ok(css.includes('.o-rmcard:has(> .o-surface):active { transform: scale(.955); }'), 'la carte ne s’enfonce plus au press');
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce) { .o-rmcard:has(> .o-surface):active { transform: none; } }'), 'l’enfoncement ignore « réduire les animations »');
  // Le même enfoncement que les boutons, pas un autre.
  assert.match(css, /\[role="button"\]:active \{\n {2}transform: scale\(\.955\);/, 'l’enfoncement des boutons a changé : l’aligner ici');
});
