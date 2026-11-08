# 0312 — Les caméras disent quoi par la clé de leur intégration ; la sonnette et le colis vont au journal et au rail

*1er novembre 2026 — appliqué (v3.97.0) (lot 8 du rapport « Gladys comparé au catalogue », 31/10 : D19, C1, C2)*

*Complète l'ADR [0031](0031-les-cameras-disent-leur-dernier-evenement.md) : les détecteurs d'une caméra et son dernier événement.*

## Le problème

- **D19.** Ce que la caméra a vu (personne, véhicule) se trouvait par un motif sur l'identifiant (`resolve.js`,
  `camDetections`). Le motif « voiture » attrapait `…_alarme_de_voiture_detectee` : chez UniFi Protect, c'est la clé
  `car_alarm_detected`, un SON. Le bon capteur ne gagnait que parce qu'il venait avant. L'animal n'existait pas.
- **C1.** Chez UniFi Protect, le colis n'existe qu'en entité `event` (clé `package`). Loggia ne lisait aucun `event`.
- **C2.** L'appui sur la sonnette est aussi une entité `event` (classe `doorbell`). Rien ne l'écrivait nulle part.

Son registre (lecture seule, 01/11) : `person_detected`, `vehicle_detected`, `animal_detected`, `car_alarm_detected`,
`doorbell` (le binaire, classe `occupancy`), et les `event` `doorbell` (classe `doorbell`), `package`, `vehicle`,
`smart_detection`, `motion_detection`, `sound_detection`. L'état d'un `event` est l'instant du dernier événement ; après un
redémarrage de Home Assistant, il vaut `unknown` jusqu'au suivant.

## La décision

**Ce que la caméra a vu se trouve à la clé de traduction** (`CLES_DETECTION`, `resolve.js`), lue dans l'index de l'écran :
`person_detected` / `person`, `vehicle_detected` / `vehicle`, `animal_detected` / `animal` / `pet`, `doorbell` / `visitor`,
`package_detected` / `package` (UniFi Protect, Reolink). `pickSibling` reçoit deux critères, `cles` et `sansCle`.

- Le nom reste un **repli**, pour une intégration qui ne donne pas de clé, et seulement sur une entité SANS clé : une entité qui
  en a une est nommée par son intégration, et si ce n'est pas la nôtre, c'est autre chose. Le repli saute aussi ce qu'une caméra
  entend (alarme, klaxon, aboiement, son).
- **L'animal** rejoint la personne et le véhicule partout où ils se disent : la tuile, la fiche, la vue Sécurité (« Animal
  détecté », « Animal », la patte), la liste de l'utilisateur complétée, les clés du sondage.
- Rien n'a été ajouté au composant : l'index porte déjà la clé (`key`), aucun redémarrage de Home Assistant.

**La sonnette et le colis** (`evenementsPorte`, `evenement.js`) : une entité `event` de classe `doorbell` est un appui ; une
entité `event` de clé `package` est un colis. Sans clé, le nom (`package`, `colis`, `parcel`), sur l'appareil d'une caméra
seulement. La détection intelligente, qui sait aussi dire « package » parmi d'autres, n'en est pas une.

- **Au journal de l'écran** (`deriveNotifs`) : « Sonnette · On a sonné à 14:12 · Entrée », « Colis · Un colis déposé à 14:12 ».
  Une entrée par événement (la clé porte l'instant), qui se marque lue comme les autres. Et dans le journal de la vue Sécurité,
  où la ligne dit « Détecté » à l'heure de l'événement.
- **Dans « En ce moment »**, en tête après la vigilance : « On a sonné à 14:12 », « Un colis déposé à 14:12 », au nom de
  l'appareil. La ligne ouvre la caméra. Le geste « Vu » la retire.
- **Jusqu'à quand.** « Vu » vaut pour l'écran où on l'a touché, comme « lu » au journal (`journal.js`) : marquer vu sur son
  téléphone n'efface pas le colis de la tablette du couloir. Sans geste, la ligne part à son heure : **30 min** pour un appui
  (au-delà, ce n'est plus « en ce moment », et le journal le garde) ; **12 h** pour un colis (déposé l'après-midi, il est
  rentré le soir ; le lendemain matin, la ligne ne dirait plus rien de vrai). Le journal de l'écran ne reçoit un événement que
  dans cette même fenêtre.
- **Rien au téléphone** : aucune clé dans `CLES_TELEPHONE`, aucune notification. Aucun point d'attention : un colis n'est
  pas un danger.

**La caméra en grand quand on sonne : une option de l'ÉCRAN, décochée par défaut** (Paramètres › Apparence, à côté de la
veille et du retour à l'accueil : c'est le même écran de couloir). Elle n'est proposée que s'il existe une sonnette sur
l'appareil d'une caméra.

- Par écran (stockage du navigateur), et non de la maison : on la veut sur la tablette de l'entrée, pas sur le téléphone. Ce
  n'est donc pas un réglage réservé aux administrateurs.
- Cochée, App monte `sonnettegrand.jsx`, chargé à la demande (`lazyRecharge`), sur cet écran seulement. Il guette un appui
  NEUF : un instant que l'écran n'avait pas, de moins de 60 s, l'écran visible. La première lecture ne fait qu'apprendre : un
  rechargement ne rejoue jamais l'appui d'avant.
- La fiche de la caméra s'ouvre telle quelle (`CamSheet`) sur la caméra que porte le même appareil (le flux retenu par la
  résolution), puis se referme 60 s après l'appui, ou plus tôt par sa croix. La veille s'efface pendant ce temps.
- Aucune commande ne part : la fiche ne bascule un mode de la caméra que sur un geste.

Écarté : une notification aux personnes à la maison (sa décision, rapport C2) ; un « Vu » partagé par la maison (il faudrait
une clé ouverte à tous au composant) ; un réglage de la maison.

## Les conséquences

- Aucun redémarrage de Home Assistant : rien n'a changé au composant.
- La démo porte un appui de sonnette (il y a 4 min) et un colis (il y a 25 min) sur la caméra de l'entrée.
- Le boot grossit d'environ 3,7 Ko ; la caméra en grand vit dans un morceau à part (1,5 Ko).
- Pas fait : une sonnette qui n'est pas sur l'appareil d'une caméra n'ouvre rien (elle va quand même au journal et au rail) ;
  après un redémarrage de HA, l'état `unknown` d'un `event` ne dit rien jusqu'au prochain événement ; les autres `event`
  (véhicule, détection intelligente) ne sont pas lus.
- Tests : `tests/cameras_disent_quoi.test.mjs`. Vérifié dans les tests seulement, ni en démo ni chez lui.
