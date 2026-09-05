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
comportements déclenchés par les **tokens** sont ceux du cœur de Foundry ;
Tile Companions y ajoute (v0.2) quatre comportements déclenchés par un simple
**clic** des joueurs, sans token — voir plus bas.

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

## Comportements au clic (v0.2)

Quatre **comportements de région** supplémentaires, cliquables par les
joueurs **sans token** (théâtre de l'esprit, plans de ville, indices sur une
table…) — les comportements du cœur de Foundry ne réagissent qu'aux tokens.
Ils s'ajoutent comme n'importe quel comportement (calque Régions → double-clic
sur la région → Comportements), ou directement depuis le dialogue du HUD
(« Au clic ») à la création de la région :

| Comportement | Au clic | Options propres |
|---|---|---|
| **Macro au clic** | exécute la macro chez l'utilisateur qui clique, même sans permission sur la macro (elle tourne avec *ses* droits — aucun pouvoir supplémentaire). `scope.behavior` et `scope.region` sont disponibles dans une macro script. | macro |
| **Vers une scène au clic** | `scene.view()` chez le cliqueur, même si la scène n'est pas dans la barre de navigation. | scène ; *Activer pour toute la table* (MJ seulement) |
| **Ouvrir un document au clic** | ouvre un journal, ou une page précise, chez le cliqueur. Si le joueur n'a pas le droit de le voir, le **MJ connecté** lui accorde Observateur via le socket du module (définitif, par joueur). Sans MJ en ligne : avertissement clair. | journal ou page (UUID) ; *Donner la permission* |
| **Jukebox au clic** | lance / coupe chez le cliqueur un lecteur **local** sur une playlist : coupe sa musique (canal Musique seulement), joue sur le canal **Interface** (curseur du joueur), respecte le mode de la playlist et les boucles ; état publié dans ses flags User (`api.jukebox.listActive()` côté MJ). Activer une scène coupe tous les jukebox. `api.resyncMusicForEveryone()` (MJ) ramène tout le monde sur la musique du MJ. | playlist ; mode (celui de la playlist / séquentiel / aléatoire / simultané) |

Commun aux quatre : **libellé au survol** (vide = nom de la cible ou de la
région), **surbrillance** (au survol / toujours discrète / jamais), **couleur**
(vide = celle de la région), curseur main. Une région n'a qu'un comportement
cliquable actif à la fois (le premier). Le MJ ne déclenche les clics que
depuis le calque **Jetons**, pour ne pas voler ceux des outils d'édition.

Ces comportements viennent de [coc7-dialogues](https://github.com/Darshyne/coc7-dialogues),
débarrassés de tout ce qui touchait au système Call of Cthulhu ; le dialogue
de PNJ à embranchements, lui, reste là-bas.

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
  region: { trace: true, name: 'Mare',                   // ou true
            behavior: { type: 'clickMacro', system: { macro: 'Macro.xxx', highlight: 'always' } } },
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

Comportements au clic :

```js
await api.addClickBehavior(region, 'toScene', { targetScene: 'Scene.xxx' }); // clickMacro | toScene | openDocument | jukebox
api.executeClick(behavior);        // déclenche un comportement à la main
api.getClickableRegions();         // [{ region, behavior }] de la scène courante
api.jukebox.start('Playlist.xxx'); api.jukebox.stop(); api.jukebox.listActive(); // MJ : qui écoute quoi
api.resyncMusicForEveryone();      // MJ : tout le monde revient sur la musique du MJ
```

Utilitaires exposés aussi : `traceTileOutline(tile)` (polygone scène du
contour alpha, ou `null`), `tileFrame`, `toScene`, `toLocal`,
`pixelsToUnits`, `grantObserver(uuid, userId)` (MJ).

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
