# 0170 — Un écran qui se réveille relit sa configuration

*8 octobre 2026 — accepté*

## Le problème

> « Sur tout support, PC, tablette et mobile, souvent je dois remettre les
> widgets, les réactiver ou désactiver certaines, et l'ordre aussi qui change ;
> les cartes pièces aussi, qui si elle est compacte grande, elle repasse en
> compact. Je ne sais pas pourquoi. » — 7 octobre.

Un défaut qui se présentait comme trois : des widgets qui reviennent, un ordre
qui change, une taille de carte qui retombe. Une seule cause.

La configuration — l'agencement, les widgets du rail, les tailles — est lue
**au montage**. Elle arrive du serveur par un appel qui peut échouer, et
surtout : un onglet laissé ouvert pendant des heures, une tablette murale qui
se met en veille, un téléphone verrouillé puis repris, tout cela **ne remonte
pas**. L'écran garde ce qu'il avait en mémoire — y compris une configuration
lue avant un échec, donc vide, donc remplacée par les valeurs par défaut. Et à
la première modification, c'est cette version par défaut qui part au serveur.

L'agencement ne se « perdait » donc pas : il était **réécrit** par un écran qui
ne s'était jamais remis à jour.

## La décision

Trois signaux, le même geste : relire.

```js
document.addEventListener('visibilitychange', auReveil);
window.addEventListener('focus', auReveil);
conn.addEventListener('ready', relire);   // la connexion WebSocket revient
```

- **`visibilitychange`** couvre l'onglet qu'on retrouve et la tablette qui se
  rallume ;
- **`focus`** couvre la fenêtre qu'on revient regarder sans que l'onglet ait
  changé ;
- **`ready`** de la connexion couvre le redémarrage de Home Assistant.

`auReveil` ne relit que si la page est bien **visible** : sans cette garde,
`visibilitychange` se déclenche aussi au moment où l'on quitte l'onglet, et
l'on relirait pour rien.

Les trois écouteurs sont retirés au démontage. La relecture passe par une
référence (`relireRef`) plutôt que par une dépendance de l'effet : rebrancher
trois écouteurs à chaque rendu coûterait plus que ce que cela protège.

## Ce qu'on n'a pas fait

**Sonder à intervalle régulier.** Relire toutes les minutes « au cas où »
charge le serveur pour rien : un écran qu'on ne regarde pas n'a besoin de rien,
et un écran qu'on retrouve a besoin de tout, tout de suite. Les trois signaux
disent exactement cela.

**Écrire moins souvent.** Le défaut n'était pas l'écriture, c'était la lecture.
Retarder l'écriture aurait caché le symptôme en laissant la cause.

## Ce que les tests tiennent

`tests/relire_au_reveil.test.mjs` : les trois écouteurs sont posés, la garde de
visibilité est là, les trois sont retirés au démontage, et la relecture passe
par la référence.
