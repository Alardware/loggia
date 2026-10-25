# 0222 — Un écran peut ranger sa propre mise en page

*17 octobre 2026 — accepté (tranche 3 de `docs/chantier-synchronisation.md`)*

## Le problème

> « Sur la synchronisation il faudrait que ce soit comme pour une vraie app […]
> à la différence que sur chaque appareil l'utilisateur peut personnaliser la
> mise en page. »

Depuis le 18/09, la disposition suit le **type** d'écran : tous les téléphones
d'un profil partagent la même. C'est le bon défaut — rien ne se perd quand on
vide un cache ou qu'on passe de l'adresse locale à l'accès distant — mais une
tablette murale n'est pas une tablette de canapé.

## La décision

Son choix, entre trois (« A + B ») : **le type d'écran par défaut, et un écran
peut, s'il le veut, prendre la sienne**, sous un nom.

```
appareil nommé  →  type d'écran  →  ordinateur      (réglage par réglage, ADR 0221)
```

- La fiche de l'appareil (ADR 0220) gagne `propre` (vrai / faux) et `nom`.
- Une valeur rangée par profil porte, à côté de `formats`, une table
  `appareils` : `{ '<id>': { order, larges, compacts } }`. Elle reste dans la
  part du **profil** (ADR 0185) : sur une tablette partagée, chacun range la
  sienne.
- L'Accueil aussi : `loggia_accueil.appareils[id]` superpose sa grille à celle
  du format.
- Couper « sa propre mise en page » ne détruit rien : la part reste, inerte,
  et revient si on la rallume.

Ses réponses du 17/10 :

| Question | Réponse |
|---|---|
| Le nom | **automatique** — « Tablette », « Tablette 2 » — renommable quand on veut |
| Qui voit la section | **tout le monde** ; chacun règle SON écran ; oublier un autre appareil est réservé à l'administrateur |
| L'Accueil | **oui**, un appareil à part range aussi sa grille |
| L'interrupteur | **Paramètres › Appareils**, nulle part ailleurs ; le bandeau d'édition de l'Accueil affiche le nom de la mise en page qu'on range |

### L'écran qu'on ne reconnaît pas

Un écran sans fiche, alors que la maison connaît des appareils **nommés** de son
type, se voit demander une fois : « Cet écran est-il l'un de ceux-ci ? ». Le
choix reprend l'identifiant (`adopterAppareil`) et le profil de la fiche — sauf
un profil Admin, qui passe toujours par le code (ADR 0080). Sinon, il devient
un nouvel appareil, qui suit son type d'écran.

## Ce que cela entraîne

- Aucun changement de droits : les parts sont de l'agencement, ouvert à tous.
- Un appareil oublié laisse ses parts dans les agencements : inertes, puisque
  plus aucun écran ne porte son identifiant.
- La démo n'a pas de composant : la section s'y affiche, l'interrupteur n'y a
  pas d'effet.
- Dix-huit textes nouveaux, dans les sept langues ; le polonais est marqué
  pour relecture.

## Ce qui n'est pas fait ici

- **L'identifiant de l'application Home Assistant** pour téléphone, qui
  survivrait au cache vidé : pas vérifié. La question « Cet écran est-il l'un
  de ceux-ci ? » couvre le cas en attendant.
- Le bandeau d'édition **des vues** ne nomme pas encore la mise en page qu'on
  range : seul celui de l'Accueil le fait. Le composant `BandeauEdition` est
  aussi modifié par un chantier en cours ; on y reviendra après sa fusion.
- `loggia_camdispo`, `loggia_vuepieces` et `loggia_scnordre` restent par type
  d'écran.
