# 0302 — Le tableau Énergie en entier : toutes les sources, l'eau chaude, la borne, Tempo et le prix qui varie

*30 octobre 2026 — à l'essai (rien de publié) (chantier G3, « Énergie complète », d'après la comparaison des intégrations Gladys du 30/10 : D3, D4, E1 à E7)*

## Le problème

- **D3.** `resolveEnergy` ne lisait que la PREMIÈRE source solaire et la
  PREMIÈRE batterie : avec deux onduleurs, la moitié de la production.
  `prodJourParts` était calculé et jamais lu.
- **E1.** Les puissances que Home Assistant NOMME dans son tableau Énergie
  (`stat_rate`, le niveau `stat_soc`, la capacité `capacity`) étaient ignorées
  au profit d'une déduction par appareil voisin. Les conventions de signe ne
  sont pas celles de Loggia : la batterie de Home Assistant est positive en
  DÉCHARGE, `batNow` en charge ; le réseau est positif en import.
- **D4, E5.** Une seule connexion dont le prix vient d'une entité qui varie
  (prix spot, tarif horaire) s'appelait « Tarif unique », et la prévision que
  l'entité publie n'était pas lue.
- **E2.** Un `water_heater` s'affichait par son état brut, en anglais.
- **E3.** La puissance de charge de la voiture (`evNow`) ne venait que d'un
  réglage.
- **E4.** Le créneau d'heures creuses de `rtetempo` n'a pas de clé de
  traduction : `creneau.js` ne le trouvait pas. Rien ne disait « demain, jour
  rouge ».
- **E6, E7.** Ni l'autonomie de la batterie, ni la production solaire prévue.

## La décision

- **Toutes les sources.** Une grandeur à une source garde sa clé (`solarNow`,
  `prodJour`, `batRate`, `batSoc`, `consoNow`) ; à plusieurs, ses PARTS
  (`…Parts`) et la clé seule reste nulle — aucune n'est élue pour le tout
  (ADR 0030). `energieparts.js` les relit pour la vue Énergie, l'Accueil et la
  carte Énergie maison : `idsDe` (la clé seule l'emporte sur ses parts),
  `sommeLue` (un onduleur muet ne fait pas tomber l'autre ; rien de lisible :
  `null`, jamais 0).
- **Ce que Home Assistant nomme passe d'abord.** `stat_rate` sur la source, la
  liste `power` de l'ancienne source réseau, puis `power_config.stat_rate`.
  Réseau → `consoNow` (le flux net, positif en import, comme avant). Solaire →
  un `stat_rate` par onduleur, sinon la puissance voisine de son compteur —
  SEULEMENT si c'est la seule puissance de l'appareil : un micro-onduleur à
  batterie en porte trois (deux panneaux, la batterie), et la première venue
  était la batterie à −300 W. Plusieurs puissances : rien pour cette source.
  Avec UN SEUL onduleur, la règle d'avant reste (la première puissance de
  son appareil) : un onduleur qui publie son AC et son DC garde son solaire. Batterie →
  `batRate`, au sens de Home Assistant, que `puissanceBatterie`
  (`energiebatterie.js`, chargé avec la vue Énergie seulement) INVERSE à la
  lecture et nulle part ailleurs ; `power_config.stat_rate_inverted` est déjà
  au sens de Loggia (`batNow`, une part par batterie). Les deux conventions se
  SOMMENT (`batNow − batRate`) : deux batteries d'une même maison peuvent ne
  pas parler pareil. `stat_soc` avant le voisin. `capacity` sort à
  côté des identifiants (`batteries: [{ soc, capacite }]`), comme un prix. Un
  appareil mesuré prend son `stat_rate`. L'ancien chemin reste pour les
  versions de Home Assistant qui n'ont rien de cela. La fiche reste
  prioritaire, famille par famille : les parts et `batRate` sont dans leur
  famille (`FAM_SCHEMA`), et la capacité ne vaut plus dès que la fiche nomme
  la batterie. Le serveur écarte des piles le niveau nommé (`_batterie_maison`).
- **Le prix du moment.** Une seule connexion, un prix venu d'une entité, qui a
  varié dans la journée ou dont la prévision a plusieurs valeurs : « Prix du
  moment ». La prévision se lit par sa FORME (`lirePrevision`, tarif.js) : une
  liste d'objets portant un instant avec l'heure et un nombre — le début est le
  plus tôt des instants, le prix le nombre dont le nom dit un prix
  (`per_kwh`, `price`, `value`, `total`…) ou le seul. « Le moins cher :
  13:00–15:00 » : la fenêtre CONTINUE la moins chère à venir, deux heures,
  la plus tôt à égalité, l'heure en cours comprise, un trou coupe. Pas de
  liste d'intégrations. Nord Pool (l'intégration officielle) et Tibber ne
  publient leur prévision que par une action à eux : elles restent sans
  fenêtre.
- **L'eau chaude.** Une carte et une popup, chargées à la demande
  (`carteeau.jsx`, `ficheeau.jsx`, coquilles dans `cartes/eauborne.jsx`) : la
  température de l'eau, la consigne dans `min_temp`/`max_temp`, le mode
  traduit et la phrase de la carte générique — `modeChauffeEau`,
  `phraseChauffeEau`, `chauffeEauEnChauffe` (objets.js, chantier G1, recopiés
  ici à l'identique : les sept états standard, un mode du fabricant tel quel,
  l'orange de la chauffe seulement quand `hvac_action` vaut `heating` ou
  `preheating`) — et marche/arrêt. La carte remplace le rendu générique. Côté serveur, une OPTION
  du chauffage, DÉCOCHÉE par défaut (`eau_chaude.absence`, eau_chaude.py) :
  pendant les Vacances, `water_heater.set_away_mode` sur ce qui sait le faire,
  levé DOUZE HEURES avant la fin des Vacances ; des Vacances sans fin le
  gardent jusqu'au retour au Planning. Loggia ne lève que ce qu'il a posé
  (`.storage/loggia_eau_chaude_etat`) ; « Observer sans agir » n'envoie rien.
  Un ballon posé, VU en absence depuis, puis retrouvé hors absence pendant
  les Vacances a été remis à la main : il est laissé tranquille jusqu'à leur
  fin, sans nouvel ordre ; tant qu'il n'a pas été vu en absence, un « off »
  n'est que l'état d'avant l'ordre (un ballon en nuage publie tard). Un ballon
  muet au moment de lever reste posé : le moteur revient le voir toutes les
  5 minutes, deux jours au plus. Une levée refusée se retente trois fois, puis
  le journal de Home Assistant le dit.
- **La borne.** Trouvée par famille (borne.js) : un appareil qui porte une
  puissance ET un `number` de classe `current` réglable, plus un indice de
  recharge (`binary_sensor` `plug` ou `battery_charging`, ou un `enum` qui a
  `charging`) — une pompe à chaleur à courant limité n'en a aucun —,
  confirmé par une ligne des appareils mesurés du tableau Énergie. Un seul
  candidat, sinon rien. Elle remplit `evNow`. Sa carte (`obj:borne`, sous IoT,
  une par appareil) et sa popup : l'état, la puissance, les kWh de la charge
  en cours (l'index d'énergie depuis le branchement), le courant maximum
  (`number.set_value` dans ses bornes), la pause et la reprise seulement avec
  un interrupteur, et toujours avec une question.
- **Tempo.** Le serveur, seul à voir l'identifiant stable, pose un RÔLE dans
  l'index (`tarifs.py`, comme la famille d'un fil pilote) : `creneau` pour un
  binaire dont l'`unique_id` finit par `_off_peak` ; `couleur` / 
  `couleur_demain` pour un `enum` dont les options disent bleu, blanc et
  rouge (ou blue, white, red), le lendemain quand l'identifiant stable ou la
  clé de traduction le disent. `trouverCreneau` garde la clé de traduction
  d'abord, le rôle ensuite, un seul candidat. « Demain : jour rouge » est un
  point d'attention `info` du rail de l'Accueil, vers l'Énergie, seulement
  quand demain est rouge.
- **L'autonomie** : « ≈ 3 h de réserve » sous le jeton de la batterie = ce
  qu'elle tient (niveau × capacité, toutes les capacités connues) ÷ ce que la
  MAISON consomme, batterie comprise (`consoPourAutonomie` : la consommation
  de la vue moins la puissance de la batterie, ou le capteur de la maison) —
  le soir, 50 W de réseau pour 850 W de maison donnaient « ≈ 7 j » au lieu de
  9 h. Sous 50 W, rien.
- **« Surplus solaire — export réseau » ne change pas** : son flux net
  (`consoNow`) ne vient que de la FICHE (`ficheEnergie`, derive.jsx), jamais
  du flux net découvert ; l'injection et le surplus se lisent comme avant
  (`enHaids`, découverte comprise). Lue sur la découverte, elle s'allumerait chez lui dès
  100 W d'export, chaque jour de soleil : du bruit, pas un point rare et
  actionnable.
- **La production prévue** : `energy/solar_forecast`, la commande de Home
  Assistant, pour les entrées rattachées aux onduleurs
  (`config_entry_solar_forecast`) — « Prévu aujourd'hui », « Prévu demain »,
  dans la vue Énergie seulement, relus au tour de l'historique.

Écarté : désigner la couleur du lendemain par sa seule forme (les deux `enum`
de `rtetempo`, aujourd'hui et demain, ont les mêmes options) ; une pause de la
charge depuis la carte (elle se règle dans la popup, qui demande).

## Les conséquences

- **Le démarrage** : 1 042 508 octets, +9 213 sur l'état d'avant (1 033 295) —
  la découverte de la borne (`borne.js`), la lecture des parts
  (`energieparts.js`), la résolution, les coquilles de l'eau chaude et de la
  borne, et les mots du chauffe-eau de G1 (objets.js). Les cartes, les
  popups, la vue de la borne (`bornevue.js`), la batterie
  (`energiebatterie.js`), le prix dynamique (tarif.js) et la prévision
  (`previsionsolaire.js`) se chargent à la demande.
- **Redémarrage de Home Assistant** : le rôle Tempo de l'index, l'option de
  l'eau chaude, l'état publié du chauffage (`eau_chaude`).
- La démo porte chaque cas : deux onduleurs, la batterie au sens de Home
  Assistant (10 kWh), la borne trouvée sans réglage, le chauffe-eau de G1
  (`water_heater.ballon`, qui sait ici le mode absence), Tempo (demain
  rouge), la prévision solaire, et `?demo&tarif=dynamique` (un prix spot et
  sa prévision). Sa fiche Énergie ne
  nomme plus le solaire, la batterie ni la voiture.
- La borne garde son interrupteur reconnu comme prise par la règle des prises
  (`estPrise`) : sa carte de prise ne s'affiche plus dans Objets (un appareil,
  une carte), mais la liste des prises du serveur le compte encore.
- Le rendu générique d'un `water_heater` (`cartescustom/cartes.jsx`, corrigé
  par G1) cède la place à sa carte. Fusion avec G1 : `objets.js`, les quatre
  clés des catalogues (`Électrique`, `Pompe à chaleur`, `Forte demande`,
  `Performance`), le chauffe-eau de la démo et ses deux lignes de
  `cartescustom/cartes.jsx` sont recopiés de G1 à l'identique.
- Tests : `g3_energie_complete`, `g3_prix_dynamique`, `g3_tempo`,
  `g3_eau_borne`, `g3_demo` ; `test_eau_chaude.py`, `test_discovery.py`
  (Tempo), `test_veilles_capteurs.py` (`stat_soc`).
