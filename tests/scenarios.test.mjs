// Les scenarios de Loggia (16/09, ADR 0027) : le module pur qui les DIT —
// nom, teinte, resume, dernier lancement — et ce que l'ecran en fait.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GESTES_SCENARIO, FAMILLES, IDS_INTEGRES, TEINTES_SCENARIO, ICONES_SCENARIO,
  nomScenario, teinteScenario, libelleAction, resumeScenario, nombreActions, nombreCibles,
  libelleDernier, scenariosVisibles, scenariosAccueil, actionVide, scenarioVide, versEnregistrement,
  bordsDefilement,
} from '../src/scenarios.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const police = readFileSync(join(RACINE, 'public', 'fonts', 'uicons-regular-rounded.css'), 'utf8');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');

test('aucun geste ne desarme ni ne deverrouille, et chaque famille a ses gestes', () => {
  const tous = Object.values(GESTES_SCENARIO).flat();
  assert.ok(!tous.includes('desarmer') && !tous.includes('deverrouiller'));
  assert.deepEqual(FAMILLES, Object.keys(GESTES_SCENARIO));
  assert.deepEqual(GESTES_SCENARIO.alarme, ['absent', 'nuit', 'maison']);
  assert.equal(IDS_INTEGRES.length, 8);
});

test('un scenario de Loggia se nomme dans la langue du moment, un perso par son nom', () => {
  assert.equal(nomScenario({ id: 'nuit', nom: null }), 'Bonne nuit');
  assert.equal(nomScenario({ id: 'nuit', nom: 'Dodo' }), 'Dodo');
  assert.equal(nomScenario({ id: 'perso_apero', nom: 'Apéro' }), 'Apéro');
  assert.equal(nomScenario({ id: 'perso_x' }), 'perso_x');
  assert.equal(nomScenario(null), '');
});

test('la teinte : un jeton connu, l’accent sinon', () => {
  assert.equal(teinteScenario({ teinte: 'chambre' }).col, 'var(--o-piece-chambre)');
  assert.equal(teinteScenario({ teinte: 'fuchsia' }).id, 'accent');
  assert.equal(teinteScenario(null).id, 'accent');
  for (const t of TEINTES_SCENARIO) {
    if (t.rgb.startsWith('var(')) assert.ok(css.includes(t.rgb.slice(4, -1) + ':'), t.id + ' : le jeton rgb existe dans index.css');
  }
});

test('une action se dit en quelques mots, avec sa portee et sa condition', () => {
  assert.equal(libelleAction({ famille: 'lumieres', geste: 'eteindre', portee: 'maison' }), 'Lumières éteintes');
  assert.equal(libelleAction({ famille: 'lumieres', geste: 'allumer', portee: 'piece', piece: 'Salon', valeur: 10 }), 'Lumières à 10 % · Salon');
  assert.equal(libelleAction({ famille: 'lumieres', geste: 'allumer', portee: 'vie', valeur: 60, si: 'nuit' }), 'Lumières à 60 % · pièces de vie (la nuit)');
  assert.equal(libelleAction({ famille: 'lumieres', geste: 'allumer', portee: 'piece' }), 'Lumières à 100 % · pièce à choisir');
  assert.equal(libelleAction({ famille: 'volets', geste: 'fermer' }), 'Volets fermés');
  assert.equal(libelleAction({ famille: 'medias', geste: 'allumer_tv', portee: 'piece', piece: 'Salon' }), 'TV allumée · Salon');
  assert.equal(libelleAction({ famille: 'chauffage', geste: 'eco' }), 'Chauffage éco');
  assert.equal(libelleAction({ famille: 'alarme', geste: 'absent' }), 'Alarme absent');
  assert.equal(libelleAction({ famille: 'serrures', geste: 'verrouiller', si: 'jour' }), 'Portes verrouillées (le jour)');
  assert.equal(libelleAction({ famille: 'piscine', geste: 'vider' }), '');
  assert.equal(libelleAction(null), '');
});

test('le resume : ce que le serveur a resolu, sinon les actions, sinon rien ; un lien dit ce qu’il lance', () => {
  const s = { actions: [{ famille: 'lumieres', geste: 'eteindre' }, { famille: 'volets', geste: 'fermer' }] };
  assert.equal(resumeScenario(s), 'Lumières éteintes · Volets fermés');
  assert.equal(resumeScenario({ ...s, resume: [{ famille: 'alarme', geste: 'nuit', n: 1 }] }), 'Alarme nuit');
  assert.equal(resumeScenario({ actions: [] }), 'Aucune action');
  assert.equal(resumeScenario({ lien: 'script.good_night' }, { 'script.good_night': 'Good night' }), 'Lance Good night');
  assert.equal(resumeScenario({ lien: 'scene.x' }), 'Lance scene.x');
  assert.equal(resumeScenario(null), '');
});

test('combien d’actions, combien de cibles', () => {
  assert.equal(nombreActions({ actions: [{}, {}, {}] }), 3);
  assert.equal(nombreActions({ lien: 'scene.x', actions: [] }), 1);
  assert.equal(nombreCibles({ resume: [{ n: 3 }, { n: 2 }, { n: 0 }] }), 5);
  assert.equal(nombreCibles({ actions: [{}] }), null);
  assert.equal(nombreCibles({ lien: 'scene.x', resume: [{ n: 4 }] }), null);
});

test('quand il a tourne : jamais, a l’instant, il y a n min, une heure, hier, il y a n j', () => {
  const now = new Date(2026, 8, 16, 21, 30, 0).getTime();
  const s = (secondesAvant) => now / 1000 - secondesAvant;
  assert.equal(libelleDernier(null, now), '—');
  assert.equal(libelleDernier(s(-5), now), '—', 'un futur ne se dit pas');
  assert.equal(libelleDernier(s(20), now), "À l'instant");
  assert.equal(libelleDernier(s(12 * 60), now), 'Il y a 12 min');
  assert.equal(libelleDernier(s(3 * 3600), now), '18:30');
  assert.equal(libelleDernier(s(24 * 3600), now), 'hier');
  assert.equal(libelleDernier(s(3 * 86400 + 60), now), 'Il y a 3 j');
});

test('visibles et sur l’accueil : un scenario masque disparait, un scenario sans accueil reste dans la vue', () => {
  const liste = [{ id: 'a' }, { id: 'b', masque: true }, { id: 'c', accueil: false }, null, { nom: 'sans id' }];
  assert.deepEqual(scenariosVisibles(liste).map(s => s.id), ['a', 'c']);
  assert.deepEqual(scenariosAccueil(liste).map(s => s.id), ['a']);
  assert.deepEqual(scenariosVisibles(undefined), []);
});

test('ce que la fiche envoie : le scenario sans ce qu’il a calcule', () => {
  const s = {
    id: 'nuit', nom: '  ', icone: 'moon', teinte: 'chambre', lien: null, piece: null, integre: true, modifie: false,
    resume: [{ n: 3 }], dernier: 12, suggestion: 'scene.x', piece_effective: 'Salon', lien_absent: false,
    actions: [{ famille: 'lumieres', geste: 'eteindre', portee: 'maison', sauf_veilleuses: true, valeur: 30 },
      { famille: 'lumieres', geste: 'allumer', portee: 'piece', piece: 'Salon', valeur: 10, si: 'nuit' },
      { famille: 'volets', geste: 'fermer', portee: 'piece', valeur: 4, si: 'toujours' }],
  };
  assert.deepEqual(versEnregistrement(s), {
    id: 'nuit', nom: null, icone: 'moon', teinte: 'chambre', lien: null, piece: null, accueil: true, masque: false,
    actions: [{ famille: 'lumieres', geste: 'eteindre', portee: 'maison', sauf_veilleuses: true, valeur: 30 },
      { famille: 'lumieres', geste: 'allumer', portee: 'piece', piece: 'Salon', valeur: 10, si: 'nuit' },
      { famille: 'volets', geste: 'fermer', portee: 'piece' }],
  });
  assert.deepEqual(versEnregistrement({ nom: 'Apéro', lien: 'scene.apero', actions: [{ famille: 'medias', geste: 'lecture' }] }).actions, [], 'un lien : plus d’actions');
  assert.equal(versEnregistrement({ nom: 'x', accueil: false, masque: true }).accueil, false);
  assert.deepEqual(actionVide('volets'), { famille: 'volets', geste: 'ouvrir', portee: 'maison' });
  assert.deepEqual(actionVide('piscine'), { famille: 'lumieres', geste: 'eteindre', portee: 'maison' });
  assert.equal(scenarioVide().icone, 'sparkles');
});

// ── Ce qu'App.jsx en fait (assertions sur les sources) ──────────────────────
const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = app.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = app.indexOf(fin, d + 1); return app.slice(d, f < 0 ? undefined : f); };

test('les bords d’une rangee qui defile : ce qui montre et active les fleches', () => {
  assert.deepEqual(bordsDefilement(0, 1150, 762), { avant: false, apres: true }, 'au depart : rien avant, la suite apres');
  assert.deepEqual(bordsDefilement(200, 1150, 762), { avant: true, apres: true }, 'au milieu : les deux');
  assert.deepEqual(bordsDefilement(388, 1150, 762), { avant: true, apres: false }, 'au bout : plus rien apres');
  assert.deepEqual(bordsDefilement(387.4, 1150, 762), { avant: true, apres: false }, 'a une fraction de pixel du bout, c’est le bout');
  assert.deepEqual(bordsDefilement(1.5, 1150, 762), { avant: false, apres: true }, 'a une fraction de pixel du depart, c’est le depart');
  assert.deepEqual(bordsDefilement(2, 1150, 762), { avant: false, apres: true }, 'pile sur la marge : pas encore');
  assert.deepEqual(bordsDefilement(386, 1150, 762), { avant: true, apres: false }, 'pile a la marge du bout : deja le bout');
  assert.deepEqual(bordsDefilement(3, 1150, 762), { avant: true, apres: true }, 'au-dela de la marge, on a bien avance');
  assert.deepEqual(bordsDefilement(385, 1150, 762), { avant: true, apres: true }, 'en deca de la marge du bout, il reste de quoi avancer');
  assert.deepEqual(bordsDefilement(0, 700, 762), { avant: false, apres: false }, 'tout tient : pas de fleche du tout');
  assert.deepEqual(bordsDefilement(0, 762, 762), { avant: false, apres: false });
  assert.deepEqual(bordsDefilement(-40, 1150, 762), { avant: false, apres: true }, 'le rebond elastique ne compte pas');
  assert.deepEqual(bordsDefilement(undefined, null, NaN), { avant: false, apres: false }, 'rien de mesurable : rien a montrer');
  assert.deepEqual(bordsDefilement(10, 1150, 762, 12), { avant: false, apres: true }, 'la marge se regle');
});

test('l’Accueil : la rangee des scenarios, et « Gerer » cliquable malgre le contenu inerte de l’edition', () => {
  const a = bloc('function ScenariosAccueil(', NL + '}');
  assert.ok(a.includes('const liste = scenariosAccueil(sc.etat && sc.etat.scenarios);'), 'seuls les scenarios cochés « Sur l’Accueil »');
  assert.ok(a.includes('<CarteScenario key={s.id} s={s} noms={sc.noms} compacte enCours={sc.enCours === s.id} onLancer={sc.lancer} />'), 'des cartes compactes');
  // En edition, `Sec` pose pointer-events none sur le contenu d'une section :
  // le bouton doit se remettre en auto, sinon le clic tombe sur la section
  // et part en glisser (bug vu sur HA le 16/09).
  assert.ok(a.includes("<button data-drag-ui=\"1\" onClick={() => onNav('scenes')} style={{ pointerEvents: 'auto',"), '« Gérer les scénarios » reste cliquable en édition');
  assert.ok(app.includes("scenes: <ScenariosAccueil hass={dashHass} edit={editMode} onNav={onNav} />,"), 'la section `scenes` de l’Accueil');
  assert.ok(!app.includes('quickScenes') && !app.includes('QuickScenes') && !app.includes('ScenesView'), 'plus rien des scènes rapides');
});

test('la carte suit le gabarit : disque teinte en haut a gauche, dernier lancement a droite, titre sous l’icone, sans bordure', () => {
  const c = bloc('function CarteScenario(', NL + '}');
  assert.ok(c.includes("borderRadius: '50%'") && c.includes('background: `rgba(${t.rgb},.22)`') && c.includes('<Ico name={s.icone || \'sparkles\'}'), 'le disque teinté porte l’icône');
  assert.ok(c.includes("{!sansDernier && <span") && c.includes("libelleDernier(s.dernier, Date.now(), locale())"), 'le repère haut-droit = dernier lancement, effacé en édition');
  assert.ok(c.includes("height: compacte ? 88 : 184") && c.includes("border: 'none'"), 'deux tailles, sans bordure');
  assert.ok(app.includes("const PUCE_SCN = { fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 9,"), 'des puces à l’arrondi 9');
});

test('la vue Scenarios : cartes standard, edition avec fleches et crayon, la bibliotheque Hue dessous', () => {
  const v = bloc('function ScenariosView(', NL + '}');
  assert.ok(v.includes("sansDernier={edit}") && v.includes("position: 'absolute', right: 12, top: 12"), 'les outils prennent la place du repère');
  assert.ok(v.includes("<ScenesContent hass={hass} />"), 'les ambiances Hue restent, dessous');
  assert.ok(v.includes("sc.enregistrer({ ordre: ids })"), 'l’ordre se range par les flèches');
  assert.ok(app.includes("view === 'scenes' ? <ScenariosView hass={hass} edit={editMode && peutEditer} />"), 'la route `scenes` mène à la vue');
  assert.ok(app.includes("<div style={sectionTitle}>{tr('Ambiances lumineuses')}</div>"), 'la bibliothèque Hue devient une section');
  const f = bloc('function FicheScenario(', NL + '}');
  assert.ok(f.includes("{ reinitialiser: scenario.id }") && f.includes("{ supprimer: scenario.id }") && f.includes("{ enregistrer: doc }"), 'les trois gestes de la fiche');
});

test('la veille et la recherche passent aux scenarios ; les liens sont sondes avec l’Accueil', () => {
  assert.ok(app.includes("{scenariosAccueil(scenarios()).slice(0, 4).map(s => ("), 'la veille : quatre scénarios de l’Accueil');
  assert.ok(app.includes("scenarios().forEach(s => { const nom = nomScenario(s); if (!match(nom)) return; results.push({ group: tr('Scénarios'),"), 'la recherche ⌘K');
  assert.ok(app.includes("const qsKeys = () => scenarios().map(s => s.lien).filter(Boolean);"), 'les scènes et scripts liés sont sondés');
  assert.ok(app.includes("{ label: 'Scénarios', svg: <Fi i=\"sparkles\"") && app.includes("'Scénarios': 'scenes',"), '« Scènes » est devenue « Scénarios », l’identifiant reste');
});

test('les quarante icones existent dans la police regular, par pages de dix', () => {
  assert.equal(ICONES_SCENARIO.length, 40);
  assert.equal(new Set(ICONES_SCENARIO).size, 40, 'sans doublon');
  for (const ic of ICONES_SCENARIO) assert.ok(police.includes('.fi-rr-' + ic + ':before'), ic + ' manque a la police');
});
