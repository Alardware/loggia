/* Le mode édition n'imbrique plus de boutons (lot 13 de l'audit du 03/10).
 *
 * En édition, la carte qu'on range — le kit commun d'Objets, des pièces, des
 * volets, de Sécurité et d'Énergie —, la section de l'Accueil et la tuile de
 * pièce étaient ELLES-MÊMES des `role="button"`. Ce rôle rend sa descendance
 * présentationnelle : Modifier, Supprimer, la taille, le × d'une section, les
 * cartes des favoris disparaissaient d'un lecteur d'écran. axe-core en comptait
 * dans la démo 39 `nested-interactive` sur Objets en édition, 17 sur l'Accueil
 * (onze sections, six tuiles), 10 sur Sécurité, 8 dans le Salon.
 *
 * Le motif est celui de l'ADR 0074 : la carte garde son geste au pointeur, un
 * bouton de SURFACE (`Surface`, ui.jsx) — sœur des commandes, peint sous
 * elles — prend le focus, le nom et les flèches. Son nom est ce que la carte
 * affiche, puis le geste : le nom visible en tête (WCAG 2.5.3).
 *
 * La carte d'une vue personnalisée suit le même motif, mais dans la zone des
 * vues personnalisées (tests/lot13_vues_perso) : CustomView n'est pas touchée
 * ici, pour que les deux correctifs ne se disputent pas les mêmes lignes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { composant, rendre } from './rendu.mjs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const NL = '\n';
const bloc = (debut) => { const i = app.indexOf(debut); assert.ok(i >= 0, debut + ' introuvable'); return app.slice(i, app.indexOf(NL + 'function ', i + 1)); };
const compte = (s, re) => (s.match(re) || []).length;

test('la carte du kit d’édition n’est plus un bouton : sa surface, sœur de ses commandes, porte le focus et le nom', () => {
  const c = bloc('function EditableCard(');
  assert.ok(!/\brole=/.test(c) && !c.includes('tabIndex='), 'une racine de la carte est encore un bouton focalisable : ses commandes disparaissent d’un lecteur d’écran');
  const debut = c.indexOf('const prise = {');
  const prise = c.slice(debut, c.indexOf(NL + '  };', debut));
  assert.ok(prise.includes('onPointerDown') && !prise.includes('onKeyDown'), 'la racine garde le pointeur, la surface le clavier');
  assert.equal(compte(c, /<div data-id=\{id\} \{\.\.\.prise\}/g), 3, 'les trois gabarits gardent le geste au pointeur');
  // Une surface pour l'intertitre, une pour les cartes compacte et standard.
  assert.equal(compte(c, /<Surface /g), 2);
  assert.equal(compte(c, /\{surface\}/g), 2, 'la compacte et la standard posent la même');
  // Son nom : ce que la carte affiche, puis le geste.
  assert.ok(c.includes("label={nomCarte(nom || id, sousTitre, tr('Modifier ou déplacer'))}"), 'la carte : son nom, « Domaine · identifiant », le geste');
  assert.ok(c.includes("label={nomCarte(nom || id, tr('Modifier ou déplacer'))}"), 'l’intertitre : son nom, le geste');
  assert.ok(!c.includes("aria-label={tr('Modifier ou déplacer') + ' '"), 'l’ancien nom mettait le geste avant le nom affiché');
  assert.equal(compte(c, /popup=\{!!onEdit\}/g), 2, 'elle ouvre la fiche Modifier : un dialogue');
  // Le clic d'un lecteur d'écran ouvre la fiche ; celui du pointeur, `dragEnd` l'a déjà tranché.
  assert.ok(c.includes('onClick: (e) => { if (e.detail === 0 && onEdit) onEdit(id); },'), 'le clic sans pointeur');
  // Les commandes nomment la carte, texte visible en tête : « Modifier Plafonnier ».
  assert.equal(compte(c, /aria-label=\{tr\('Modifier'\) \+ ' ' \+ \(nom \|\| id\)\}/g), 3);
  assert.equal(compte(c, /aria-label=\{tr\('Supprimer'\) \+ ' ' \+ \(nom \|\| id\)\}/g), 3);
  // Et passent AU-DESSUS de la surface : un conteneur positionné est peint après elle.
  for (const r of [
    "<div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>",
    "<div style={{ position: 'relative', display: 'flex', gap: 6 }}>",
    "<div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>",
    "<div style={{ position: 'relative', display: 'flex', gap: 8, marginTop: 12 }}>",
  ]) assert.ok(c.includes(r), 'une rangée de commandes passe sous la surface : ' + r);
  assert.equal(compte(c, /\.\.\.petit(, marginRight: 8)?, position: 'relative' \}/g), 2, 'les deux boutons de l’intertitre');
});

test('la section et la tuile de pièce de l’Accueil : une surface en édition, et l’appui sur elle saisit toujours', () => {
  const d = bloc('function Dashboard(');
  assert.ok(!d.includes("role={editMode ? 'button' : undefined}") && !d.includes('tabIndex={editMode ? 0 : undefined}'), 'une enveloppe redevient un bouton en édition');
  assert.ok(d.includes("label={nomCarte(ACC_NOMS()[id] || id, cache ? (estOption(id) ? tr('en option') : tr('masquée')) : null, tr('Déplacer avec les flèches'))}"), 'la section : son nom, « masquée » s’il le faut, le geste');
  assert.ok(d.includes("label={nomCarte(p.name, tr('Déplacer avec les flèches'))}"), 'la tuile : son nom, le geste');
  /* La surface est un <button> : la garde qui laisse leur clic aux boutons
   * l'aurait refusée, et la section ou la tuile ne se saisissait plus. */
  assert.equal(compte(d, /e\.target\.closest\('button:not\(\.o-surface\), \[role="switch"\], input'\)/g), 2, 'debutSec et debutPiece');
  assert.ok(!d.includes("e.target.closest('button, [role=\"switch\"], input')"), 'une garde refuse encore l’appui sur la surface');
  // Ce qui reste vivant en édition passe au-dessus de la surface de la section.
  assert.ok(d.includes("...(editMode ? { position: 'relative' } : {}), pointerEvents: editMode && id !== 'pieces' && id !== 'favoris' ? 'none' : 'auto'"), 'le contenu vivant (Gérer les scénarios, le segment, les favoris)');
  /* Relecture du lot 13 : `pointer-events` ne retire ni le focus ni l'arbre
   * d'accessibilité. Ce contenu « inerte » se tabulait — Entrée sur « Lancer
   * Soirée » lançait le scénario en pleine édition, « Mettre en pause » du
   * rail aussi. Les scénarios s'en écartent pour garder « Gérer les
   * scénarios » joignable : leur rangée seule devient inerte. */
  assert.ok(d.includes("<div inert={editMode && id !== 'pieces' && id !== 'favoris' && id !== 'scenes' ? '' : undefined} style={{ ...(editMode ? { position: 'relative' } : {}),"), 'en édition, le contenu d’une section se tabule encore');
  const scn = bloc('function ScenariosAccueil(');
  const rang = scn.indexOf(`<div ref={rangee} className="grid-qscenes" inert={edit ? '' : undefined}>`);
  assert.ok(rang > 0, 'en édition, Entrée lance encore un scénario de la rangée');
  const gerer = scn.indexOf("<button data-drag-ui=\"1\" onClick={() => onNav('scenes')}");
  assert.ok(gerer > 0 && gerer < rang, '« Gérer les scénarios » est passé dans la rangée inerte');
  assert.ok(d.includes("<div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>"), 'le bandeau d’outils de la section');
  assert.ok(d.includes("<div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>"), 'les puces de style');
  assert.ok(d.includes("? <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px'"), 'la rangée d’une section masquée');
  assert.ok(d.includes("aria-label={(estOption(id) ? tr('Retirer') : tr('Masquer')) + ' ' + (ACC_NOMS()[id] || id)}"), 'le × nomme sa section');
  const p = bloc('function CartePieceEdition(');
  assert.equal(compte(p, /style=\{\{ position: 'relative', display: 'flex'/g), 4, 'les quatre rangées de commandes de la carte de pièce');
  assert.equal(compte(p, /aria-label=\{tr\('Modifier'\) \+ ' ' \+ p\.name\}/g), 2, 'Modifier nomme la pièce');
  assert.equal(compte(p, /aria-label=\{\(confirme \? tr\('Confirmer \?'\) : tr\('Supprimer'\)\) \+ ' ' \+ p\.name\}/g), 2, 'Supprimer aussi, et son second appui');
});

test('les favoris de l’Accueil en édition : la carte inerte au clavier aussi, chaque outil nomme la carte qu’il touche', () => {
  /* Relecture du lot 13 : la carte d'une vue l'était devenue
   * (tests/lot13_vues_perso), pas sa jumelle des favoris — son interrupteur
   * se tabulait sous la barre, Espace éteignait la lampe. */
  const f = bloc('function FavorisAccueil(');
  assert.ok(f.includes(`<div className="o-cvfit" inert={edit ? '' : undefined} style={{ height: '100%', pointerEvents: edit ? 'none' : 'auto' }}>`), 'en édition, les commandes d’un favori se tabulent encore');
  // Trois favoris lisaient trois fois « Changer la carte », et la croix « × ».
  for (const geste of ["tr('Changer la carte'))", "tr('Largeur double')", "tr('Retirer')"]) {
    assert.ok(f.includes(geste + " + ' · ' + nomCv(x, hass)}"), 'un outil de la barre des favoris ne dit pas quelle carte il touche : ' + geste);
  }
  assert.ok(f.includes("aria-label={tr('Largeur double') + ' · ' + nomCv(x, hass)} aria-pressed={cvW(x) === 2}"), 'le nom de la bascule de largeur change avec son état : « Largeur simple », enfoncé');
  // Le nom est celui des vues, par la même fonction de module : pas une copie.
  assert.ok(app.includes(NL + 'function nomCv(x, hass) {') && !f.includes('CV_TYPE_NOMS()'), 'les favoris recopient le nom d’une carte');
});

test('la surface d’une carte qu’on range : transparente au curseur de saisie, un dialogue seulement si elle ouvre une fiche', async () => {
  const Surface = await composant('ui.jsx', 'Surface');
  const nomCarte = await composant('ui.jsx', 'nomCarte');
  const fiche = rendre(Surface, { label: nomCarte('Plafonnier', 'Lumière · plafonnier', 'Modifier ou déplacer'), popup: true, style: { cursor: 'inherit' } });
  assert.ok(fiche.includes('aria-label="Plafonnier, Lumière · plafonnier, Modifier ou déplacer"'), 'le nom affiché d’abord, le geste ensuite');
  assert.ok(fiche.includes('aria-haspopup="dialog"'), 'la carte du kit ouvre sa fiche');
  assert.ok(/cursor:\s*inherit/.test(fiche) && !/cursor:\s*pointer/.test(fiche), 'le curseur de saisie de la carte passe à travers la surface');
  const rang = rendre(Surface, { label: nomCarte('Salon', 'Déplacer avec les flèches'), popup: false, style: { cursor: 'inherit' } });
  assert.ok(rang.includes('aria-label="Salon, Déplacer avec les flèches"') && !rang.includes('aria-haspopup'), 'une section ou une tuile se déplace, elle n’ouvre rien');
});

test('l’anneau du focus et l’enfoncement au press restent ceux de la carte, pas ceux de sa surface', () => {
  assert.ok(css.includes('.o-pointille:has(> .o-surface:focus-visible) { outline: 2px solid var(--o-accent); }'), 'la carte, le trait plein à la place du pointillé');
  assert.ok(css.includes('[data-sec]:has(> .o-surface:focus-visible) { outline: 2px solid var(--o-accent); outline-offset: 2px; }'), 'la section de l’Accueil, 2 px dehors');
  assert.ok(/@supports selector\(:has\(\*\)\) \{\s*\.o-pointille > \.o-surface:focus-visible, \[data-sec\] > \.o-surface:focus-visible \{ outline: none; \}/.test(css), 'l’anneau intérieur ne s’efface que là où :has le remplace');
  assert.ok(css.indexOf('.o-pointille:has(') > css.indexOf('.o-surface:focus-visible { outline-offset: -2px; }'), 'après la règle de la surface');
  // La racine tenait son enfoncement de `[role="button"]:active` : la classe le reprend.
  assert.ok(css.includes('.o-pointille:active, [data-sec]:has(> .o-surface):active { transform: scale(.955); }'), 'la carte qu’on tient s’enfonce comme avant');
  assert.ok(/@media \(prefers-reduced-motion: reduce\) \{\s*\.o-pointille:active, \[data-sec\]:has\(> \.o-surface\):active \{ transform: none; \}/.test(css), 'sans mouvement pour qui l’a demandé');
});
