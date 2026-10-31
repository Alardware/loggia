# 0288 — Une feuille d'alerte au lieu des dialogues du navigateur

*29 octobre 2026 — à l'essai (audit de consolidation du 28/10, lot 6, partie b : M8)*

## Le problème

Des dialogues natifs restaient : `window.confirm` sur l'écran de secours
(`boot.jsx`, « Réglages d'usine ») et neuf `alert` / `window.alert` dans
Paramètres (remise à zéro, import, export, photo de fond, enregistrement des
entités, détection des capteurs), plus celui de « Versions précédentes »
(ADR 0285), arrivé après l'audit. Une boîte du système ne suit ni le thème,
ni la règle des feuilles (ADR 0055), et ses boutons (« OK », « Annuler »)
parlent la langue du navigateur, pas celle de Loggia. Leur rendu dans
l'application mobile de Home Assistant n'était pas garanti.

## La décision

**`alerter({ titre, texte, action, repli })`** (ui.jsx) montre une feuille
d'alerte, `FeuilleAlerte` : la ligne de titre et sa croix (`TitreFeuille`,
une seule croix, en dernier), le message (`role="alert"`), et **au plus un
bouton** : l'action, quand il y en a une, au bleu plein et au texte blanc.
Pas de « OK » ni d'« Annuler » : la croix, le voile, Échap et la poignée
ferment, comme toute feuille. La feuille prend la hauteur de son contenu.

**Un hôte, `HoteAlertes`**, monté une fois dans `boot.jsx`, à côté de l'App
et **hors de sa barrière d'erreur** : `alerter` lui parle par un événement,
d'où qu'elle vienne, d'un rappel asynchrone aussi. Les alertes attendent
leur tour, une à la fois. Il sert encore sur l'écran de secours, qui
remplace tout le reste : la confirmation des réglages d'usine passe par lui,
son seul bouton est « Effacer ».

**Le repli.** Sans hôte vivant, ou si la feuille casse à son tour (l'hôte a
sa propre barrière), le dialogue natif d'avant reprend la main : `repli`,
et par défaut `window.alert(texte)`. L'écran de secours garde ainsi sa
dernière issue même si l'interface ne peut plus rien dessiner.

**Les titres** sont des libellés déjà traduits : le nom du geste qui a
échoué (« Réinitialiser Loggia », « Import », « Exporter », « Photo »,
« Enregistrer et recharger », « Détecter automatiquement », « Versions
précédentes », « Réglages d'usine »). Aucune nouvelle phrase à traduire.

`views/versions.jsx` reçoit `alerter` de Paramètres par une prop, comme
`motif` : l'importer de ui.jsx aurait fait exporter un nom de plus au
démarrage (`tests/versions_precedentes.test.mjs`).

## Deux puces choisies au texte blanc

La règle des puces vaut sans exception : choisi = `--o-accent-fond` et
texte blanc. Deux coches l'écrivaient encore en `#06121f`, un quasi-noir,
sur l'accent : la coche d'une ligne du composeur (« Ajouter une carte »,
`LigneComposeur`, edition/feuilles.jsx) et celle d'une pièce choisie dans
l'assistant de premier lancement (`Check`, Onboarding.jsx). Elles passent au
blanc ; ça se voit, c'est voulu. Le cliquet des couleurs en dur descend :
`edition/feuilles.jsx` 1 → retiré, `Onboarding.jsx` 2 → 1 (reste la lettre
du logo, sur son dégradé, qui n'est pas un choix).

## Les filets

- `tests/feuille_alerte.test.mjs` : plus aucun `alert(`, `confirm(` ni
  `prompt(` dans `src/`, hors des deux replis ; l'hôte à côté de l'App ; la
  feuille rendue (titre, croix, message, un seul bouton d'action au bleu
  plein) ; le repli sans hôte.
- `tests/rien_en_francais.test.mjs` lit aussi le titre, le texte et le
  libellé du bouton d'un `alerter({…})`.

## Vérifié dans la démo

Cinq cas déclenchés, avant (dialogue natif, relevé par le navigateur
piloté) et après (feuille), à 1440 px en clair et à 390 px en sombre :
l'export qui échoue, la remise à zéro dont la sauvegarde échoue, l'import
d'un fichier illisible, une photo de fond illisible, les réglages d'usine
de l'écran de secours. Chaque feuille porte une croix, le message, et le
seul « Effacer » pour les réglages d'usine.

L'enregistrement des entités, la détection des capteurs et le retour à une
version ne se déclenchent pas dans la démo sans simuler une panne du
serveur : ils passent par la même fonction, et le test les compte.

La coche du composeur et celle de l'assistant de premier lancement, avant
et après, à 390 px en sombre et 1440 px en clair (l'assistant sur une démo
construite pour la capture sans son drapeau « déjà fait ») : `rgb(6,18,31)`
avant, blanc après.

Boot +1 727 octets (1 027 228 → 1 028 955), sous la borne de 1 065 000.
