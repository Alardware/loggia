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
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('src', 'App.jsx');
const VOL = lire('src', 'views', 'volets.jsx');
const PAR = lire('src', 'views', 'parametres.jsx');
const compter = (s, motif) => s.split(motif).length - 1;

test('le filet de securite est un SEUL mecanisme, et il expire', () => {
  assert.ok(APP.includes('function useOptimiste(reel, delai = OPTIMISTE_MS) {'), 'le hook a change de forme');
  const i = APP.indexOf('function useOptimiste(');
  const hook = APP.slice(i, APP.indexOf('\n}\n', i));
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
  assert.equal(compter(APP, 'useEffect(() => { setOv(null); }'), 0, 'un clear fait main est revenu');
  for (const setter of ['setOvOn', 'setOvBri', 'setOvVol', 'setVolOv', 'setOvPortion']) {
    assert.equal(compter(APP, 'useEffect(() => { ' + setter + '(null); }'), 0, setter + ' garde son clear fait main');
  }
  // Les deux minuteurs faits main (lampe, tuile piece) sont partis avec.
  assert.equal(compter(APP, 'ovRevertRef'), 0, 'le filet fait main de la lampe est revenu');
  assert.equal(compter(APP, 'ovBriRef'), 0, 'le filet fait main de la luminosite est revenu');
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
  const lignes = APP.split('\n');
  const fautes = [];
  for (let i = 0; i < lignes.length; i++) {
    const m = lignes[i].match(/useOptimiste\(([^;]*)\);/);
    if (!m) continue;
    // `z.target` lit une PROPRIETE : le `target` local d'apres est un autre nom.
    const sig = m[1].replace(/\.\w+/g, '');
    const noms = new Set((sig.match(/\b[a-zA-Z_]\w*\b/g) || [])
      .filter(n => ['join', 'true', 'false', 'null', 'undefined'].indexOf(n) < 0));
    for (const nom of noms) {
      for (let k = i + 1; k < Math.min(i + 80, lignes.length); k++) {
        if (/^function /.test(lignes[k])) break;
        if (new RegExp('^\\s*const ' + nom + '\\b').test(lignes[k])) {
          fautes.push('l.' + (i + 1) + ' lit « ' + nom + ' », déclaré l.' + (k + 1));
          break;
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
  assert.ok(APP.includes('const [ovBri, setOvBri] = useOptimiste(bri, 4000);'), 'la fenetre de la luminosite a change');
  assert.ok(APP.includes('const OPTIMISTE_MS = 6000;'), 'le delai commun a change');
});

test('« ferme » ne se tranche plus sur un zero pile', () => {
  assert.ok(APP.includes('function coverFerme(st, pos) {'), 'le verdict a change de forme');
  const i = APP.indexOf('function coverFerme(');
  const f = APP.slice(i, APP.indexOf('\n}\n', i));
  // Home Assistant fait autorite quand il dit `closed` : Loggia le contredisait.
  assert.ok(f.includes("if (st && st.state === 'closed') return true;"), 'l’etat de Home Assistant n’est plus l’autorite');
  assert.ok(f.includes('return pos <= coverSeuil();'), 'le seuil ne sert plus a trancher');
  // Aux deux bouts : 99 % est « Ouvert », pas « Ouvert a 99 % ».
  assert.ok(APP.includes('const coverOuvert = (pos) => pos >= 100 - coverSeuil();'), 'la butee haute a disparu');
  // Le seuil est borne : une valeur aberrante ne doit pas fermer un volet ouvert.
  const s = APP.slice(APP.indexOf('function coverSeuil()'), APP.indexOf('function coverFerme('));
  assert.ok(s.includes('n >= 0 && n <= 20'), 'le seuil n’est plus borne');
  assert.ok(s.includes("cfgVal('loggia_coverseuil', COVER_SEUIL_DEF)"), 'le seuil ne se lit plus dans la configuration');
  assert.ok(APP.includes('const COVER_SEUIL_DEF = 2;'), 'le defaut du seuil a change');
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
  assert.ok(APP.includes('const openCount = covers.filter(c => !coverFerme(S && S[c.haid], c.pos)).length;'), 'le compte « n ouverts » de la vue Volets');
  // Plus aucun « pos === 0 » ni « pos > 0 » pour dire l'etat d'un volet.
  assert.equal(compter(APP, 'pos === 0 ?'), 0, 'un test sur un zero pile est revenu');
  assert.equal(compter(APP, 'pos > 0 &&'), 0, 'un test sur une position brute est revenu');
});

test('le seuil se regle, et il se regle dans la page des volets', () => {
  assert.ok(VOL.includes('export function VoletsAffichage({ cardSt })'), 'le reglage a disparu');
  assert.ok(VOL.includes('const SEUILS = [0, 1, 2, 5];'), 'les choix du seuil ont change');
  // La puce choisie : bleu plein, texte blanc — la norme de « Séjour ».
  assert.ok(VOL.includes("background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)'"), 'la puce choisie ne suit plus la norme');
  // Le defaut ne s'ecrit pas : une configuration propre ne porte que les choix.
  assert.ok(VOL.includes('cfgSet({ loggia_coverseuil: n === SEUIL_DEF ? null : n })'), 'le defaut s’ecrirait dans la configuration');
  // Un miroir React, sinon la puce ne s'allume qu'au prochain rendu venu d'ailleurs.
  assert.ok(VOL.includes('const [seuil, setSeuil] = useState(lireSeuil);'), 'la puce choisie ne se redessine plus');
  // Et il est JOIGNABLE : branche dans la page, pas seulement exporte.
  assert.ok(PAR.includes('import { VoletsReglages, VoletsAffichage }'), 'le reglage n’est plus importe');
  assert.ok(PAR.includes('<VoletsAffichage cardSt={cardSt} />'), 'le reglage n’est plus rendu');
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
