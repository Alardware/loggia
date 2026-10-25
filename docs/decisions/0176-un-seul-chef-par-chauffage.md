# 0176 — Un seul chef par chauffage

*9 octobre 2026 — accepté, à l'essai (plan 1 du chantier Chauffage, rien de publié)*

## Le problème

Deux systèmes qui commandent le même radiateur se défont l'un l'autre **en
silence**. C'est en lisant Velair et Versatile Thermostat qu'on l'a vu : Velair
défait tout changement qui ne vient pas de lui, et les règles de Loggia ne
reconnaissent comme « main » qu'un geste porteur d'un `user_id`. Dans Loggia
même, la règle des fenêtres coupait le chauffage, la présence baissait les
consignes : avec un planning, cela ferait trois chefs.

## La décision

**Planning allumé : le moteur (`chauffage.py`) est le seul à commander ce
chauffage.**

- La règle des fenêtres et la présence ne lui envoient plus d'ordres : elles
  lui donnent des **faits**. `fenetres.py` dit « fenêtre ouverte dans la
  chambre » (son délai passé) puis « refermée » — pour TOUS les chauffages de la
  pièce, si bien que le moteur sait déjà tout le jour où l'on allume le planning
  d'un autre. `presence.py` dit « maison vide » ou « quelqu'un est rentré ».
- La présence fait passer la maison en **Absence** seulement si elle est en
  Planning, et la remet en **Planning** seulement si elle est en Absence ;
  Vacances et Été ne se touchent qu'à la main. Ces deux gestes suivent les
  réglages qu'elle a déjà (« baisser le chauffage au départ », « le remettre au
  retour ») et SON « Observer sans agir » : c'est elle qui agit sur le mode.
- Le moteur **ne passe pas par `regles.agir`**. L'entonnoir du socle protège
  des règles qui se partagent une entité ; ici trois de ses garde-fous
  trahiraient le seul chef : le gel de trente minutes (`regles.py:611`) aurait
  perdu un changement du planning tombé juste après un geste, une tenue laissée
  par la règle des fenêtres (`regles.py:617-621`) l'aurait retenu, et la main
  n'y est qu'un `user_id` (`regles.py:360`) — la télécommande du poêle n'en
  porte pas. Il garde du socle le **journal** (`regles.noter`, module
  `chauffage`) : chaque ordre y est écrit avec son motif.
- **Observer sans agir** (ADR 0004) : un drapeau à lui, `simulation.actif`
  dans `loggia_chauffage`, comme chaque module qui commande. Le moteur calcule,
  note « aurait mis Confort » une fois par décision, n'envoie rien. Les faits
  ne se simulent pas ; les ordres, si. Basculer remet à zéro, reprises en main
  comprises : prises pendant l'observation, elles venaient le plus souvent de
  l'ancien système, qui commandait encore les radiateurs.
- En observation (Observer sans agir), la règle des fenêtres et la présence
  gardent la main : le moteur ne fait qu'observer.
- **Une seule question à chaque événement** : fenêtre, reprise en main, mode
  de la maison, planning — la première marche qui répond l'emporte, et l'on
  n'envoie un ordre que s'il diffère de l'état de l'appareil. **La fenêtre ne
  fait que baisser** : la spécification la place en tête « pour la sûreté », et
  telle quelle un réglage « Éco fenêtre ouverte » aurait rallumé un poêle coupé
  pour l'été. Elle ne répond donc que si son mode est **plus froid** que ce
  que les autres marches donnent : la fenêtre ne répond que si elle baisse
  vraiment. Une fenêtre qui ne coupe rien n'est pas une source — en Été, ou
  sur un planning déjà à l'Arrêt, l'écran dirait sinon « Fenêtre ouverte ·
  Arrêt » tant qu'elle reste ouverte : du bruit. À mode égal, c'est la marche
  suivante qui parle (tâche 2 bis du plan 2). Elle ne relève pas non plus une
  consigne posée à la main sur un thermostat : « Éco fenêtre ouverte » lui
  envoie le plus bas de l'Éco et de cette consigne (un 15 °C reste à 15, un
  21 °C retombe à 17).
- **Un seul minuteur** pour le prochain changement, tous chauffages
  confondus, et un **rattrapage** au démarrage (à la différence des robots,
  ADR 0043) : une coupure à 6 h 20 ne fait pas sauter le Confort de 6 h 30.
- Un ordre **refusé** est noté en rouge et retenté une fois une minute plus
  tard — en recalculant : on ne rejoue jamais un ordre ancien —, puis on
  attend l'événement suivant. Un service qui ne répond pas en quinze secondes
  compte comme un refus. Un appareil **injoignable** n'est pas commandé ; à
  son retour, on recalcule et on applique.
- L'**interrupteur d'un module** fil pilote n'est jamais commandé : coupé, il
  est signalé (« module coupé »), pas rallumé.
- **Les droits** : l'état, la reprise en main et le mode de la maison sont
  ouverts à tout compte (`loggia/chauffage/etat`, `/main`, `/maison`), la
  reprise bornée à ce que le compte peut piloter ; Été — y entrer comme en
  sortir — et la configuration (`/config`) restent aux administrateurs.

**Planning éteint : rien ne change**, sauf deux choses de la règle des
fenêtres (ADR 0178) : un fil pilote se coupe par son ordre Arrêt, et une
fenêtre déjà ouverte au démarrage, après un rechargement ou quand on se met
à suivre la pièce est revue.

## Ce qu'on n'a pas fait

**Un drapeau de plus dans le socle** (`agir(..., sans_gel=True)`) : le socle
serait devenu l'arbitre d'un cas où il n'y a rien à arbitrer.

**Laisser « Éco fenêtre ouverte » réchauffer.** Une sûreté qui allume le
chauffage n'en est pas une.

## Ce que les tests tiennent

`tests/python/test_chauffage.py` (les ordres, le minuteur, le rattrapage,
l'observation, les relances, les faits, la maison, l'état),
`test_fenetres.py` et `test_presence.py` (les faits au lieu des ordres),
`test_websocket_api.py` et `test_websocket_api_execution.py` (les droits, les
refus nommés).
