# 0182 — Un réglage suit le profil, le profil suit l'écran

*10 octobre 2026 — accepté*

## Le problème

Signalé deux fois le même jour, par deux personnes :

> « Je me suis connecté en tant que Guillaume sur PC, j'ai activé désactivé des
> vues ; sur mobile, toujours en tant que Guillaume, rien, aucun changement. »

> « Il y a une différence d'interface entre la version PC et la version
> Téléphone. J'ai par exemple supprimé les scénarios et rajouté 2 sections sur
> la version PC […] et qu'une seule section ne s'affiche sur la version
> mobile. » — [issue #30](https://github.com/Alardware/loggia/issues/30)

## La cause

`readViewsCfg` / `writeViewsCfg` parlaient au **`localStorage` en direct** pour
trois clés : `loggia-hiddenviews`, `loggia-shownviews`, `loggia-vueordre`.
Chaque navigateur gardait donc son propre menu.

Le chemin normal est `cfgVal` / `cfgSet` : le serveur fait foi dès qu'il répond.
**Le symptôme était déroutant** parce que `loggia_customviews`, juste à côté,
passait bien par lui : les vues CRÉÉES arrivaient sur le téléphone, celles
MASQUÉES non. C'est exactement ce que décrit l'issue #30.

## La correction avait une moitié fausse

Les mettre dans la configuration était juste pour « le même profil sur deux
écrans », et **faux pour deux profils différents** :

> « Quand je change avec un profil, ça change pour tous les profils, donc ça va
> pas, c'est réservé au seul profil qui fait la modif. »

Le `localStorage` les séparait auparavant PAR APPAREIL — ce qui séparait deux
personnes par accident, pas par règle.

**Forme retenue** : une seule clé, un objet indexé par profil, exactement comme
`disposition.js` range une part par format d'écran. La clé reste celle
qu'`AGENCEMENT` autorise, donc un compte ordinaire peut toujours ranger son
menu.

## La moitié manquante : le profil actif était commun

Indexer par profil ne séparait **toujours** rien, pour une raison qui remonte
plus haut : `loggia_active_user` n'était pas une clé personnelle. Le profil
actif appartenait à la maison depuis le 03/09 — « on veut se retrouver au même
endroit, quel que soit l'écran que l'on prend ».

Conséquence invisible tant qu'un seul écran était allumé :

> « Si je modifie depuis mon PC avec le profil Nova, ça modifie sur la tablette
> aussi, qui est sur un autre profil — chaque profil pour la personnalisation
> est indépendant. »

La tablette n'était **pas** sur un autre profil : elle avait suivi. Le profil
actif est revenu dans les clés personnelles, **des deux côtés** (`PERSONNELLES`
dans `src/state.js`, `PERSONAL_KEYS` dans `store.py` — deux miroirs).

Changer de profil reste permis à un compte ordinaire : une clé personnelle n'est
pas une clé de maison, elle n'a pas besoin d'être « ouverte » pour être écrite.

## L'héritage avait un dernier défaut

> « Un profil non admin ne doit avoir que les vues par défaut et non les vues
> secondaires ; là j'ai Climatisation toujours d'affiché. »

Un profil sans part à lui héritait de la valeur **commune migrée** — celle
réglée avant que les parts existent. La part commune n'échoit plus qu'au
**premier** profil, qui est celui qui l'avait réglée. Tout autre démarre sur le
menu par défaut.

## La règle, en trois lignes

| ce qui | suit |
|---|---|
| un réglage (le menu, l'apparence) | le **profil**, à travers tous ses écrans |
| la disposition des cartes | l'**écran** (`disposition.js`) |
| les marges, les panneaux repliés, QUI regarde | l'**appareil** |

Restent communs à la maison : **qui** sont les profils et leurs droits
(`loggia_users`), le code administrateur.

Et le menu reste **réservé aux administrateurs** :

> « Un profil non admin ne peut pas toucher aux vues […] il peut juste modifier
> comme les autres l'organisation de son dashboard : carte standard ou compacte,
> déplacer, masquer, mais pas supprimer. »

## Conséquences

- Une signature des trois clés émet `loggia-views-changed` quand la
  configuration arrive : sans elle, il faudrait recharger la page pour voir un
  changement fait ailleurs.
- `tests/vues_suivent_le_compte.test.mjs` (neuf) refuse le retour au
  `localStorage`, vérifie que les trois clés restent hors des deux listes
  personnelles, qu'elles sont dans `AGENCEMENT` — et que `loggia_customviews`
  n'y est pas.
- `tests/synchro.test.mjs` est scindé : la liste des profils reste commune, le
  profil ACTIF devient personnel. Trois tests de `test_store.py` suivent.
- **`store.py` a changé : un redémarrage de Home Assistant est nécessaire.**
