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

## Amendement (03/10/2026) — le choix d'une icône et le quart de tour du plan

**Redémarrage de Home Assistant requis.**

L'audit du 03/10 a trouvé deux clés d'apparence restées du côté réservé, faute
d'avoir été rangées quand la frontière a bougé : `loggia_icones`, le glyphe
choisi pour une entité, et `loggia_vacrot`, le quart de tour appliqué au plan
du robot. Depuis un compte ordinaire, le geste s'affichait, un message le
disait non enregistré, et il disparaissait au rechargement — le symptôme de
départ, sur deux clés de plus.

**Décidé : elles rejoignent l'apparence** (`APPARENCE`, store.py). Elles ne
font que remplacer un dessin ou tourner une image ; une erreur ne coûte rien :
on rend l'icône d'origine, on tourne encore d'un quart. Comme l'agencement,
elles vont dans le commun — une icône vaut pour toutes les cartes de la maison
qui montrent cette entité.

**Ce qui ne suit pas.** L'association des couleurs du plan aux pièces
(`loggia_vacplan`) décide de ce que le robot nettoie quand on touche une zone :
c'est de la configuration, elle reste réservée. Le choix des agendas affichés
(`loggia_agendas`) reste réservé aussi, par décision du 03/10. Le planning du
robot garde son refus voulu et dit (0043).

Un test : un compte ordinaire pose une icône, tourne le plan, rend l'icône
d'origine, et tout atterrit dans le commun ; les deux voisines restent
refusées, nommément.
