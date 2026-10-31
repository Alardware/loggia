# 0279 — Jamais défini, aucun code n'ouvre rien

*28 octobre 2026 — à l'essai (audit de consolidation du 28/10, lot 1 : H1, B4, M5 ; complète l'ADR du code administrateur haché, 18/09, et l'ADR 0278)*

## Le problème

L'audit du 28/10 a relevé trois faiblesses dans ce que le code de la maison
ouvre et dans ce que le journal montre.

1. **`0000` ouvrait tout tant que personne n'avait défini de code.** Tant
   qu'aucun administrateur n'avait défini de code, `pin/verifier` acceptait
   `0000` et donnait le laissez-passer de cinq minutes à **tout compte
   connecté**. Ce laissez-passer ouvre :
   - le passage vers un profil Admin ;
   - les gestes du parent dans le mode enfant (`enfant/config`, `lever`,
     `repondre`).

   `enfant/config` règle notamment `phrases_dormir`, du texte libre que
   `enfant/dormir` envoie à l'Echo en `media_content_type: "custom"`.
   L'intégration Alexa joue ce texte comme une phrase **prononcée**. Sur une
   maison qui n'avait jamais posé de code, un enfant ou un invité pouvait donc
   faire exécuter n'importe quelle commande vocale.
2. **Un code redéfini ne refermait rien.**
   - Les laissez-passer accordés par l'ancien code tenaient jusqu'à leur
     échéance.
   - Les ratés comptés contre l'ancien code bloquaient encore le nouveau.
   - Le dictionnaire des verrous par compte (`verrous_pin`) grandissait
     jusqu'au redémarrage.
3. **Le journal des règles se lisait en entier.** `regles/etat` rendait le
   journal entier, les gels, les tenues et les ordres en attente à **tout
   compte**, sans tenir compte des droits de lecture que Home Assistant pose
   sur un compte. Les lumières, le chauffage et le mode enfant, eux, filtraient
   déjà.

## La décision

**Il n'y a plus de code par défaut.**

- **Côté composant.** Tant qu'aucun code n'est défini, `pin/verifier` refuse
  par un refus **nommé**, `code_non_defini`. Ce refus ne compte pas comme un
  essai raté : il n'y avait rien à deviner. `CODE_DEFAUT` disparaît.
- **Côté écran, pour un administrateur de Home Assistant.** Le pavé devient
  « Créer le code administrateur » : on choisit le code, on le retape, et il
  part par `pin/definir`, réservée aux administrateurs. C'est la « première
  ouverture » : l'administrateur n'a pas besoin du code pour passer, donc une
  fois le code posé, le pavé a fini.
- **Côté écran, pour un autre compte.** Le pavé ne montre ni points ni
  touches. Il dit qu'aucun code n'est défini, et qu'un administrateur de Home
  Assistant doit le créer dans Paramètres › Profils.
- **Configuration en retard.** Si la configuration de l'écran n'était pas à
  jour, le refus nommé du composant fait passer le pavé dans cet état.
- **Paramètres.** La pastille « Encore 0000 » devient « Pas encore défini ».
- **Démo.** Elle suit le composant : sa maison n'a pas de code au départ.

**Les phrases pour dormir restent aux parents** (« code ou administrateur »),
puisque le code n'ouvre désormais que ce qu'un parent a choisi d'ouvrir. Le
composant valide la phrase avant de la ranger :

- 2 à 120 caractères, une fois les blancs du bord retirés ;
- des caractères imprimables seulement : ni retour à la ligne, ni caractère de
  contrôle ou invisible ;
- au moins une lettre ;
- aucun des signes qui ouvriraient un balisage : `<`, `>`, `{`, `}`, `\`.

Une phrase illisible relue du magasin s'écarte.

**Un code redéfini referme tout.**

- `pin/definir` retire tous les laissez-passer (`LaissezPasser.tout_retirer`)
  et oublie tous les ratés (`Limiteur.tout_oublier`).
- `verrous_pin` devient `VerrousParCompte`. Chaque entrée compte qui tient
  ou attend le verrou d'un compte, et la dernière à sortir la retire. Retirer
  un verrou encore attendu en ferait naître un second pour le même compte, et
  deux vérifications passeraient ensemble.
- Le nombre d'itérations et la longueur rangée ne changent pas (ADR 0278).

**`regles/etat` se lit sous les droits de lecture du compte**
(`_lecture_autorisee`) :

- Une ligne du journal ne garde que les cibles lisibles, et disparaît si elle
  n'en a plus.
- Une ligne sans cible (une alerte, un geste de la maison) reste.
- Les gels, les tenues et les ordres en attente sont réduits aux entités
  lisibles.
- Un compte sans restriction voit tout, comme avant
  (`regles.journal_lisible`, `regles.cles_lisibles`).

## Ce que cela coûte

- **Pour une maison sans code**, la tablette de famille au compte ordinaire ne
  peut plus ouvrir les réglages du mode enfant ni un profil Admin, tant qu'un
  administrateur n'a pas posé le code. C'est le but. Le pavé dit qui doit le
  faire, et où.
- **Un code redéfini** fait retaper le code sur les écrans qui avaient un
  laissez-passer en cours.
- **Un compte restreint** voit un journal plus court. Le nombre de lignes peut
  être inférieur à `limite` : la limite s'applique avant le filtre.

## Ce qui n'est pas fait

- **Le détail des lignes n'est pas filtré.** Une ligne du chauffage porte
  encore le nom du compte qui a repris la main. C'est un choix du journal
  (ADR du journal des règles), pas une entité.
- **`config/suivre` diffuse toujours le `user_id` des autres comptes.**
- **Les phrases pour dormir pourraient aller plus loin.** On pourrait les
  réserver aux administrateurs, ou les choisir dans une liste fixe, si un jour
  le code de la maison devait être donné à des personnes à qui l'on ne
  confierait pas l'Echo.

Ces trois points sont notés dans l'audit du 28/10, sans être décidés ici.
