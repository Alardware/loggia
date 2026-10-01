# 0125 — Ranger ses cartes n'est pas un privilège d'administrateur

Date : 01/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

Deux symptômes, longtemps pris pour deux bogues distincts :

1. un message « réglage non enregistré » tombait à chaque sortie du mode
   édition de l'Accueil ;
2. le bouton de taille d'une carte de pièce « fonctionnait mal, comme si la
   zone qui englobe les cartes prenait le dessus » — au doigt **et à la
   souris**.

C'était le même. Le bouton agissait : il appelle `saveGrille`, qui écrit
`loggia_accueil`. L'écriture repartait **refusée**, et la carte reprenait sa
taille dès que la configuration revenait du serveur. Rien à voir avec un
pointeur.

**Ce qui a permis de le voir.** Le message ne disait pas quoi. Il nomme
désormais les clés refusées et ne se répète pas : `loggia_accueil` et
`loggia_histo`, soit exactement ce que la sortie d'édition écrit. Un message qui
ne nomme rien coûte des jours ; c'est la leçon à garder de celle-ci.

**Pourquoi c'était refusé.** `store.py` réservait aux administrateurs Home
Assistant toute clé qui n'était pas propre à un appareil. Le compte connecté
n'était pas administrateur.

**Décidé : la frontière change de place.** Elle ne sépare plus ce qui est
*commun* de ce qui est *propre à un appareil*, mais ce qu'une **erreur coûte**.

- **Ouverts à tous.** L'**agencement** — où se posent les cartes, dans quel
  ordre, de quelle taille, par format d'écran : `loggia_accueil`,
  `loggia_histo` qui archive ces mêmes agencements, les grilles des cinq vues,
  les caméras par ligne, Cartes ou Plan, l'ordre des scénarios, les épingles.
  Et l'**apparence** : thème, mode clair/sombre, barre de navigation, effets
  météo, langue. Rien là-dedans ne casse : au pire quelqu'un range autrement,
  et le suivant range à nouveau — exactement ce que deux administrateurs
  peuvent déjà se faire. Les refuser n'ajoutait **aucune** sécurité ; ça rendait
  le dashboard inutilisable depuis un compte ordinaire.

- **Toujours réservés.** Ce qui **configure** la maison : les pièces, les
  appareils, les caméras, l'alarme, les personnes, les vues personnalisées. Et
  `loggia_users` surtout, qui porte les rôles : c'était le vrai danger, et il ne
  bouge pas.

L'agencement écrit par un compte ordinaire va dans le **commun**, pas dans un
coin de son compte. Rangé ailleurs, il l'emporterait à la lecture pour ce compte
seul, et son écran se figerait sur l'agencement du jour où il a servi — c'est
précisément le défaut que le refus avait remplacé en son temps.

Trois tests : un compte ordinaire enregistre son agencement et il atterrit bien
dans le commun ; la configuration reste refusée ; et un garde-fou sur la liste
elle-même, qui refuse nommément qu'une clé de configuration s'y glisse un jour
par inadvertance.
