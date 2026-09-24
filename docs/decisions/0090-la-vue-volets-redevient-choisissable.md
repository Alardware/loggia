# ADR 0090 — La vue Volets redevient choisissable

**Statut** : décidé et appliqué le 2026-09-24 ; gardé en local pour la mise à
jour groupée de correctifs.

Point S2 du plan du 22/09 : « La vue Volets, joignable par la seule recherche ».

## Le constat, et ce que le plan n'avait pas vu

La vue existait, sa route marchait — `view === 'volets' ? <VoletsView …>` — mais
on n'y arrivait que par un résultat de recherche sur un volet, par `?vue=volets`,
ou par une session qui s'en souvenait. Le plan proposait donc : la supprimer, ou
lui rendre un chemin visible.

En regardant, la situation est **à l'envers**, et c'est ce qui tranche.

`HIDDEN_VIEWS` n'est pas « la liste des vues cachées ». C'est **la liste des
vues secondaires que l'on peut activer** dans Paramètres › Vues. Or :

- **Lumières, Climat et Médias y figurent** — alors qu'elles n'ont plus de vue
  à elles : leurs routes ouvrent Objets avec un filtre posé (ADR 0023).
- **Volets n'y figurait pas** — alors qu'elle porte une VRAIE vue, sa barre de
  modes et son planning.

Trois entrées qui ne sont qu'un filtre étaient proposées ; la seule qui a du
contenu propre ne l'était pas. Elle n'était pas masquée par choix : elle était
**absente du choix**.

Le commentaire du code le disait déjà, sans en tirer la conséquence : « le motif
d'alors — l'Ouverture vit dans la vue Climatisation — n'a plus cours :
`ClimatView` n'existe plus […] et les volets ont de nouveau leur vue à eux ».

## La décision

**Une ligne dans `HIDDEN_VIEWS`**, entre Climat et Médias :

```js
{ label: tr('Volets'), vid: 'volets', icon: 'blinds', c: 'var(--o-purple)' },
```

Violet, parce que c'est **la couleur des volets dans Loggia** — celle de la
famille de carte « Volet » et des lignes « En ce moment ». Des couleurs se
répètent déjà dans ce menu (l'orange est sur Pièces et sur Climat) : mieux vaut
la vraie qu'une inventée.

Et son sous-titre dans Paramètres, comme ses quatre voisines : « modes et
planning ».

**Y figurer n'allume rien.** `shown` est vide par défaut : la vue reste éteinte
pour tout le monde, et ne s'offre qu'aux installations qui ont des volets
(`isViewAvailable` : « aucun volet (domaine cover) »). Le menu de personne ne
change sans qu'on le demande.

## Pourquoi pas la supprimer

Quatre raisons, et la dernière suffirait :

- **L'ADR 0023 l'a déjà décidé** : « La vue Volets reste : elle porte la barre
  de modes et le planning. » Cette décision-ci la confirme, elle ne l'amende
  pas.
- Un test le disait déjà, mot pour mot : « la vue Volets, elle, reste ».
- Elle a un contenu que le filtre Objets n'a pas : la barre de modes et le
  planning.
- **Elle est le seul lecteur de `loggia_coverlayout`** (`useLayoutEditor`). La
  supprimer orphelinait une clé synchronisée — ce que l'ADR 0089 vient
  justement d'interdire — et **effaçait l'agencement** que quelqu'un s'était
  donné pour ses volets.

Treize kilo-octets de code qui marche, un agencement d'utilisateur, une décision
écrite et un test qui la tient : l'économie n'existait pas.

## Vérifié à l'écran

Sur la démonstration : la vue apparaît dans Paramètres › Vues entre Climat et
Médias, avec son sous-titre, **interrupteur à `false`**. Allumée par cet
interrupteur, elle arrive dans le menu latéral entre Sécurité et Système, et
s'ouvre sur « Volets · 3 volets · 2 OUVERTS » avec sa barre de modes.

## Conséquences

- **Rien côté serveur, aucun redémarrage de Home Assistant.**
- Un texte nouveau dans les sept langues : « modes et planning ». Le garde-fou
  de l'ADR 0084 l'a nommé avant que j'y pense.
- Le compteur de Paramètres passe de onze à douze vues.

Tests : `objets.test.mjs` (+1) — l'entrée de la liste, le sous-titre, la route.
970 au vert côté JS, 573 côté Python, lint propre, audit propre.
