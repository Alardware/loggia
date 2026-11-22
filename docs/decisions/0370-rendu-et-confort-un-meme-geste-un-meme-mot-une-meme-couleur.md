# 0370 — Rendu et confort : un même geste, un même mot, une même couleur

*14 novembre 2026 — appliqué (v3.100.0). Audit du 12/11, lot 4 : les points E14, E18 à E20, E24 à E28, R1 à R6, I1 à I6, validés un par un. L'écran seul change : pas de redémarrage de Home Assistant.*

## Le problème

Vingt-deux constats de rendu et de confort, sans lien technique entre eux mais
de la même famille : la même chose ne se disait, ne se dessinait ou ne se
faisait pas partout pareil ; et quelques écrans restaient muets — une liste
vide, une attente, une consigne illisible.

## La décision

**Une même couleur.**

- *Bascules (E14).* Elles en portaient trois : rose sur les cartes d'appareil,
  ambre sur les tuiles de pièce, bleu dans Système et Paramètres. Sa
  décision : l'AMBRE pour une lumière — sa carte, sa fiche, la tuile d'une
  pièce —, le BLEU de la maison pour tout le reste. En thème clair, l'ambre
  est un jeton à lui (`--o-bascule-lampe`) : celui de la lampe y est une encre
  brune, une bascule allumée passait pour éteinte.
- *Blanc sur bleu clair (E25).* « Ajouter le rappel », « + Événement », le
  « + » des courses passent sur `--o-accent-fond`, fait pour porter du blanc.
  Le texte d'un rendez-vous prend une encre foncée de la couleur de son
  agenda : aucune des six teintes ne tenait le blanc (1,9 à 3,3 pour 1).

**Un même mot.**

- *« Indisponible » (E24).* Partout la règle de la lumière : « Indisponible
  depuis 14:20 », en rouge — volet, garage, chauffage, mesure, borne, eau
  chaude, carte générique.
- *Journal d'un thermostat (E19).* Les modes se disent avec les mots de sa
  carte, dans la langue de l'écran ; plus de « CONFORT » pour le chauffage ni
  de `cool`, `dry` en anglais brut.
- *Fiche d'un lecteur (E20).* Une série : son nom en titre, l'épisode dessous,
  comme sa carte.
- *Unités (E26).* La carte « Qualité air » écrit l'unité que le capteur
  publie ; sans elle, « ppb » pour les COV et « µg/m³ » pour les particules.
- *Capteur à état texte (R4).* Un état qui n'est pas un nombre s'écrit comme
  une phrase, traduit quand on sait le traduire, plus en gros chiffres.

**Un même geste.**

- *Supprimer (I2).* Une pièce, un scénario, un écran : le premier appui arme
  le bouton (rouge plein, « Confirmer ? »), le second supprime, et il se
  désarme seul au bout de 4 s — le geste de la feuille d'un profil (ADR 0365).
  L'événement d'agenda l'avait déjà ; il gagne le désarmement.
- *Minuteur (I5).* L'interrupteur simple a le minuteur de la prise et de la
  lumière : quatre durées, puis « +15 min », « +1 h », « Annuler ».
- *Réessayer (I4).* Spotify ne répond pas : un bouton relit la liste des
  playlists — jamais une lecture.

**Ce qui restait figé, caché ou muet.**

- *Dessins (E18).* Seize animations que `dessins.js` appelait n'étaient
  définies nulle part : 41 dessins sur 171 gardaient une partie figée. Elles
  le sont, sous le même préfixe `o-ic-` — ce que la mise en pause vise.
- *Agenda, vue Semaine (E27).* Deux rendez-vous à la même heure se partagent
  la colonne au lieu de se cacher.
- *Écran de veille (E28).* Sa seule consigne tenait 2,3 pour 1 ; elle se lit,
  sans devenir une lampe la nuit.
- *Listes vides (I1).* Piles, caméras, scénarios : la liste le dit.
- *Énergie (R2, R3).* Au doigt, la valeur d'une barre reste jusqu'au toucher
  suivant, et un résumé en texte sert le lecteur d'écran ; la carte
  « Aperçu » ne laisse plus cent pixels vides sous ses bilans.
- *Rangée des pièces (R5).* Elle prend les flèches de la rangée des scénarios
  quand elle déborde, à la souris.
- *Barre d'annulation (R6, I6).* Sur iPhone, elle ne compte plus deux fois la
  zone du bas ; le geste et son annulation se disent au lecteur d'écran. La
  recherche annonce la ligne que les flèches choisissent.
- *Plan 3D (R1).* Il s'annonce par le squelette des chargements.

## Ce qui n'est pas fait

- **Les boutons trop petits pour le doigt (E17)** : un lot à part. Une dizaine
  de familles de commandes dans huit fichiers, des rangées qui défilent : à
  mesurer au téléphone et à la tablette.
- **R1, pour l'agenda, la fiche d'une pièce et le formulaire de rappel** :
  leur feuille entière se charge à la demande ; un repli y ouvrirait une
  seconde feuille. À reprendre comme les autres fiches (la feuille d'emblée,
  le contenu à la demande).
- **R5, un fondu au bord** : les flèches suffisent ; la rangée des scénarios
  de l'Accueil les avait déjà.
- **I3** (se mettre à jour sans recharger) : déjà traité au lot 2b (B14, B16,
  B17), constaté.
- La popup de la borne, la compacte et la fiche d'un volet disent encore
  « Indisponible » sans heure.

## Les conséquences

Pas de redémarrage. Six textes neufs, dans les six catalogues. Tests :
`tests/audit_1211_lot4_icones.test.mjs`, `_cartes`, `_agenda`, `_accueil`.
