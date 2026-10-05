// ─────────────────────────────────────────────────────────────────────────────
// Ce qu'un compte ordinaire ne pourra jamais enregistrer, il ne le voit pas
// (03/10).
//
// L'ADR 0125 a deplace la frontiere : l'agencement et l'apparence s'ouvrent a
// tous, la configuration de la maison reste aux administrateurs Home
// Assistant. Mais l'ecran montrait encore a tout le monde les gestes de
// configuration — la bascule « lumiere » d'une prise, le menu de
// l'assistant, Modifier et Supprimer sur une piece. Le geste semblait
// marcher, puis le serveur le refusait et tout revenait au rechargement.
//
// Decide : MASQUES, pour un compte que Home Assistant dit ordinaire. Le
// critere est le COMPTE (`hass.user.is_admin`), jamais le profil Loggia : un
// profil Admin se choisit au code depuis n'importe quel compte, et c'est celui
// d'une installation neuve. Ranger ses cartes, l'ordre, la taille,
// l'apparence — ouverts a tous — ne sont masques nulle part.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compteOrdinaire } from '../src/state.js';
import { composant, rendre } from './rendu.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (src, debut, fin) => {
  const d = src.indexOf(debut);
  assert.ok(d >= 0, debut + ' introuvable');
  const f = src.indexOf(fin, d + 1);
  return src.slice(d, f < 0 ? undefined : f);
};

test('le critere : Home Assistant dit « non administrateur », en toutes lettres', () => {
  assert.equal(compteOrdinaire({ user: { is_admin: false }, states: {} }), true);
  assert.equal(compteOrdinaire({ user: { is_admin: true }, states: {} }), false, 'un administrateur : rien ne change');
  // Sur un doute — pas encore de compte, la demonstration, un test — rien ne
  // se masque : un administrateur ne doit jamais perdre un geste.
  assert.equal(compteOrdinaire({ user: {} }), false);
  assert.equal(compteOrdinaire({ states: {} }), false);
  assert.equal(compteOrdinaire(null), false, 'sans navigateur ni hass : pas ordinaire');
});

test('l’assistant : son nom pour tous, le menu pour qui peut l’enregistrer', async () => {
  const AssistantSheet = await composant('views/assistant.jsx');
  const { tr } = await import('../src/i18n.js');
  const deux = {
    'conversation.alpha': { attributes: { friendly_name: 'Alpha' } },
    'conversation.beta': { attributes: { friendly_name: 'Beta' } },
  };
  const voir = (is_admin) => rendre(AssistantSheet, { hass: { states: deux, user: { is_admin } }, ns: 'x', onClose: () => {} });
  assert.ok(voir(true).includes(tr('Choisir l’assistant')), 'un administrateur garde le menu');
  assert.ok(!voir(false).includes(tr('Choisir l’assistant')),
    'un compte ordinaire voit le menu de loggia_assistant, que le serveur lui refusera');
});

test('la fiche d’une carte : la prise ne se declare lumiere que pour qui peut l’enregistrer', () => {
  const app = lire('src', 'App.jsx');
  const f = bloc(app, 'function CardEditSheet(', NL + '}');
  assert.ok(f.includes('const peutDeclarer = estPrise && !compteOrdinaire(hass);'), 'loggia_switchlights est reservee');
  assert.ok(f.includes('{peutDeclarer' + NL) && f.includes('? <ListeChoix value={domaineChoisi}'), 'le menu du domaine suit ce droit');
  // L'icone reste a tous : `loggia_icones` est de l'apparence (store.py).
  assert.ok(f.includes('const peutChoisirIcone = estEntite || estZone;'), 'le choix de l’icone ne depend pas du compte');
});

test('l’Accueil en edition : la taille d’une piece a tous, la piece elle-meme aux administrateurs', () => {
  const app = lire('src', 'App.jsx');
  const home = bloc(app, 'function Dashboard(', NL + 'function ');
  assert.ok(home.includes('const ordinaire = compteOrdinaire(dashHass);'));
  assert.ok(home.includes("[p.name]: t === 'c' ? 's' : 'c' } })} reglable={!ordinaire} />"), 'Modifier et Supprimer ecrivent loggia_rooms');
  assert.ok(home.includes('{editMode && !ordinaire && (' + NL + "                <div style={{ gridColumn: piecesApres.c"), '« Ajouter une piece » aussi');
  const carte = bloc(app, 'function CartePieceEdition(', NL + '}');
  assert.ok(carte.includes('onTaille, reglable = true }) {'), 'par defaut, rien ne change');
  const gardes = carte.split('{reglable && (').slice(1);
  assert.equal(gardes.length, 2, 'les deux gabarits, compact et standard');
  for (const g of gardes) {
    const garde = g.slice(0, g.indexOf('</div>'));
    assert.ok(garde.includes("tr('Modifier')") && garde.includes("tr('Supprimer')") && !garde.includes('{taille}'),
      'la garde porte Modifier et Supprimer, jamais le bouton de taille');
  }
});

test('les autres gestes de configuration : masques au meme critere', () => {
  const app = lire('src', 'App.jsx');
  const cal = bloc(app, 'function FeuilleCalendrier(', NL + '}');
  assert.ok(cal.includes('const ordinaire = compteOrdinaire(hass);') && cal.includes('{!ordinaire && tousCals.length > 1 && ('),
    'loggia_agendas reste reservee : le choix des agendas est masque');
  assert.ok(bloc(app, 'function BandeauEdition(', NL + '}').includes('const ouvrirEnt = onEnt && !compteOrdinaire(ctx.hass) ? onEnt : null;'),
    '« Entites de la vue » ecrit les pieces, les cameras, l’alarme…');
  assert.ok(app.includes('const showOnboarding = !onboarded && loggiaRuntime.ready && !compteOrdinaire(hass);'), 'le premier lancement');
  assert.ok(app.includes('<CustomView cv={activeCv} hass={hass} edit={editMode && peutEditer && !compteOrdinaire(hass)}'), 'une vue perso');

  const par = lire('src', 'views', 'parametres.jsx');
  assert.ok(par.includes('isAdmin: profilAdmin = false') && par.includes('const isAdmin = profilAdmin && !ordinaire;'),
    'profils, code, vues perso, import, remise a zero : le profil Admin ne suffit plus');
  assert.ok(par.includes("{!ordinaire && <button onClick={() => setCvEditing('new')}"), 'creer une vue perso');
  assert.ok(par.includes('{!ordinaire && (' + NL + "            <Ligne titre={tr('Assistant vocal')}"), 'l’assistant, cote Parametres');
  // Ce qu'ouvre un DROIT (Regles, Interrupteurs, Alertes) reste : l'editeur de
  // profil previent en l'accordant, et le refus se dit (DROITS_ADMIN_HA).
  assert.ok(par.includes('const aD = (id) => isAdmin || droits.indexOf(id) >= 0;'), 'une section accordee par un droit a ete masquee');

  const vac = lire('src', 'vacplan.jsx');
  assert.ok(vac.includes('const ordinaire = compteOrdinaire(hass);')
    && vac.includes('{regions.filter(r => !ordinaire || zoneDe(r.couleur)).map(r => {')
    && vac.includes('{!ordinaire && Object.keys(assoc).length > 0 && ('), 'nommer les pieces du plan (loggia_vacplan)');
  // Pivoter reste a tous : `loggia_vacrot` est de l'apparence (store.py).
  assert.ok(vac.includes('<button onClick={pivoter}') && !/ordinaire[^\n]*pivoter/.test(vac), 'pivoter le plan reste ouvert');
});
