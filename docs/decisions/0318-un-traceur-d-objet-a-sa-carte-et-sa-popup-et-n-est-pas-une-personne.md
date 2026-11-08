# 0318 — Un traceur d'objet a sa carte et sa popup, et ce n'est pas une personne

*1er novembre 2026 — appliqué (v3.97.0) (lot 13 du rapport « Gladys comparé au catalogue », 31/10 : H2)*

## Le problème

Un traceur d'objet (Invoxia : un sac, un vélo, un chien) arrive dans Home Assistant comme un
`device_tracker`, avec les capteurs de son appareil : la batterie, le dernier signal, la
dernière position, la précision, la méthode de localisation, l'état du traceur. Loggia ne lui
donnait que la carte générique d'une présence, « Présent » (`cartescustom/cartes.jsx`). Elle
ne disait ni sa batterie, ni depuis quand il s'est tu. Et il n'apparaissait dans Objets que si
on l'ajoutait à la main.

## La décision

**La reconnaissance.** Un traceur d'objet est un `device_tracker` d'une intégration de
traceurs, reconnu à sa plateforme : `invoxia_biotracker` (vue au registre de l'installation
d'essai) ou `invoxia` (`estTraceur`, state.js). Jamais à son nom. Un téléphone (`mobile_app`),
un routeur (`unifi`, `ping`) n'en sont pas. Les capteurs se lisent à leur clé, rattachés par
l'APPAREIL du traceur (`pickSibling`) :
- la zone : l'état du traceur, au mot de la présence (`lieuPresence`, ADR 0300) : « À la
  maison », « Absent », le nom de la zone tel quel, « Inconnu » ; « Indisponible » quand il
  ne répond plus ;
- la batterie : le capteur `battery` de son appareil, sinon l'attribut `battery_level` ;
- le dernier signal : le capteur de clé `last_seen`, sinon l'attribut `last_seen`, sinon
  l'heure de la dernière position (`last_location`, capteur puis attribut), sinon le
  dernier changement d'état du traceur ;
- l'état : le capteur de clé `tracker_state`, tel que l'intégration l'écrit. C'est un mot de
  son service ; Loggia ne connaît pas ce vocabulaire et ne le traduit pas.

**La carte** (`cartetraceur.jsx`) suit le gabarit des cartes IoT (ADR 0202), celui de l'eau
chaude : le nom, la zone (en vert à la maison), « Signal il y a 3 j », la batterie nommée.
Étroite (1c) : la batterie en haut. Compacte : la batterie à droite. Aucune commande : il
n'y a rien à commander. Toucher ouvre la popup.

**La popup** (`fichetraceur.jsx`) : une feuille sans onglets. En tête, où il est et son
dernier signal ; puis le dernier signal avec l'heure exacte, la batterie, l'état du traceur,
et « L'appareil » (la fiche universelle).

**Où elle vit.** La carte générique (`CvCard`) passe la main à cette carte, partout où un
traceur est posé. Objets montre le traceur, une carte par appareil, sous IoT (« les
appareils »). Un autre `device_tracker` (le téléphone d'une personne) n'y entre toujours pas.
Pas de vue dédiée (un appareil = sa carte + sa popup).

**Ce n'est pas une personne.** La présence de la maison ne lit que les `person` choisies dans
la vue Présence (presence.py, `tous_absents`) ; la découverte des personnes ne retient que le
domaine `person` (`resolvePeople`). Un traceur n'y entre pas, et ce lot ne l'y fait pas
entrer. Un test l'épingle.

**Le poids.** La carte et la popup se chargent à la demande, feuille comprise
(`lazyRecharge`) : le démarrage ne porte que leur adresse, `estTraceur` et le branchement.
Pour compenser, `vacRooms` et ses aides (le rattachement des pièces de l'aspirateur aux
zones) quittent state.js pour robotsfiche.js : seule la fiche du robot, chargée à la demande,
les appelait. Le démarrage passe de 1 061 068 à 1 059 858 octets.

**Démo.** Un vélo (plateforme `invoxia_biotracker`), à la maison, sa batterie sur le
traceur, son dernier signal sur un capteur de clé `last_seen`. Pas de capteur d'état : son
vocabulaire n'est pas connu, la démo n'en invente pas.

## Les conséquences

- Aucun redémarrage de Home Assistant : l'index porte déjà la plateforme et la clé.
- Tests : `tests/traceurs_objets.test.mjs`. Une assertion modifiée dans
  `tests/fiche_robot.test.mjs` (`vacRooms` s'importe de robotsfiche.js).
- Pas fait : la position sur une carte, la précision et la méthode de localisation (elles
  restent dans « L'appareil ») ; le mot de l'état du traceur reste celui de l'intégration.
- Une maison où une `person` est reliée à un traceur d'objet le voit compter dans sa
  présence : c'est sa configuration de Home Assistant, pas Loggia. Loggia ne le corrige pas.
