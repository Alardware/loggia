/* Lot 13 de l'audit du 03/10 — les cartes machine, distributeur et plante.
 *
 * axe-core relevait `nested-interactive` sur la vue Objets : la carte d'un
 * robot (Démarrer, Dock, Localiser, Pause) et celle du distributeur
 * (Distribuer, Rempli) étaient des `role="button"` qui enfermaient de vrais
 * boutons. Un rôle bouton rend sa descendance présentationnelle : un lecteur
 * d'écran ne voyait plus ces commandes. Et leur nom, « Ouvrir Aspirateur »,
 * taisait l'état affiché et prenait le mot d'un bouton (WCAG 2.5.3).
 *
 * Le motif de l'ADR 0074 : la carte perd son rôle, une `Surface` (ui.jsx) en
 * PREMIER enfant porte « ouvrir la fiche » sous le nom que la carte affiche
 * (`nomCarte`), les commandes passent au-dessus d'elle, positionnées, et
 * nomment l'appareil. La plante, sans commande, garde son rôle bouton : seul
 * son nom change.
 *
 * Ces cartes ne sont pas exportées : App.jsx se lit comme du texte. Le rendu
 * de `Surface` et de `nomCarte`, lui, s'exécute.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { composant, rendre } from './rendu.mjs';

const NL = String.fromCharCode(10);
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

/** Le texte sans ses commentaires : ceux qui racontent l'ancien rôle bouton ne sont pas du code. */
function sansCommentaires(t) {
  let out = '';
  for (let i = 0; i < t.length;) {
    const a = t.indexOf('/*', i);
    if (a < 0) { out += t.slice(i); break; }
    out += t.slice(i, a);
    i = t.indexOf('*/', a) + 2;
  }
  return out.split(NL).filter(l => !l.trim().startsWith('//')).join(NL);
}
const corps = (nom) => {
  const d = app.indexOf('function ' + nom + '(');
  assert.ok(d > 0, nom + ' introuvable dans App.jsx');
  return sansCommentaires(app.slice(d, app.indexOf(NL + '}', d)));
};
const compter = (s, m) => s.split(m).length - 1;

/** La balise ouvrante qui commence en `d`, jusqu'à son `>` : les accolades et
 *  les chaînes sont sautées (un `=>` n'y ferme rien). */
function balise(s, d) {
  for (let k = d + 1, p = 0; k < s.length; k++) {
    const c = s[k];
    if (c === "'" || c === '"' || c === '`') k = s.indexOf(c, k + 1);
    else if (c === '{') p++;
    else if (c === '}') p--;
    else if (c === '>' && p === 0) return s.slice(d, k + 1);
  }
  return s.slice(d);
}

/** La racine qui porte `classe` : sa balise ouvrante, et ce qui la suit. */
function racine(src, classe) {
  const i = src.indexOf(classe);
  assert.ok(i > 0, 'la classe ' + classe + ' a disparu : le liseré « ne répond plus » la lit');
  const d = src.lastIndexOf('<div', i);
  const b = balise(src, d);
  return { b, suite: src.slice(d + b.length).trimStart() };
}
const sansGeste = (b) => !b.includes('onClick=') && !b.includes('onKeyDown=') && !b.includes('tabIndex=') && !b.includes('aria-label=') && !b.includes('role=');

const RMCARD = "className={'o-rmcard' + (mort ? ' o-panne' : '')}";
const DENSE = "className={'o-piece o-cvdense' + (mort ? ' o-panne' : '')}";
// Les boutons SEULS passent au-dessus de la surface, jamais leur rangée
// (relecture du lot 13) : positionnée, elle la couvrait sur toute sa largeur,
// et un appui entre deux boutons ne faisait plus rien.
const RANGEE = "<div style={{ display: 'flex', gap: 8, marginTop: 11 }}>";
const RANGEE_POSEE = "<div style={{ position: 'relative', display: 'flex', gap: 8";
const BOUTON_POSE = /\nconst RM_BTN = \{ position: 'relative', /;

test('la carte machine : ses commandes ne sont plus enfermées dans un bouton, la surface dit ce qu’elle affiche', () => {
  const c = corps('RoomMachineCard');
  assert.ok(!c.includes('role="button"') && !c.includes('onKeyDown'), 'Démarrer, Dock, Localiser restent dans un rôle bouton (nested-interactive)');
  assert.ok(!c.includes("tr('Ouvrir')"), 'le nom « Ouvrir Aspirateur » taisait l’état et prenait le mot d’un bouton');
  const { b, suite } = racine(c, RMCARD);
  assert.ok(sansGeste(b), 'la racine ne porte plus le geste : ' + b);
  assert.ok(b.includes("position: 'relative'"), 'la racine borne la surface');
  assert.ok(suite.startsWith('{onOpen && <Surface onClick={() => onOpen(id)} label={nomCarte(nom, etatAff)} />}'), 'la surface, premier enfant : la tabulation la prend avant les boutons');
  // Le nom reprend la ligne MÊME de l'écran, pas un résumé.
  assert.ok(c.includes("const etatAff = mort ? tr('Indisponible') : etat;") && c.includes('{etatAff}</div>'), 'l’état du nom n’est plus celui que la carte affiche');
  assert.ok(c.includes('<div style={RM_NAME}>{nom}</div>'), 'le nom affiché et le nom lu viennent de la même variable');
  // Les boutons : au-dessus de la surface, nommés avec l'appareil.
  assert.ok(c.includes(RANGEE) && !c.includes(RANGEE_POSEE), 'la rangée de boutons couvre la surface : un appui entre deux boutons ne fait plus rien');
  assert.ok(BOUTON_POSE.test(app), 'les boutons ne sont plus positionnés : ils passeraient sous la surface, et « Pause » ouvrirait la fiche');
  assert.ok(c.includes('style={{ ...RM_BTN, display:'), 'le bouton du robot ne tient plus sa position de RM_BTN');
  assert.ok(c.includes("aria-label={lbl2 + ' ' + nom}") && c.includes('title={lbl2}'), '« Pause Tondeuse » : le geste, puis l’appareil ; l’infobulle ne change pas');
  assert.ok(c.includes('e.stopPropagation(); call(svc);'), 'le bouton garde son arrêt de propagation');
});

test('la carte du distributeur, compacte et standard : la même structure', () => {
  const c = corps('RoomFeederCard');
  assert.ok(!c.includes('role="button"') && !c.includes('onKeyDown'), 'Distribuer et Rempli restent dans un rôle bouton (nested-interactive)');
  assert.ok(!c.includes("tr('Ouvrir')"), 'plus de « Ouvrir Distributeur »');
  assert.equal(compter(c, '<Surface '), 2, 'une surface par gabarit');
  for (const classe of [DENSE, RMCARD]) {
    const { b, suite } = racine(c, classe);
    assert.ok(sansGeste(b) && b.includes("position: 'relative'"), 'la racine ' + classe + ' : ' + b);
    assert.ok(suite.startsWith('{onOpen && <Surface onClick={() => onOpen()} label={nomCarte(nom, ligne)} />}'), 'la surface en premier enfant de ' + classe);
  }
  // Chaque gabarit garde SA ligne : la ration d'abord en compacte, le bac d'abord en standard.
  assert.ok(c.includes('const ligne = prochaine || sub;') && c.includes('const ligne = sub || prochaine;'), 'la ligne affichée a changé d’ordre');
  assert.equal(compter(c, "{ligne || '—'}"), 2, 'le nom lu et la ligne affichée viennent de la même variable');
  // La compacte : le bouton SEUL au-dessus, le nom reste sous la surface.
  assert.ok(c.includes("aria-label={tr('Distribuer une ration') + ' ' + nom}"), 'le bouton de la compacte ne nomme pas l’appareil');
  assert.ok(c.includes("style={{ position: 'relative', width: 38, height: 26"), 'le bouton de la compacte passe sous la surface');
  /* L'écart a quitté la ligne pour la feuille (05/10) : la requête de
   * conteneur le resserre quand la carte est étroite, et un style en ligne
   * aurait gagné contre elle. La rangée reste SANS position. */
  assert.ok(c.includes(`<div className="o-cvrow" style={{ display: 'flex', alignItems: 'center' }}>`), 'la rangée de la compacte ne doit pas passer au-dessus : un appui sur le nom n’ouvrirait plus rien');
  // La standard : les boutons au-dessus, pas leur rangée ; des noms qui commencent par le texte visible.
  assert.ok(c.includes(RANGEE) && !c.includes(RANGEE_POSEE), 'la rangée Distribuer / Rempli couvre la surface : l’écart entre eux ne fait plus rien');
  assert.equal(compter(c, 'style={RM_BTN}'), 2, 'Distribuer et Rempli ne tiennent plus leur position de RM_BTN : ils passeraient sous la surface');
  assert.ok(c.includes("aria-label={tr('Distribuer') + ' ' + nom}") && c.includes("{tr('Distribuer')}</button>"), '« Distribuer … » : le texte visible en tête du nom');
  assert.ok(c.includes("aria-label={tr('Rempli') + ' ' + nom}") && c.includes("{tr('Rempli')}</button>"), '« Rempli … » : le texte visible en tête du nom');
});

test('la carte de plante : sans commande, elle reste un bouton — c’est son nom qui change', () => {
  const c = corps('RoomPlantCard');
  assert.ok(!c.includes('<button') && !c.includes('<Surface'), 'la plante n’a pas de commande : rien à séparer');
  // Relecture du lot 13 : l'humidité affichée en chiffres entre dans le nom, à
  // sa place dans chaque gabarit — après le verdict en compacte, avant lui en
  // standard.
  assert.equal(compter(c, 'role="button" tabIndex={0} aria-label={nomCarte(nom, ligne, humLue)} aria-haspopup="dialog"'), 1, 'compacte : le nom, le verdict, l’humidité affichés, et la fiche annoncée');
  assert.equal(compter(c, 'role="button" tabIndex={0} aria-label={nomCarte(nom, humLue, ligne)} aria-haspopup="dialog"'), 1, 'standard : le nom, l’humidité, le verdict affichés, et la fiche annoncée');
  assert.ok(c.includes("const humLue = hum != null ? Math.round(hum) + ' %' : null;") && compter(c, '{Math.round(hum)}%</span>') === 2, 'le chiffre lu est celui qu’on voit');
  assert.ok(!c.includes("tr('Ouvrir')"), 'plus de « Ouvrir Monstera », qui taisait le verdict');
  assert.equal(compter(c, 'const ligne = verdict || sub;'), 2, 'le verdict, sinon le lieu — comme à l’écran');
  assert.equal(compter(c, "{ligne || '—'}"), 2, 'le nom lu et la ligne affichée viennent de la même variable');
});

test('ce que la surface fait entendre : le nom puis l’état, et la fiche qu’elle ouvre', async () => {
  const Surface = await composant('ui.jsx', 'Surface');
  const nomCarte = await composant('ui.jsx', 'nomCarte');
  const html = rendre(Surface, { onClick: () => {}, label: nomCarte('Aspirateur', 'Sur la base') });
  assert.ok(html.startsWith('<button') && html.includes('type="button"'), 'un vrai bouton : Entrée et Espace l’activent sans gestionnaire');
  assert.ok(html.includes('aria-label="Aspirateur, Sur la base"'), 'le nom de la carte machine');
  assert.ok(html.includes('aria-haspopup="dialog"'), 'elle annonce la fiche');
  // Sans ligne sous le nom, le tiret de l'écran ne se lit pas.
  assert.equal(nomCarte('Basilic', undefined), 'Basilic');
  assert.equal(nomCarte('Distributeur', 'Réservoir 38 % · dernier repas 08:12'), 'Distributeur, Réservoir 38 % · dernier repas 08:12');
});
