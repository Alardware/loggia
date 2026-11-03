# 0316 — Les médias restants : le volume au pavé, l'annonce par une voix de synthèse, écrire sur la TV

*1er novembre 2026 — à l'essai (rien de publié) (lot 12 du rapport « Gladys comparé au catalogue », 31/10 : M1, M2, M3 ; les points du 30/10)*

*Complète l'ADR [0207](0207-la-carte-et-la-popup-d-un-lecteur.md) : la fiche d'un lecteur gagne trois gestes.*

## Le problème

Trois points du 30/10 restaient ouverts :

- **M1.** La table de la télécommande avait `vol_plus` et `vol_moins` pour l'Apple TV
  (`telecommande.js`), mais le pavé ne dessinait que Retour, Accueil, Lecture et Veille.
- **M2.** L'annonce ne passait que par Alexa. Une enceinte Cast (« Chromecast intégré »)
  ne pouvait rien dire, alors que la maison a des moteurs de synthèse : Piper, la voix
  de Home Assistant Cloud.
- **M3.** Quand l'Apple TV attend du texte (une recherche, un mot de passe Wi-Fi d'une
  appli), il fallait la télécommande physique ou le téléphone. Home Assistant le dit
  pourtant : un binaire « clavier » (`keyboard_focused`) passe à `on`.

## La décision

**M1 — Volume − et Volume +** dans la rangée du pavé, après Veille. Chacun n'apparaît que si
la table de CETTE intégration a la touche (`TOUCHES_TV`) : Apple TV, Android TV, Roku,
Samsung oui ; LG non (sa table n'a pas de volume). Un geste envoie une touche
(`remote.send_command`), comme les autres. La barre de volume du lecteur reste ce qu'elle
était.

**M2 — L'annonce par `tts.speak`.** Un panneau « Annonce » dans la fiche d'un lecteur :
- de la plateforme `cast` (`plateformeDe`, jamais le nom). Google Cast lit l'adresse du son
  que la synthèse produit. Une Apple TV ou une Echo ne la jouent pas de façon sûre : elles
  ne sont pas dans la liste (`VOIX_LUES`, voixmedia.js). Une Echo garde l'annonce d'Alexa ;
- qui sait jouer un média (le bit PLAY_MEDIA, 512) ;
- et quand au moins une entité `tts.*` répond. L'état d'un moteur est l'heure de sa
  dernière phrase, `unknown` tant qu'il n'a rien dit : seul `unavailable` le retire.

Le formulaire est celui de l'annonce d'Alexa : le champ, « Annoncer », les quatre annonces
toutes prêtes, la ligne « Annoncé sur {lecteur} : « … » », et la carte qui l'écrit six
secondes. Avec un seul moteur, il n'y a rien à choisir. Avec plusieurs, un menu « Voix »
(`ListeChoix`), qui part sur le premier par ordre de nom. Le choix n'est pas retenu d'une
ouverture à l'autre : le plus simple. L'appel est
`tts.speak { entity_id: <moteur>, media_player_entity_id: <lecteur>, message }`, sans
langue : celle du moteur. Une seule annonce en vol ; un refus se dit.

**M3 — Écrire sur la TV.** Le service est `apple_tv.set_keyboard_text`, arrivé dans Home
Assistant le 1er avril 2026 (PR #165638, vérifié dans `apple_tv/services.py`) ; il y a aussi
`append_keyboard_text` et `clear_keyboard_text`. `set_keyboard_text` REMPLACE le contenu du
champ de la TV : ce qu'on tape est ce qui s'y trouve. Il refuse de lui-même si le clavier
n'a pas le focus (`keyboard_not_focused`).

Ce service ne prend pas d'entité mais l'**entrée de configuration** (`config_entry_id`).
L'écran ne la connaît pas : le composant la pose dans l'index, sous la clé `clavier`, sur
le binaire `keyboard_focused` de la plateforme `apple_tv`, et sur lui seul
(`discovery.py`, `_entites`). Rien ne se devine au nom. L'identifiant stable
(`unique_id`) ne sort toujours pas. Une entrée de configuration n'est pas un secret : le
service la demande à quiconque l'appelle.

Dans la fiche, le champ « Écrire sur la TV » s'offre en tête du panneau de la TV pendant
que ce binaire, rattaché par l'APPAREIL du lecteur, est à `on`, et seulement si le service
existe dans l'installation (`services` de l'index). Le texte part sur « Envoyer » ou
Entrée, jamais à la frappe. Un refus se dit (« Home Assistant a refusé. ») et le texte
reste dans le champ. Le champ s'en va avec le focus. Une TV tenue par le mode enfant n'a
ni applis ni télécommande, ni ce champ.

Écarté :
- écrire à la frappe (`append_keyboard_text` à chaque lettre) : un appel par touche ;
- une passerelle au serveur (`loggia/media/ecrire`) qui retrouverait l'entrée : plus de
  code et de droits à vérifier, pour la même chose.

## Les conséquences

- **Redémarrage de Home Assistant requis** pour M3 : `discovery.py` pose le drapeau
  `clavier`. Sans redémarrage, le champ ne s'offre simplement pas. M1 et M2 n'en ont pas
  besoin.
- Poids : tout ce qui est neuf vit dans la fiche du lecteur, chargée à la demande, et dans
  `voixmedia.js`, qu'elle seule importe. Au démarrage, seule la clé `clavier` de l'index
  (`src/discovery.js`) s'ajoute.
- Six clés nouvelles × 6 langues ; « Annonce », « Annoncer », « Envoyer », les annonces
  prêtes et « Home Assistant a refusé. » sont réutilisées.
- Tests : `tests/medias_restants.test.mjs` (15) et `tests/python/test_clavier_apple_tv.py` (3).
  Vérifié dans les tests seulement : aucun service appelé chez lui.
- La démo montre M1 (l'Apple TV de la chambre a sa télécommande). Elle ne porte ni M2 ni
  M3 : il y faudrait une enceinte Cast de plus (la vue Médias et ses tests comptent ses
  lecteurs) et une liste de services, que la démo n'a pas.
