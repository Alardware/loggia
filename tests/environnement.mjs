/* Charge AVANT tout test (`npm test` : `node --import ./tests/environnement.mjs --test`).
 *
 * Node 22 a un `navigator` global, dont la langue suit la machine, et la langue
 * de Loggia se resout au chargement de `i18n.js` (`resoudreTot`). Un test qui
 * pose `navigator` ou `process.env.TZ` en tete de fichier arrive trop tard : ses
 * `import` sont evalues avant lui. Sur la machine de developpement (fr, Paris),
 * cela ne se voyait pas ; sur la CI (Linux, en-US, UTC), 26 tests ecrivaient
 * « 1,400 ppm », « Sept » ou « 11:21 » (25/10, PR #36). Un test qui veut une
 * autre langue ou un autre fuseau redefinit les siens, comme avant. */
process.env.TZ = 'Europe/Paris';
Object.defineProperty(globalThis, 'navigator', {
  value: { language: 'fr-FR', languages: ['fr-FR'] },
  configurable: true, writable: true,
});
