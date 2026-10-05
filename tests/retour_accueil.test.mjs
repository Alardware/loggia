// Le retour à l'accueil après inactivité (05/10).
//
// Sur une tablette murale, une fiche laissée ouverte y reste jusqu'au prochain
// passage. Passé le délai, les feuilles se ferment et la vue revient à
// l'Accueil. Coupé par défaut, réglé par appareil.
//
// Rien ne se teste à l'écran ici : on relit les sources, comme les autres
// tests de branchement de l'Accueil.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const APP = lire('src', 'App.jsx');
const UI = lire('src', 'ui.jsx');
const PAR = lire('src', 'views', 'parametres.jsx');

test('une seule ligne ferme TOUTES les feuilles, d’où qu’elles viennent', () => {
  /* Les feuilles naissent dans une dizaine d'endroits — `useDomainCards`, les
   * vues, les cartes du rail — sans ancêtre commun qui pourrait les fermer
   * ensemble. Chacune s'auto-ferme donc sur un événement nommé : écrire une
   * feuille de plus demain ne demandera rien. */
  assert.ok(UI.includes("export const FERMER_TOUT = 'loggia:fermer-feuilles';"),
    'le nom de l’événement est public : App.jsx l’émet, BottomSheet l’écoute');
  assert.ok(UI.includes('window.addEventListener(FERMER_TOUT, surFermer);'),
    'chaque feuille montée écoute');
  assert.ok(UI.includes('return () => window.removeEventListener(FERMER_TOUT, surFermer);'),
    'et se désabonne — sinon une feuille fermée resterait branchée');
  assert.ok(APP.includes('window.dispatchEvent(new Event(FERMER_TOUT));'), 'l’Accueil l’émet');
  assert.ok(/import \{[^}]*FERMER_TOUT[^}]*\} from '\.\/ui\.jsx';/s.test(APP), 'importé, pas recopié');
});

test('le minuteur : coupé par défaut, par appareil, et il ne compte que les GESTES', () => {
  assert.ok(APP.includes("localStorage.getItem('loggia-retour') || '0'"),
    'coupé par défaut, et retenu par appareil comme la veille');
  assert.ok(APP.includes("localStorage.setItem('loggia-retour', String(min))"));
  assert.ok(APP.includes("const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart'];"),
    'un geste réarme ; un changement d’état de la maison n’est pas un geste — sinon le délai ne s’écoulerait jamais');
  assert.ok(APP.includes('t = setTimeout(sonne, retourAcc * 60000);'), 'le réglage est en minutes');
  assert.ok(APP.includes('if (!retourAcc) return undefined;'), 'à zéro, aucun minuteur n’est armé');
  assert.ok(APP.includes('}, [retourAcc]);'), 'seul le délai relance l’effet');
});

test('une saisie en cours ne se fait pas couper sous les doigts', () => {
  assert.ok(APP.includes("if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;"),
    'un formulaire à moitié rempli ne doit pas disparaître');
  /* Et le délai repart : sans ce `arme()` après coup, le minuteur ne sonnerait
   * plus jamais une fois le champ quitté. */
  assert.ok(APP.includes('const sonne = () => { retourRef.current(); arme(); };'),
    'qu’il ait fermé ou renoncé, le tour suivant est armé');
});

test('le réglage vit dans Paramètres, à côté de la veille — et n’est pas grisé par elle', () => {
  assert.ok(PAR.includes("<OptRow title={tr('Retour à l’accueil')}"), 'sa ligne existe');
  assert.ok(!/<OptRow[^>]*eteint=\{!veille\}[^>]*title=\{tr\('Retour à l’accueil'\)\}/.test(PAR),
    'la veille MASQUE, celui-ci RANGE : on peut vouloir l’un sans l’autre');
  assert.ok(PAR.includes("opts={[['0', tr('Off')], ['1', '1 min'], ['2', '2 min'], ['5', '5 min'], ['10', '10 min'], ['30', '30 min']]}"),
    'les six délais, « Off » en premier');
  // La valeur traverse App → ParametresView → ParametresContent sans se perdre.
  assert.ok(APP.includes('retourAcc={retourAcc} onRetourAcc={onRetourAcc}'), 'passée à la vue');
  assert.ok(PAR.includes('retourAcc = 0, onRetourAcc,'), 'et reçue par le contenu');
});
