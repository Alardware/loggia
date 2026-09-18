# 0049 — La démo en ligne, et un README qui dit vrai

Date : 18/09/2026 (v3.50.1). Statut : acceptée. Demande : « il faudrait mettre
à jour le GitHub » ; « Toute la maison, une seule page, c'est pas vrai […] ça
correspond pas à Loggia » ; « supprime les captures ordi, tablette,
téléphone » ; « il y a pas moyen de créer une vraie démo, mais sans avoir à
mettre l'adresse de HAOS ? ».

## Contexte

La section « Essayer sans rien installer » du README demandait d'ouvrir
`http://<votre-ha>:8123/loggia-static/index.html?demo` : il fallait donc un
Home Assistant, et Loggia déjà installé dessus. Le titre du bandeau, repris
d'ailleurs, promettait « toute la maison, une seule page » à un dashboard qui
en a huit. Et douze captures par appareil, datées du 05/09, montraient une
interface qui a changé depuis.

## Décision

- **Une construction « démo seule »** : `npm run build:demo` (mode Vite
  « demo », sortie `dist-demo/`, jamais versionnée). `main.jsx` y lit
  `import.meta.env.MODE === 'demo'` : la maison de démonstration se monte
  toujours, sans `?demo`, sans Home Assistant, sans adresse. Dans la
  construction livrée, MODE vaut 'production' : la condition disparaît à la
  compilation, le panneau servi par Home Assistant ne peut pas s'y retrouver.
- **Publiée par GitHub Pages** (`.github/workflows/demo.yml`) à chaque push
  sur `main` qui touche le front : https://alardware.github.io/loggia/. Les
  paramètres d'aperçu de la démo y marchent (`?lang=en`, `?mode=light`,
  `?vue=energie`).
- **La démo ne nomme pas un serveur qu'elle n'a pas** : la barre latérale dit
  « maison de démonstration » au lieu de l'hôte de la page.
- **Le README** : le lien vers la démo sous le bandeau, la section « Essayer
  sans rien installer » réécrite (elle est vraie désormais), les captures par
  appareil retirées. Le bandeau garde ses appareils ; son titre devient
  « Votre maison, d'un coup d'œil. », et le nom comme le titre y sont posés en
  Manrope, la police de l'interface.

## Conséquences

La démo en ligne ne contient que les données factices de `src/demo.js`, déjà
publiques dans le dépôt, et l'audit anti-données personnelles les couvre. Elle
tourne entièrement dans le navigateur. Tests : tests/demo_en_ligne.test.mjs
(5). Pas de changement côté serveur.
