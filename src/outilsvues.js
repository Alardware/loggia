/* CE QUE LES VUES CHARGÉES À LA DEMANDE EMPRUNTENT AU MONOLITHE (25/10, ADR 0274).
 *
 * Une vue sortie d'App.jsx (views/energie.jsx, views/securite.jsx) se sert
 * encore de pièces que l'Accueil utilise aussi : l'éditeur d'agencement, les
 * cartes éditables, la carte d'alarme… Les importer d'App.jsx ferait une boucle
 * entre le monolithe et ses morceaux. App.jsx les pose donc ici à son
 * évaluation, avant tout rendu ; une vue chargée ensuite les y trouve. */
export const OUTILS_VUES = {};
