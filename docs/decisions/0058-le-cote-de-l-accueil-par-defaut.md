# 0058 — Le côté de l'Accueil par défaut : celui de la capture

Date : 19/09/2026 (v3.59.0). Statut : acceptée. Demande, capture du côté de
l'Accueil à l'appui (l'heure en tuiles, la météo, le CO₂, En ce moment, le
calendrier) : « par défaut, avec bien sûr À surveiller tout en haut ».

## Contexte

- Un accueil jamais rangé montrait sur le côté : À surveiller, la météo, En
  ce moment, Rappels, Agenda. L'heure, le calendrier et le CO₂ étaient EN
  OPTION (ADR 0041, 0044) : absents tant qu'on ne les ajoutait pas en mode
  édition, l'heure en aiguilles.
- Chez l'utilisateur, le côté de l'ordinateur était rangé à la main comme la
  capture ; celui du téléphone a son propre agencement (ADR 0052).

## Décision

- L'ordre par défaut (`ACC_RAIL`) : À surveiller, l'heure, la météo, le CO₂,
  En ce moment, le calendrier, puis Rappels et Agenda.
- L'heure, le CO₂ et le calendrier sont présents d'emblée
  (`ACC_AJOUTEES_DEFAUT`). Ils restent en option : la croix les retire,
  « Ajouter » les rend.
- Rappels et Agenda sont masqués par défaut (`ACC_CACHES_DEFAUT`) : le
  calendrier reprend l'agenda du jour ; « Réafficher » les rend.
- L'heure se montre en tuiles (heures · minutes · secondes) par défaut
  (`STYLES_WIDGETS`) ; le calendrier, en semaine, comme avant.
- Rien sans source, comme avant : sans capteur de CO₂ ou sans météo, pas de
  section ; À surveiller n'existe que s'il y a quelque chose à dire.

## Conséquences

- Cela ne vaut que pour un accueil jamais rangé : aucun agencement
  enregistré, ou un agencement enregistré avant les widgets en option. Un
  agencement enregistré reste le sien — celui de l'ordinateur de
  l'utilisateur est déjà la capture ; celui de son téléphone garde le sien
  (sans CO₂, avec Rappels).
- La démo, qui n'enregistre pas d'agencement, montre le nouveau côté.

Tests : tests/accueil_rail_defaut.test.mjs (3) ; sept tests qui épinglent
l'ordre du côté réalignés, et le style par défaut de l'heure
(accueil_widgets_temps). Vérifié en démo, à 1 440 px et au téléphone (la
page « En ce moment ») : À surveiller, l'heure, la météo, le CO₂, En ce
moment, le calendrier.
