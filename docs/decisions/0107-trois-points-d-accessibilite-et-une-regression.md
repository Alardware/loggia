# 0107 — Trois points d'accessibilité, et une régression trouvée en les vérifiant

Date : 28/09/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti. Version **3.77.1**.

## D'abord la régression, parce qu'elle est partie chez les utilisateurs

La vue **Objets plantait** dans le garde-fou d'erreur dès qu'une carte de
chauffage s'affichait :

```
ReferenceError: Cannot access 'etatSt' before initialization
    at RoomClimateCard (src/App.jsx:4625)
```

C'est moi qui l'ai introduite, en v3.77.0, à l'ADR 0105. La conversion des
dix-huit états optimistes vers `useOptimiste()` a été faite **par un script**.
Il posait la signature sur la ligne de DÉCLARATION — alors que le `useEffect`
qu'il remplaçait venait APRÈS les valeurs qu'il lisait :

```js
const [ov, setOv] = useOptimiste([realTarget, etatSt].join('|'));
const etatSt = st && st.state;          // ← déclaré APRÈS
```

`const` hisse sa déclaration sans l'initialiser : **la syntaxe est valide**.
Trois sites sur dix-huit étaient dans ce cas — `RoomClimateCard`,
`RoomClimateSheet`, `FicheDistributeur`.

### Pourquoi rien ne l'a vu

- **Le lint** ne le voit pas : `no-use-before-define` est hors du jeu de règles
  du projet, et la syntaxe est correcte.
- **Les 1 007 tests** ne le voient pas : ils lisent `src/App.jsx` en **texte**.
  Ils ont vérifié que le filet existait, qu'il expirait, que plus aucune carte
  ne tenait le sien — pas qu'une carte se **rende**.
- **La vérification à l'écran l'a manquée** : j'avais regardé l'Accueil, une
  pièce et les Paramètres. Les trois composants fautifs vivent dans Objets et
  dans deux feuilles. Un écran regardé n'est pas l'écran.

C'est la leçon du 23/09 (`Ico` non exporté) et de l'ADR 0102, une troisième
fois, sous une forme nouvelle : **il ne suffit pas d'ouvrir l'application, il
faut ouvrir la vue qu'on a touchée.**

### Le garde-fou

`tests/optimiste.test.mjs` refuse désormais toute signature d'état optimiste
qui lit une valeur déclarée plus bas dans la même fonction. Il écarte les accès
de propriété — `z.target` n'est pas le `target` local déclaré en dessous, et
trois des six candidats étaient ce faux positif-là. Vérifié dans les deux
sens : il échoue sur l'`App.jsx` de la v3.77.0, il passe sur celui-ci.

## Les trois points d'accessibilité

Ils étaient nommés dans l'ADR 0101 comme n'étant pas de cette fournée-là.

### L'alarme et « À surveiller » se disent enfin

Les deux changent tout seuls — la maison s'arme, un détecteur se tait, une
fuite arrive. À l'écran ça se voit ; pour qui n'a pas le focus dessus, ça ne se
disait pas.

Le piège : un lecteur d'écran n'annonce le contenu d'une région vivante que
s'il **change**, et une région qui apparaît déjà remplie ne dit rien. Les poser
DANS la carte n'aurait donc rien annoncé au moment qui compte — celui où la
carte apparaît. Deux régions `role="status"` vivent donc en haut du tableau de
bord, **toujours montées**, vides tant qu'il n'y a rien.

Deux plutôt qu'une : sinon l'arrivée d'un point d'attention ferait répéter
l'état de l'alarme, et réciproquement.

Mesuré : « Alarme : Désarmée » → « Alarme : Armée · Absent » quand l'entité
change, et « À surveiller : 2 points à surveiller » à côté.

### Échap referme les menus de l'en-tête

Ils se fermaient au clic dehors, et à rien d'autre : ouvert au clavier, le menu
des notifications n'avait **aucune sortie au clavier**. Échap le referme, et
**rend le focus au bouton qui l'a ouvert** — sans quoi on repart du haut de la
page à chaque fermeture. Le bouton Profil gagne au passage l'`aria-expanded`
que la cloche avait déjà.

Mesuré : `aria-expanded` passe de `true` à `false`, et le focus revient sur la
cloche.

### Le curseur de luminosité disait « % de luminosité »

```js
aria-label={tr('{n} % de luminosité', { n: '' })}
```

Un `n` **vide**. Le nom lu était donc « % de luminosité », et rien ne disait de
quelle lampe. Un curseur se nomme par ce qu'il **commande** ; sa valeur, elle,
est déjà dite par le curseur lui-même. Il prend la formule des jauges des
cartes de pièce : `Luminosité <nom>`.

**Non vérifié à l'écran**, et c'est dit plutôt que tu : ce curseur n'apparaît
que sur une carte au format standard de la vue Objets, et je n'ai pas réussi à
l'y faire rendre depuis la démonstration. La correction est d'un seul attribut,
et `name` vaut `label || cvName(st, id)` — jamais vide.

## Vérifications

1 008 tests JS (un garde-fou de plus, qui échoue sur la v3.77.0), 579 pytest,
lint propre (aucun avertissement ajouté), audit propre. Paquet rebâti, second
passage sans effet.

Vue Objets rouverte après correction : **34 cartes rendues, zéro écran
d'erreur**, console vide.
