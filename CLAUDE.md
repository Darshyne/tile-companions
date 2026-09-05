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

## Pièges

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
