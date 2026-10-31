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

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
const NL = String.fromCharCode(10);
const app = MONOLITHE;

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

// Les boutons SEULS passent au-dessus de la surface, jamais leur rangée
// (relecture du lot 13) : positionnée, elle la couvrait sur toute sa largeur,
// et un appui entre deux boutons ne faisait plus rien.
// ASSERTION MODIFIÉE (étape 2 IoT, 19/10) : `RMCARD`, `DENSE` et `RANGEE` partent avec l'ancienne carte du distributeur, qui seule les lisait.
const RANGEE_POSEE = "<div style={{ position: 'relative', display: 'flex', gap: 8";
const BOUTON_POSE = /\nconst RM_BTN = \{ position: 'relative', /;

test('la carte d’un robot : ses commandes ne sont plus enfermées dans un bouton, la surface dit ce qu’elle affiche', () => {
  /* ASSERTION MODIFIÉE (chantier IoT, tâche 6, 18/10 ; I5, I9) : `RoomMachineCard` est partie ; la carte d'un robot est
   * `RoomRobotCard`, au gabarit commun. Le motif ne change pas : pas de rôle bouton autour des commandes, la surface en premier
   * enfant sous ce que la carte affiche — le nom, la phrase, la batterie —, les puces seules positionnées (`RM_BTN`), nommées
   * avec l'appareil. Ce que la carte dessine se joue dans tests/carte_robot.test.mjs. */
  const c = corps('RoomRobotCard');
  assert.ok(!c.includes('role="button"') && !c.includes('onKeyDown'), 'Démarrer, Pause, Base restent dans un rôle bouton (nested-interactive)');
  assert.ok(!c.includes("tr('Ouvrir')"), 'le nom « Ouvrir Aspirateur » taisait l’état et prenait le mot d’un bouton');
  const { b, suite } = racine(c, "className={'o-rmcard o-gabarit' + (v.panne ? ' o-panne' : '')}");
  assert.ok(sansGeste(b), 'la racine ne porte plus le geste : ' + b);
  assert.ok(b.includes("position: 'relative'"), 'la racine borne la surface');
  assert.ok(suite.startsWith("{onOpen && <Surface onClick={() => onOpen(id)} label={nomCarte(v.nom, v.phrase.texte, pile == null ? null : tr('batterie {p} %', { p: pile }))} />}"),
    'la surface, premier enfant : la tabulation la prend avant les puces');
  // Le nom lu reprend ce que la carte affiche : la même vue.
  assert.ok(c.includes('{v.nom}</div>') && c.includes('{v.phrase.texte}</div>'), 'le nom affiché et le nom lu viennent de la même vue');
  // Les puces : au-dessus de la surface, nommées avec l'appareil ; leur rangée ne l'est pas.
  assert.ok(c.includes(`<div className="o-puces-robot" data-n={n} style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 'var(--o-pied-haut, 9px)' }}>`) && !c.includes(RANGEE_POSEE),
    'la rangée de puces couvre la surface : un appui entre deux puces ne fait plus rien');
  assert.ok(BOUTON_POSE.test(app), 'les boutons ne sont plus positionnés : ils passeraient sous la surface, et « Pause » ouvrirait la fiche');
  assert.ok(/\nconst RM_PUCE_ROBOT = \{ \.\.\.RM_BTN, /.test(app), 'la puce du robot ne tient plus sa position de RM_BTN');
  assert.ok(c.includes("aria-label={p.mot + ' ' + v.nom} title={p.mot}"), '« Pause Tondeuse » : le geste, puis l’appareil ; l’infobulle dit le geste');
  assert.ok(c.includes('e.stopPropagation(); p.agir();'), 'la puce garde son arrêt de propagation');
});

test('la carte du distributeur, compacte et standard : la même structure', () => {
  /* ASSERTION MODIFIÉE (étape 2 IoT, 19/10 ; I5, I10, I12) : `RoomFeederCard` lit sa vue (`v`) et passe dans la grille commune ;
   * « Rempli » quitte la carte (il vit près du réservoir, dans la popup). Le motif ne change pas : pas de rôle bouton autour de la
   * commande, la surface en premier enfant sous ce que la carte affiche — le nom, la phrase, le réservoir —, la puce seule positionnée,
   * nommée avec l'appareil. Ce que la carte dessine, et ce qu'un appui envoie, se jouent dans tests/carte_distributeur.test.mjs. */
  const c = corps('RoomFeederCard');
  assert.ok(!c.includes('role="button"') && !c.includes('onKeyDown'), 'Distribuer reste dans un rôle bouton (nested-interactive)');
  assert.ok(!c.includes("tr('Ouvrir')"), 'plus de « Ouvrir Distributeur »');
  assert.equal(compter(c, '<Surface '), 2, 'une surface par gabarit');
  for (const classe of ["className={'o-piece o-cvdense' + (v.mort ? ' o-panne' : '')}", "className={'o-rmcard o-gabarit' + (v.mort ? ' o-panne' : '')}"]) {
    const { b, suite } = racine(c, classe);
    assert.ok(sansGeste(b) && b.includes("position: 'relative'"), 'la racine ' + classe + ' : ' + b);
    assert.ok(suite.startsWith('{onOpen && <Surface onClick={() => onOpen()} label={label} />}'), 'la surface en premier enfant de ' + classe);
  }
  // Le nom lu reprend ce que la carte affiche : le nom, la phrase, le réservoir — la même vue pour les deux gabarits.
  assert.ok(c.includes("const label = nomCarte(v.nom, v.phrase.texte, v.pct == null ? null : tr('réservoir {p} %', { p: v.pct }));"), 'le nom lu et la ligne affichée viennent de la même vue');
  assert.equal(compter(c, '{v.phrase.texte}</div>'), 2, 'la phrase affichée, dans les deux gabarits');
  /* L'écart a quitté la ligne pour la feuille (05/10) : la requête de
   * conteneur le resserre quand la carte est étroite, et un style en ligne
   * aurait gagné contre elle. La rangée reste SANS position. */
  assert.ok(c.includes(`<div className="o-cvrow" style={{ display: 'flex', alignItems: 'center' }}>`), 'la rangée de la compacte ne doit pas passer au-dessus : un appui sur le nom n’ouvrirait plus rien');
  // La puce : au-dessus de la surface, pas sa rangée ; « Distribuer 12 g Distributeur » — le texte visible, puis l'appareil.
  assert.ok(c.includes(`<div className="o-puces-robot" data-n={1} style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 'var(--o-pied-haut, 9px)' }}>`) && !c.includes(RANGEE_POSEE),
    'la rangée de la puce couvre la surface');
  assert.ok(c.includes('puce(RM_PUCE_ROBOT,') && c.includes('puce(RM_MINI_DISTRIBUER,'), 'la puce de la carte et le mini de la compacte');
  assert.ok(/\nconst RM_MINI_DISTRIBUER = \{ position: 'relative', /.test(app) && /\nconst RM_PUCE_ROBOT = \{ \.\.\.RM_BTN, /.test(app), 'positionnés, ils passent au-dessus de la surface');
  assert.ok(c.includes("aria-label={mot + ' ' + v.nom} title={mot}"), '« Distribuer … » : le texte visible en tête du nom, puis l’appareil');
  assert.ok(c.includes('e.stopPropagation(); v.distribuer();'), 'la puce garde son arrêt de propagation');
  assert.ok(!c.includes("tr('Rempli')"), '« Rempli » a quitté la carte');
});

test('la carte de plante : sans commande, elle reste un bouton — c’est son nom qui change', () => {
  const c = corps('RoomPlantCard');
  assert.ok(!c.includes('<button') && !c.includes('<Surface'), 'la plante n’a pas de commande : rien à séparer');
  /* Relecture du lot 13 : le sol affiché en chiffres entre dans le nom, dans les deux gabarits.
   * ASSERTIONS MODIFIÉES (chantier Capteurs, étapes 2 et 3, tâche 10 ; C30) : la carte lit sa vue (`vuePlante`) — le nom, le sol, la phrase, le même nom
   * pour la compacte et la standard ; le chiffre lu (`v.chiffre`) est celui qu'on voit. */
  assert.equal(compter(c, 'role="button" tabIndex={0} aria-label={label} aria-haspopup="dialog"'), 2, 'compacte et standard : le nom, le sol, la phrase affichés, et la fiche annoncée');
  assert.ok(c.includes('const label = nomCarte(nom, v.sol == null ? null : v.chiffre, v.phrase);') && compter(c, '{v.chiffre}</span>') === 2, 'le chiffre lu est celui qu’on voit');
  assert.ok(!c.includes("tr('Ouvrir')"), 'plus de « Ouvrir Monstera », qui taisait le verdict');
  assert.equal(compter(c, '{v.phrase}</div>'), 2, 'la phrase lue et la phrase affichée viennent de la même vue');
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
