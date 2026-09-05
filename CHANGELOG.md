# Changelog

## 0.2.0 — 2026-09-05

Comportements de région cliquables **sans token**, portés depuis
coc7-dialogues et débarrassés de tout ce qui touchait au système CoC7 :

- **Macro au clic** (exécutée chez le cliqueur, permission ou pas, avec ses
  droits), **Vers une scène au clic** (option « activer pour toute la
  table » pour le MJ), **Ouvrir un document au clic** (journal ou page ; le
  MJ connecté accorde Observateur au cliqueur via le socket du module),
  **Jukebox au clic** (lecteur local par joueur sur une playlist, canal
  Interface, état en flags User, coupé à l'activation d'une scène).
- Commun : libellé au survol, surbrillance (survol / toujours / jamais),
  couleur, curseur main ; le MJ ne clique que depuis le calque Jetons.
- Dialogue du HUD : champ « Au clic » pour attacher un de ces comportements
  à la région créée ; `bind()` accepte `region.behavior`.
- API : `addClickBehavior`, `executeClick`, `getClickableRegions`,
  `jukebox.*`, `resyncMusicForEveryone`, `grantObserver`.
- Nouveaux sous-types + `socket: true` dans le manifeste → **relancer le
  monde** après mise à jour (pas juste F5).

## 0.1.0 — 2026-09-05

Première version.

- Bouton dans le HUD des tuiles → dialogue : région (détourée sur l'alpha de
  l'image, ou rectangle), son d'ambiance, lumière d'ambiance ; plusieurs
  tuiles à la fois.
- Les compagnons suivent la tuile : position, taille, rotation, ancre,
  retournement, masquage, élévation (son/lumière), niveaux de scène (V14),
  suppression (réglage). Redétourage automatique quand l'image change
  (réglage), ou manuel depuis le dialogue.
- Sens inverse : déplacer le son / la lumière ou remodeler la région met à
  jour ce que la tuile mémorise.
- Détacher : en supprimant les compagnons, ou en les gardant comme documents
  indépendants.
- Copier-coller d'une tuile liée → copie sans lien ; duplication de scène →
  liens conservés.
- API `game.modules.get('tile-companions').api` (`bind`, `unbind`, `sync`,
  `syncScene`, `retrace`, `promptBind`, `getCompanions`…). Tout en flags.
- Français / anglais.
