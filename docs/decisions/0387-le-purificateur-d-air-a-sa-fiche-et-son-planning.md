# 0387 — Le purificateur d'air a sa fiche : la scène animée, ses modes, son planning, son filtre, sa journée

*21 novembre 2026 — appliqué (v3.100.0) (sa consigne « Consigne Loggia — nouvelle popup Purificateur d'air », 21/11)*

## Le problème

Le 21/11, une consigne écrite par l'utilisateur, avec sa maquette (un canevas interactif) : remplacer la popup de son
purificateur d'air (VeSync LV-PUR131S, au bureau) par une popup sur le modèle de celle du poêle — onglets, bandeau d'état,
grande carte centrale, boutons de mode —, avec une scène animée inspirée de l'appli VeSync. Ses mots : « pour le purificateur
d'air, à sûrement adapter, modifier un peu, mais je veux garder l'animation ».

Jusque-là, un `fan` ouvrait la fiche universelle de l'appareil : une ligne de commande, les préréglages en puces, la vitesse
(ADR 0385), puis toutes les entités. Rien ne disait la qualité de l'air, le filtre, ni ce que l'appareil fait.

Chez lui, relevé dans le registre et la base de Home Assistant (lecture seule) : `fan` avec `preset_modes` auto et sleep,
`percentage_step` 33,3 (trois vitesses), `percentage` nul en Auto ; un capteur `air_quality` (« excellent »…), un capteur
`filter_life` (%, diagnostic), un interrupteur `display` (configuration). Ni verrou enfant, ni minuterie, ni bouton de remise
à zéro du filtre.

## La décision

**Reconnaître un purificateur.** Un `fan` dont l'APPAREIL porte une mesure de l'air (clé `air_quality`, `pm25`, `aqi`, ou
classe `pm25`, `pm10`, `aqi`) ou un filtre (`filter_life`, `filter_life_remaining`) ouvre sa fiche ; tout autre ventilateur
garde la fiche universelle. Jamais d'après un nom. Seule cette reconnaissance est au démarrage (`purificateurboot.js`) ; la
fiche (`fichepurificateur.jsx`) et ses calculs (`purificateur.js`) se chargent à l'ouverture.

**La fiche, sur le modèle du poêle.** Une feuille à onglets (hauteur fixe) : Accueil, Planning, Filtre (si l'appareil publie
son filtre), Historique. En-tête commun : la plaque à la couleur du niveau, le nom, « pièce · fabricant modèle », l'épingle,
une croix.

**Accueil.**
- Le bandeau de sa consigne (§ 4), mot pour mot, et « Planning : Nuit à 22:30. » quand le planning est allumé. Air mauvais ou
  pollué, appareil allumé : le bandeau prend la teinte du niveau (fond 12 %, bord 50 %, triangle).
- **La scène, gardée telle quelle** : le halo qui respire, les particules aspirées du bord vers le disque par trois voies
  (230, 185, 150 px), le disque de 196 px au double anneau, les quatre pales en moulinet. Le rythme de sa consigne : facteur
  0 éteint, 0,45 en Nuit, 0,7 / 1 / 1,5 selon la vitesse ; particules 16 / 24 / 36 / 46 / 62 selon le niveau, × 0,6 en Nuit ;
  un hasard figé (graine 7) pour que l'animation ne reparte pas à chaque relevé. Éteint : gris, immobile, « Éteint ».
  « Réduire les animations » coupe tout.
- Dans le disque : « QUALITÉ DE L'AIR », le niveau en grand, la ligne du mode (« Auto · vitesse faible », « Nuit ·
  silencieux », « Manuel · vitesse forte », « · 2 h » avec la minuterie), et « Filtre 72 % › » — « Vérifier le filtre » à
  25 % et moins — qui ouvre l'onglet Filtre.
- La rangée des modes et des vitesses fusionnés : Auto, les crans de l'appareil (Faible, Moyen, Fort pour trois), Nuit, puis
  ses autres préréglages. Choisir allume. Le choisi en bleu plein.
- Les actions rapides : Marche/Arrêt (rallume dans le dernier mode, ticket #43), Écran (s'il a l'interrupteur), Verrou (s'il a
  le verrou enfant), Minuterie. Ce que l'appareil n'a pas n'est pas montré.
- Les lignes : Dernier signal, L'appareil (la fiche universelle, par-dessus).

**Planning.** Une semaine de plages (lundi = 0), au pas de 30 min, chacune un mode : Arrêt, Auto, un cran, Nuit — ceux que
l'appareil sait. L'interrupteur, les jours, la frise de 24 h, les plages dépliables (mode, début ± 30 min, supprimer),
« Ajouter une plage » (la plus longue coupée en son milieu), « Copier sur lun → ven », « Copier sur 7 jours ». Le planning vit
dans Home Assistant (`purificateurs.py`), comme celui des robots : un tic par minute, le mode part au début de chaque
CHANGEMENT de mode, un changement manqué pendant un redémarrage part au démarrage (moins de six heures, une fois), l'heure
répétée de l'automne ne relance rien. Il commande sans auteur. Seuls les administrateurs l'écrivent
(`loggia/purificateurs/regler`) ; tout compte le lit sous ses droits de lecture (`loggia/purificateurs/etat`).

**Filtre.** Le pourcentage en grand, l'état (« En bon état », « Bientôt à changer » à 25 %, « À remplacer » à 10 %), la jauge,
la phrase ; « Filtre remplacé · remettre à 100 % » en deux appuis, seulement si l'appareil a le bouton de remise à zéro.

**Historique.** Les dernières 24 h en escalier sur cinq bandes (Très bon → Pollué), les trois du haut teintées, « pire : … » ;
puis les gestes du jour (allumé, éteint, mode, vitesse) et les changements de l'air, les plus récents d'abord.

**Ce qui change par rapport à sa consigne, et pourquoi.**
- Les couleurs : celles de sa maquette, mais en JETONS du thème — Très bon `--o-ok`, Bon entre `--o-ok` et `--o-warn`, Moyen
  `--o-warn`, Mauvais `--o-warn2`, Pollué `--o-bad` ; les plages Arrêt gris, Auto vert, les crans en bleu d'accent plus ou moins
  plein, Nuit violet. Les fonds sombres de la maquette (`#101827`, `#161d2b`…) deviennent les surfaces du thème : la fiche
  reste lisible en clair et dans chaque thème.
- La minuterie : ni VeSync ni Home Assistant n'en publient pour ce modèle. Elle passe par les minuteurs du composant
  (`minuteurs.py`, déjà là) : 2 h, 4 h, 8 h, puis annulée ; le libellé compte à rebours à la seconde (la règle des actions
  différées). Sans réponse du composant, pas de bouton.
- La note du planning dit « jusqu'au prochain changement de mode » au lieu de « jusqu'à la plage suivante » : c'est ce que fait
  le moteur — deux plages de suite au même mode (la Nuit de 22:30 puis celle de 00:00) n'en font qu'une, minuit ne réimpose
  rien.
- Le bandeau de la Nuit ne dit « écran éteint » que si l'écran l'est.
- Écarté : la ligne « Diagnostic › N entités » (« L'appareil » les montre déjà) ; « Dernier remplacement » et « Référence » du
  filtre (rien ne les publie) ; « Loggia vous prévient à 10 % » (aucune alerte n'existe pour un filtre). Le niveau
  « Pollué » est gardé pour d'autres purificateurs : le LV-PUR131S n'en remonte que quatre.
- Les particules : quand l'appareil ne donne que des µg/m³, le niveau suit les paliers de la table des capteurs (bon sous
  10, moyen sous 25), coupés en cinq : la fiche et la carte du capteur ne se contredisent pas.

**Chaque commande suit l'entité** (sa remarque du 21/11 : « attention les commande doivent correspondre a l'entité, ecran par
exemple, moi je l'ai mais pas tout le monde » ; guide UX, règle 46). Rien ne paraît que l'appareil ne publie, ni case vide ni
bouton grisé :
- Marche/Arrêt : les bits 32 (allumer) ou 16 (éteindre) de `supported_features` ;
- Écran : un `switch` ou une `light` de l'appareil, clé `display`, `led`, `screen` ou `display_backlight`, disponible ;
- Verrou : un `switch` de l'appareil, clé `child_lock` ou `physical_controls_locked`, disponible ;
- Minuterie : le composant répond, et l'appareil sait s'éteindre (bit 16) — elle éteint par `fan.turn_off`, pour tout
  ventilateur ; elle n'utilise pas la minuterie propre d'un appareil ;
- Auto, Nuit, autres modes : le bit 8 et le préréglage dans `preset_modes` ; les crans : le bit 1 et `percentage_step` (2 à
  6 crans) ; une vitesse sans crans : un pas à pas ;
- la qualité de l'air et ses mots : une mesure de l'air de l'appareil, disponible ; sans elle, la scène dit « En marche » ;
- le filtre, son onglet et sa pastille : un capteur `filter_life` disponible ; sa remise à zéro : le bouton de l'appareil ;
- le planning : au moins deux modes que l'appareil sait (Arrêt, Auto, crans, Nuit, ou Marche pour un appareil sans modes) ;
  le serveur refuse lui aussi un mode que le masque ne déclare pas ;
- le bandeau et l'historique ne nomment ni vitesse sans crans, ni Nuit sans mode nuit, ni mode qu'il n'a pas.

## Les conséquences

- **Redémarrage de Home Assistant** : un module neuf (`purificateurs.py`) et deux commandes WebSocket. Sans redémarrage,
  l'onglet Planning le dit (« Le planning se règle une fois Home Assistant redémarré… ») ; le reste de la fiche marche.
- Chez lui : la fiche s'ouvre sur son purificateur du bureau ; Écran présent ; Verrou absent ; Filtre à 0 % lu le 21/11
  (« À remplacer », « Vérifier le filtre »). Planning éteint tant qu'il ne l'allume pas.
- La démo porte les deux cas : le purificateur du salon, complet (qualité de l'air, filtre, écran, verrou, sa journée, son
  planning en mémoire), et celui de la chambre, minimal (marche, arrêt, son filtre).
- Tests : `tests/purificateur.test.mjs`, `tests/purificateur_commandes.test.mjs` (purificateurs-types et mutants d'appareil),
  `tests/python/test_purificateurs.py`. 23 mutants de code des gardes, tous tués. Le guide UX gagne sa règle 46 (`guide_ux` : 46 règles). Assertions modifiées : `choix` (six feuilles
  à onglets), `test_websocket_api` (les deux commandes classées), `test_demarrage` (68 commandes).
- Hors champ, noté : la carte du purificateur (Objets, Pièces) reste la carte générique ; une alerte du filtre au téléphone ;
  la scène qui suivrait le geste avant la réponse de l'appareil (elle suit le relevé suivant, deux secondes au plus).
