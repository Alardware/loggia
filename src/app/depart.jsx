/* La feuille « Avant de partir » (04/11, étape 2 du rapport sur l'usage),
 * et « Avant de dormir » pour « Bonne nuit », sur le même modèle (05/11,
 * étape 4) : ce qui restera ouvert, puis ce que le scénario fera.
 * La règle vit dans `depart.js` ; ici, ce que le démarrage en garde : la
 * liste des scénarios qui regardent d'abord, ce qui restera ouvert, et la
 * coquille de la feuille. La feuille elle-même se charge à la demande
 * (`departfeuille.jsx`, chantier du 20/11, lot 6 ; ADR 0386) :
 * elle ne s'ouvre que sur un geste. */
import { Suspense } from 'react';
import { lazyRecharge } from '../recharge.js';
import { plateformeDe, voisinsDe } from '../state.js';
import { restesAvantDepart, verrouillePar } from '../depart.js';
import { masqueDe } from './noyau.jsx';

const CTX = { plateforme: plateformeDe, masque: masqueDe, voisins: voisinsDe };
/** Les scénarios qui regardent d'abord ce qui reste ouvert : « Je pars » (étape 2) et « Bonne nuit » (étape 4). */
export const AVANT_DE_LANCER = ['depart', 'nuit'];
/** Ce qui restera ouvert si l'on part maintenant, lu dans la maison telle qu'elle est — et ce que le scénario `s` ne verrouillera
 *  pas (A4, ADR 0386) : sans `s`, on ne sait pas s'il verrouille, une serrure ouverte se dit. */
export const restesMaintenant = (hass, s = null) => restesAvantDepart(hass && hass.states, { ...CTX, verrouille: verrouillePar(s) });

const FeuilleDepartContenu = lazyRecharge(() => import('../departfeuille.jsx'));
/** La feuille « Avant de partir » ou « Avant de dormir » : rien tant qu'aucun scénario n'attend (`sc.avant`). */
export function FeuilleDepart({ hass, sc }) {
  if (!sc || !sc.avant) return null;
  return <Suspense fallback={null}><FeuilleDepartContenu hass={hass} sc={sc} /></Suspense>;
}
