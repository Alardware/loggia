/* Les coquilles de l’édition chargée à la demande (étape b) : chacune porte le nom du composant qu’elle charge.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { Suspense } from 'react';
import { lazyRecharge } from '../recharge.js';

/* L'ÉDITION, CHARGÉE À LA DEMANDE (lot 5 de l'audit du 28/10, ADR 0283).
 * Les feuilles d'une carte, le composeur, l'historique des mises en page, la
 * Bibliothèque et les vues personnalisées ne servent qu'une fois ouverts : ils
 * quittent le boot. Chaque coquille garde le nom du composant qu'elle remplace
 * — aucun appel ne change — et pose sa frontière Suspense elle-même ; une
 * flèche, pas une fonction déclarée : la déclaration du vrai composant reste
 * la seule qui porte son nom. Ce que ces modules lisent encore ici
 * leur est prêté par `OUTILS_VUES`, en fin de fichier. `useLayoutEditor` reste au démarrage (edition/disposition.jsx) :
 * c'est lui qui range les cartes, en édition comme à l'affichage. */
const CardEditSheetDiffere = lazyRecharge(() => import('./feuilles.jsx').then(m => ({ default: m.CardEditSheet })));
const ComposeurCartesDiffere = lazyRecharge(() => import('./feuilles.jsx').then(m => ({ default: m.ComposeurCartes })));
const FeuilleHistoriqueDiffere = lazyRecharge(() => import('./feuilles.jsx').then(m => ({ default: m.FeuilleHistorique })));
const BiblioViewDiffere = lazyRecharge(() => import('./biblio.jsx').then(m => ({ default: m.BiblioView })));
const CustomViewDiffere = lazyRecharge(() => import('../cartescustom/vue.jsx').then(m => ({ default: m.CustomView })));
const CardEditSheet = (props) => <Suspense fallback={null}><CardEditSheetDiffere {...props} /></Suspense>;
const ComposeurCartes = (props) => <Suspense fallback={null}><ComposeurCartesDiffere {...props} /></Suspense>;
const FeuilleHistorique = (props) => <Suspense fallback={null}><FeuilleHistoriqueDiffere {...props} /></Suspense>;
/* Une vue : le repli est la surface vide qu'App montre déjà avant la découverte. */
const BiblioView = (props) => <Suspense fallback={<main className="loggia-main" style={{ flex: 1, minWidth: 0 }} />}><BiblioViewDiffere {...props} /></Suspense>;
const CustomView = (props) => <Suspense fallback={<main className="loggia-main" style={{ flex: 1, minWidth: 0 }} />}><CustomViewDiffere {...props} /></Suspense>;

export { CardEditSheet, ComposeurCartes, FeuilleHistorique, BiblioView, CustomView };
