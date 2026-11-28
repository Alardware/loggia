# 0392 — La voiture a sa fiche à onglets : la charge, le climat, l'historique

*24 novembre 2026 — appliqué (v3.101.0) (sa demande du 24/11 : « ok maintenant pour les voitures », avec ses exemples ; aperçu
sur la démo, PC, tablette et téléphone, deux cartes A et B ; sa réponse : « B : barre + dessin » ; le 27/11, la voiture devient
une photo)*

*Complète l'ADR [0386](0386-la-serrure-la-voiture-la-litiere-et-la-fontaine.md) (la voiture reconnue sans réglage, sa carte et sa
popup), dont elle lève une partie de l'« écarté » : la climatisation, la charge et les historiques.*

## Le problème

Depuis l'ADR 0386, Loggia reconnaît une voiture connectée par sa famille d'entités et lui donne une carte et une popup. La popup
était une liste : la batterie, l'autonomie, « Recharge », le verrou, les ouvrants, les pneus, et un seul geste, « Verrouiller ».
Il y manquait ce qu'on attend d'une voiture électrique : la batterie en barre avec sa limite de
charge, la puissance et le temps qui reste, la limite et le courant à régler, la climatisation, la trappe, la position, le
compteur, l'historique de la batterie et des kilomètres, les dernières recharges.

Trois défauts aussi, vus en montant l'aperçu :
- la trappe de charge d'une Tesla est une `cover` de classe `door` : branchée, elle est ouverte, et la voiture se disait
  « Ouverte » (la nuit, « Voiture ouverte la nuit ») ;
- la `climate` d'une voiture passait pour un thermostat de la maison (Objets, Chauffage), sa trappe pour un volet (Objets,
  Volets) ;
- avec plusieurs distances (BMW : totale, électrique, réservoir, compteur), l'autonomie ne se triait pas.

La démo porte le cas, aux clés de l'intégration Tesla Fleet.

## La décision

**La découverte** (`composes.js`) ajoute des rôles, chacun null quand la voiture ne le publie pas : la puissance de charge, le
temps restant (une durée) ou l'heure de fin (un horodatage), l'énergie prise, la limite de charge (un `number` en %, sinon un
capteur lu), le courant demandé, la charge à lancer (un interrupteur, sinon les boutons démarrer / arrêter), la trappe (une
`cover`), le climat (une `climate`, sinon un interrupteur, sinon un bouton qui le lance), le dégivrage, le volant chauffant, les
températures intérieure et extérieure, la consommation (sa clé ou son unité, « kWh/100 km », « Wh/km »). La classe d'abord ; les
clés de traduction, lues dans le code des intégrations, ne servent qu'à TRIER. La trappe n'est plus un ouvrant. Les clés
d'autonomie de BMW (`remaining_range_*`) rejoignent le tri.

**La carte** garde le gabarit (plaque, nom sous la plaque, phrase, pourcentage nommé) et gagne, en bas, la barre de la batterie
(verte en charge, la règle des piles sinon, l'accent du thème au repos) et le trait de sa limite. La compacte a la barre en fil, au
bas, sans trait. En charge, la phrase dit le temps qui reste (« En charge · 1 h 40 »). **Variante choisie : B** (sa réponse du
24/11, « B : barre + dessin ») : la grande carte porte aussi la voiture en filigrane (la photo de la fiche), à droite, au-dessus de la barre,
sans la borne — le câble vert branchée, le courant qui coule en charge, une portière ouverte qui s'ouvre. Ni la compacte, ni une
voiture muette n'ont de filigrane. La variante A (la barre seule) est écartée.

**La fiche** devient une feuille à onglets, hauteur fixe (`BottomSheet onglets`), une seule croix :
- **Voiture** : la voiture en photo de studio détourée, sans marque, la même pour toutes (`dessinvoiture.jsx`, `assets/voiture/`) —
  argent au thème sombre, graphite au clair (son choix du 27/11, après trois dessins jugés trop simples ; la bascule est en CSS,
  l'ombre au sol est un noir translucide) ; dessinés par-dessus aux couleurs du thème : la borne et son câble vert quand elle est
  branchée, le courant qui coule dans le câble en charge, une portière ouverte s'ouvre pour de vrai (prise sur la photo, elle
  pivote sur sa charnière ; l'habitacle et le siège paraissent derrière — l'ambre posé dessus, jugé laid le 27/11, est parti), l'air qui monte
  au-dessus du toit le climat en marche ; la batterie en grand, l'autonomie, la barre ; les pastilles (verrou, position — qui
  ouvre la carte de Home Assistant, compteur, température dehors) ; les actions rapides (Verrouiller quand elle est
  déverrouillée, Climat, Dégivrage) ; puis les ouvrants, les pneus, la consommation, le dernier signal, « L'appareil » ;
- **Charge** : l'état, la puissance, le temps qui reste et l'heure de fin, l'énergie prise, la barre et sa limite ; Charger
  (bascule) ou Démarrer / Arrêter (boutons), la limite et le courant (pas à pas ; un pourcentage par pas de 5), la trappe
  (Ouvrir / Fermer selon ce qu'elle déclare) ;
- **Climat** : la température dedans et dehors, la climatisation (bascule ; le premier mode que la `climate` publie hors
  « off »), la consigne (pas à pas, ses bornes et son pas), le dégivrage et le volant chauffant ;
- **Historique** : la batterie sur 7 jours (la limite en pointillé, les recharges en vert), les kilomètres de chaque jour, les
  dernières recharges (« lundi · 23:30 → 01:00 · 66 → 80 % »).
Un onglet n'existe que si la voiture publie de quoi le remplir ; une commande, que si son entité existe (règle 46).

**La maison** : la `climate` et la trappe d'une voiture ne sont plus découvertes comme un thermostat ou un volet
(`entiteDeCompose`, `climateZones`, `voletCovers`) ; une saisie à la main les garde. La carte Leaflet montre la voiture
(`FeuilleCarte`, `autres`).

**Écarté** : « Déverrouiller », le klaxon, les phares (verrouiller ne laisse entrer personne ; le reste se fait sur place) ; les
sièges chauffants (des listes propres à chaque marque) ; le carnet de trajets ; la photo de SA voiture et son logo (la photo de la fiche est la même pour toutes, sans marque).

## Les conséquences

- Écran seul : aucun fichier Python, pas de redémarrage de Home Assistant.
- La démo porte douze entités de plus et une semaine d'historique (`historiqueVoitureDemo`) : deux trajets par jour, plus longs le
  week-end, une recharge à 7,1 kW dès 23 h 30 jusqu'à 80 %.
- 30 textes dans les sept langues.
- Tests : `tests/voiture_0392.test.mjs`. Assertions modifiées : `chantier_2011_lot6_voiture` (la batterie n'est plus une rangée ;
  ni déverrouillage, ni pêne, ni klaxon, ni phares, mais la clim et la charge permises ; la signature de la fiche ; « L'appareil »
  et « Verrouiller » dans l'onglet Voiture ; « hors #fff »), `choix` (7 feuilles à onglets), `demo_mesures` (les températures de
  la voiture sont à sa fiche).
- Hors champ : une voiture vue seulement par le téléphone (les capteurs « Android Auto » de l'application Home Assistant), sans
  appareil à elle ; les sièges
  chauffants ; la « Pile faible » du serveur pour la batterie d'une voiture (ADR 0386).
