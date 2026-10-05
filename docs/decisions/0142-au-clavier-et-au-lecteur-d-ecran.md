# 0142 — Au clavier et au lecteur d'écran

Date : 03/10/2026. Statut : appliqué. Pas de redémarrage de Home Assistant :
seul l'écran change.

Le lot 8 de l'audit du 03/10 : treize défauts, tous revérifiés sur le code
actuel avant correction. Pour chacun, le correctif a été préparé, contesté
par un second regard, appliqué, puis mesuré dans la démo, au clavier et dans
l'arbre d'accessibilité.

**1. Entrée sur un bouton de carte ouvrait la fiche (gravité haute).** Le
gestionnaire de touches des cartes ne regardait pas d'où venait la touche.
Les boutons intérieurs n'arrêtaient que le clic : au clavier, la carte prenait
Entrée, l'annulait, et ouvrait sa fiche. « Fermer » d'un volet, « Pause »
d'un lecteur, − / + d'un thermostat ou « Renvoyer au dock » ne faisaient donc
rien. Onze gestionnaires portent maintenant
`if (e.target !== e.currentTarget) return;`, le motif de l'ADR 0068 : dix
cartes, et la carte du kit d'édition. Mesuré : Entrée sur « Fermer » du volet
cuisine le ferme (60 % → fermé) sans ouvrir la fiche, et Entrée sur la carte
l'ouvre toujours. `tests/clavier.test.mjs` refuse l'oubli de cette garde
dans tout `src/`.

**2. Le bouton « Mode édition » du rail replié** n'avait pas de nom. Il
s'appelle « Mode édition » quand le rail est replié ; déplié, il garde le mot
affiché, pour ne pas contredire « Quitter l'édition » (WCAG 2.5.3).

**3. Un échec de commande n'était pas annoncé.** La région vivante n'était
montée qu'avec son texte. Une région `role="alert"` vide est maintenant
toujours montée, et le message s'y écrit (règle de l'ADR 0107). Le toast
visible garde son dessin et ses 5 s, en `aria-hidden` pour n'être lu qu'une
fois. Les fiches ouvertes rendent inerte le reste de la page, sauf cette
région.

La relecture contradictoire a trouvé une faille : les feuilles portaient
`aria-modal="true"`. Avec lui, WebKit (Safari, et donc l'appli Home Assistant
sur iOS) et Chromium retirent de l'arbre d'accessibilité tout ce qui est hors
de la feuille, région d'annonce comprise. L'échec d'une commande lancée
**depuis une fiche**, le cas même visé, restait donc muet. `aria-modal` est
retiré des feuilles et du code administrateur : `inerterAutour` confinait
déjà. Mesuré, fiche ouverte : le fond est inerte, la région ne l'est pas et
figure dans l'arbre d'accessibilité.

**4. Le code administrateur faux** ne se disait que par la couleur des
points, pendant 650 ms. Il s'annonce désormais « Code incorrect » dans une
région vivante, et s'écrit aussi en rouge à la place du sous-titre jusqu'à la
touche suivante. La rangée de points dit « 2 chiffres sur 4 ».

**5. Le focus était invisible en mode édition.** Le pointillé posé en style en
ligne battait la règle `:focus-visible`. Il passe par une classe,
`.o-pointille`, dont chaque grille règle l'opacité et l'écart, et le focus le
remplace par le trait plein d'accent. Mesuré : pointillé 1 px, puis trait
plein 2 px au focus.

**6. Dix-huit feuilles sans nom.** Les feuilles s'annonçaient « dialogue »,
sans plus. `NomFeuille` (`ui.jsx`), rendu À L'INTÉRIEUR de la feuille, pose
l'id du nom sur son titre existant ; aucune seconde croix. Mesuré : la
recherche, un capteur, un lecteur, la fiche du robot, l'agenda et l'assistant
ont chacun un nom.

**7. Les sélecteurs segmentés de Paramètres (Seg)** disent l'option choisie
(`aria-pressed`) et portent un nom de groupe. Deux clés sont nouvelles,
« Collection de thèmes » et « Filtrer par état ».

**8. Le focus tombait sur la page au changement de vue.** Toute la vue se
remonte (`key={view}`), et le bouton qui venait de servir partait avec elle.
`src/focus.js` (sans React, testé sur un faux document) pose le focus sur le
titre de la nouvelle vue, et seulement s'il est tombé : le menu latéral garde
son bouton. Paramètres rend le focus à la tuile d'origine au retour au
sommaire. `setView` reste nu. Changer de vue ne remonte pas la page : au
clavier seulement, le titre revient à l'écran, sous l'en-tête collant
(`scroll-margin-top`). Mesuré : il était 313 px au-dessus de l'écran, il est
à 84 px du haut. Relecture : la tuile rendue au retour au sommaire pouvait
finir sous la barre du bas d'une tablette tactile tenue au clavier. Elle a sa
propre marge, en haut comme en bas (`--o-navh`).

**9. Où l'on est.** La barre du bas s'appelle « Vues », la vue courante porte
`aria-current="page"`, et « Menu » dit s'il est ouvert. Les puces de pièce
forment un groupe « Pièces », la courante marquée.

**10. Le journal de Système** se prend au clavier : région nommée et
focusable. Une zone qui défile ne l'est pas d'elle-même sous Safari et iOS.

**11. Mouvement réduit.** Deux défilements doux ignoraient la préférence ; un
test refuse désormais un `behavior: 'smooth'` en dur.

**12. Les onglets de la fiche robot** suivent le motif ARIA. Seul l'onglet
actif est atteint par Tab ; les flèches, Début et Fin passent d'un onglet à
l'autre et l'activent ; chaque panneau est nommé par son onglet. La logique
des touches est une fonction pure, `ongletVoisin` (`choix.js`).

**13. La case « Marquer fait » des rappels** se vise à 24 × 24 px, avec la
pastille toujours dessinée à 18 (procédé de l'ADR 0101). La ligne ne bouge
pas.

**Le polonais.** Cinq clés nouvelles, alignées sur le vocabulaire de Seba882
(ADR 0141), comme « Kolekcja scen » → « Kolekcja motywów ».

**Ce qui n'est pas fait** : le lot 13 (noms accessibles qui remplacent
l'affiché, cartes qui englobent leurs commandes, modales de profil faites
main). Aucun vrai lecteur d'écran n'a été utilisé : tout est mesuré par
l'arbre d'accessibilité du navigateur.

**Comment c'est vérifié.** Treize fichiers de tests, nouveaux ou étendus.
Rejoués sur le code d'avant le lot, chacun échoue au moins une fois. Les
mesures dans la démo sont citées plus haut.
