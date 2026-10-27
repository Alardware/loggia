/* ── Une vanne : sa carte ou sa popup, d'un seul morceau chargé à la demande (chantier IoT, étape 3) ──
 *
 * App.jsx n'importe qu'UN module pour la vanne — chaque import à la demande pèse au démarrage (son adresse, ses dépendances) :
 * celui-ci rend la carte (cartevanne.jsx), ou la popup quand `fiche` est posé (fichevanne.jsx). Une maison qui n'a pas de vanne ne
 * le charge jamais.
 */
import CarteVanne from './cartevanne.jsx';
import FicheVanne from './fichevanne.jsx';

// Le contenu de la popup seul, pour la fiche d'une prise désignée comme vanne d'eau (ficheprise.jsx ; passe bis, point 9).
export { ContenuVanne } from './fichevanne.jsx';

export default function Vanne({ fiche = false, ...p }) {
  return fiche ? <FicheVanne {...p} /> : <CarteVanne {...p} />;
}
