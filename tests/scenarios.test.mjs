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

test('« Sauf les veilleuses » n’est plus une option : ni bouton, ni texte, ni champ écrit (19/10)', async () => {
  const { readFileSync } = await import('node:fs');
  const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  assert.ok(!lire('src/fichescenario.jsx').includes('sauf_veilleuses'), 'plus de bouton dans l’éditeur');
  assert.ok(!lire('src/scenarios.js').includes('sauf_veilleuses'), 'plus de champ écrit');
  assert.ok(!/sauf_veilleuses/.test(lire('src/demo.js')), 'la démo ne la porte plus');
  for (const lg of ['en', 'de', 'nl', 'it', 'es', 'pl']) assert.ok(!lire('src/langues/' + lg + '.js').includes("'Sauf les veilleuses'"), lg + ' : clé orpheline');
});

test('ce que la fiche envoie : le scenario sans ce qu’il a calcule', () => {
  const s = {
    id: 'nuit', nom: '  ', icone: 'moon', teinte: 'chambre', lien: null, piece: null, integre: true, modifie: false,
    resume: [{ n: 3 }], dernier: 12, suggestion: 'scene.x', piece_effective: 'Salon', lien_absent: false,
    actions: [{ famille: 'lumieres', geste: 'eteindre', portee: 'maison', sauf_veilleuses: true, valeur: 30 },
      { famille: 'lumieres', geste: 'allumer', portee: 'piece', piece: 'Salon', valeur: 10, si: 'nuit' },
      { famille: 'volets', geste: 'fermer', portee: 'piece', valeur: 4, si: 'toujours' }],
  };
  // ASSERTION MODIFIÉE (19/10) : « Sauf les veilleuses » a quitté l'éditeur — les veilleuses sont épargnées
  // par toute extinction (ADR 0260) ; le champ d'un ancien scénario ne repart plus.
  assert.deepEqual(versEnregistrement(s), {
    id: 'nuit', nom: null, icone: 'moon', teinte: 'chambre', lien: null, piece: null, accueil: true, masque: false,
    actions: [{ famille: 'lumieres', geste: 'eteindre', portee: 'maison', valeur: 30 },
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
  /* + l'ecran de veille et la modale du code : sortis d'App.jsx le 23/09
   * (plan M1). Ce que ce fichier verifie n'a pas bouge, seulement son
   * adresse — on relit donc le monolithe ET ce qui en est sorti. Les
   * ambiances Hue en sont sorties le 11/10 (scenes.jsx, chargé à la demande). */
const app = ['App.jsx', 'ecranveille.jsx', 'pinmodal.jsx', 'scenes.jsx'].map(f => readFileSync(join(RACINE, 'src', f), 'utf8')).join(String.fromCharCode(10));
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
  // Dans l'ordre de CE type d'ecran (ADR 0052) : `sc.tous`.
  assert.ok(a.includes('const liste = scenariosAccueil(sc.tous);'), 'seuls les scenarios cochés « Sur l’Accueil »');
  assert.ok(a.includes('<CarteScenario key={s.id} s={s} noms={sc.noms} compacte enCours={sc.enCours === s.id} onLancer={sc.lancer} />'), 'des cartes compactes');
  // En edition, `Sec` pose pointer-events none sur le contenu d'une section :
  // le bouton doit se remettre en auto, sinon le clic tombe sur la section
  // et part en glisser (bug vu sur HA le 16/09).
  assert.ok(a.includes("<button data-drag-ui=\"1\" onClick={() => onNav('scenes')} style={{ pointerEvents: 'auto',"), '« Gérer les scénarios » reste cliquable en édition');
  assert.ok(app.includes("scenes: <ScenariosAccueil hass={dashHass} edit={editMode} onNav={onNav} />,"), 'la section `scenes` de l’Accueil');
  assert.ok(!app.includes('quickScenes') && !app.includes('QuickScenes') && !app.includes('ScenesView'), 'plus rien des scènes rapides');
});

test('la carte suit le gabarit : disque teinte en haut a gauche, dernier lancement a droite, titre sous l’icone, le liseré du réglage', () => {
  const c = bloc('function CarteScenario(', NL + '}');
  assert.ok(c.includes("borderRadius: '50%'") && c.includes('background: `rgba(${t.rgb},.22)`') && c.includes('<Ico name={s.icone || \'sparkles\'}'), 'le disque teinté porte l’icône');
  assert.ok(c.includes("{!sansDernier && <span") && c.includes("libelleDernier(s.dernier, Date.now(), locale())"), 'le repère haut-droit = dernier lancement, effacé en édition');
  assert.ok(c.includes("height: compacte ? 88 : 184") && c.includes("boxSizing: 'border-box', borderRadius: 'var(--o-radius,18px)', border: LISERE,"), 'deux tailles, le liseré DANS la carte (04/10)');
  assert.ok(app.includes("const PUCE_SCN = { fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 9,"), 'des puces à l’arrondi 9');
});

test('les puces de la carte ne se coupent pas en plein mot sur un telephone', () => {
  // Audit du 27/09 : la rangée n'était bornée qu'à GAUCHE, chaque puce en
  // `nowrap`. Sur un téléphone la rangée mesurait 192 px pour une carte de
  // 141, et la carte la coupait en plein mot — « scène H », « Loggi »
  // (mesuré à 320, 360 et 390 px).
  //
  // Pas de seuil en pixels : ce qui ne tient pas passe à la ligne suivante,
  // hors de la hauteur visible, et disparaît donc ENTIER. Un nombre écrit
  // d'avance aurait trahi une langue ou l'autre — la rangée mesure 220 px en
  // français, 249 en espagnol.
  const c = bloc('function CarteScenario(', NL + '}');
  assert.ok(c.includes('left: 15, right: 15, bottom: 14'),
    'la rangée de puces n’est plus bornée à droite : elle repassera sous le bord de la carte');
  assert.ok(c.includes("flexWrap: 'wrap'") && c.includes("alignContent: 'flex-start'"),
    'les puces ne passent plus à la ligne : elles seront coupées au lieu de disparaître');
  assert.ok(c.includes('height: H_PUCE_SCN') && c.includes("overflow: 'hidden'"),
    'la rangée ne tient plus sur UNE ligne : une seconde rangée de puces apparaîtra');
  // La hauteur est calculée, pas devinée : 15 de ligne + 4 + 4 de
  // rembourrage. `lineHeight` doit donc rester écrit dans la puce.
  assert.ok(app.includes('const H_PUCE_SCN = 23;'), 'la hauteur d’une puce n’est plus nommée');
  assert.ok(app.includes("lineHeight: '15px'"),
    'la puce n’impose plus sa hauteur de ligne : 23 px ne veut plus rien dire, et la langue la ferait varier');
});

test('la vue Scenarios : cartes standard, edition avec fleches et crayon, la bibliotheque Hue dessous', () => {
  const v = bloc('function ScenariosView(', NL + '}');
  assert.ok(v.includes("sansDernier={edit}") && v.includes("position: 'absolute', right: 12, top: 12"), 'les outils prennent la place du repère');
  assert.ok(v.includes("<ScenesContent hass={hass} />"), 'les ambiances Hue restent, dessous');
  // Chargées à la demande depuis le 11/10 : elles attendent sous un repli qui garde leur place.
  assert.match(v, /<Suspense fallback=\{<div style=\{\{ marginTop: 8, minHeight: \d+ \}\} \/>\}>\s*<ScenesContent hass=\{hass\} \/>\s*<\/Suspense>/,
    'les ambiances Hue, chargées à la demande, n’ont plus de repli qui tienne leur place : la page sauterait à leur arrivée');
  // Les fleches rangent sur CE type d'ecran : l'ordinateur au composant, les autres chez eux (ADR 0052).
  assert.ok(v.includes("sc.ordonner(ids);") && !v.includes('sc.ordonner(ids).catch'), 'l’ordre se range par les flèches, et son refus ne s’avale plus');
  assert.ok(app.includes("view === 'scenes' ? <ScenariosView hass={hass} edit={editMode && peutEditer} />"), 'la route `scenes` mène à la vue');
  assert.ok(app.includes("<h2 style={sectionTitle}>{tr('Ambiances lumineuses')}</h2>"), 'la bibliothèque Hue devient une section');
  // ASSERTION MODIFIÉE (contre-relecture du lot 3 des capteurs) : la fiche d'un scénario est chargée à la demande — fichescenario.jsx.
  const fs = readFileSync(new URL('../src/fichescenario.jsx', import.meta.url), 'utf8');
  const f = fs.slice(fs.indexOf('export default function FicheScenario('));
  assert.ok(app.includes("const FicheScenario = lazyRecharge(() => import('./fichescenario.jsx'));"), 'la fiche quitte le démarrage');
  assert.ok(f.includes("{ reinitialiser: scenario.id }") && f.includes("{ supprimer: scenario.id }") && f.includes("{ enregistrer: doc }"), 'les trois gestes de la fiche');
});

test('la bibliothèque Hue, chargée à la demande, garde ses 55 ambiances', () => {
  /* Règle de la maison : « Garder la bibliothèque Hue » — rien n'en est
   * retiré. Le 11/10 (tâche 6 bis du chantier Chauffage), elle quitte le boot
   * pour scenes.jsx, chargé à la première ouverture des Scénarios : les mêmes
   * sept collections, les mêmes 55 ambiances, chacune avec ses cinq couleurs
   * (le dégradé), sa luminosité et son image. Lue comme du texte : une
   * ambiance par ligne, chaque ligne relue entière. */
  const src = readFileSync(join(RACINE, 'src', 'scenes.jsx'), 'utf8');
  const d = src.indexOf('\nconst HUE_SCENES = {\n');
  assert.ok(d >= 0, 'la bibliothèque Hue a quitté scenes.jsx');
  const lib = src.slice(d, src.indexOf('\n};\n', d));
  assert.deepEqual([...lib.matchAll(/^ {2}(\w+): \{ label: /gm)].map(m => m[1]),
    ['classics', 'cosy', 'party', 'romance', 'halloween', 'winter', 'misc'], 'une collection a disparu, ou changé de place');
  const COULEUR = String.raw`\[\d{1,3},\d{1,3},\d{1,3}\]`;
  const AMBIANCE = new RegExp(String.raw`^ {4}\{ name: '([^']+)', uuid: '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', colors: \[${COULEUR}(?:,${COULEUR}){4}\], brightness: \d{1,3} \},$`, 'gm');
  const noms = [...lib.matchAll(AMBIANCE)].map(m => m[1]);
  assert.equal((lib.match(/\buuid: '/g) || []).length, 55, 'une ambiance a été retirée de la bibliothèque Hue');
  assert.equal(noms.length, 55, 'une ambiance a perdu ses cinq couleurs, sa luminosité ou son image');
  assert.equal(new Set(noms).size, 55, 'deux ambiances portent le même nom : la scène active ne se retrouverait plus');
  // Le dégradé dessiné, et la luminosité qui part avec la scène.
  assert.ok(src.includes('const sceneGradient = (colors) => {') && src.includes('brightness_pct: sc.brightness });'),
    'le dégradé ou la luminosité d’une ambiance s’est perdu en route');
});

test('la veille et la recherche passent aux scenarios ; les liens sont sondes avec l’Accueil', () => {
  /* La veille les reçoit en PROPS depuis le 23/09 (plan M1) : sortie
   * d'App.jsx, elle ne connaît plus le magasin des scénarios ni la commande —
   * on lui passe la liste de l'Accueil et de quoi en lancer un. */
  assert.ok(app.includes("<AmbientOverlay scenes={scenariosAccueil(scenarios()).map(s => ({ ...s, nom: nomScenario(s) }))} onScene={(s) => lancerScenario(getHass(), s.id)}"),
    'la veille : quatre scénarios de l’Accueil');
  assert.ok(app.includes('{scenes.slice(0, 4).map(s => ('), 'la veille n’en montre plus quatre');
  assert.ok(app.includes("scenarios().forEach(s => { const nom = nomScenario(s); if (!match(nom)) return; results.push({ group: tr('Scénarios'),"), 'la recherche ⌘K');
  assert.ok(app.includes("const qsKeys = () => scenarios().map(s => s.lien).filter(Boolean);"), 'les scènes et scripts liés sont sondés');
  assert.ok(app.includes("{ label: 'Scénarios', svg: <Fi i=\"sparkles\"") && app.includes("'Scénarios': 'scenes',"), '« Scènes » est devenue « Scénarios », l’identifiant reste');
});

test('les quarante icones existent dans la police regular, par pages de dix', () => {
  assert.equal(ICONES_SCENARIO.length, 40);
  assert.equal(new Set(ICONES_SCENARIO).size, 40, 'sans doublon');
  for (const ic of ICONES_SCENARIO) assert.ok(police.includes('.fi-rr-' + ic + ':before'), ic + ' manque a la police');
});
