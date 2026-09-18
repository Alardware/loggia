# 0047 — Trois niveaux, une seule voix : normal, attention, action

Date : 18/09/2026 (v3.49.0). Statut : acceptée. Demande : « vois que tout
concorde, que tout soit bien harmonisé … des états dynamiques et responsive,
pas décoratifs : 🟢 Normal, information discrète · 🟡 Attention, l'information
devient visible · 🔴 Action nécessaire, l'interface attire immédiatement
l'œil ». Troisième tranche de l'audit du 18/09 (ADR 0045, 0046).

## Contexte

Le modèle existait déjà, dans `attention.js` (ADR 0028) : trois niveaux —
`danger`, `alerte`, `info` — et une seule table de couleurs, `couleurNiveau`.
Mais l'écran ne le parlait pas partout. L'inventaire a trouvé une seconde
échelle de CO₂ (600 / 900 ppm) à côté du palier commun (1 200) ; trois jeux
de seuils de pile (15 / 40, 20 / 50, celui du serveur) ; des notifications
dont le NIVEAU était un code couleur en dur (`'#f87171'` voulait dire
« rouge ») relu tel quel par l'ambiance ; une soixantaine de couleurs d'état
écrites en hexadécimal — illisibles sur le thème clair, que les jetons
redéfinissent ; le point qui bat sur la pastille de la bannière même quand
tout va bien, et sur des voyants d'activité (solaire, marche) ; la surface
d'une carte du rail recopiée dans trois fichiers, les petites capitales et
la puce d'un filtre dans deux ; la tondeuse nommée en dur.

## Décision

- **Un vocabulaire, trois niveaux, un seul endroit.** `attention.js` porte
  `SEUILS_PILE` (attention à 20 %, action à 5 %), `niveauPile`, `niveauCo2`
  (attention au palier « chargé », le même chiffre que la veille du serveur et
  le point d'attention) et `animationNiveau` : le point ne bat qu'en `danger`.
  Le normal n'a pas de niveau : il reste dans la couleur du texte.
- **Ce que chaque niveau fait à l'écran.** Normal : discret (`--o-text2`,
  `--o-text3`), sans couleur. Attention : ambre (`--o-warn`), visible, sans
  battre. Action : rouge (`--o-bad`), lavis, point qui bat, bandeau. Activité
  (lecture, nettoyage, tonte) : la couleur d'identité, jamais un niveau.
- **Les états passent par les jetons du thème.** Les hexadécimaux d'état
  (`#f87171`, `#ffb347`, `#fbbf24`, `#fb923c`, `#ef4444`, `#34d399`,
  `#60a5fa`, `#94a3b8`) sont remplacés par `--o-bad`, `--o-warn`, `--o-warn2`,
  `--o-ok`, `--o-cold`, `--o-text3` — dans les notifications (dont le premier
  champ dit désormais le niveau par le jeton), l'ambiance, la barre latérale,
  les caméras, les machines, l'énergie, les messages d'erreur, le code
  administrateur, la météo. Restent en dur les identités : dégradés d'une
  lampe, palette du flux d'énergie, thèmes, avatars.
- **Le CO₂ d'une carte pièce lit `airPalier`** : discret jusqu'au palier
  « chargé », ambre au-delà. Plus de seconde échelle.
- **La pile suit `niveauPile` partout** : plante, aspirateur, tondeuse, point
  d'attention (une pile signalée par le serveur à 14 % est une attention, à
  4 % une action — plus une simple information).
- **Le point qui bat est réservé à l'action** : la pastille de la bannière
  bat seulement en danger ; les voyants d'activité (solaire, marche) ne
  battent plus ; Home Assistant perdu et l'alarme déclenchée gardent le leur.
- **Les styles partagés vivent une fois** : `src/styles.js` porte
  `CARTE_RAIL` (la surface d'une carte du rail — météo, CO₂, En ce moment,
  Rappels), `petitesCapitales(taille)` et `puce`.
- **La tondeuse porte son nom** (`friendly_name`), comme l'aspirateur.

## Conséquences

Visibles : un badge CO₂ gris tant que l'air est bon ou moyen (il était vert,
puis ambre dès 600 ppm) ; une pile en bonne santé sans couleur (elle était
verte) ; un thème clair lisible là où le rouge clair ne l'était pas ; la
bannière ne « respire » plus quand tout va bien. Tests :
tests/etats.test.mjs (7) ; attention, accueil_attention, accueil_meteo,
accueil_widgets_temps, evenement réalignés. Pas de changement côté serveur.
