# 0036 — La vue Sécurité s'édite comme les autres ; la tuile Alarme en verre

Date : 17/09/2026 (v3.37.0). Statut : acceptée. Deux retours de
l'utilisateur après l'ADR 0035 : « pour cette carte seulement un fond
glassmorphism, blur léger, coloré — vert désarmée, orange absent, violet
nuit… » et « dans Sécurité, je voudrais le même mode édition que pour les
autres ».

## Contexte

La tuile Alarme de la bannière ne se distinguait des autres chiffres que par
la couleur de son texte, alors qu'elle dit l'état le plus important de la
maison. Et la vue Sécurité était la seule vue à cartes qu'on ne pouvait pas
arranger : son mode édition se bornait au choix du panneau et des caméras,
là où Volets, Objets ou une pièce laissent glisser, retirer, renommer,
élargir et ajouter.

## Décision

- **La tuile Alarme, et elle seule, est en verre** : un fond teinté léger
  (16 %), un flou d'arrière-plan, un reflet fin, sans bordure. La teinte suit
  l'état — vert désarmée, bleu maison, orange absent et vacances, violet
  nuit, ambre pendant l'armement, rouge déclenchée — et le texte prend la
  même famille de couleur. Les autres tuiles de la bannière restent
  transparentes : c'est ce contraste qui la fait lire d'abord.
- **La vue Sécurité passe par l'éditeur d'agencement commun.** La découverte
  propose — l'alarme, les sirènes, la présence, puis les ouvrants sous leur
  titre, les ouverts d'abord — et l'utilisateur dispose : ordre par
  glisser-déposer, retrait, nom, largeur double, ajout d'une carte ou d'un
  titre, retour à la liste automatique. L'agencement vit dans
  `loggia_seclayout` et suit le compte comme les autres. Pas de taille
  compacte ici : ces cartes ont besoin de leurs deux rangées.
- **Une carte ajoutée passe par la fabrique commune** ; l'alarme, la sirène,
  la présence et les ouvrants gardent leur carte propre. « À surveiller »
  remonte au-dessus des cartes : ce qui demande l'attention passe avant ce
  qui se range.

## Conséquences

Les domaines d'édition gagnent l'alarme et la sirène ; la carte Présence y a
sa clé. L'en-tête, la rangée de tuiles, les caméras et le journal restent
fixes — on arrange des cartes, pas la structure de la vue. Non fait : le
choix de la sirène dans la feuille des entités (une sirène absente s'ajoute
désormais par « Ajouter une carte »).
