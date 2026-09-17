# 0039 — La barre de confort des pièces

Date : 17/09/2026 (v3.40.0). Statut : acceptée. Une maquette de
l'utilisateur — « Indice de confort 50 / 100 · Acceptable », puis quatre
pastilles : température, humidité, CO₂, bruit — avec la consigne : « la barre
dans les pièces avec luminosité, couleur, etc., remplace par ceci ».

## Contexte

En tête d'une pièce, une barre de réglages rapides pilotait la luminosité du
groupe, une palette de couleurs et les volets. Tout cela se pilote déjà sur
les cartes juste en dessous — alors que rien ne disait, d'un regard, si l'on
est bien dans la pièce. Les mesures n'existaient qu'en petits chiffres sous le
titre, et leurs verdicts au fond d'une fiche.

## Décision

- **La barre de confort remplace la barre de réglages.** À gauche l'indice sur
  100, son anneau et son mot ; un filet ; puis une pastille par mesure que la
  pièce possède — icône teintée, valeur, point de couleur, verdict. Un tap
  ouvre la fiche de confort et son historique, qui n'avaient plus que cette
  barre pour porte.
- **Rien sans capteur.** Une mesure absente n'a pas de pastille et ne compte
  pas dans l'indice ; une pièce sans aucune mesure n'a pas de barre.
- **Une seule table de seuils.** Les paliers de la température, de l'humidité
  et du CO₂ sont ceux de la fiche de confort, à la borne près ; la fiche
  délègue désormais ses verdicts à `confort.js`. La barre et la fiche ne
  peuvent pas se contredire, et il n'y a pas une échelle de CO₂ de plus.
- **L'indice : la moyenne des notes, tirée vers le bas par la pire.** Chaque
  mesure reçoit une note de 0 à 100 — 100 sur le plateau du « bon », puis une
  pente entre des points d'ancrage calés sur les paliers. L'indice est la
  demi-somme de la moyenne et de la pire note : une pièce à 21 °C n'est pas
  confortable si l'air y est confiné, ce que la moyenne seule cacherait ; la
  pire note seule ignorerait tout le reste. Cinq mots : Confortable (≥ 80),
  Correct (≥ 60), Acceptable (≥ 40), À améliorer (≥ 20), Inconfortable. Les
  valeurs de la maquette (10 % d'humidité, 2000 ppm) donnent 33 et non 50 :
  les seuils de la maison priment sur les chiffres d'une maquette.
- **Le bruit se découvre.** La configuration des pièces ne nomme que la
  température, l'humidité et le CO₂ ; le sonomètre se cherche dans la zone Home
  Assistant de la pièce, à sa `device_class` (`sound_pressure`) — jamais à son
  unité, la force d'un signal Wi-Fi se mesurant aussi en dB. Paliers : calme
  sous 40 dB, animé sous 55, bruyant sous 70, très bruyant au-delà. Il entre
  aussi dans la fiche de confort, avec sa barre et son historique.
- **Au téléphone la rangée de mesures reste sur UNE ligne** : l'indice passe
  au-dessus, chaque pastille met son icône au-dessus de sa valeur, le nom de
  la mesure s'efface. Sur tablette, quatre colonnes ; le point de couleur cède
  sa place pour que le verdict ne se tronque pas.

## Conséquences

Ce qui se calcule vit dans `src/confort.js`, pur et testé à sec
(tests/pieces_confort.test.mjs, 39 mutations) ; `src/barreconfort.jsx` ne
garde que le dessin. Les réglages de groupe (luminosité, couleur, bascule des
volets) quittent la vue des pièces avec leur code ; la sous-ligne du titre
garde le compte des lampes et ses chiffres. Le mot de la fiche de confort
devient celui de l'indice (« Sain » et « À surveiller » disparaissent). Non
fait : pondérer les mesures entre elles, et régler les seuils par pièce (une
chambre et une cuisine n'ont pas le même « idéal »).
