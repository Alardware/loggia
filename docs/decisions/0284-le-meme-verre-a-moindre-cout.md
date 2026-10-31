# 0284 — Le même verre, à moindre coût

*29 octobre 2026 — à l'essai (sa réponse : « Réglage par appareil (Recommandé) »)*

## Le problème

En thème givré, chaque carte porte un `backdrop-filter: blur(16px)
saturate(1.35)` (`index.css`, `html.loggia-frosted [style*="--o-surfA"]`).
Ce flou se recalcule à chaque image du défilement, carte par carte : c'est lui
qui fait ramer une vieille tablette murale.

Les cartes « Glass Cards » de Home Assistant proposent une matière « Light »
qui floute le fond une seule fois, d'avance. Il veut la même chose dans
Loggia.

## Ce n'est pas une nouvelle matière

La décision du 29/08 tient : **une seule matière, le translucide de
l'Accueil, partout** (`applyLook`, theme.js ; « Matière & formes »,
parametres.jsx). Le rendu léger donne le même aspect ; seul le coût change.
Aucun jeton de surface n'est ajouté, aucune couleur de thème ne bouge.

## La décision

**Un réglage de l'appareil**, Paramètres › Effets › « Verre des cartes »,
juste sous « Ciel animé » et sur son modèle : `Auto` / `Plein` / `Léger`,
dans le stockage local (`loggia-verre`), jamais dans le profil. La ligne est
alignée sur les autres, sans retrait.

**Auto** suit la fluidité que le ciel de l'Accueil mesure déjà
(`loggia-ciel-actuel`, ciel.js) : `plein` donne Plein, `leger` ou `fixe`
donnent Léger. Sans mesure **en cours** — effets météo coupés, qualité du
ciel forcée, rien de mesuré —, Auto reste à **Plein**, comme avant : rien ne
change pour qui ne touche à rien. La description reprend les phrases du ciel
(« Suit la fluidité de l'appareil · ici : léger »).

La classe `loggia-verre-leger` se pose sur `<html>` **à l'import de
theme.js**, donc avant le premier rendu (`verre.js`, sans dépendance). Auto
ne décide qu'au démarrage : le ciel peut changer de niveau en cours de
séance, les cartes ne sautent pas. Un choix dans Paramètres s'applique
sur-le-champ.

## Ce que Léger change (index.css)

- **Les cartes** et la tuile de l'alarme : plus de `backdrop-filter`. Ce qui
  flotte (`position: fixed`) garde le sien.
- **La photo de fond** : son calque fixe (`.o-fond-photo`) porte le flou et
  la saturation des cartes, `filter: blur(16px) saturate(1.35)`, et déborde
  de 40 px pour que son bord flou reste hors de l'écran. Les cartes posées
  dessus montrent ce qu'elles montraient ; **entre** les cartes, la photo est
  floue elle aussi — la seule différence visible.
  Choisi plutôt qu'une image floutée une fois par canvas : sur GPU, le calque
  filtré ne coûte rien de mesurable ; en rendu logiciel il garde un petit
  coût (voir plus bas), qu'un canvas effacerait au prix d'un module, d'une
  seconde image en mémoire et d'un repli pour les Safari sans `ctx.filter`.
- **Sans photo**, retirer le flou suffit : l'écart mesuré est sous
  0,5 / 255 en moyenne, saturation comprise.
- **La feuille** glissait au-dessus du ciel animé et recalculait son flou à
  chaque image : elle devient pleine, de la teinte que le flou lui donnait
  (sa surface sur le fond du thème assombri par l'ombre du voile). Le
  **voile**, un flou plein écran, garde son ombre seule (`.o-voile`).
- **Gardés** : les menus (`ListeChoix`, celui de l'en-tête), le bandeau
  d'erreur, l'en-tête du PC (qui s'en passe déjà au-dessus du ciel), la barre
  du bas du téléphone, le pavé du code, les badges des caméras. Un ou deux
  éléments, ou un calque qu'on ne fait pas défiler.

## Ce que cela coûte, ce que cela rapporte

Démo, Chrome headless, CPU ralenti x4, défilement de l'Accueil de 6 s,
occupation du fil de composition (ms sur 6 s) :

- rendu logiciel, téléphone : Plein 2 212 à 2 446, Léger 643 à 937 ;
  PC : Plein 2 158 à 2 716, Léger 343 à 905 ;
- GPU, PC : fil GPU Plein 763 à 982, Léger 466 à 589.

Le nombre d'images par seconde mesuré par `requestAnimationFrame` ne
départage rien : il suit le fil principal, que le flou ne charge pas.

Démarrage : +557 octets au boot (la lecture du réglage et la pose de la
classe). L'écriture vit dans Paramètres, chargé à la demande.
