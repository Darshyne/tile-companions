# Changelog

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
