// ─────────────────────────────────────────────────────────────────────────────
// Un mode se MÉMORISE, il ne se déduit pas de ses valeurs.
//
// « Heures à lui », dans le détail par volet, était déduit de la présence d'un
// décalage : `ouverture != null || fermeture != null`. Vider le dernier champ
// rendait donc le mode faux, le bloc entier se démontait, et le volet
// retombait sur « Comme les autres ». Le champ disparaissait sous les doigts
// de qui essayait simplement de corriger un nombre.
//
// C'était d'autant plus faux que la ligne d'aide, juste en dessous, annonce
// l'inverse : « Vide = suit l'heure générale pour ce sens. » Vider est un
// choix, pas une sortie du mode.
//
// La leçon vaut au-delà des volets : dès qu'un réglage a un mode ET des
// valeurs, l'un ne doit pas se lire dans les autres.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VUES_SORTIES } from './monolithe.mjs'; // App.jsx + les vues sorties du boot (ADR 0274)

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'views', 'volets.jsx'), 'utf8');

/* TESTS MODIFIÉS (chantier Volets, tâche 13, V2) : « Comme les autres · Heures
 * à lui · Jamais » quitte Règles › Volets pour la fiche de chaque volet. Ce que
 * ces trois tests gardaient s'y garde, dans voletsfiche.js ; les cas chiffrés
 * sont dans tests/voletsfiche.test.mjs (« écrire : des tables ENTIÈRES »). */
const fiche = readFileSync(join(RACINE, 'src', 'voletsfiche.js'), 'utf8');

test('« Heures à lui » survit à des champs vides', () => {
  assert.ok(fiche.includes('const perso = r && !r.exclu && (r.perso || r.ouverture != null || r.fermeture != null);'),
    'la règle du mode « Heures à lui » a disparu ou changé de forme');
  // Le choix doit poser le drapeau, sinon la lecture ne trouvera jamais rien.
  assert.ok(fiche.includes("regle === 'perso' ? (perso ? { ...r, perso: true } : { perso: true, ouverture: null, fermeture: null })"),
    'le choix « Heures à lui » ne pose plus le mode');
});

test('les réglages écrits avant le drapeau restent reconnus', () => {
  // Une installation configurée avant le drapeau n'a que ses décalages : ne
  // lire que le drapeau ferait retomber ses volets sur « Comme les autres ».
  assert.ok(fiche.includes('r.ouverture != null || r.fermeture != null'), 'les anciennes configurations perdraient leur mode');
});

test('un décalage vide part de celui de la maison, jamais de zéro', () => {
  // Vide (null), le volet suit l'heure de la maison : le premier − ou + part
  // de ce décalage-là, il n'écrit pas zéro minute — un réglage actif.
  assert.ok(fiche.includes('const depart = r[sens] != null && Number.isFinite(Number(r[sens])) ? Number(r[sens]) : decalageMaison(plan, sens);'),
    'un décalage vide repartirait de zéro');
});

// ─────────────────────────────────────────────────────────────────────────────
// Une règle activée doit pouvoir se replier.
//
// Sur Paramètres → Règles, activer une règle déployait tout son paramétrage et
// ne le refermait jamais. On règle une automatisation une fois, puis on n'y
// revient plus : cinq familles déployées remplissaient plusieurs écrans de
// champs qu'on ne relit pas.
//
// « Activée » et « dépliée » sont donc deux états distincts, et le pli ne
// touche pas au fonctionnement : la règle continue de tourner.
// ─────────────────────────────────────────────────────────────────────────────

const ui = readFileSync(join(RACINE, 'src', 'ui.jsx'), 'utf8');
// Les cinq onglets de Paramètres → Règles.
const VUES_REGLES = ['volets', 'nuit', 'veilles', 'fenetres', 'presence'];
// Celles dont l'en-tête était écrit à l'identique et a été extrait.
const VUES_EXTRAITES = ['volets', 'nuit', 'veilles'];

test('l’en-tête des règles est écrit une seule fois', () => {
  // Il l'était trois fois à l'identique. Le poser ailleurs évite de devoir lui
  // ajouter le pli trois fois — et d'oublier la quatrième vue à venir.
  assert.match(ui, /export function RegleEntete\(/, 'l’en-tête partagé a disparu');
  assert.match(ui, /export function Bascule\(/, 'l’interrupteur partagé a disparu');
  for (const v of VUES_EXTRAITES) {
    const src = readFileSync(join(RACINE, 'src', 'views', v + '.jsx'), 'utf8');
    assert.ok(!/const Entete = \(\{ nom/.test(src), `${v}.jsx a repris une copie locale de l’en-tête`);
    assert.ok(!/const Bascule = \(\{ on/.test(src), `${v}.jsx a repris une copie locale de l’interrupteur`);
  }
  for (const v of VUES_REGLES) {
    const src = readFileSync(join(RACINE, 'src', 'views', v + '.jsx'), 'utf8');
    assert.match(src, /RegleEntete, usePli/, `${v}.jsx n’importe plus l’en-tête partagé`);
  }
});

test('les cinq onglets ont au moins une règle repliable', () => {
  // Deux d'entre eux étaient bâtis autrement, sans le composant d'en-tête, et
  // sont restés dépliés une version de plus.
  for (const v of VUES_REGLES) {
    const src = readFileSync(join(RACINE, 'src', 'views', v + '.jsx'), 'utf8');
    assert.match(src, /<RegleEntete[\s\S]{0,400}?plie=\{/,
      `${v}.jsx : aucune règle repliable — cet onglet restera déplié`);
  }
});

test('chaque en-tête pilote SON pli, et lui seul', () => {
  // Vérifier que le pli est branché quelque part ne suffit pas. « Protection
  // solaire » avait reçu deux jeux de props — `plie={pliSol}` puis
  // `plie={pliVent}` — et en JSX le dernier gagne : l'en-tête basculait le pli
  // du vent pendant que son contenu attendait celui du soleil. Le chevron
  // bougeait, rien ne se repliait, et le bloc du vent n'était plus pliable du
  // tout. Rien ne le signalait : deux props valides, deux gardes valides,
  // simplement pas les mêmes.
  for (const v of VUES_REGLES) {
    const src = readFileSync(join(RACINE, 'src', 'views', v + '.jsx'), 'utf8');

    // Une balise ne porte `plie` qu'une fois.
    for (const balise of src.match(/<RegleEntete[\s\S]*?\/>/g) || []) {
      const n = (balise.match(/\bplie=\{/g) || []).length;
      assert.equal(n, 1, `${v}.jsx : un en-tête porte ${n} fois « plie » — le dernier écrase les autres`);
    }

    // Pour chaque en-tête, on relie la règle qu'il commande au pli qu'il porte,
    // puis on exige que TOUTES les gardes de cette règle portent CE pli.
    //
    // Compter, ou comparer des ensembles, ne suffirait pas : « Départ et
    // retour » gouverne trois blocs avec un seul pli, et il suffirait qu'un
    // seul des trois le garde pour que l'ensemble paraisse complet — pendant
    // qu'un bloc resterait déplié pour de bon.
    const pilotes = [];
    for (const balise of src.match(/<RegleEntete[\s\S]*?\/>/g) || []) {
      const mOn = balise.match(/on=\{!*([A-Za-z0-9_]+)\.actif\}/);
      const mPli = balise.match(/plie=\{(pli[A-Za-z0-9]*)\}/);
      if (!mOn || !mPli) continue;
      const [regle, pli] = [mOn[1], mPli[1]];
      pilotes.push(pli);
      const gardes = src.match(new RegExp('\\{' + regle + '\\.actif &&[^(]*\\(', 'g')) || [];
      assert.ok(gardes.length > 0, `${v}.jsx : « ${regle} » a un en-tête pliable mais rien à replier`);
      for (const g of gardes) {
        assert.ok(g.includes('!' + pli + ' &&'),
          `${v}.jsx : « ${g.trim()} » ne porte pas ${pli}, le pli de son en-tête — ce bloc restera déplié`);
      }
    }
    assert.equal(new Set(pilotes).size, pilotes.length,
      `${v}.jsx : deux en-têtes partagent le même pli — ils se replieront ensemble`);
  }
});

test('le pli reste sur l’appareil', () => {
  // `estPersonnelle` classe sur le suffixe « panel ». Ce qu'on a replié sur son
  // téléphone n'a pas à se replier sur la tablette de quelqu'un d'autre.
  const m = ui.match(/localStorage\.getItem\('(loggia-[a-z]+)'\)/);
  assert.ok(m, 'la clé du pli est introuvable');
  assert.ok(m[1].endsWith('panel'),
    `${m[1]} ne finit pas par « panel » : le pli suivrait la maison au lieu de l’appareil`);
});

test('le pli ne s’affiche pas sur une règle éteinte', () => {
  const i = ui.indexOf('export function RegleEntete(');
  const corps = ui.slice(i, ui.indexOf('\n}', i));
  // On ne replie pas ce qui n'affiche rien : sans cela, le chevron apparaîtrait
  // sur une règle désactivée et ne ferait rien.
  assert.match(corps, /const pliable = !!\(on && onPlier\);/,
    'le chevron s’affiche désormais sur les règles éteintes');
});

// ─────────────────────────────────────────────────────────────────────────────
// Un en-tête doit dire DE QUOI il commande le pli.
//
// `RegleEntete` acceptait `zone` et le posait en `aria-controls` — mais aucun
// appelant ne le lui passait. Le commentaire du composant décrivait donc un
// motif que le code ne réalisait pas : exactement la faute du `nom` de
// `Bascule`, accepté par JSX et jeté par la fonction.
//
// Le report tenait à un obstacle qui n'existait pas : « il faudrait convertir
// les fragments en <div>, ce qui casserait la mise en page ». Les cartes de
// règles sont des blocs simples, sans flex ni gap — un enrobage y est neutre.
// ─────────────────────────────────────────────────────────────────────────────

test('chaque en-tête repliable désigne la région qu’il replie', () => {
  for (const v of VUES_REGLES) {
    const src = readFileSync(join(RACINE, 'src', 'views', v + '.jsx'), 'utf8');
    for (const balise of src.match(/<RegleEntete[\s\S]*?\/>/g) || []) {
      if (!/\bplie=\{/.test(balise)) continue;          // en-tête non repliable
      const z = balise.match(/zone="([^"]+)"/);
      assert.ok(z, `${v}.jsx : un en-tête repliable ne dit pas quelle région il commande`);
      for (const id of z[1].split(' ')) {
        // Une zone qui désigne un identifiant que personne ne porte ne relie
        // rien : l'attribut a l'air posé et ne mène nulle part.
        assert.ok(src.includes(`id="${id}"`),
          `${v}.jsx : aucune région ne porte l’identifiant « ${id} »`);
      }
    }
  }
});

test('la relation disparaît avec la région', () => {
  const i = ui.indexOf('export function RegleEntete(');
  const corps = ui.slice(i, ui.indexOf('\n}', i));
  // Replier ne masque pas la région : cela la démonte. Garder `aria-controls`
  // laisserait une référence vers un identifiant absent du document — ce qu'un
  // vérificateur signale, et qui ne mène nulle part.
  assert.match(corps, /aria-controls=\{pliable && zone && !plie \? zone : undefined\}/,
    'l’en-tête garde aria-controls une fois replié : il désigne alors une région démontée');
});

// ─────────────────────────────────────────────────────────────────────────────
// Les priorités déclarées et le mode simulation (11/09/2026).
// ─────────────────────────────────────────────────────────────────────────────

test('on peut observer sans agir, et l’écran le dit', () => {
  /* Un seul interrupteur depuis le 18/09, au-dessus des onglets des Règles :
   * il pose le drapeau des quatre modules qui commandent, volets compris. */
  const par = readFileSync(join(RACINE, 'src', 'views', 'parametres.jsx'), 'utf8');
  assert.ok(par.includes("h.callWS({ type: 'loggia/volets/config', patch: { simulation: { actif: cible } } })"), 'plus d’interrupteur de simulation pour les volets');
  assert.ok(par.includes("<Tgl on={actifs.length > 0} cb={basculerObserve} off={!observe} label={tr('Observer sans agir')} />"), 'l’interrupteur commun a disparu');
  // Tant qu'elle tourne, un bandeau en haut : sinon on cherche pourquoi les
  // volets ne bougent plus.
  assert.ok(src.includes('{simu.actif && ('), 'plus de bandeau de simulation');
  // Et chaque ligne simulée est marquée comme telle.
  assert.ok(src.includes('{j.simule && <span'), 'une ligne simulée se lirait comme une vraie manœuvre');
});

test('le journal dit pourquoi, et qui l’emporte', () => {
  // Le motif — « coucher +30 min », « vent 62 » — était tenu par le serveur
  // depuis la v3.7.0, mais jamais affiché.
  // Depuis l'ADR 0070, `pourquoi(j)` rend regle · motif · detail, traduits.
  assert.ok(src.includes("{pourquoi(j)}"), 'le motif ne s’affiche plus');
  assert.ok(src.includes("etat.priorites.map(nomPriorite).join(' › ')"), 'l’ordre de priorité ne s’affiche plus');
});

// ─────────────────────────────────────────────────────────────────────────────
// Les heures calmes, et le journal commun dans les veilles (12/09/2026).
//
// Le socle (regles.py) sait se taire ; encore faut-il pouvoir le lui dire.
// ─────────────────────────────────────────────────────────────────────────────

test('les heures calmes se règlent à côté du téléphone', () => {
  const par = readFileSync(join(RACINE, 'src', 'views', 'parametres.jsx'), 'utf8');
  // Depuis le défaut, qui vit juste au-dessus de la carte, jusqu'à la section
  // suivante : la carte entière, et rien d'autre.
  const debut = par.indexOf('const ALERTES_DEF');
  assert.notEqual(debut, -1, 'la carte des alertes a disparu');
  const carte = par.slice(debut, par.indexOf('/* ════════════ VUES PERSONNALISÉES', debut));
  assert.ok(carte.includes("calme: { actif: false, debut: '22:00', fin: '07:00' }"), 'plus de défaut pour les heures calmes');
  assert.ok(carte.includes('save({ calme: { ...cfg.calme, actif: !cfg.calme.actif } })'), 'plus d’interrupteur');
  // Deux heures, saisies comme des heures : le clavier du téléphone s'ouvre
  // sur un sélecteur d'heure, pas sur des lettres.
  assert.equal((carte.match(/type="time"/g) || []).length, 2, 'il faut un début ET une fin');
  assert.ok(carte.includes('debut: e.target.value') && carte.includes('fin: e.target.value'));
  // Et le rechargement garde la plage : sans cette fusion, rouvrir la page
  // remettait 22:00–07:00 quoi qu'on ait réglé.
  assert.ok(carte.includes('calme: { ...d.calme, ...(c.calme || {}) }'), 'la plage réglée ne survit pas au rechargement');
});

test('le journal des veilles lit les champs communs', () => {
  const vei = readFileSync(join(RACINE, 'src', 'views', 'veilles.jsx'), 'utf8');
  // Les veilles écrivent dans le journal du socle : `quoi`, `regle`, `motif`,
  // `detail` — plus `entite` ni `valeur`, qui n'existent plus.
  assert.ok(!vei.includes('nomDe(j.entite)'), 'le journal lit encore un champ qui n’existe plus');
  // Depuis le 18/09, chaque règle montre SES derniers signalements, dans sa
  // carte : la règle filtre, le motif porte la valeur, le détail le capteur.
  assert.ok(vei.includes("j.regle === regle && (j.quoi === 'prevenir' || j.quoi === 'alerter')"), 'les signalements ne se rangent plus par règle');
  assert.ok(vei.includes('parseInt(j.motif, 10)'), 'la valeur d’une pile ne vient plus du motif');
  assert.ok(vei.includes("String(j.detail || '')"), 'le nom du capteur ne vient plus du détail');
});

// ─────────────────────────────────────────────────────────────────────────────
// Les quatre modules migrés sur le socle (12/09/2026).
//
// Chaque onglet lit le journal commun et sait observer sans agir. Présence ne
// promet plus de « confort » : le retour remet les consignes d'avant (ADR 0011).
// ─────────────────────────────────────────────────────────────────────────────

/* Depuis le 18/09 (maquettes des Paramètres) : les manœuvres de chaque module
 * se lisent dans l'onglet Journal — la liste recopiée dans chaque onglet était
 * un doublon —, et « Observer sans agir » est UN interrupteur, au-dessus des
 * onglets. Chaque onglet garde son bandeau : c'est là qu'on se demande
 * pourquoi rien ne bouge. */
const PAR = readFileSync(join(RACINE, 'src', 'views', 'parametres.jsx'), 'utf8');
const JOURNAL = readFileSync(join(RACINE, 'src', 'views', 'journal.jsx'), 'utf8');
const PATCH_OBSERVER = {
  fenetres: "h.callWS({ type: 'loggia/fenetres/config', patch: { simulation: cible } })",
  presence: "h.callWS({ type: 'loggia/presence/config', patch: { simulation: { actif: cible } } })",
  nuit: "h.callWS({ type: 'loggia/nuit/config', patch: { simulation: { actif: cible } } })",
};
for (const v of ['fenetres', 'presence', 'nuit']) {
  test(`${v} : ses manœuvres au journal, et l’observation au-dessus des onglets`, () => {
    const src = readFileSync(join(RACINE, 'src', 'views', v + '.jsx'), 'utf8');
    assert.ok(!src.includes("{tr('Observer sans agir')}"), `${v}.jsx : un second interrupteur d’observation est revenu`);
    assert.ok(PAR.includes(PATCH_OBSERVER[v]), `${v} : l’interrupteur commun ne pose plus son drapeau`);
    assert.ok(src.includes("{tr('Simulation : rien ne bouge, tout est noté.')}"), `${v}.jsx : plus de bandeau de simulation`);
    assert.ok(!src.includes("{j.regle}{j.motif ? ' · ' + j.motif : ''}"), `${v}.jsx : la liste des manœuvres est revenue en double`);
  });
}

test('le journal commun lit les champs du socle, et marque le simulé', () => {
  assert.ok(JOURNAL.includes("{pourquoi(j)}") && JOURNAL.includes("{mot(j, 'quoi')}"), 'le journal lit encore des champs qui n’existent plus');
  assert.ok(JOURNAL.includes("{j.simule && <span style={badge('var(--o-warn)')}>{tr('simulé')}</span>}"), 'une ligne simulée se lirait comme une vraie manœuvre');
});

test('présence ne promet plus de consigne de confort', () => {
  const src = readFileSync(join(RACINE, 'src', 'views', 'presence.jsx'), 'utf8');
  assert.ok(!src.includes("chauffage: { confort:"), 'le réglage « confort » est revenu : il écraserait un réglage fait à la main');
  assert.ok(src.includes("tr('Aux consignes d’avant le départ, telles quelles.')"));
});

// ─────────────────────────────────────────────────────────────────────────────
// L'onglet Journal (ADR 0009, 0020).
// ─────────────────────────────────────────────────────────────────────────────

test('l’onglet Journal existe, et lit le socle', () => {
  const par = readFileSync(join(RACINE, 'src', 'views', 'parametres.jsx'), 'utf8');
  assert.ok(par.includes("['journal', tr('Journal')]"), 'plus d’onglet Journal dans Règles');
  assert.ok(par.includes("ongletRegle === 'journal' ? <JournalReglages"), 'l’onglet Journal ne rend rien');
  const vue = readFileSync(join(RACINE, 'src', 'views', 'journal.jsx'), 'utf8');
  assert.ok(vue.includes("useEtatServeur(hass, 'loggia/regles/etat'"), 'la vue ne lit pas le journal commun');
});

test('le journal montre le présent avant le passé', () => {
  const vue = readFileSync(join(RACINE, 'src', 'views', 'journal.jsx'), 'utf8');
  const present = vue.indexOf("{tr('En ce moment')}");
  const passe = vue.indexOf("{tr('Toutes les règles, la plus récente en premier.')}");
  assert.ok(present > 0 && passe > present, 'la section « en ce moment » doit venir en tête');
  for (const morceau of ['Object.keys(gels)', 'Object.keys(tenues)', 'Object.keys(attentes)']) {
    assert.ok(vue.includes(morceau), 'le présent ne montre plus : ' + morceau);
  }
});

test('rendre la main est un geste d’administrateur, et passe par le serveur', () => {
  const vue = readFileSync(join(RACINE, 'src', 'views', 'journal.jsx'), 'utf8');
  assert.ok(vue.includes("h.callWS({ type: 'loggia/regles/degeler', entity_id: id })"));
  assert.ok(vue.includes('const admin = !!(hass && hass.user && hass.user.is_admin);'));
  assert.ok(vue.includes('{admin && ('), 'le bouton s’afficherait à un compte qui ne peut que le voir échouer');
});

test('le journal montre tout, du plus récent au plus ancien, sans filtre', () => {
  /* Les puces de filtre (module, simulé / réel) sont parties avec la maquette
   * du 18/09 : chaque ligne dit son module en capitales, et une ligne simulée
   * porte sa marque — le tri se fait à l'œil, sur une liste courte. */
  const vue = readFileSync(join(RACINE, 'src', 'views', 'journal.jsx'), 'utf8');
  assert.ok(!vue.includes('useState('), 'un filtre est revenu');
  assert.ok(!vue.includes('(!module || j.module === module)'), 'le filtre par module est revenu');
});

test('les derniers envois des alertes ne vivent plus qu’au journal', () => {
  const par = readFileSync(join(RACINE, 'src', 'views', 'parametres.jsx'), 'utf8');
  assert.ok(!par.includes("tr('DERNIERS ENVOIS')"), 'la liste doublon est revenue (ADR 0009)');
  assert.ok(!par.includes('loggia_alertes_journal'));
});

test('la démo répond au journal, avec les champs communs partout', () => {
  const demo = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');
  assert.ok(demo.includes("msg.type === 'loggia/regles/etat'"));
  assert.ok(demo.includes("msg.type === 'loggia/regles/degeler'"));
  // Plus aucun journal de démo aux anciens champs : les onglets ne les lisent plus.
  for (const ancien of ["{ quoi: 'rendre', piece:", "quoi: 'co2', entite:", "quoi: 'veilleuse', entites:", "quoi: 'depart', detail: ["]) {
    assert.ok(!demo.includes(ancien), 'journal de démo aux anciens champs : ' + ancien);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Volet bloqué (§1, ADR 0010) : on ne ferme pas sur une baie ouverte (13/09/2026).
// ─────────────────────────────────────────────────────────────────────────────

// TEST MODIFIÉ (chantier Volets, tâche 13, V2) : la porte se choisit dans la fiche du volet ; l'interrupteur reste ici.
test('la porte ou la fenêtre devant chaque volet se désigne dans sa fiche ; l’interrupteur reste dans Règles › Volets', () => {
  assert.ok(src.includes('enregistrer({ baies: { actif: !baies.actif } })'), 'plus d’interrupteur « Volet bloqué »');
  assert.ok(src.includes("usePli('volets:baies')"), 'la règle ne se replie pas comme les autres');
  // Un capteur par volet, choisi parmi les capteurs d'ouverture — jamais
  // deviné d'un nom — et écrit dans la section « baies » du serveur.
  assert.ok(fiche.includes("const CLASSES_PORTE = ['door', 'window', 'opening', 'garage_door'];"), 'la porte ne se choisit plus parmi les capteurs d’ouverture');
  // ASSERTION MODIFIÉE (25/10, fusion volet par volet) : le patch ne porte que CE volet, `null` le retire.
  assert.ok(fiche.includes('return { baies: { volets: { [id]: capteur || null }, ...(capteur && !baies.actif ? { actif: true } : null) } };'),
    'le choix du capteur n’écrit plus dans la section « baies »');
});

test('le journal dit pourquoi un ordre attend', () => {
  const vue = readFileSync(join(RACINE, 'src', 'views', 'journal.jsx'), 'utf8');
  assert.ok(vue.includes("{mot(attentes[id], 'motif') ? ' · ' + mot(attentes[id], 'motif') : ''}"),
    '« en attente · fermer » sans dire si c’est le volet ou la baie');
});

test('la démo a une baie désignée et un ordre qui l’attend', () => {
  const demo = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');
  // ASSERTION MODIFIÉE (chantier Volets, tâche 2) : la porte devant le volet du salon est sa baie vitrée (§ 9).
  assert.ok(demo.includes("baies: { actif: true, volets: { 'cover.volet_salon': BAIE_DEMO } }") && demo.includes("const BAIE_DEMO = 'binary_sensor.baie_vitree';"), 'la démo ne montre pas la règle');
  assert.ok(demo.includes("motif: 'baie ouverte'"), 'la démo ne montre pas d’ordre retenu par une baie');
});

// ─────────────────────────────────────────────────────────────────────────────
// Un seul indice suffit (§10, ADR 0021) — 13/09/2026.
// ─────────────────────────────────────────────────────────────────────────────

test('la présence écoute les indices, et l’écran le dit', () => {
  const vue = readFileSync(join(RACINE, 'src', 'views', 'presence.jsx'), 'utf8');
  assert.ok(vue.includes("enregistrer({ indices: { actif: ind.actif === false } })"), 'plus d’interrupteur pour les capteurs');
  assert.ok(vue.includes("enregistrer({ indices: { mains: ind.mains === false } })"), 'plus d’interrupteur pour les gestes');
  // La carte se replie avec la règle, comme les trois autres.
  assert.ok(vue.includes('zone="presence-pres-1 presence-pres-2 presence-pres-3 presence-pres-4"'), 'la carte ne se replie pas avec la règle');
  // Les capteurs se trouvent par device_class — le miroir du serveur — jamais par nom.
  // ASSERTION MODIFIÉE (audit du 19/10, point 14) : la liste vient de LA table des classes (attention.js) — la présence, puis les ouvrants.
  assert.ok(vue.includes('const classes = [...CLASSES_MOUVEMENT, ...CLASSES_OUVRANT];'), 'la liste des device_class a changé de forme');
  const demo = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');
  assert.ok(demo.includes('indices: { actif: true, mains: true }'), 'la démo ne montre pas la règle');
  assert.ok(demo.includes("quoi: 'reporter'"), 'la démo ne montre pas de décompte reporté');
});

// ─────────────────────────────────────────────────────────────────────────────
// L'éclairage nocturne (§14, ADR 0012) — 13/09/2026.
// ─────────────────────────────────────────────────────────────────────────────

test('l’éclairage nocturne se règle pièce par pièce, depuis les zones', () => {
  const vue = readFileSync(join(RACINE, 'src', 'views', 'nuit.jsx'), 'utf8');
  assert.ok(vue.includes("enregistrer({ eclairage: { actif: !ecl.actif } })"), 'plus d’interrupteur « Éclairage nocturne »');
  assert.ok(vue.includes("usePli('nuit:eclairage')"), 'la règle ne se replie pas comme les autres');
  // Les pièces viennent des zones, les capteurs de leur device_class — jamais d'un nom.
  assert.ok(vue.includes("const CLASSES_MOUVEMENT = ['motion', 'occupancy', 'presence'];"));
  assert.ok(vue.includes('LOGGIA_INDEX.areaList'), 'les pièces ne viennent plus des zones Home Assistant');
  // Activer une pièce la remplit ; une pièce à la fois, fusionnée localement.
  assert.ok(vue.includes("{ actif: true, capteurs: p.capteurs, lampes: p.lampes }"));
  assert.ok(vue.includes('if (patch.eclairage && patch.eclairage.pieces) {'), 'les autres pièces disparaîtraient le temps de l’aller-retour');
  const demo = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');
  assert.ok(demo.includes("device_class: 'motion'"), 'la démo n’a pas de capteur de mouvement');
  // Par ses parties, comme le serveur l'écrit : sa clé traduit le motif (relecture du 03/10).
  assert.ok(demo.includes("motif: [['mouvement : {piece}', { piece: lieu('Entrée') }]]"), 'la démo ne montre pas la règle');
});

// ─────────────────────────────────────────────────────────────────────────────
// Sur un danger, la maison réagit (§18, ADR 0022) — 13/09/2026.
// ─────────────────────────────────────────────────────────────────────────────

test('sur un danger, la maison réagit — et cela se règle à côté du téléphone', () => {
  const par = readFileSync(join(RACINE, 'src', 'views', 'parametres.jsx'), 'utf8');
  assert.ok(par.includes("actions: { actif: true, lumieres: true, volets: true, vanne: { actif: true, entite: '' } }"), 'plus de défaut pour les actions');
  assert.ok(par.includes("save({ actions: { ...cfg.actions, actif: !cfg.actions.actif } })"), 'plus d’interrupteur général');
  for (const k of ['lumieres', 'volets']) assert.ok(par.includes(`save({ actions: { ...cfg.actions, ${k}: !cfg.actions.${k} } })`), `plus d’interrupteur pour ${k}`);
  /* ASSERTION MODIFIÉE (étape 3 IoT, 25/10 ; I29) : « Fermer en cas de fuite » — l'ancienne « Vanne d'eau coupée » — DÉMÉNAGE dans la
   * popup de la vanne, qui l'écrit par sa commande étroite (`loggia/eau/regle`) ; Paramètres n'en garde qu'une ligne qui dit où elle se
   * règle, et n'écrit plus jamais `actions.vanne.actif` — pas même depuis une configuration lue à l'ouverture et périmée depuis. */
  assert.ok(!par.includes("vanne: { ...cfg.actions.vanne, actif: !cfg.actions.vanne.actif }"), 'la bascule de la vanne a quitté Paramètres');
  /* ASSERTION MODIFIÉE (passe bis de l'étape 3, 25/10 ; points 5, 6 et 16) : la ligne ne nomme plus le filtre — une prise désignée
   * se range sous Prises, pas sous IoT ; et la valeur du disque, c'est le SERVEUR qui la garde (`loggia/config/set`, store.py) —
   * la relecture d'avant l'écriture est partie (tests/parametres_alertes_ecriture.test.mjs joue le panneau). */
  assert.ok(par.includes("tr('Se règle dans la popup de la vanne d’eau.')"), 'la ligne dit où elle se règle');
  assert.ok(!par.includes('Objets › IoT'), 'sans nommer un filtre faux pour une prise désignée');
  assert.ok(!par.includes('frais.actions.vanne.actif'), 'plus de relecture avant d’écrire');
  // La vanne se choisit dans une liste ; vide, c'est la règle du composant :
  // ASSERTION MODIFIÉE (étape 3 IoT, 25/10 ; I30) : TOUTES les vannes d'eau (alertes.py, `_vannes`) — l'écran dit lesquelles.
  assert.ok(par.includes("label={tr('Entité de la vanne d’eau')} value={vanne}"), 'la vanne ne se désigne plus');
  assert.ok(par.includes("vannes.filter(id => (S[id].attributes || {}).device_class === 'water')"), 'le choix automatique ne suit plus celui du composant');
  // Une configuration écrite avant les actions garde ses défauts.
  assert.ok(par.includes("actions: { ...d.actions, ...(c.actions || {}), vanne: { ...d.actions.vanne, ...((c.actions || {}).vanne || {}) } }"));
});

test('la fiche volet n’a plus la grille de modes : la bascule suffit', () => {
  const app = (readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8') + VUES_SORTIES);
  const debut = app.indexOf('function RoomCoverSheet(');
  const fin = app.indexOf('function RoomClimateSheet(', debut);
  assert.ok(debut > 0 && fin > debut, 'la fiche volet précède la fiche thermostat');
  const fiche = app.slice(debut, fin);
  // Audit du 19/10 : la fiche n'est plus que celle des ouvrants qui ne sont pas
  // des volets — le planning ne les pilote pas, la bascule mentait.
  assert.ok(!fiche.includes("tr('Auto lever / coucher')"), 'plus de bascule du planning sur un garage');
  assert.ok(fiche.includes("tr('Pas piloté par Loggia')"), 'un ouvrant sans classe dit pourquoi');
  assert.ok(!fiche.includes('voletModes('), 'plus de lecture des modes de l’input_select');
  assert.ok(!fiche.includes('select_option'), 'plus de commande de mode');
  assert.ok(!app.includes("tr('MODE AUTOMATIQUE')"), 'le libellé a disparu');
  assert.ok(!app.includes('VOLET_ALLURE'), 'la table des allures aussi');
  assert.ok(!app.includes('o-volet-mode'), 'et la classe des boutons');
});

test('la pièce n’a plus de journal d’activité, la Sécurité garde le sien', () => {
  const app = (readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8') + VUES_SORTIES);
  const rv = app.indexOf('function RoomView(');
  const room = app.slice(rv, app.indexOf(String.fromCharCode(10) + 'function ', rv + 1));
  assert.ok(!room.includes('<RoomActivityCard'), 'plus de journal sous les appareils de la pièce');
  assert.ok(app.includes("<RoomActivityCard hass={hass} max={12} titre={tr('Journal de la sécurité')}"), 'la vue Sécurité garde son journal');
});

test('la glissière des cartes a retrouvé sa hauteur d’avant, sans changer de dessin', () => {
  const app = (readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8') + VUES_SORTIES);
  const j = app.indexOf('function RmJauge(');
  const jauge = app.slice(j, app.indexOf(String.fromCharCode(10) + '}', j));
  // ASSERTION MODIFIÉE (chantier Lumières, tâche 4) : l'épaisseur devient un réglage (`piste`, 24 px par défaut) ; la fiche d'une lumière la veut à 32.
  // ASSERTION MODIFIÉE (chantier Mode enfant, tâche 4 ; E7, E15) : la borne haute (`plafond`, null : aucune) et le pas du geste (`pas`, 1) s'ajoutent — sans eux, 24 px et le même dessin.
  assert.ok(jauge.includes('piste = 24, plafond = null, pas = 1 }) {') && jauge.includes("height: piste, borderRadius: piste / 2, background: 'var(--o-s1)'") && jauge.includes('marginTop: marge'), '24 px de haut, comme avant la refonte');
  assert.ok(jauge.includes('data-fill') && jauge.includes('data-knob'), 'le dessin reste : remplissage + curseur');
  assert.ok(!jauge.includes('border:'), 'et toujours sans bordure');
});

test('les boutons de la carte enceinte sont des icônes, pas des « » en texte', () => {
  const app = (readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8') + VUES_SORTIES);
  /* ASSERTION MODIFIÉE (chantier Médias, tâche 4 ; M2 A, M13) : précédent et suivant ont quitté la carte pour la popup — leurs
   * chevrons avec eux. La carte garde UNE puce, lecture ou pause, à icône (14 px), dans son propre composant (`PuceLecture`). */
  const d = app.indexOf('function PuceLecture(');
  assert.ok(d >= 0, 'la puce lecture / pause de la carte a disparu');
  const puce = app.slice(d, app.indexOf(String.fromCharCode(10) + '}', d));
  assert.ok(puce.includes("<Fi i={v.playing ? 'pause' : 'play'} size={14} />"), 'lecture / pause à 14 px');
  const c = app.indexOf('function RoomMediaCard(');
  const carte = app.slice(c, app.indexOf(String.fromCharCode(10) + '}', c));
  assert.ok(!carte.includes('angle-double-left') && !carte.includes('angle-double-right'), 'précédent et suivant sont dans la popup (M2 A)');
  assert.ok(!carte.includes('>«<') && !carte.includes('>»<') && !puce.includes('>«<'), 'plus de guillemets en guise de flèches');
});

// ─────────────────────────────────────────────────────────────────────────────
// V2 (chantier Volets, tâche 13) : un volet se règle dans sa fiche.
// ─────────────────────────────────────────────────────────────────────────────

test('V2 : Règles › Volets ne règle plus un volet à la fois, une ligne dit où c’est', () => {
  for (const parti of ["tr('Volet par volet')", "tr('Où donne chaque volet')", "setPicker({ domaines: ['binary_sensor']", 'const CARDINAUX = () => [']) {
    assert.ok(!src.includes(parti), 'revenu dans Règles › Volets : ' + parti);
  }
  assert.ok(src.includes("{tr('Chaque volet se règle dans sa popup : ses heures, sa façade, la porte devant lui.')}"), 'la ligne qui dit où c’est');
  // Ce qui reste : la maison (§ 8 de la conception).
  // Le mode, lui, n'y a plus de commande (décision du 19/10) : il s'y dit, il
  // se choisit dans la popup et dans la vue « modes et planning ».
  assert.ok(!src.includes("enregistrer({ planning: { mode: id } })"), 'le mode se commande encore dans Paramètres');
  for (const reste of ["enregistrer({ planning: { actif: !plan.actif } })", "enregistrer({ soleil: { temp_min: n } })",
    "enregistrer({ baies: { actif: !baies.actif } })", "enregistrer({ verification: { tentatives: n } })", 'Ouvrants sans classe dans Home Assistant']) {
    assert.ok(src.includes(reste), 'parti de Règles › Volets : ' + reste);
  }
});
