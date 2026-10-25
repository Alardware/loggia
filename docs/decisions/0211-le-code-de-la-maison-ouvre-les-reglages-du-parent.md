# 0211 — Le code de la maison ouvre les réglages du parent

*17 octobre 2026 — accepté, à l'essai (chantier Mode enfant ; rien de publié). La conception : `docs/chantier-mode-enfant.md`, E2 B tranché par lui le 17/10, E12, E13, E14 ; § 7.4 ; § 8.*

## Le problème

Sur la tablette de famille — un compte ordinaire de Home Assistant —, le « Code parent » de
sa maquette (2d) doit ouvrir les réglages du profil, accorder quinze minutes, lever les
limites. Jusqu'ici toute configuration de la maison est aux administrateurs
(`require_admin`) : sur la tablette, le code parent serait un décor, ce que l'ADR 0045
refuse. Le code de la maison existe (`loggia/pin/verifier`, haché, limité en essais), et son
laissez-passer de cinq minutes (ADR 0080, `code_admin.py`) — mais il ne gardait qu'un
affichage, le profil Admin. Un second code serait un code de plus à retenir.

## La décision

**Le code de la maison ouvre les réglages du mode enfant, cinq minutes, sur ce compte ; un
administrateur Home Assistant s'en passe (E2 B).** Six commandes (E12, § 7.4) :
`loggia/enfant/etat` à tous, sous les droits de lecture du compte — jamais le code, jamais le
jeton dans la réponse ; `loggia/enfant/config`, `lever` et `repondre` à un administrateur OU
au porteur d'un laissez-passer valide, sinon `code_admin_requis`, le code que l'écran traduit
déjà ; `loggia/enfant/demander` et `dormir` à tous, bornés à ce que le compte peut piloter
(`controle_de`). `test_websocket_api.py` gagne une troisième liste, `CODE_OU_ADMIN`, et compte
49 commandes. `loggia_enfant` n'entre pas dans `OUVERTES_A_TOUS` : par `config/set` elle reste
aux administrateurs (un import) ; le laissez-passer n'ouvre que la commande du module, qui
valide chaque valeur (`poser_patch` refuse sans écrire). C'est la première commande de
CONFIGURATION ouverte au laissez-passer : le code est haché, vérifié par le composant, limité
en essais — il peut porter cette charge.

*17/10, passe bis (point 7).* Le laissez-passer n'ouvre que les PROFILS : `loggia/enfant/config`
refuse `simulation` (« Observer sans agir », un réglage de la maison) à qui n'est pas
administrateur de Home Assistant (`unauthorized`) — il passait avec le seul code de la maison —,
et refuse toute clé qui n'est ni `profils` ni `simulation` (`invalid_format`, la clé nommée), que
le module aurait ignorée en silence. `test_websocket_api_execution.py` le tient.

**À l'écran.** La rangée « Réglages parent » de la popup dit « Code à 4 chiffres » à un compte
ordinaire et « Ouvrir » à un administrateur ; le pavé (`PinModal`, « Requis pour les réglages
du mode enfant ») vérifie par `loggia/pin/verifier` — qui pose le laissez-passer — puis ouvre
la feuille ; un refus `code_admin_requis` d'une commande de la feuille (le laissez-passer a
expiré) referme la feuille et rouvre le pavé. « Code parent », au pied de la feuille : un
administrateur le change sur place (`loggia/pin/definir`, les règles de Paramètres) ; les
autres lisent où il se change — c'est le même code que celui de Paramètres, sur tous les
appareils, pas un second.

**La demande (E13).** Une à la fois par profil, depuis la popup d'un écran bloqué par le temps
— pas au coucher, pas depuis une enceinte : `invalid_format`. Elle vit dans l'état, expire au
bout de trente minutes sans réponse (« demande expirée » au journal), et part au téléphone par
`regles.prevenir`, étendu d'un `data` : deux boutons, « Accorder 15 min » et « Refuser », dont
l'identifiant d'action porte un jeton aléatoire à usage unique (`secrets.token_urlsafe(16)`,
préfixe `LOGGIA_ENFANT_`) ; le serveur écoute `mobile_app_notification_action`, et un jeton
reconnu vaut la réponse — seul le téléphone qui a reçu la notification le connaît. Le parent
répond aussi depuis la feuille (« Lino demande 15 min de plus · Apple TV Chambre · à 18:20 »,
Accorder / Refuser). Accordée : quinze minutes de plus au jour, l'écran peut se rallumer — par
la télécommande ou la puce « Allumer », jamais par la maison. Refusée : plus de demande jusqu'au
lendemain, et la popup le dit (« Demande refusée · demain dès 07:30 »). Le journal : « 15 min
accordées · depuis le téléphone », « demande refusée · depuis l'écran ».

**Lever et rétablir (E14).** `loggia/enfant/lever {minutes: 30}` pose `leve_jusqua` : pendant
ce temps aucune règle du profil n'agit, la pastille dit « Limites levées », la popup « Limites
levées jusqu'à 18:15 » et « Limites levées : volume libre », le curseur reprend toute sa
course ; `{minutes: 0}` rétablit. La bascule « Mode enfant » de la feuille éteint le profil
(`actif: false`) : rien n'agit, tout se voit — la rangée dit « Désactivé », la ligne du volume
« Mode enfant désactivé : volume libre ».

## Ce que cela coûte

Cinq minutes où le code n'est plus demandé sur la tablette (dit tel quel). Un enfant qui
connaît le code de la maison connaît celui-ci — c'était déjà vrai du profil Admin. Une réponse
donnée depuis le téléphone se voit sur la tablette au sondage suivant (60 s, 15 s la popup
ouverte). `mobile_app_notification_action` n'était pas encore employé dans Loggia : à vérifier
chez lui au moment du go, par une notification d'essai — jamais par un volume. La démo ne sonne
pas : sa demande se note au journal.

## Ce qu'on n'a pas fait

Un second code « parent » (E2 C) ; le téléphone seul (E2 D) ; une demande au coucher ; une
réponse depuis la carte ; le « · par vous » du bandeau de la levée.

## Ce que les tests tiennent

`tests/python/test_websocket_api.py` (les trois listes, `_code_ou_admin`, les schémas des six
commandes), `test_websocket_api_execution.py` (49 commandes ; le refus `code_admin_requis` d'un
compte ordinaire, le laissez-passer posé par `loggia/pin/verifier`), `test_enfant_calcul.py`
(une demande à la fois, trente minutes, le refus du jour, le jeton), `test_enfant.py` (la
demande part au téléphone avec deux boutons et la réponse revient par le jeton ; refusée depuis
l'écran, plus de demande du jour, une demande expire ; l'état se lit sous les droits du compte),
`tests/fiche_media.test.mjs` (la rangée selon le compte, le pavé, la feuille qui s'ouvre, la
demande envoyée), `tests/fiche_enfant.test.mjs` (lever, rétablir, la bascule, la réponse à la
demande, un refus `code_admin_requis` qui rouvre le pavé, « Code parent »),
`tests/pin_faux.test.mjs` (le sous-titre du pavé), `tests/demo_enfant.test.mjs` (le faux serveur
a les droits du vrai : le code ouvre cinq minutes).
