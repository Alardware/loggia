# 0025 — L'Accueil : Sécurité en tête, « En ce moment » sur le côté, deux onglets sur mobile

Date : 15/09/2026 (v3.24.0). Statut : acceptée.

## Contexte

L'armement et la serrure vivaient en tête du rail « En cours » : à droite sur
PC, tout en bas sur mobile. Deux endroits disaient « ce qui se passe » — la
glissière « En ce moment » de la colonne principale (lecteurs, chauffage) et
le panneau « En cours » du rail (volets, robots, lave-vaisselle). Sur mobile,
le rail s'empilait sous toutes les sections : un long puits.

## Décision

- **Sécurité en tête de la colonne principale** : les boutons d'armement
  d'aujourd'hui (pas le sélecteur de la maquette — décision de l'utilisateur),
  la serrure, et « n ouvrants ouverts sur m » vers la vue Sécurité. Sans
  panneau, serrure ni ouvrant, la carte n'existe pas.
- **« En ce moment » sur le côté**, une seule liste au vocabulaire des lignes
  denses : tuile, nom, état, un geste quand il existe. Ce qui y entre vient
  des données : lecteur en lecture (pause), appareil en marche selon la règle
  de la bannière (dock, éteindre, fermer la vanne), lave-vaisselle en cours,
  zones qui chauffent, volet entre deux ou en mouvement (stop). Huit lignes au
  plus ; le panneau reste quand rien ne tourne. La glissière du héros disparaît.
- **Deux pages sur mobile et tablette** : « Maison » et « En ce moment »,
  glissées au doigt, deux points tapables pour repère — pas de barre
  d'onglets (retour utilisateur, v3.24.1) — un seul panneau dans le flux,
  page retenue pour la session, glissement coupé en édition. Le PC garde
  ses deux colonnes.
- **Migration** : `etats` → `moment` dans les ordres et masquages enregistrés,
  `securite` en tête d'un accueil déjà rangé, `heros` ignoré.

## Conséquences

Le rail perd « Mode volets » (dans la vue Volets) et les lignes robots au
repos (leurs entités apparaissent quand elles tournent). L'accueil surveille
les lecteurs, le chauffage, les volets et les appareils pour tenir ses lignes.
