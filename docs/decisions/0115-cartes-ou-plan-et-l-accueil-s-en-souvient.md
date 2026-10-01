# 0115 — Cartes ou plan, et l'Accueil s'en souvient

Date : 01/10/2026. Statut : appliqué. Aucun redémarrage de Home Assistant ;
`src/` change — **le paquet est rebâti**.

La section Pièces de l'Accueil porte une bascule **Cartes / Plan**. Le plan
n'existe pas encore : le bouton est là, la place est prise, et l'écran le dit
franchement — « Le plan de la maison arrive prochainement. En attendant,
“Cartes” montre les mêmes pièces. » Dessiner un faux plan aurait été pire que
d'annoncer le vrai.

## Le choix se garde, par type d'écran

« Pour l'accueil un réglage pourrait être bien pour afficher de préférence soit
les pièces soit le plan par défaut. »

Le choix suit l'ÉCRAN, comme tout ce qui se range dans `disposition.js` et comme
les caméras : un plan a du sens sur un grand écran et beaucoup moins sur un
téléphone, où l'on cherche une pièce du pouce. Il vit dans la configuration de
la **maison**, pas dans le navigateur.

**Pas de réglage en double dans Paramètres.** La bascule de l'Accueil EST le
réglage ; elle se souvient, voilà tout. Paramètres ne répète pas ce qu'une page
règle déjà.

`loggia_vuepieces` ne garde que ce qui s'écarte du défaut : revenir aux cartes
efface l'entrée, et la dernière effacée efface la clé.

## Une limite, dite plutôt que cachée

Tant que le plan n'existe pas, le choisir par défaut fait ouvrir l'Accueil sur
une page d'attente. C'est cohérent, et c'est assumé.
