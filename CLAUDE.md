# CLAUDE.md — tile-companions

## Quoi

Module Foundry VTT **agnostique** (v13 min / v14 vérifié) : lie à une tuile
une Région, un AmbientSound et/ou un AmbientLight, qui la suivent (position,
taille, rotation, retournement, masquage, élévation, niveaux V14,
suppression). La région est **détourée** sur l'alpha de l'image. `README.md`
= doc utilisateur + modèle de données + API, le lire en premier.

Créé le 2026-09-05 à partir de ce qu'a appris `coc7-dialogues` (Foundry Call
of Cthulhu/) : le détourage alpha (`scripts/trace.js`) et le bouton de HUD en
sont repris tels quels ; tout ce qui est dialogue / clic / CoC7 est resté
là-bas. Test local : jonction
`F:\Foundry V14\Data\modules\tile-companions` → ce dossier ; monde de test
`cthulhu` (V14). Repo GitHub prévu : `Darshyne/tile-companions` (manifest /
download dans `module.json` pointent déjà dessus ; workflow release sur tag
`vX.Y.Z`, identique à coc7-dialogues).

## Décisions structurantes

- **Tout en flags, rien en settings** (sauf 3 réglages monde booléens) :
  `tile.flags.tile-companions.{region,sound,light}` + lien inverse
  `flags.tile-companions.tile` sur chaque compagnon. Lisible par le
  connecteur MCP et par des macros.
- **Coordonnées mémorisées = fractions (u, v) de l'image** dans le cadre
  non tourné de la tuile, miroir compris (`scripts/geometry.js`). Déplacer /
  tourner / redimensionner / retourner la tuile = reprojection pure, jamais
  besoin de connaître l'état d'avant. V14 : `tile.x/y` = point d'ancre
  (`texture.anchorX/Y`, défaut 0.5) et pivot de rotation ; V13 : coin
  haut-gauche, pivot au centre (`tileFrame` fait la différence via
  `game.release.generation`). Le mode `fit` de la texture n'est honoré qu'au
  détourage (via la transformation locale du mesh) — un redimensionnement
  ultérieur étire avec le cadre, exact en `fill` seulement.
- **Qui écrit** (un seul client par changement) :
  - tuile → compagnons : le client **initiateur** (`userId === game.user.id`
    dans `updateTile`/`deleteTile`). Seuls des MJ modifient des tuiles, et
    l'initiateur a la scène sur son canevas — nécessaire pour redétourer
    (`tile.object`). Pas `activeGM` : il pourrait être sur une autre scène.
  - compagnons → tuile (l'utilisateur bouge le son, remodèle la région) :
    `game.users.activeGM` (données pures, pas de canevas).
  - Toutes nos écritures portent l'option d'opération `tileCompanions`
    (`OPT`), propagée à tous les clients par Foundry → nos hooks ignorent
    l'écho. Ne pas retirer cette option d'un `update`/`create`/`delete`.
- **Redétourage automatique au changement d'image** : dans `updateTile`, le
  placeable n'a pas encore redessiné (le redraw passe par le ticker), donc on
  capture `tile.object.texture` comme « ancienne » texture puis
  `waitTexture` attend (≤ 8 s) que `obj.texture` change et soit `valid`.
  Après timeout on détoure quand même.
- **Copier-coller** : `preCreateTile` retire nos flags d'une tuile créée sans
  `OPT` (sinon la copie piloterait les compagnons de l'original) ;
  `preCreate{Region,AmbientSound,AmbientLight}` retire le lien inverse. La
  duplication de scène ne passe pas par ces hooks (documents embarqués créés
  avec le parent, ids conservés) → les liens survivent, voulu.
- **Région retouchée à la main** → relue via `region.polygonTree`
  (profondeur 1 = plein, 2 = trou…) et mémorisée en polygones : un
  rectangle/cercle ajouté à la main redevient polygone au prochain
  déplacement. Assumé, documenté dans le README.
- Pas de CSS (V14 agrège le CSS au lancement du monde → un fichier `styles`
  imposerait un relancement à chaque retouche ; le dialogue n'utilise que les
  classes core `form-group`/`form-fields`/`hint`). Pas de sous-type de
  document ni de pack → un simple F5 recharge le module.

## v0.2 — comportements cliquables (2026-09-05, demande du MJ)

Portés depuis coc7-dialogues **sans le dialogue PNJ** (celui-là dépend de
CoC7 : jets, SAN, argent) : `scripts/behaviors/` = `click-macro.js`,
`to-scene.js`, `open-document.js`, `jukebox.js`, champs communs dans
`common.js` (préfixe i18n `TILECOMPANIONS.ClickCommon`, listé APRÈS le
préfixe propre dans `LOCALIZATION_PREFIXES` — Foundry cumule les préfixes,
cf. `SHAPE.TYPES.rectangle` + `SHAPE.TYPES.base` en core), table centrale
`index.js` (`CLICK_BEHAVIORS` → enregistrement, dispatch, HUD, `bind`).
`region-click.js` (détection clic sur `canvas.stage`, surbrillance
décorative `eventMode='none'`, curseur par ticker) et `socket.js`
(grantDocument + resyncMusic) repris tels quels, clés renommées. Tout ce que
coc7-dialogues a appris là-dessus (couche « hit » supprimée en 0.13.1,
curseur réaffirmé par frame, nom de champ `scene` interdit → `targetScene`,
MJ ne clique que depuis le calque Jetons) reste valable ici — voir son
CLAUDE.md pour l'historique. Nouveaux sous-types + `socket: true` →
**relancement du monde** obligatoire.

## Vérifié en jeu (2026-09-05, monde `cthulhu`, V14 14.367, MJ)

v0.2 : `bind` avec `region.behavior` clickMacro → behavior créé (nom
localisé, `displayName` = label), `getClickableRegions` le liste,
`executeClick` exécute la macro avec `scope.region/behavior` (retour 42),
clic simulé sur `canvas.stage` (`emit('pointerdown'/'pointerup')` avec
`global` + `getLocalPosition`, calque Jetons actif) déclenche la macro et
un déplacement > 6 px est ignoré ; openDocument (`displayName` = nom du
journal, `executeClick` ouvre la feuille, `grantObserver` pose
`ownership.<test> = 2`) ; toScene (`displayName` = nom de la scène cible,
`executeClick` bascule bien sur « Arkham Nuit ») ; dialogue HUD : select
« Au clic » avec les 4 types, lignes `data-for` masquées/affichées selon le
choix. **Jukebox non vérifiable ici** : `start()` ne résout jamais en
navigateur caché (`AudioHelper.play` attend un geste utilisateur /
AudioContext suspendu) — `status()` se remplit, mais le flag User (posé
après la lecture) reste non testé ; code identique à coc7-dialogues 0.10,
vérifié en jeu là-bas. Voir plus bas pour la v0.1.

**Piège V14 vu en test** : `journal.update({ 'ownership.-=<id>': null })`
(ou la forme imbriquée) est ignoré silencieusement — la clé reste. Pour
retirer un utilisateur de `ownership`, réécrire l'objet entier :
`update({ ownership: sansLaClé }, { recursive: false, diff: false })`.
Noté aussi dans `foundry-core-notes/v14-migration.md`.

**Piège de test v0.2** : `game.scenes.viewed` nul et « Framebuffer width or
height is zero » au chargement du monde = viewport 0×0 (pane caché + taille
« desktop ») → toujours `resize_window` 1600×900 AVANT de rejoindre le
monde, sinon le canevas ne s'initialise jamais (et `canvas.initialize()` à
la main échoue : plugins PIXI déjà enregistrés).

v0.1 :

Scène de test jetable, tuile `assets/radio1920.webp` 600×321 tournée 15° :
bind → 70 points détourés, centre dedans / coin transparent dehors, son et
lumière au centre, lumière tournée de 15°. Déplacement, rotation,
masquage, miroir, restauration à l'identique (aller-retour stable).
**Géométrie = erreur 0** face à `mesh.transform.localTransform` sur 4
configurations (ancre 0.2/0.8 + rot 33, idem miroir X, ancre 0.7/0.3 +
miroir X+Y + rot 200) — c'est ce test qui a révélé que Foundry retourne
l'image **autour de l'ancre**, pas du centre (corrigé, `frame.mirror`).
Synchro inverse (son déplacé → u/v, région remodelée en rectangle →
polygone 4 points conservé au déplacement suivant, rotation de lumière →
relative), redétourage auto au changement d'image (110 points sur la
serveuse), collage (tuile et région) épuré, suppression manuelle d'un
compagnon → flag retiré, cascade à la suppression de la tuile, bouton HUD
allumé + dialogue. Non testé : client V13, joueur non-MJ (pas concerné),
plusieurs MJ connectés.

## Pièges

- **Tests dans le pane navigateur caché** : pas de rAF → le placeable ne se
  redessine jamais (changement d'image → `mesh.texture` reste l'ancienne) ;
  et les timers sont bridés à ~1/s → un script qui `await`e des `setTimeout`
  dépasse vite les 45 s de l'outil. Scripts courts, et
  `canvas.app.ticker.update()` n'est pas une solution (le script a pendu).

- `RegionDocument.hidden` existe en V14 (pas sûr en V13) → toujours passer
  par `has(doc, 'hidden')` (test du schéma) avant d'écrire `hidden`,
  `levels`, `elevation`, `name` sur un compagnon.
- `updateTile` avec seulement des flags (nos propres écritures) → `OPT`
  posé, sortie immédiate ; sans `OPT` (un autre module écrit des flags) →
  aucune clé géométrique → rien à faire. Ne pas déclencher un sync sur
  `flags`.
- Un `update` de flags avec un objet fait un **merge profond** (les clés
  absentes restent) ; pour retirer une clé : `flags.tile-companions.-=kind`.
  Les tableaux (`shapes`) sont remplacés, pas fusionnés.
- Détourage : `tile.object.applyRenderFlags()` avant lecture du mesh (tuile
  fraîchement créée ou onglet caché = mesh encore à l'origine) ; canvas
  « tainted » → `getImageData` lève → repli rectangle (voir coc7-dialogues).
- Heredoc bash trop long tronqué silencieusement par l'outil (vécu à la
  création) : écrire les gros fichiers avec l'outil Write.

## Conventions

Mêmes patterns que coc7-dialogues : `data-action`, i18n `TILECOMPANIONS.*`
(fr + en), API publique sur `game.modules.get(id).api` au `ready`,
`.gitattributes` LF partout + `core.autocrlf false` en local. Gotchas core :
`../../foundry-core-notes/`.
