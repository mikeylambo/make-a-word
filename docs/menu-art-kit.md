# Studio art kit — first slice

Open the game with `?menu=layered` to review the working composition. The normal
menu is preserved. Classic uses a separate raster art surface with live HTML
title, description, and play action. Its entire surface moves together; existing
`data-mode="classic"` routing starts the real game. Other modes retain their
existing responsive implementation pending their own artwork extraction.

## Assets

- `public/assets/menu/studio-empty.png`: reconstructed studio without interface.
- `public/assets/menu/classic-clean.png`: clean opaque gold panel with decorative
  WORD tiles; title and action are not baked in.
- `studio-championship.webp`: original preserved, unchanged.

Created using the built-in image generation tool with the original as reference.
These are regenerated derivatives, not lossless pixel extractions. The first
transparent-panel attempt contained painted checkerboard and was rejected.
The accepted panel is explicitly opaque and rectangular; no alpha is claimed.

## Final prompts

Background: Remove all panels, controls, statistics, logo, tiles and text from
the approved menu. Reconstruct the hidden continuous navy curved studio walls
and reflective floor. Preserve camera, cobalt beams, gold lighting, balcony,
elliptical stage, and materials. Full-bleed 16:9; no UI or watermark.

Classic: Opaque rectangular gold panel filling the entire landscape canvas,
1.8:1. Match sunburst, halftone texture, illuminated gold rim and brown bevel.
Keep cream WORD tiles inside the left quarter. Right three quarters empty.
Remove titles, subtitle and button. No checkerboard, margins, or background.

## Remaining art work

Exact typography match, extracted logo and icons, clean textures for the four
other panels, precise angled geometry, and visual/device comparison before
promoting this opt-in composition to the default menu.
