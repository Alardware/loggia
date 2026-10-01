# 0116 — Une playlist en une touche, et une phrase pour l'Echo

Date : 01/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

« Qu'en est-il des playlists pour la musique ? »

Elles étaient déjà atteignables : « Parcourir » demande son arbre au lecteur
(`media_player/browse_media`), et Spotify, Plex, Sonos ou Music Assistant y
rangent les leurs. Seulement il fallait redescendre trois niveaux chaque fois.

## Les favoris gardent le point d'arrivée

Une étoile sur chaque ligne jouable du navigateur ; ce qu'on étoile revient en
une touche sur la fiche du lecteur.

**Le contrat de `browse_media` :** un élément qui porte `can_play` se rejoue en
recopiant TELS QUELS son `media_content_id` et son `media_content_type` dans
`play_media`. C'est un identifiant **opaque** — on ne le reconstruit pas, on ne
le devine pas.

D'où un choix qui compte : les favoris se rangent **par lecteur**. Une URI
Spotify ne veut rien dire pour un Plex. Les proposer partout ferait échouer la
commande là où personne ne regarde — chez le lecteur, en silence.

Une vignette embarquée (`data:image/jpeg;base64,…`) n'est pas gardée : elles
pèsent parfois des centaines de kilo-octets, et le navigateur n'en tient que
cinq méga-octets pour Loggia entier.

## La phrase, seul chemin d'un Echo

Une enceinte Alexa ne sait **pas** `browse_media`. Dans `alexa_media_player`,
`play_media` avec le type `custom` appelle `run_custom(media_id)` : le texte est
exécuté comme s'il avait été dit à voix haute. La phrase entière EST
l'identifiant, et elle se range donc comme n'importe quel favori.

La phrase reste **celle de l'utilisateur**, dans sa langue et avec ses mots :
c'est son Alexa qui l'écoute. Rien n'est traduit, complété, ni proposé d'office.

## Trois défauts trouvés sur l'installation RÉELLE

« La différence entre ce que toi tu crois qu'il y a, et moi qui n'ai rien. »

Le champ ne s'affichait pas chez lui. Trois causes empilées :

**1. L'intégration ne venait pas que de l'appareil.** `integrationDe` ne lisait
que le registre des appareils ; ses Echo n'y en ont pas. `src/discovery.js` le
disait pourtant déjà, au-dessus de `platform` : « 21 appareils de l'installation
d'essai n'ont aucune intégration dans le registre, mais leurs entités, elles, en
ont une. » L'appareil d'abord, la plateforme de l'entité ensuite.

**2. Deux intégrations Alexa cohabitent**, et créent chacune leur entité pour la
même enceinte :

| entité | intégration | sait la phrase ? |
|---|---|---|
| préfixée par la pièce | **Alexa Devices**, officielle | non |
| non préfixée | **alexa_media_player**, HACS | oui |

Loggia affiche la première et doit commander la seconde. `cibleAlexa` va
chercher la sœur.

**3. L'appariement par le nom ne marchait qu'une fois sur trois.** L'officielle
écrit « Echo Dot - Bureau » là où l'autre écrit « Echo Bureau ». Leurs
IDENTIFIANTS, eux, se répondent : l'officielle préfixe par la pièce, donc
`<piece>_echo_salon` finit par `echo_salon`.

**Décidé :** deux signes stricts, et seulement eux — l'un des deux identifiants
finit par l'autre, ou les deux noms portent exactement les mêmes mots. Rien au
jugé : viser la mauvaise enceinte ferait parler une autre pièce, ce qui est pire
que ne rien faire.

## La leçon

Tout avait été vérifié dans la **démo** — où l'Echo d'exemple avait été ajouté
avec un appareil en bonne et due forme. Vérifier ce qu'on a soi-même construit
pour que ça marche ne prouve rien. Les trois défauts ne sont sortis qu'en
regardant l'installation réelle.
