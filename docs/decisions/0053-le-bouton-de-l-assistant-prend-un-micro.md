# 0053 — Le bouton de l'assistant prend un micro

Date : 18/09/2026 (v3.54.0). Statut : acceptée. Demande : « modifie l'icône
de chat aussi », avec deux captures — en haut, un bouton rond gris au micro ;
dans la barre du bas, un carré arrondi rose-violet au micro blanc.

## Contexte

Le bouton de l'assistant était un disque bleu à point blanc lumineux : dans
l'en-tête sur grand écran, au milieu de la barre du bas sur téléphone. Rien
n'y évoquait la parole, et en haut il tranchait sur ses voisins (thème,
notifications), des boutons ronds sobres.

En le reprenant, un défaut est apparu : la barre du bas recevait de quoi
dicter (`onDictee`, `hass`, depuis la mise en service de la voix) sans le
lire ni le passer au bouton. Sur téléphone, le maintien faisait paraître
l'orbe mais n'écoutait rien — l'en-tête, lui, dictait.

## Décision

- **Un micro dans les deux variantes** (`BoutonAssistant`, icône
  `microphone`).
- **En haut**, le bouton des voisins de l'en-tête : fond `--o-s1`, filet
  `--o-bd2`, icône `--o-text1`. Pendant le maintien, un anneau violet.
- **En bas**, un carré arrondi (48 px, rayon 15) en dégradé des jetons
  `--o-rose` → `--o-purple`, le micro en blanc, posé 14 px au-dessus de la
  barre comme l'ancien disque. Les teintes suivent le thème ; aucune couleur
  en dur.
- **Les gestes ne changent pas** : un appui ouvre la conversation, un maintien
  de 200 ms dicte.
- **La barre du bas dicte** : `MobileNav` lit `onDictee` et `hass` et les
  passe au bouton, comme l'en-tête.
- **Le badge de la démo** (« Démonstration — données factices »), posé à
  10 px du bas, couvrait ce bouton sur téléphone. Il monte au-dessus de la
  barre d'après sa hauteur mesurée (`--o-navh`) et tient sur une ligne ; sans
  barre, il reste à 10 px du bas.

## Conséquences

Le rose-violet n'est pas une couleur d'état (ADR 0047) : il ne dit ni
alerte ni marche, il désigne l'assistant — le seul geste de la barre qui ne
soit pas une navigation. Tests : tests/assistant.test.mjs (+2). Vérifié en
démo sur ordinateur et en téléphone émulé ; la dictée elle-même n'a pas été
jouée (pas de micro en démo), seul le passage de `onDictee` et `hass`
jusqu'au bouton l'a été.
