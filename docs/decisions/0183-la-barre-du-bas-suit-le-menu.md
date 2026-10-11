# 0183 — La barre du bas suit le menu

*10 octobre 2026 — accepté*

## Le problème

> « La nav barre mobile, actuellement elle n'est pas personnalisable. »

Elle portait **cinq entrées écrites en dur** — Accueil, Scénarios, Objets,
Énergie, Sécurité —, filtrées seulement par ce que l'installation sait remplir.
Masquer Objets dans le menu ne l'en retirait pas ; remettre Climatisation ne
l'y mettait pas.

## Trois façons de la rendre réglable

Trois options lui ont été proposées : qu'elle suive le menu, qu'elle ait un
réglage à elle, ou qu'on n'en réordonne que le contenu actuel. Réponse : **elle
suit le menu**.

C'est le choix qui n'ajoute rien à apprendre. On range son menu une fois, et la
barre suit — comme le fait déjà la barre latérale.

## La règle, reprise à la lettre de la barre latérale

- les **droits du profil** (`vuesAutorisees`, que l'appelant lui passe
  désormais) ;
- les vues **masquées** retirées ;
- les **secondaires remises** admises ;
- l'**ordre** choisi ;
- **Accueil en tête**, hors du rangement : c'est le point de départ, et la barre
  latérale le tient aussi à part.

## Pourquoi cinq, et pas plus

Le plafond n'est pas un caprice. Le code ajuste déjà le corps du texte de 11 à
**9,5 px** pour que la SOMME des libellés tienne en largeur — une case ne
rétrécit jamais sous son libellé, sans quoi un mot se coupe. Au-delà de cinq, le
corps a touché son plancher et ça déborde.

Ce qui ne rentre pas vit dans « Menu », juste à côté.

## Vérifié en direct, sans rechargement

| | barre du bas |
|---|---|
| Pièces visible | Accueil · **Pièces** · Scénarios · Objets · Énergie |
| Pièces masquée | Accueil · Scénarios · Objets · Énergie · **Sécurité** |

Pièces est entrée d'elle-même — elle n'était pas masquée — et a poussé Sécurité
dans le Menu. La barre était jusqu'ici « sans Pièces, accessibles via les cartes
de l'Accueil » : ce n'est plus à elle d'en décider.

Comme les vues suivent le profil (ADR 0182), **la barre aussi** : chacun la
sienne, et les écrans d'une même personne s'accordent.

## Conséquences

- Les libellés COURTS quittent le composant pour `BARRE_VUES`, au-dessus : la
  barre y **choisit** ses entrées au lieu de les écrire. Le polonais n'en a
  toujours pas — sa traduction est relue par un Polonais, et ses mots restent
  les siens.
- `tests/navbar_suit_le_menu.test.mjs` (neuf) tient les trois bouts : la barre
  lit les vues du menu, respecte les droits, et s'arrête à cinq cases — avec la
  raison du plafond épinglée dans le code.
- `tests/barre_mobile_courte.test.mjs` lit désormais les libellés dans
  `BARRE_VUES` ; `tests/assistant.test.mjs` tolère les paramètres ajoutés.
