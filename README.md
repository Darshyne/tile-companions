# Tile Companions

Module Foundry VTT **indépendant du système de jeu** : lie à une **tuile**
une **région**, un **son d'ambiance** et/ou une **lumière d'ambiance**, qui
suivent ensuite la tuile — déplacée, redimensionnée, tournée, retournée,
masquée, supprimée. La région prend la **forme visible de l'image** de la
tuile (détourage des pixels non transparents), pas son rectangle.

Foundry v13 minimum, vérifié sur v14. Licence MIT.

Cas d'usage typiques : une mare (tuile détourée) → région « coût de
déplacement » ou « macro à l'entrée » exactement sur l'eau ; un feu de camp →
lumière chaude + crépitement qui bougent avec la tuile ; une radio / un
gramophone → son localisé ; une trappe → téléportation ; un piège → macro. Les
**comportements** eux-mêmes sont ceux du cœur de Foundry (ou d'un autre
module) : Tile Companions ne fournit que la forme et le lien.

## Installation

Dans Foundry (ou The Forge), « Installer un module » → URL de manifest :

```
https://github.com/Darshyne/tile-companions/releases/latest/download/module.json
```

En développement : jonction `<Foundry Data>/modules/tile-companions` → ce
dossier (le `module.json` est à la racine).

## Utilisation (MJ)

1. Sélectionner une tuile (calque Tuiles) → clic droit → bouton **🔗** dans
   le HUD (colonne de droite). Plusieurs tuiles sélectionnées : les mêmes
   choix s'appliquent à chacune.
2. Cocher ce qu'on veut créer :
   - **Région** — nom, et *Détourer le contour visible* (décoché : rectangle
     de la tuile). Les comportements s'ajoutent ensuite normalement sur la
     région (calque Régions, ou double-clic dessus).
   - **Son d'ambiance** — fichier, rayon (par défaut : la plus grande
     dimension de la tuile, en unités de la scène), volume, boucle. Placé au
     centre de la tuile ; on peut ensuite le **déplacer** à la main, le
     décalage est mémorisé et suit la tuile.
   - **Lumière d'ambiance** — rayons faible / vif (défaut : dimension de la
     tuile, et la moitié), couleur. Placée au centre ; **tourne avec la
     tuile** (utile pour un cône). Déplaçable à la main, comme le son.
3. **Créer**. La configuration du son et de la lumière s'ouvre pour affiner
   (animation, murs, atténuation…). Le bouton du HUD est allumé sur une tuile
   liée ; il rouvre le même dialogue pour **ajouter** un compagnon manquant,
   **redétourer** la région (après retouche de l'image) ou **détacher** —
   en supprimant les compagnons, ou en les gardant comme documents ordinaires.

Ce qui suit la tuile automatiquement :

| Changement sur la tuile | Région | Son | Lumière |
|---|---|---|---|
| position, taille, rotation, ancre | forme reprojetée | position | position + rotation |
| retournement (échelle négative) | forme miroir | position miroir | position miroir |
| image changée | redétourée (réglage) | — | — |
| masquée / affichée | idem (réglage) | idem | idem |
| élévation | — | élévation | élévation |
| niveaux de scène (V14) | copiés | copiés | copiés |
| supprimée | supprimée (réglage) | supprimée | supprimée |

Et dans l'autre sens : **déplacer le son ou la lumière** à la main, ou
**modifier la forme de la région** (poignées, ajout de formes, trous),
met à jour ce que la tuile mémorise — le prochain déplacement de la tuile
conserve la nouvelle disposition. Une région retouchée est mémorisée en
polygones : un rectangle ou un cercle ajouté à la main redevient un polygone
au prochain déplacement (même forme, plus de poignée « cercle »).

Le copier-coller d'une tuile liée donne une tuile **sans** compagnons (sinon
la copie déplacerait ceux de l'original) ; la duplication d'une **scène**
conserve les liens.

## Réglages (monde)

- **Supprimer les compagnons avec la tuile** (défaut : oui).
- **Redétourer la région quand l'image change** (défaut : oui).
- **Masquer les compagnons avec la tuile** (défaut : oui).

## API (macros, autres modules)

`game.modules.get('tile-companions').api` :

```js
const api = game.modules.get('tile-companions').api;
const tile = canvas.tiles.controlled[0].document;

await api.bind(tile, {
  region: { trace: true, name: 'Mare' },                 // ou true
  sound:  { path: 'sounds/eau.ogg', radius: 6, volume: 0.4 },
  light:  { dim: 4, bright: 2, color: '#ff9944', angle: 90, rotation: 0 },
  openSheets: false
});
api.getCompanions(tile);          // { region, sound, light } (documents ou null)
await api.retrace(tile);          // redétoure la région
await api.sync(tile);             // reprojette tout depuis l'état courant de la tuile
await api.syncScene();            // toutes les tuiles liées de la scène courante
await api.unbind(tile, { remove: false }); // détache en gardant les documents
await api.promptBind([tile]);     // le dialogue du HUD
```

Utilitaires exposés aussi : `traceTileOutline(tile)` (polygone scène du
contour alpha, ou `null`), `tileFrame`, `toScene`, `toLocal`,
`pixelsToUnits`.

## Modèle de données

Tout est en **flags**, rien en settings — lisible et modifiable par un autre
outil (connecteur MCP, macro) :

```
tile.flags["tile-companions"] = {
  region: { id, shapes: [{ points: [u, v, …], hole }] },
  sound:  { id, u, v },
  light:  { id, u, v, rotation }        // rotation relative à celle de la tuile
}
région / son / lumière : flags["tile-companions"].tile = <id de la tuile>
```

`u, v` sont des **fractions de l'image** (0 = bord gauche/haut, 1 = bord
droit/bas) dans le cadre **non tourné** de la tuile, miroir compris quand
l'image est retournée. Bouger / tourner / redimensionner / retourner la tuile
est donc une simple reprojection.

## Limites connues

- Le détourage lit les pixels de l'image : une **vidéo** ou une image
  **cross-origin sans CORS** (certains assets externes) donne un canvas
  « tainted » → repli sur le rectangle de la tuile, sans erreur. Une seule
  silhouette est gardée (le plus gros îlot de pixels visibles).
- Le mode d'ajustement de l'image (`contain`, `cover`…) est respecté au
  détourage ; lors d'un **redimensionnement** ultérieur la région s'étire
  avec le cadre de la tuile, ce qui n'est exact qu'en mode `fill` (défaut).
  Un **Redétourer** remet les choses d'équerre.
- La région n'a pas d'élévation propre (bornes infinies) : à régler à la
  main si nécessaire.

## Origine

Le détourage alpha et le bouton de HUD viennent de l'outil « tuile → région »
de [coc7-dialogues](https://github.com/Darshyne/coc7-dialogues) (même
auteur), généralisé ici sans rien de spécifique à un système.
