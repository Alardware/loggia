# 0385 — Sept idées pour les autres maisons : Tempo, bornes, climat et air, chaudière, aspirateur, volets, caméras

*21 novembre 2026 — appliqué (v3.100.0) (chantier du 20/11, lot 5 : A3, A5, A6, A7, A8, A9, A10)*

## Le problème

Le 20/11, une revue de Loggia a cherché ce qui manquait pour des maisons équipées autrement que la sienne. Ces sept-là servent surtout les autres maisons ; l'utilisateur les a validées le 21/11. Dans chaque cas, Loggia savait lire la donnée, ou avait la commande, mais ne la montrait pas, ou ne connaissait qu'un seul cas.

## La décision

Écran seul. Chaque ajout n'apparaît que si l'appareil publie la donnée. On le reconnaît par `device_class`, clé de traduction, plateforme ou `supported_features`, jamais par un nom. Les clés ont été vérifiées dans le code public des intégrations.

- **A3, Tempo** (`tempo.js`, carte du Tarif).
  - « Aujourd'hui bleu · demain blanc · encore 14 rouges ».
  - La couleur du jour est le rôle `couleur` que `tarifs.py` pose déjà.
  - Les jours restants : seulement si la même intégration les publie (clé de traduction). Un rouge se dit en `--o-bad`.
- **A7, plusieurs bornes.**
  - La découverte rend une liste. Chaque borne a sa carte et sa popup : `obj:borne` pour la première, `obj:borne:<appareil>` pour les suivantes.
  - Dès qu'il y a plusieurs bornes, `evNowParts` fait la somme dans la vue Énergie, et « Borne en défaut » vaut pour chacune.
  - La popup dit « Dernière charge : 18 kWh, hier soir » : historique d'une semaine du compteur, charge coupée après 90 min sans relevé.
- **A5, climat et air** (`reglagesair.js`, `ReglagesAir`).
  - Ventilation et balayage d'un climatiseur.
  - Vitesse d'un ventilateur ou d'un purificateur : des puces de 2 à 6 crans, sinon un pas de 10 %.
  - Consigne d'humidité.
  - Une alerte de bac, par clé : Tuya `tankfull`, Vesync `water_lacks` et `water_tank_lifted`, Xiaomi `no_water`.
- **A10, la chaudière et la vanne** (`chauffageseuils.js`).
  - « Pression de la chaudière basse » sous 0,8 bar.
  - « Granulés bas » sous 10 %, si le capteur est en pourcentage et que sa clé parle de granulés.
  - Une tête thermostatique sans `hvac_action` « chauffe » quand sa vanne est ouverte à 5 % ou plus (`valve_position`, `pi_heating_demand`, `heating_demand`).
- **A6, l'aspirateur** (`robotsbase.js`).
  - Ce que fait sa base : « Vide le bac », « Lave / Sèche la serpillière ».
  - Ses alertes : réservoir d'eau sale plein, etc.
  - La pièce en cours : « Nettoie · Cuisine · 60 % ».
  - Clés de Roborock, Ecovacs (`station_state`) et Dreame. Aucun « bac plein » n'est inventé.
- **A9, les volets** (`confirmerouvrant.js`).
  - Deux repères fixes, « Aérer 30 % » et « Ombre 60 % », dans la fiche.
  - Ouvrir un portail ou un garage demande « Confirmer ? » pendant 4 s, sur la carte et la compacte. Fermer et arrêter partent tout de suite. Un volet n'est jamais interrogé.
- **A8, les caméras** (`camson.js`, `camcmd.js`, `camcommandes.jsx`).
  - Un bouton pour écouter, une caméra à la fois, si le flux porte une piste audio.
  - Une croix d'orientation : Reolink, maintenir pour bouger (avec `ptz_stop`) ; Tapo, un cran par appui. Pas ONVIF ni UniFi : rien de sûr ne dit qu'ils bougent.
  - « PRIVÉ » au lieu de « HORS LIGNE » (`switch` de clé `privacy_mode` : UniFi Protect, Reolink), sur toutes les tuiles. On ne confond plus avec une panne.

## Les conséquences

Écran seul : pas de redémarrage de Home Assistant. Quarante-six textes nouveaux dans les six catalogues ; pl.js n'a que des ajouts.

Le code a été écrit par quatre agents, sur des fichiers distincts, puis intégré et vérifié ensemble. Les tests : `tests/chantier_2011_lot5_{E,F,G,H}.test.mjs`.

Assertions existantes modifiées et marquées :
- `g3_eau_borne` : « deux bornes : rien » devient « la première » ;
- `lot13_volet_climat_pilote` et `volets_commandes_1910` : « Ouvrir » change de nom une fois armé, et un garage demande.

Chez l'utilisateur :
- ses deux volets Netatmo ont les deux repères ;
- ses caméras UniFi diront « PRIVÉ » en mode privé ;
- rien d'autre ne change (pas de Tempo, de borne, de climatiseur ni de purificateur ; son Ecovacs ne publie pas sa base ; ses thermostats ne publient ni ventilation ni humidité).

Pas fait :
- des positions favorites réglables (il faudrait une clé de plus au serveur) ;
- la confirmation dans la fiche d'un portail (`RoomCoverSheet`) ;
- la pièce de l'aspirateur dans « En ce moment » ;
- un point d'attention pour la chaudière ;
- le mode privé dans le compte « en ligne » de l'Accueil (`cameraEnLigne`).
