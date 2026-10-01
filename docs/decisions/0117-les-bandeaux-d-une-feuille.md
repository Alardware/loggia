# 0117 — Les bandeaux d'une feuille

Date : 01/10/2026. Statut : appliqué. Aucun redémarrage de Home Assistant ;
`src/` change — **le paquet est rebâti**.

« Ce qui me gêne ici c'est les bandeaux en haut et en bas, c'est pas terrible. »

## En haut : dix-sept pixels de fond, et un arrondi qui ne correspond pas

La fiche d'un lecteur ouvre sur un panneau coloré — la pochette, floutée et
teintée. Il ne montait pas jusqu'au bord de la feuille : il restait **17 px** de
fond sombre au-dessus de lui. Le compte :

| | |
|---|---|
| la poignée | 25 px de haut, 2 px de marge |
| la feuille | 10 px de marge haute |
| le panneau en reprenait | 10 px |

Et son arrondi valait 20 px quand celui de la feuille vaut 26.

**Décidé :** le panneau remonte de 27 px, prend l'arrondi de la feuille, et la
poignée passe **par-dessus** (`position: relative`, un plan au-dessus) au lieu
d'être recouverte.

## En bas : la respiration passe de 24 à 16 px

Vaut pour toutes les feuilles. 24 px sous le dernier bouton faisaient une bande
vide qu'on lisait comme une erreur de mise en page.

## Et le titre d'un lecteur

Trouvé au passage sur l'installation réelle : la fiche affichait
`media_player.…` en brut quand le lecteur ne figurait pas dans la liste de
Loggia. Elle retombe maintenant sur le nom de l'entité avant son identifiant.
