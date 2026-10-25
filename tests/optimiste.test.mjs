// ─────────────────────────────────────────────────────────────────────────────
// Un etat optimiste qui EXPIRE, et un volet qui bute a 1 % (v3.77.0, ADR 0105).
//
// Retour du 27/09 : « si je ferme mes volets et que je change de page et que je
// revien la carte est ouvert alors que le volet est bien ferme, meme chose pour
// la lumieres et surement d'autre », puis « je ne comprend pas pourquoi celui
// de la chambre reste a 1% quand il se ferme ».
//
// Deux defauts, une meme famille :
//
// 1. Une carte montre tout de suite ce qu'on vient de lui demander, sans
//    attendre Home Assistant. Ce mensonge utile ne se vidait que si l'etat REEL
//    bougeait. Quand il ne bouge jamais — commande refusee, volet qui bute,
//    echo Zigbee — il tenait indefiniment, et SEUL un changement de page le
//    revelait : le composant mourait, l'etat optimiste avec lui. L'utilisateur
//    croyait que le retour mentait, alors que c'etait l'affichage d'avant.
//
// 2. « Ferme » ne se disait que pour `pos === 0`. Un volet qui bute a 1 % etait
//    donc dessine OUVERT : lavis violet, icone violette, « Ouvert a 1 % ».
//
// Ce fichier tient les deux dans les DEUX sens : le filet existe partout, et
// plus personne ne tranche « ferme » sur un zero pile.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('src', 'App.jsx') + lire('src', 'views', 'voletsplan.jsx'); // App.jsx + la vue « modes et planning », chargée à la demande depuis le 19/10 (borne du boot).
const VOL = lire('src', 'views', 'volets.jsx');
const PAR = lire('src', 'views', 'parametres.jsx');
const OPT = lire('src', 'optimiste.js');
const ECR = lire('src', 'voletecran.js');
/* Le filet lit TOUT `src/`, vues comprises (lot 15 de l'audit du 03/10) : il
 * ne lisait qu'App.jsx, et Paramètres tenait ses automatisations hors de sa
 * vue — dans un état qui n'expirait pas. Les langues sont des catalogues. */
const parcourir = (rep, out = []) => {
  for (const n of readdirSync(rep)) {
    const p = join(rep, n);
    if (statSync(p).isDirectory()) parcourir(p, out); else if (/\.(js|jsx)$/.test(n)) out.push(p);
  }
  return out;
};
const SOURCES = parcourir(join(RACINE, 'src')).filter(p => !/[\\/]langues[\\/]/.test(p))
  .map(p => [p.slice(RACINE.length + 1).split('\\').join('/'), readFileSync(p, 'utf8').replace(/\r\n/g, '\n')]);
const TOUT = SOURCES.map(([, t]) => t).join('\n');
const compter = (s, motif) => s.split(motif).length - 1;

test('le filet de securite est un SEUL mecanisme, et il expire', () => {
  // Son propre module depuis le lot 15 de l'audit du 03/10 : les vues l'importent.
  assert.ok(OPT.includes('export function useOptimiste(reel, delai = OPTIMISTE_MS) {'), 'le hook a change de forme');
  const i = OPT.indexOf('export function useOptimiste(');
  const hook = OPT.slice(i, OPT.indexOf('\n}\n', i));
  // Le minuteur : sans lui, un etat reel qui ne bouge jamais fige l'affichage.
  assert.match(hook, /minuteur\.current = setTimeout\(\(\) => setOv\(null\), delai\)/,
    'l’etat optimiste ne s’efface plus tout seul : un affichage faux tiendrait jusqu’au changement de page');
  /* L'etat reel reste prioritaire : quand la maison repond, on la croit. Mais
   * « je ne sais pas » n'est PAS une reponse (01/10) : une carte de piece rend
   * `null` quand la liste de ses plafonniers se vide un instant, et l'optimiste
   * se faisait jeter — la bascule retombait sur eteint, puis remontait seule.
   * Repete, cela la fait clignoter pendant que la lampe, elle, ne bouge pas. */
  assert.match(hook, /if \(reel == null\) return;/,
    'un etat reel inconnu vide de nouveau l’optimiste');
  assert.ok(hook.includes('clearTimeout(minuteur.current); setOv(null);'),
    'l’etat reel ne vide plus l’etat optimiste');

  /* Et les deux gabarits de carte de piece laissent l'optimiste PASSER DEVANT :
   * sans cela, le correctif du hook ne servirait a rien chez elles — elles
   * retombaient sur un compteur de lampes qui, liste vide, dit zero. */
  assert.equal(compter(APP, 'ov != null ? ov : (realOn != null ? realOn : n > 0)'), 2,
    'une carte de piece retombe sur son compteur avant de regarder l’optimiste');
  // Et le minuteur meurt avec la carte, sinon il ecrit dans un composant demonte.
  assert.ok(hook.includes('useEffect(() => () => clearTimeout(minuteur.current), []);'), 'le minuteur survit au demontage');
});

test('plus aucune carte ne tient son propre etat optimiste', () => {
  // La recette d'avant, recopiee dans quatorze cartes : elle ne doit plus
  // exister nulle part, sinon le defaut revient par la fenetre.
  // Partout dans src/, vues comprises (lot 15 de l'audit du 03/10).
  assert.equal(compter(TOUT, 'useEffect(() => { setOv(null); }'), 0, 'un clear fait main est revenu');
  for (const setter of ['setOvOn', 'setOvBri', 'setOvVol', 'setVolOv', 'setOvPortion', 'setLevelLocal', 'setAutoOv']) {
    assert.equal(compter(TOUT, 'useEffect(() => { ' + setter + '(null); }'), 0, setter + ' garde son clear fait main');
  }
  // Les deux minuteurs faits main (lampe, tuile piece) sont partis avec.
  assert.equal(compter(TOUT, 'ovRevertRef'), 0, 'le filet fait main de la lampe est revenu');
  assert.equal(compter(TOUT, 'ovBriRef'), 0, 'le filet fait main de la luminosite est revenu');
  // Et tout le monde passe par le hook : au moins un par famille touchee.
  assert.ok(compter(APP, 'useOptimiste(') >= 18, 'des cartes ont perdu leur filet');
});

test('aucune signature ne lit une valeur declaree APRES elle', () => {
  /* Le defaut que ce test existe pour empecher, et qui EST PARTI EN v3.77.0.
   *
   * La conversion des dix-huit etats optimistes a ete faite par un script :
   * il a pose `useOptimiste(sig)` sur la ligne de DECLARATION, alors que le
   * `useEffect` qu'il remplacait venait APRES les valeurs qu'il lisait. Trois
   * signatures se sont retrouvees au-dessus de leur propre dependance —
   * `etatSt` deux fois, `valeurPortion` une —, ce qui donne une zone morte
   * temporelle : « Cannot access 'etatSt' before initialization », et la vue
   * Objets tombait dans le garde-fou d'erreur des qu'une carte de chauffage
   * s'affichait.
   *
   * NI le lint NI les tests ne l'ont vu : `const` hisse sa declaration sans
   * l'initialiser, donc la syntaxe est valide et les tests lisent du TEXTE.
   * Seul l'ecran l'a dit. Ce test met ce regard-la dans la suite. */
  // Tout src/ : Paramètres et les vues posent leurs signatures eux aussi
  // (lot 15 de l'audit du 03/10).
  const fautes = [];
  for (const [chemin, texte] of SOURCES) {
    const lignes = texte.split('\n');
    for (let i = 0; i < lignes.length; i++) {
      const m = lignes[i].match(/useOptimiste\(([^;]*)\);/);
      if (!m) continue;
      // `z.target` lit une PROPRIETE : le `target` local d'apres est un autre nom.
      const sig = m[1].replace(/\.\w+/g, '');
      const noms = new Set((sig.match(/\b[a-zA-Z_]\w*\b/g) || [])
        .filter(n => ['join', 'true', 'false', 'null', 'undefined'].indexOf(n) < 0));
      for (const nom of noms) {
        for (let k = i + 1; k < Math.min(i + 80, lignes.length); k++) {
          if (/^(export )?function /.test(lignes[k])) break;
          if (new RegExp('^\\s*const ' + nom + '\\b').test(lignes[k])) {
            fautes.push(chemin + ' l.' + (i + 1) + ' lit « ' + nom + ' », déclaré l.' + (k + 1));
            break;
          }
        }
      }
    }
  }
  assert.deepEqual(fautes, [],
    'une signature d’état optimiste lit une valeur déclarée plus bas : le composant lèvera ' +
    '« Cannot access … before initialization » au rendu — ' + fautes.join(' ; '));
});

test('la luminosite garde sa fenetre courte : 4 s, pas 6', () => {
  // L'echo Zigbee rejoue l'ancienne valeur ; attendre six secondes ferait
  // revenir la vieille luminosite sous le doigt.
  // ASSERTION MODIFIÉE (chantier Lumières, tâche 5) : la carte d'une lumière lit sa luminosité par `luminosite` (lumieres.js) ; la fenêtre reste de 4 s.
  // ASSERTION MODIFIÉE (audit du 19/10, seconde tranche, B2) : l'avance est PARTAGÉE entre la carte et la fiche (`poserPartage`) ; 4 s, et l'état réel la lève en atteignant la valeur (B3).
  assert.ok(APP.includes("const poserBri = (pct) => poserPartage(CLE_LUMINOSITE(id), pct, { reel: lue, change: st ? st.last_updated : null, filet: 4000, cible: pct });"), 'la fenetre de la luminosite a change');
  assert.ok(OPT.includes('const OPTIMISTE_MS = 6000;'), 'le delai commun a change');
});

/* ASSERTIONS MODIFIÉES (chantier Volets, tâche 1, V12) : le verdict quitte
 * App.jsx pour voletecran.js, que la fiche du volet — chargée à la demande —
 * lit aussi ; le seuil n'est plus un réglage, il vaut 2 %. Les cas chiffrés
 * sont dans tests/voletecran.test.mjs. */
test('« ferme » ne se tranche plus sur un zero pile', () => {
  assert.ok(ECR.includes('export function coverFerme(st, pos) {'), 'le verdict a change de forme');
  const i = ECR.indexOf('export function coverFerme(');
  const f = ECR.slice(i, ECR.indexOf('\n}\n', i));
  // Home Assistant fait autorite quand il dit `closed` : Loggia le contredisait.
  assert.ok(f.includes("if (st && st.state === 'closed') return true;"), 'l’etat de Home Assistant n’est plus l’autorite');
  assert.ok(f.includes('return pos <= SEUIL_FERME;'), 'le seuil ne sert plus a trancher');
  // Aux deux bouts : 99 % est « Ouvert », pas « Ouvert a 99 % ».
  assert.ok(ECR.includes('export const coverOuvert = (pos) => pos >= 100 - SEUIL_FERME;'), 'la butee haute a disparu');
  assert.ok(ECR.includes('export const SEUIL_FERME = 2;'), 'le seuil n’est plus fixe a 2 %');
  // L'import grandit avec les tâches suivantes (la carte y ajoute ses noms) : il se lit par motif.
  assert.ok(/import \{[^}]*\bcoverFerme\b[^}]*\bcoverOuvert\b[^}]*\} from '\.\/voletecran\.js';/.test(APP), 'App.jsx a de nouveau son propre verdict');
});

test('tout ce qui dit l’etat d’un volet passe par le meme verdict', () => {
  // Les cinq marques de la carte : lavis, icone, pourcentage, sous-titre, mot.
  assert.ok(APP.includes('...(!ferme && LAVIS ? {'), 'le lavis violet retombe sur la position brute');
  assert.ok(APP.includes("...RM_ICO(!ferme ? 'rgba(var(--o-purple-rgb),.16)' : 'var(--o-s1)', !ferme ? 'var(--o-purple)' : 'var(--o-text3)')"), 'l’icone retombe sur la position brute');
  assert.ok(APP.includes("color: ferme ? 'var(--o-text3)' : 'var(--o-text)' }}>{pos} %"), 'le pourcentage retombe sur la position brute');
  assert.ok(APP.includes("color: !ferme && !mort ? 'var(--o-purple)' : 'var(--o-text3)' }}>{sub}"), 'le sous-titre retombe sur la position brute');
  assert.ok(APP.includes("ferme ? tr('Fermé') : coverOuvert(pos) ? tr('Ouvert') : tr('Ouvert à {n} %', { n: pos })"), 'la carte ne dit plus « Fermé » sur le verdict');
  // La feuille, sa puce, la pastille de la piece et le compte de la vue.
  assert.ok(APP.includes("const etatTxt = ferme ? tr('Fermé') : coverOuvert(pos) ? tr('Ouvert') : tr('Ouvert à {n} %', { n: pos });"), 'la feuille du volet');
  assert.ok(APP.includes("const chip = ferme ? 'ferme' : coverOuvert(pos) ? 'ouvert' : pos === 50 ? 'mi' : null;"), 'la puce de la feuille');
  assert.ok(APP.includes('return !coverFerme(st, p != null ? Math.round(p) : '), 'la pastille de la tuile piece');
  // Les volets seulement, et un volet muet n'est pas « ouvert » (audit du 19/10).
  assert.ok(APP.includes('const openCount = volets.filter(c => !estMuetVolet(S[c.haid]) && !coverFerme(S[c.haid], c.pos)).length;'), 'le compte « n ouverts » de la vue Volets');
  // Plus aucun « pos === 0 » ni « pos > 0 » pour dire l'etat d'un volet.
  assert.equal(compter(APP, 'pos === 0 ?'), 0, 'un test sur un zero pile est revenu');
  assert.equal(compter(APP, 'pos > 0 &&'), 0, 'un test sur une position brute est revenu');
});

/* TEST RÉÉCRIT (chantier Volets, tâche 1, V12) : « le seuil se règle, et il
 * se règle dans la page des volets » — c'était l'inverse de sa demande du
 * 12/10 : « tu peux le retirer des réglages d'ailleurs ». */
test('le seuil n’est plus un réglage : ni dans la page des volets, ni dans la configuration (V12)', () => {
  assert.ok(!VOL.includes('VoletsAffichage') && !VOL.includes('const SEUILS = '), 'le réglage du seuil est revenu');
  assert.ok(!PAR.includes('VoletsAffichage'), 'Paramètres rend encore le réglage du seuil');
  for (const [f, s] of [['App.jsx', APP], ['views/volets.jsx', VOL], ['voletecran.js', ECR]]) {
    assert.ok(!/cfgVal\('loggia_coverseuil'|loggia_coverseuil:/.test(s), f + ' lit ou écrit encore le seuil réglable');
  }
});

/* TEST AJOUTÉ (passe bis 2 du 18/10, point N) : la règle « tout état optimiste passe par optimiste.js » tient À LA LETTRE. Le geste
 * d'un robot vivait dans un magasin à lui (robotsetat.js) : une exception. Il passe par la variante PARTAGÉE de ce module — une
 * avance par CLÉ, pour tout l'écran (la carte large, l'étroite, la compacte, la popup, la fiche universelle d'un robot), au même
 * contrat que `useOptimiste` :
 *  - elle EXPIRE : son filet passé, l'état réel reprend la main, quoi qu'il arrive ;
 *  - l'état réel la lève dès qu'il RÉPOND — sa signature n'est plus celle de l'appui, ou son `last_changed` a avancé — et c'est
 *    ACQUIS : elle ne se réarme pas si la maison revient à l'état d'avant (point G) ; un relevé plus VIEUX que l'appui ne compte pas ;
 *  - une TENUE minimale : quoi qu'il arrive, elle tient ce temps-là (deux appuis d'un doigt qui hésite) ;
 *  - une GARDE, tant qu'une réponse est attendue (un départ par le serveur), bornée ; relâchée, le filet repart de là (point E) ;
 *  - un refus n'oublie que SON avance, jamais celle qui l'a remplacée (point F) ;
 *  - lue au moment même : un second appui la voit avant le prochain rendu. */
test('la variante partagée : elle expire, l’état réel reprend la main — une fois pour toutes —, tenue, garde, oubli', async () => {
  const O = await import('../src/optimiste.js');
  const h = { t: 1000, taches: new Map(), n: 0 };
  Object.assign(h, {
    maintenant: () => h.t, plusTard: (f, ms) => { const id = ++h.n; h.taches.set(id, { f, a: h.t + ms }); return id; }, annuler: (id) => h.taches.delete(id),
    avancer(ms) { h.t += ms; for (const [id, x] of [...h.taches].sort((a, b) => a[1].a - b[1].a)) if (x.a <= h.t) { h.taches.delete(id); x.f(); } },
  });
  O.reglerPartage({ horloge: h });
  const T0 = '2026-10-17T16:40:00.000Z', AVANT = '2026-10-17T16:39:00.000Z', APRES = '2026-10-17T16:41:00.000Z';
  const opts = { filet: 7000, tenue: 1500 };
  let vus = 0;
  const cesser = O.ecouterPartage('robot:a', () => { vus += 1; });
  const lire = (reel, change = T0, cle = 'robot:a') => O.lirePartage(cle, { reel, change });
  // Posée : lue tout de suite, pour cette clé seulement ; une réponse de la maison PENDANT la tenue ne la lève pas.
  const j1 = O.poserPartage('robot:a', { mot: 'Pause' }, { reel: 'travail', change: T0, ...opts });
  assert.deepEqual(lire('travail'), { mot: 'Pause' });
  assert.equal(lire('travail', T0, 'robot:b'), null, 'cette clé seulement');
  assert.deepEqual(lire('pause'), { mot: 'Pause' }, 'la maison répond tout de suite : la tenue la garde 1,5 s');
  assert.equal(vus, 1);
  h.avancer(1500);
  assert.equal(lire('pause'), null, 'répondu, la tenue passée : l’état réel reprend la main');
  assert.equal(lire('travail'), null, 'ACQUIS : la maison revient à l’état d’avant, l’avance ne se réarme pas (point G)');
  assert.equal(O.brutPartage('robot:a'), null, 'répondue et sa tenue passée : elle s’en va du magasin');
  // Le `last_changed` : un relevé plus vieux que l'appui ne répond pas ; un `last_changed` qui avance, si.
  O.poserPartage('robot:a', { mot: 'Pause' }, { reel: 'travail', change: T0, ...opts });
  h.avancer(1500);
  assert.ok(lire('base', AVANT), 'un relevé d’avant l’appui ne compte pas');
  assert.ok(lire('travail', T0), 'rien n’a répondu : elle tient');
  assert.equal(lire('travail', APRES), null, '`last_changed` a avancé : Home Assistant a répondu');
  assert.equal(lire('travail', T0), null, 'et c’est acquis');
  // Le filet : sans réponse, elle tient jusqu'à lui, puis s'en va.
  O.poserPartage('robot:a', { mot: 'Pause' }, { reel: 'travail', change: T0, ...opts });
  h.avancer(6999);
  assert.ok(lire('travail'));
  h.avancer(1);
  assert.equal(lire('travail'), null, 'le filet passé : la maison fait foi');
  assert.equal(O.brutPartage('robot:a'), null);
  // La garde (un départ par le serveur, point E) : elle tient au-delà du filet tant que la réponse n'est pas venue, bornée ; relâchée,
  // le filet repart de là.
  const j2 = O.poserPartage('robot:a', { mot: 'Démarrer' }, { reel: 'base', change: T0, ...opts, garde: 30000 });
  h.avancer(7100);
  assert.ok(lire('base'), 'au-delà de 7 s : la réponse du serveur n’est pas venue');
  O.relacherPartage('robot:a', j1);
  assert.ok(lire('base'), 'relâcher l’avance d’un AUTRE geste ne change rien');
  O.relacherPartage('robot:a', j2);
  h.avancer(6999);
  assert.ok(lire('base'));
  h.avancer(1);
  assert.equal(lire('base'), null, 'relâchée : le filet, compté depuis la réponse');
  O.poserPartage('robot:a', { mot: 'Démarrer' }, { reel: 'base', change: T0, ...opts, garde: 30000 });
  h.avancer(29999);
  assert.ok(lire('base'));
  h.avancer(1);
  assert.equal(lire('base'), null, 'jamais relâchée : bornée quand même');
  // Un refus n'oublie que SON avance (point F) : un refus tardif ne fait pas tomber le geste qui l'a remplacée.
  const vieux = O.poserPartage('robot:a', { mot: 'Démarrer' }, { reel: 'base', change: T0, ...opts });
  const neuf = O.poserPartage('robot:a', { mot: 'Pause' }, { reel: 'travail', change: T0, ...opts });
  O.oublierPartage('robot:a', vieux);
  assert.deepEqual(lire('travail'), { mot: 'Pause' }, 'le refus tardif du départ laisse la pause');
  O.oublierPartage('robot:a', neuf);
  assert.equal(lire('travail'), null, 'son propre refus la fait tomber');
  assert.equal(O.oublierPartage('robot:a', undefined), undefined, 'sans jeton, rien ne tombe');
  cesser();
  O.reglerPartage({});
  assert.equal(h.taches.size, 0, 'ses minuteurs partent avec elle');
});

/* TEST AJOUTÉ (audit du 19/10, seconde tranche ; B3) : un ordre plus récent ne doit pas être effacé par l'écho d'un ordre
 * plus ancien. Allumée → appui (off) → appui (on) : la réponse « off » du premier ordre effaçait l'avance « on » du second,
 * et la carte disait « éteinte » le temps d'un relevé. Avec `cible`, l'état réel ne répond qu'en ATTEIGNANT la valeur
 * demandée — l'idée de `useDemandes` (l'écho d'un ordre remplacé n'est pas une réponse). Même chose pour le chiffre pendant
 * un fondu : les paliers (48) ne font pas sauter le 60 posé sous le doigt. */
test('la variante partagée avec `cible` : l’écho d’un ordre plus ancien ne lève pas l’avance ; la valeur atteinte, si ; le filet sinon', async () => {
  const O = await import('../src/optimiste.js');
  const h = { t: 1000, taches: new Map(), n: 0 };
  Object.assign(h, {
    maintenant: () => h.t, plusTard: (f, ms) => { const id = ++h.n; h.taches.set(id, { f, a: h.t + ms }); return id; }, annuler: (id) => h.taches.delete(id),
    avancer(ms) { h.t += ms; for (const [id, x] of [...h.taches].sort((a, b) => a[1].a - b[1].a)) if (x.a <= h.t) { h.taches.delete(id); x.f(); } },
  });
  O.reglerPartage({ horloge: h });
  const T0 = '2026-10-19T16:40:00.000Z', T1 = '2026-10-19T16:40:01.000Z', T2 = '2026-10-19T16:40:02.000Z';
  const lire = (reel, change) => O.lirePartage('lumiere:a', { reel, change });
  // Allumée (T0) → appui : off → appui : on, avant toute réponse.
  O.poserPartage('lumiere:a', false, { reel: 'on', change: T0, filet: 6000, cible: 'off' });
  O.poserPartage('lumiere:a', true, { reel: 'on', change: T0, filet: 6000, cible: 'on' });
  assert.equal(lire('on', T0), true, 'le second appui se voit');
  assert.equal(lire('off', T1), true, 'l’écho du PREMIER ordre (off, `last_changed` avancé) n’est pas une réponse au second : la carte reste allumée');
  assert.equal(lire('on', T2), null, 'la lampe atteint la valeur demandée : l’état réel reprend la main');
  assert.equal(lire('off', T2), null, 'et c’est acquis');
  // Sans réponse qui atteigne la cible, le filet : la maison fait foi.
  O.poserPartage('lumiere:a', true, { reel: 'off', change: T0, filet: 6000, cible: 'on' });
  h.avancer(5999);
  assert.equal(lire('off', T1), true, 'un relevé qui n’atteint pas la cible ne compte pas, même après une réponse');
  h.avancer(1);
  assert.equal(lire('off', T1), null, 'le filet passé');
  // Le chiffre pendant un fondu : 40 → 60 demandé ; les paliers 48, 55 ne font pas sauter le 60 ; 60 atteint, l'état réel reprend.
  O.poserPartage('lumiere:bri:a', 60, { reel: 40, change: T0, filet: 4000, cible: 60 });
  assert.equal(O.lirePartage('lumiere:bri:a', { reel: 48, change: T1 }), 60);
  assert.equal(O.lirePartage('lumiere:bri:a', { reel: 55, change: T2 }), 60);
  assert.equal(O.lirePartage('lumiere:bri:a', { reel: 60, change: T2 }), null);
  // Sans `cible`, rien ne change pour les robots : toute réponse lève l'avance (le test d'au-dessus le tient en détail).
  O.poserPartage('robot:a', { mot: 'Pause' }, { reel: 'travail', change: T0, filet: 7000 });
  assert.equal(O.lirePartage('robot:a', { reel: 'pause', change: T1 }), null);
  O.reglerPartage({});
});

test('la variante partagée reste légère : elle vit dans le démarrage', () => {
  const debut = OPT.indexOf('/* ── La variante PARTAGÉE');
  assert.ok(debut > 0, 'la variante partagée a quitté optimiste.js');
  // Pas d'autre import que React : le démarrage n'en porte rien de plus.
  assert.deepEqual([...OPT.matchAll(/^import .* from '([^']+)';$/gm)].map(m => m[1]), ['react']);
  assert.ok(OPT.length - debut < 7000, 'la variante partagée a grossi : ' + (OPT.length - debut) + ' caractères');
  // Le geste d'un robot passe par elle, plus par un magasin à lui (robotsetat.js).
  const RE = lire('src', 'robotsetat.js');
  assert.ok(/from '\.\/optimiste\.js'/.test(RE), 'robotsetat.js ne passe plus par optimiste.js');
  assert.ok(!/publierGestes|minuteursGestes|let gestes\b/.test(RE), 'robotsetat.js tient de nouveau son propre état optimiste');
});

test('une vue surveille ce qu’elle COMMANDE, pas seulement ses spécialités', () => {
  /* Mesure du 01/10, sur l'installation réelle, avec un observateur posé sur la
   * bascule : même nœud du début à la fin (donc aucun remontage de React), et
   * l'état repasse à « éteint » **6 007 ms** après l'appui — le minuteur
   * d'`useOptimiste` à la milliseconde près.
   *
   * Cause : `useHass` ne redessine que si la signature d'une LISTE d'entités
   * surveillées bouge. La vue Objets montre tous les appareils et n'en
   * surveillait que cinq familles. Basculer une lampe ne changeait donc rien :
   * le parent ne se redessinait pas, la carte gardait l'objet `hass` d'avant la
   * commande, et son propre minuteur la redessinait SEULE avec cet état périmé.
   *
   * `sensor.` et `binary_sensor.` restent volontairement dehors : ils jitterent
   * en continu. Une mesure en retard ne ment pas ; une bascule, si. */
  const i = APP.indexOf('const VIEW_HAKEYS');
  const bloc = APP.slice(i, APP.indexOf('\n  };', i));
  const ligne = bloc.slice(bloc.indexOf('objets:'), bloc.indexOf('securite:'));
  for (const d of ['light.', 'switch.', 'cover.', 'climate.', 'media_player.']) {
    assert.ok(ligne.includes("'" + d + "'"), 'la vue Objets ne suit plus ' + d + ' : ses bascules mentiront 6 s');
  }
  assert.ok(!ligne.includes("'sensor.'") && !ligne.includes("'binary_sensor.'"),
    'un domaine qui jitte est revenu dans la liste : tout l’écran se redessinerait toutes les 2 s');
});
