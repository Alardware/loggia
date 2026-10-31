# 0289 — La photo de fond suit le compte

*30 octobre 2026 — à l'essai (rien de publié)*

## Le problème

> « Le fond d'écran configuré sur Loggia n'est pas synchronisé : j'ai appliqué
> une image en 5G depuis l'extérieur ; connecté en Wi-Fi local, je n'ai pas
> d'image. »

La photo de fond était compressée puis gardée dans le `localStorage` de
l'appareil — « jamais envoyée au serveur ». Or le choix « Photo » de
l'apparence, lui, se synchronise avec le profil. L'adresse extérieure (Nabu
Casa) et l'adresse locale sont deux origines, donc deux `localStorage` : en
Wi-Fi, le fond demandait une photo que ce navigateur n'avait jamais vue. Une
tablette ou un PC n'en voyaient rien non plus.

## Décidé

La photo est rangée sur Home Assistant, sous le **compte** connecté (un compte
= un profil, ADR 0276), comme le reste de l'apparence :

- `fond.py` : `GET / POST / DELETE /api/loggia/fond`, vue authentifiée ; chacun
  ne lit et ne remplace que la sienne ; fichier `/config/loggia/fonds/<compte>.jpg`,
  hors de `/config/www/` (servi sans authentification) ; JPEG entier vérifié,
  4 Mo au plus, écriture d'un seul tenant.
- `fondphoto.js` : l'écran envoie la photo choisie, et note sa version
  (`look.fondV`) dans l'apparence ; un autre écran voit la version changer et
  reprend la photo (ETag, 304 sans transfert). Le `localStorage` n'en garde
  qu'une copie, pour le démarrage et hors connexion.
- Reprise : une photo que seul un écran connaît (`fondV` absent) est rangée au
  serveur à son ouverture — c'est son téléphone. Retirée ailleurs (`fondV` à
  `null`), elle n'est pas renvoyée et la copie s'efface.
- Sans jeton (la démonstration), rien ne part : la photo reste celle de l'onglet.

Option prise sans lui demander (règle « une question ne bloque pas ») : par
compte plutôt que pour toute la maison, parce que l'apparence est déjà par
compte.

## Conséquence

Nouvelle vue HTTP : **redémarrage de Home Assistant** nécessaire. Avant lui,
l'envoi échoue en silence et la copie locale tient ; la reprise se fait à
l'ouverture suivante.
