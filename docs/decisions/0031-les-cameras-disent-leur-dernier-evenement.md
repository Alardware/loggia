# 0031 — Les caméras disent leur dernier événement

Date : 16/09/2026 (v3.32.0). Statut : acceptée. Quatrième étape de la refonte
de l'Accueil (plan dans l'ADR 0028).

## Contexte

Une tuile caméra de l'Accueil disait « Direct » et rien d'autre ; celle de la
vue Sécurité, seulement ce qui se passe à l'instant (« Personne détectée »,
« RAS »). Or la question qu'on se pose devant une caméra est le plus souvent
« que s'est-il passé ? » — et la réponse existait déjà : la résolution connaît
par caméra ses détecteurs (mouvement, personne, véhicule, sonnette, colis — le
choix de l'utilisateur, complété par les capteurs du même appareil), et le
journal de Home Assistant sait quand chacun s'est déclenché.

## Décision

- **La sous-ligne d'une tuile dit, dans l'ordre :** hors ligne ; la détection
  en cours (le genre le plus parlant d'abord, la sonnette avant le mouvement) ;
  sinon le dernier déclenchement des dernières 24 h — « Mouvement · il y a
  3 min », « Quelqu’un · il y a 41 min » — ; sinon « Direct ». Le même mot
  partout : l'Accueil, la vue Sécurité, la fiche.
- **La source du « dernier » est le journal, jamais `last_changed`.** Après un
  redémarrage, `last_changed` d'un détecteur vaut l'heure du redémarrage : une
  tuile qui s'y fierait inventerait un mouvement qui n'a pas eu lieu. Le flux
  `logbook/event_stream` est réduit au dernier déclenchement par entité — une
  caméra bavarde ne fait pas oublier la dernière détection d'une caméra calme.
- **Rien sans donnée.** Pas de détecteur, pas de déclenchement en 24 h, un
  journal refusé : la tuile reste à « Direct ». Un instant dans le futur (une
  horloge fausse) est ignoré.
- **« Quelqu’un », pas « Personne ».** Au passé, « Personne » seul dirait le
  contraire en français ; en cours, « Personne détectée » reste.

## Conséquences

Le module pur `src/evenement.js` porte les règles ; `historique.jsx` gagne un
crochet qui ne sait pas ce qu'est une détection (le réducteur est injecté). La
vue Sécurité perd « RAS » au profit du dernier événement, et son journal
raconte aussi les détections. Les détecteurs sont relus sur l'Accueil pour que
« en cours » suive le direct. Non fait : une vignette du dernier événement
(l'image), qui demanderait un stockage ou une intégration précise — le flux en
direct reste l'image de la tuile.
