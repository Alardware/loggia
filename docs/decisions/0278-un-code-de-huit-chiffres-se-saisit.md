# 0278 — Un code de huit chiffres se saisit

*27 octobre 2026 — accepté (ticket #38 ; complète l'ADR du code administrateur haché, 18/09)*

## Le problème

> « Le système attend un code à 4 chiffres, or j'avais introduit un code à 8
> chiffres qui n'est pas accepté. » — ticket #38

Paramètres et la fiche du mode enfant acceptent un code de 4 à 8 chiffres, et
le composant le vérifie tel quel (`code_admin.FORME`). Mais le pavé
(`src/pinmodal.jsx`) montrait quatre points et vérifiait **dès le quatrième
chiffre** : un code plus long ne pouvait jamais être saisi. Pire, chaque essai
envoyait les quatre premiers chiffres et comptait un raté — cinq tentatives,
et le compte était bloqué.

L'écran ne pouvait pas faire mieux : le code est haché, il n'en sait rien.

## La décision

**Le composant dit la longueur du code, jamais le code.**

- `hacher` range `longueur` avec le sel et l'empreinte ; `longueur_de` la lit
  (un entier de 4 à 8, sinon rien).
- La lecture de la configuration rend `loggia_admin_pin_longueur` à côté de
  `loggia_admin_pin_defini`. Seul le haché la dit : une valeur écrite dans la
  partie commune par un client est ignorée, et la clé ne quitte pas le serveur
  à l'export (`CLES_SERVEUR`).
- Le pavé montre autant de points et vérifie au **dernier** chiffre. Jamais
  défini : `0000`, quatre.
- Un code rangé **avant** ce changement ne porte pas sa longueur. Le pavé
  accepte alors de 4 à 8 chiffres et un bouton ✓ valide. La première réussite
  apprend la longueur au composant ; ensuite, le pavé vérifie seul.
  L'apprentissage passe par le magasin, sous son verrou, et seulement si le
  code rangé est encore celui qui vient d'être vérifié (même sel, même
  haché) : un administrateur peut définir un nouveau code pendant le
  PBKDF2, et réécrire l'enregistrement lu ramènerait l'ancien.

## Ce que cela coûte

La longueur est connue de tout compte connecté. Elle réduit l'espace à
deviner d'un facteur au plus 1,1 (un code de 8 chiffres : 10⁸ essais au lieu de
≈ 1,1 × 10⁸), sous la même limite d'essais (cinq ratés, puis un blocage qui
double). C'est ce qu'affiche tout écran de verrouillage à points.
