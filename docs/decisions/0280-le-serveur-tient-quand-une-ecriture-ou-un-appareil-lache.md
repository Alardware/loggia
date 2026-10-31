# 0280 — Le serveur tient quand une écriture ou un appareil lâche

*28 octobre 2026 — à l'essai (audit de consolidation du 28/10, lot 2 : M1, M2, M3, M4, B1, B2)*

## Le problème

L'audit du 28/10 a relevé six fragilités du composant. Aucune ne se voit tant
que tout va bien : chacune attend une écriture refusée, un appareil qui
décroche ou un fichier abîmé.

1. **Sauvegarder avant d'éteindre (M1).** Les minuteurs et le test de la
   sirène sauvegardaient leur table **avant** d'éteindre, sans garde. Une
   écriture refusée (plafond du magasin, disque) laissait la lampe ou la
   sirène allumée. Au démarrage, la même exception interrompait le
   rattrapage : les minuteurs suivants n'étaient ni exécutés, ni réarmés, ni
   réécoutés.
2. **Un appareil muet perdait son minuteur (M2).** Le code promettait qu'un
   appareil « unavailable » garde son minuteur « parce qu'il revient souvent
   allumé, et doit s'éteindre à l'heure ». Pourtant l'échéance le prenait pour
   éteint et abandonnait : la lampe revenue allumée le restait.
3. **Un fichier de configuration illisible bloquait tout (M3).** Un JSON
   abîmé, Home Assistant le met lui-même de côté. Une autre panne de lecture
   (droits, disque, version de format) levait, et toutes les commandes
   `config/*` échouaient à chaque appel. Les reprises d'un fichier ancien
   vivaient dans un `if True:`, sans version.
4. **La table vivante passait au magasin (M4).** Minuteurs et sirène
   rangeaient leur table vivante dans le cache du magasin, puis la modifiaient
   avant l'écriture. Le chauffage passait ses reprises vivantes à `Store`,
   qui sérialise plus tard.
5. **Un vent à « nan » (B1).** `float("nan")` passe : `valeur >= seuil` était
   toujours faux, et la mise à l'abri ne partait jamais.
6. **Des écoutes sans filtre (B2).** Les alertes et l'eau écoutaient
   `state_changed` sans filtre : leur rappel tournait à chaque changement
   d'état de la maison, pour en rejeter presque tous.

## La décision

**Éteindre d'abord, sauvegarder ensuite, sous garde.**

- Les minuteurs (`_async_echoir`) et la sirène (`_async_eteindre`) retirent
  l'entrée en mémoire, éteignent, **puis** sauvegardent dans un `try`.
- Une sauvegarde ratée laisse au pire une entrée sur le disque. Le prochain
  démarrage la trouve éteinte et l'efface.
- Le rattrapage du démarrage entoure chaque entrée d'un `try` : une entrée qui
  lève est journalisée, les suivantes passent, et tout est réarmé et
  réécouté.

**Un appareil muet garde son extinction, 24 heures au plus.**

- À l'échéance, un appareil `unavailable`, `unknown`, ou pas encore recréé au
  démarrage, n'est plus abandonné. L'entrée reste dans la table.
- Son retour passe par l'écoute des états :
  - revenu allumé, il s'éteint, avec le contexte de celui qui avait posé le
    minuteur, et la ligne du journal habituelle ;
  - revenu éteint, il n'y a plus rien à faire.
- **Borne : `ATTENTE_MAX` = 24 h après l'heure prévue.** Au-delà, on renonce
  (une ligne `info` au journal de Home Assistant, rien au journal de Loggia,
  puisque rien n'a été éteint). La borne est armée par un rendez-vous à
  `fin + 24 h`, et l'état est revérifié au moment de l'échéance comme au
  renoncement.
- Pourquoi 24 h : c'est la durée maximale d'un minuteur (`TOTAL_MAX`). Un
  appareil parti pour de bon ne garde pas un rendez-vous éternel, et une lampe
  qui reviendrait trois jours plus tard ne s'éteint pas sur un geste oublié.

**Le magasin repart vide sans jamais perdre le fichier illisible.**

- `_lire_fichier` entoure `Store.async_load` d'un `try`.
- Si la lecture lève, le fichier est **copié** à côté, sous
  `<fichier>.corrupt.<AAAAMMJJTHHMMSS>`, par `shutil.copy2` hors de la
  boucle. Il n'est jamais déplacé ni renommé. Le magasin repart vide.
- Si la copie échoue (ou qu'aucun chemin n'est connu), le magasin passe en
  lecture seule : `_ecrire`, désormais la seule porte vers le fichier, refuse
  par `MagasinIllisibleError` jusqu'au prochain redémarrage. Une première
  sauvegarde aurait écrasé la seule version de la configuration.
- Sans fichier du tout, il n'y a rien à garder : le magasin s'écrit
  normalement.

**Les reprises sont versionnées.**

- `SCHEMA = 2`, rangé dans le fichier sous `schema`, distinct de
  `STORAGE_VERSION`, la version du format de Home Assistant. Changer cette
  dernière rendrait le fichier illisible à une version précédente de Loggia.
- `_migrer_schema` joue dans l'ordre, chacune une fois :
  1. la remontée d'une configuration de compte vers la maison ;
  2. le code administrateur en clair devenu un haché.
- Un fichier sans `schema` les rejoue toutes. Elles ne changent rien à un
  fichier déjà à jour, qui n'est pas réécrit pour une étiquette : la version
  part avec la prochaine écriture.
- Un fichier d'une version **plus récente** (retour arrière de Loggia) n'est
  pas touché : ni reprise ni ménage.

**Une copie à la frontière.**

- Minuteurs et sirène passent `copy.deepcopy(self.table)` au magasin.
- Le chauffage passe `copy.deepcopy(self.reprises)` à `Store.async_save`.

**Les nombres finis seulement.** `LoggiaVolets._nombre` rend None pour `nan`,
`inf` et `-inf`, comme pour un état non numérique. Cela vaut pour le vent comme
pour la température extérieure, qui passent toutes deux par cette fonction.

**Des écoutes filtrées.**

- `alertes.py` et `eau.py` passent `event_filter=etat_ecoute` à
  `bus.async_listen("state_changed", …)`. Le filtre est une fonction
  `@callback`, ce que Home Assistant exige d'un filtre.
- Les alertes gardent les `binary_sensor.*` et `alarm_control_panel.*`, y
  compris une entité qui disparaît, puisque `entity_id` reste dans l'événement.
- L'eau garde les `valve.*`, `switch.*` et `binary_sensor.*`, que `_suivi`
  trie ensuite comme avant.

## Ce que cela coûte

- **Un minuteur en attente reste dans la table jusqu'à 24 h** après son
  heure, sans se montrer à l'écran : `vue` ne montre que les minuteurs en
  cours. Reposé sur le même appareil, il est remplacé.
- **Un magasin illisible repart vide** : le tableau de bord se présente comme
  neuf jusqu'à ce qu'on restaure la copie. C'est mieux qu'un tableau de bord
  qui refuse tout, et la copie est là. Le journal de Home Assistant dit où.
- **Une copie par écriture des tables des minuteurs et de la sirène**, qui
  font au plus 50 entrées.

## Ce qui n'est pas fait

- **Le test de la sirène n'attend pas une sirène muette** : un test de 3 s
  n'a rien à éteindre une fois la sirène revenue. Il garde son comportement.
- **Aucun écran ne dit qu'un magasin est illisible.** Seul le journal de Home
  Assistant le dit, avec le chemin de la copie.
