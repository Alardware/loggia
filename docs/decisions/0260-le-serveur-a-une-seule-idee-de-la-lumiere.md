# 0260 — Le serveur a une seule idée de la lumière

*19 octobre 2026 — accepté (audit du 19/10, côté serveur du chantier Lumières)*

## Le problème

L'audit du 19/10 a relu, règle par règle, ce que le composant appelle « une
lumière » quand il éteint ou allume la maison. Chaque règle avait la sienne.

| Règle | Ce qu'elle prenait | Ce qu'elle ratait |
|---|---|---|
| le coucher (`nuit.py`) | tout `light.*` | la LED de la borne UniFi (`config`) comptait ; `switch.lumiere_exterieur`, déclaré lumière, restait allumé ; la veilleuse n'était épargnée que si `sauf` la nommait |
| le départ (`presence.py`) | tout `light.*` | idem, et le retour ne savait rallumer qu'un `light.*` |
| le danger (`alertes.py`) | tout `light.*` joignable | la LED de la borne passait à 100 % sur une fumée |
| les scénarios (`scenarios.py`) | les `light.*` sans catégorie ni cache | l'interrupteur déclaré ; et « sauf les veilleuses » laissait partir le groupe qui en contient une — son `turn_off` l'éteint avec les autres |
| le carnet (`lumieres.py`) | les `light.*` du registre + l'interrupteur déclaré | les lampes cachées, les groupes ; et un interrupteur renommé perdait sa fiche |

Chez lui : quatorze `light.*` MQTT, aucun groupe, une LED de borne en
`config`, un interrupteur déclaré lumière, une veilleuse. Trois de ces cinq
définitions se trompaient sur sa maison.

À côté, l'audit a relevé des défauts plus petits mais du même genre — une
chose sue à un endroit, oubliée à l'autre :

- la minuterie de la veilleuse tombait quand la lampe se taisait, et son
  retour reposait une durée pleine ; un simple réglage de luminosité
  (`on` → `on`) armait une lampe allumée avant la plage ;
- un état `on` sans `brightness` écrasait le dernier niveau connu par
  `{bri: None}`, et un dernier niveau dont rien ne se lit était rendu comme
  une table de `None` ;
- au rechargement de l'intégration, le journal (`regles.py`) ne laissait pas
  son écriture finale à l'instance suivante, qui relisait le fichier pendant
  qu'il s'écrivait — le carnet des lumières et celui des robots le faisaient
  déjà, mais pas quand l'échéance venait de sonner ;
- `loggia/volets/manoeuvres` et `loggia/nuit/etat` se lisaient sans les
  droits du compte, alors que `loggia/lumieres/journal` les respectait ;
- un patch de la règle Nuit mal formé (`lampes: "light.x"`) s'écrivait tel
  quel.

## La décision

**Une seule définition, au serveur, que toutes les règles lisent :
`custom_components/loggia/lumieres_maison.py`.** Pur, comme
`lumieres_calcul.py` : ni Home Assistant, ni horloge, ni disque avant la
marque « Le temps réel ».

- **Une lumière de la maison** : un `light.*` sans catégorie (ni `config` ni
  `diagnostic`), ni caché, ni désactivé, **plus** un interrupteur déclaré
  lumière (`loggia_switchlights`, à défaut `switchLights` de
  `loggia_entities`) que le registre connaît ou qui a un état. Un **groupe**
  dont un membre est de la maison s'efface : on garde les membres, un ordre
  ne compte pas double.
- **Ce qu'on épargne** : les veilleuses de la règle Nuit
  (`loggia_nuit.veilleuse.lampes`, que la règle soit active ou non), et tout
  groupe qui en contient une, de proche en proche. **Sa décision : les
  veilleuses sont épargnées partout** — coucher, départ, scénarios, danger
  mis à part (une fumée allume tout). Dans un scénario (retouches du 19/10),
  une extinction de la famille lumières les épargne donc **toujours**, que
  l'option « sauf les veilleuses » soit cochée ou non ; un allumage n'est pas
  concerné. L'option, devenue sans objet, a quitté l'éditeur le 19/10 (sa
  réponse « oui ») : plus de bouton, plus de champ écrit ; le serveur ignore
  encore celui d'un ancien scénario, sans redémarrage à demander. La
  veilleuse peut être un interrupteur déclaré lumière : la règle Nuit
  l'éteint par son service, sans transition.
- **Chacun par son service** : `light.turn_off` pour une lampe,
  `homeassistant.turn_off` pour un interrupteur — `light.turn_off` sur un
  `switch.*`, Home Assistant le refuse. Un ordre par service : le journal
  porte une ligne par lot, et son `n` compte les vraies lampes.
- Le registre **illisible** ne filtre rien : mieux vaut éteindre la LED de la
  borne que de ne rien éteindre.

Les cinq règles passent par là. Le carnet aussi, et il suit désormais le
renommage d'un interrupteur déclaré : sa fiche passe sous le nouveau nom, et
sa déclaration avec elle — sans quoi `loggia_switchlights` nommait un
interrupteur qui n'existait plus et la fiche transférée repartait au
recensement suivant.

Les défauts voisins se tranchent dans le même sens :

- la **veilleuse qui se tait** garde sa minuterie et son échéance ; revenue,
  l'échéance d'origine tient, et passée pendant le silence, la lampe s'éteint
  tout de suite. Un `on` → `on` n'est pas un allumage. Sans échéance connue,
  le retour vaut un allumage : mieux vaut une veilleuse qui s'éteint trop tôt
  qu'une qui brûle toute la nuit ;
- un `on` **sans niveau** garde le dernier niveau connu ; un dernier niveau
  dont rien ne se lit est `None` — l'écran (`dernierDe`) lisait déjà les deux
  de la même façon, vérifié avant de changer le contrat ;
- le **journal** dépose son écriture finale dans `hass.data[DOMAIN]`
  (`regles_ecriture`), et l'instance suivante l'attend avant de relire, dix
  secondes au plus — le patron des robots et du carnet. Une écriture déjà en
  vol se dépose aussi, dans les trois modules ;
- `loggia/volets/manoeuvres` refuse (`unauthorized`) une entité que le compte
  ne lit pas ; `loggia/nuit/etat` ne rend à un compte restreint que ce qu'il
  lit — la liste des veilleuses reste rendue, filtrée, l'écran en a besoin
  pour épargner ;
- un patch de la règle Nuit se vérifie **avant** d'écrire : des listes de
  textes, des jours de 0 à 6, sinon `invalid_format` et rien ne bouge.

## Ce que cela entraîne

- Un module de plus, `lumieres_maison.py`, et ses tests ; les cinq règles et
  le carnet le lisent. Le compteur `n` du journal et ses cibles disent ce qui
  est vraiment parti, par service.
- Un interrupteur déclaré lumière s'allume aussi sur un danger, tel quel (il
  n'a pas de niveau à monter), et revient à son état d'avant quand le danger
  passe.
- Le test qui relisait la source des commandes du carnet s'en va : la même
  chose se vérifie en exécutant (`test_websocket_api_execution.py`).
- `vue()` ne se calcule plus deux fois par note.
- Redémarrage de Home Assistant nécessaire : le composant change (un module
  nouveau, deux commandes WebSocket qui lisent le compte de la session).

## Ce qui n'est pas fait ici

- L'écran n'a pas changé : il a déjà sa propre liste d'épargnées
  (`entetelumieres.jsx`), qui dit la même chose. La faire lire au serveur est
  un autre sujet.
- La déclaration d'un interrupteur retiré du registre n'est pas nettoyée :
  le carnet cesse de le suivre, la liste le garde — on peut le réappairer.
