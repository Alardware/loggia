# 0336 — Quitter les Réglages les referme

*8 novembre 2026 — appliqué (v3.99.0)*

## Le problème

La section ouverte vit dans la mémoire de l'onglet, pour survivre à un
rechargement : changer de langue recharge la page. Rien ne l'effaçait en
partant : revenu de l'Accueil, on retombait sur la dernière section au lieu de
la vue d'ensemble.

## La décision

Passer à une autre vue efface cette mémoire (`oublierSectionSiQuittee`,
`reglagesindex.js`, un effet sur `view` dans `App.jsx`). Au changement de vue,
jamais au démontage : un remontage de la vue ou un rechargement garde la
section où l'on réglait quelque chose, et toucher à un réglage ne ramène pas en
haut. Au téléphone, qui n'a pas de vue d'ensemble, on revient sur Apparence.
Ctrl+K et le pont Zigbee posent la section avant de naviguer : ils y mènent
toujours.

## Les conséquences

Écran seulement. Test `reglages_recherche`.
