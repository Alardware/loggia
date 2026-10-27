# 0277 — Le vrai logo d'une mise à jour

*27 octobre 2026 — à l'essai (rien de publié)*

## Le problème

> « Pourquoi je n'ai pas les icônes sur toutes les mises à jour ? » puis
> « Je veux leur vraie icône, pas des trucs inventés. »

Dans Paramètres > Mises à jour, la ligne montrait l'image que Home Assistant
donne (`entity_picture`). Quand elle ne chargeait pas — « Home Assistant Core »
chez lui —, elle était retirée et laissait un carré vide. Un premier correctif
y remettait l'icône du groupe : une icône de Loggia, pas celle de l'intégration.

## Décidé

`LogoMaj` (views/parametres.jsx) essaie, dans l'ordre :

1. l'image de Home Assistant (`entity_picture`) ;
2. le logo officiel de l'intégration qui publie la mise à jour
   (`plateformeDe(id)`), sur `brands.home-assistant.io/_/<intégration>/icon.png`,
   là où l'interface de Home Assistant le prend ; `_/` y rend une image de
   remplacement quand la marque n'a pas de logo ;
3. l'icône du groupe, seulement si aucune des deux ne charge (hors ligne).

C'est la première adresse externe que Loggia charge de lui-même. Sa décision :
logos partout, démo comprise, et les textes publics le disent — la politique de
confidentialité (la démo et le logiciel installé), le README, la page lisible
sans JavaScript. `tests/pages_legales.test.mjs` admet cette seule adresse et
vérifie que la politique la nomme aux deux endroits.
