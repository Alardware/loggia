# 0149 — Les règles de la maison, tenues par le code

Date : 04/10/2026. Statut : appliqué. **Redémarrage de Home Assistant
requis** (décision 0126) : la partie Python change.

Le lot 15 de l'audit du 03/10, le dernier : les règles maison qui n'étaient
pas tenues partout, et l'hygiène du code. Chaque constat a été revérifié sur
le code d'après les lots 1 à 14 ; deux étaient déjà réglés (l'exception de
contraste d'un test, l'icône choisie d'une vue personnalisée). Laissé de
côté : ramener les cartes à 184 px, qui attend la réponse à la question 5 de
l'audit.

**Le contraste.**
- Six boutons pleins écrivaient en quasi-noir (`#06121f`) sur le fond
  d'accent : 4,00:1. Ce fond est calculé pour le blanc ; ils passent en blanc
  (4,71 à 9,16:1). Restent en quasi-noir, voulu : deux icônes (seuil de 3:1)
  et l'écran d'erreur du démarrage, à couleurs fixes.
- Les compteurs des filtres d'Objets étaient atténués par une opacité de
  55 % : 2,53:1 sur la puce choisie, 4,35:1 sur les autres. Ils prennent le
  gris tertiaire du thème, que la garde de contraste tient (ADR 0060), et le
  blanc de la puce choisie.

**Les puces choisies en bleu plein**, sans exception : les zones du plan du
robot. L'aperçu d'une carte dans la galerie d'ajout n'est PAS une puce (le
bleu recouvrirait la carte qu'il montre) : il garde son cadre teinté. Le
style de puce de `styles.js`, recopié dans six vues avec des écarts, y est
importé ; le dessin ne bouge pas (mesuré).

**Les états optimistes expirent tous.** `useOptimiste` sort dans
`src/optimiste.js`. Y passent : les automatisations de Paramètres (chacune
lue sur son propre `last_changed`, sans quoi la bascule du 01/10
clignotait ; à la relecture, chaque demande a pris sa propre échéance et
l'écho d'un double appui ne reprend plus la main — `useDemandes`), le réservoir et les repas des croquettes, « tout ouvrir / tout
fermer » et le mode des volets. Le filet du test lit désormais tout `src/`.
Le cache d'historique de 24 h se purge à l'écriture (rien de ce qu'une
lecture servirait encore).

**Le code mort et les doublons.**
- 71 classes CSS sans lecteur sont retirées (89 règles, 4 animations
  orphelines) ; un test refuse une classe sans lecteur, en nommant les
  préfixes construits (`o-prise-`).
- `src/outils.js` rassemble `domaineDe` (7 copies) et `sansAccents` (7) ;
  les conversions vers l'hexadécimal (9 copies, dont 5 sans bornage) passent
  par `versHex` (`contraste.js`) ; `cleJour` et `Fi` ne sont plus redéfinis.
  Un test refuse une nouvelle copie.

**Le composant Python.**
- Les modules modifiaient la configuration partagée hors du verrou : deux
  enregistrements simultanés, et le second effaçait le premier ; un import
  lancé en même temps qu'un enregistrement était défait sans un mot. Ils
  passent par `async_modifier_shared` (`store.py`), sous le verrou.
- La migration du code administrateur en clair calcule PBKDF2 hors de la
  boucle (ADR 0045).
- La configuration des fenêtres filtre les valeurs non textuelles.
- Deux constantes mortes sont retirées (`ECOUTE_S` côté serveur, la durée
  d'écoute venant de l'écran ; `FAMILLES` de `scenarios.py`).

**Les tests et la CI.**
- `commander` et `commanderService`, la porte de toutes les commandes, sont
  exécutés par des tests : perdre le code d'alarme fait désormais échouer la
  suite.
- `generique.test` lit tout `src/` (vues comprises), en écartant les noms de
  services (`light.turn_on`).
- La CI construit la démo à chaque PR, tient un cliquet sur les
  avertissements d'eslint (53, il ne peut que descendre) et affiche la
  couverture à titre d'information. `eslint.config.mjs` n'est pas touché.
- Une épingle textuelle de la barre de confort devient un vrai rendu.

**Comment c'est vérifié.** Six fichiers de tests nouveaux, chacun rouge sur
le code d'avant le lot. Deux tests restent rouges jusqu'au repack final,
voulu (lot 14).

## Relecture

Une relecture contradictoire en cinq angles a confirmé six constats et en a
écarté trois.

- **Les bascules des automatisations** : deux appuis rapides faisaient de
  nouveau clignoter la ligne, et un refus restait affiché tant qu'on
  basculait d'autres lignes (un seul minuteur pour toute la table).
  `useDemandes` (`src/optimiste.js`) donne à chaque demande sa propre
  échéance et tient l'écho d'une demande remplacée encore en vol. Une
  horloge qui recule (tablette resynchronisée) ne fige plus une demande.
- **Les scénarios** écrivaient encore hors du verrou commun : un import ou
  une remise à zéro faits en même temps qu'un rangement étaient défaits. Ils
  passent par `async_modifier_shared`.
- **Les fenêtres** : une valeur de pièce qui n'est pas un objet ne casse
  plus la règle, à l'enregistrement comme au redémarrage.
- **La CI** : ses épingles échouent désormais si une étape gardée reçoit un
  `if:` ou un `continue-on-error` (seule la couverture garde le sien).
- **Les repas des croquettes** gardaient le défaut des bascules : ils
  partent avec la vue Croquettes, retirée le même jour (« plus de vue
  spéciale pour un appareil, c'est la carte plus sa popup »), et leur
  activation passe dans la popup du distributeur, avec `useDemandes`.
