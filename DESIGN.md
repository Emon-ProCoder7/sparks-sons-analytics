# DESIGN.md — F. Sparks & Sons Marketing Portal

The portal must feel like it belongs to **sparks.com.au**, not like a generic SaaS dashboard.
Every token below was sampled from the live site on 28 Sep 2026 (logo PNG, theme CSS, homepage HTML).

## Source of truth

| Element | On sparks.com.au | In the portal |
|---|---|---|
| Wordmark | "F. SPARKS & SONS" in orange, black caravan silhouette, black underline running into the van | `public/sparks-logo.png`, used unmodified on light surfaces only |
| Headings | **Oswald**, uppercase, tight (`H1: TRAILER, CARAVAN & TOWBAR SERVICES IN GEELONG…`) | Oswald 500/600, uppercase, `letter-spacing: .02em` |
| Body | **Poppins** | Poppins 400/500 |
| Brand orange | `#FF781A` (logo fill; `#F27218` on the anti-aliased edge) | `--orange` for primary actions, active nav, key numbers — never for body text on white |
| Ink | `#000000` / `#232323` / `#313131` | `--ink`, `--charcoal` |
| Steel / chrome | `#2D2E32`, dark textured workshop photography (trailers on charcoal) | sidebar + page hero band |
| Surfaces | `#FFFFFF`, `#F7F7F7`, `#EEEEEE` | cards on `--paper` |
| Muted text | `#666666`, `#787878` | `--muted` |

## Tokens

```css
--orange: #FF781A;      /* brand, CTAs, active states */
--orange-deep: #D95F0B; /* hover, orange text on white (AA at 16px+ bold) */
--orange-tint: #FFF1E6; /* selected rows, highlight chips */
--ink: #111111;
--charcoal: #232323;
--steel: #2D2E32;       /* sidebar */
--paper: #F7F7F7;       /* app background */
--card: #FFFFFF;
--line: #E6E6E6;
--muted: #666666;
--good: #1F8A4C;  --warn: #B7791F;  --bad: #C53030;
--radius: 6px;          /* the site is squared-off and workmanlike; no pill-heavy UI */
```

## Principles

1. **Workshop, not startup.** Squared corners (6px), solid fills, heavy uppercase Oswald labels. No glassmorphism, no purple gradients, no emoji.
2. **One orange thing per view.** The primary action, or the single number that matters, is orange. Everything else is ink on white.
3. **Plain English first.** The owner said "it's a bit above my head". Every metric card carries a one-line "what this means" sentence under the number.
4. **Honest states.** Every card shows `LIVE`, `SNAPSHOT (date)`, `DEMO ACCOUNT` or `NOT CONNECTED`. Never a fabricated number.
5. **Nothing sends without a tick.** Publish / send buttons stay disabled until an explicit approval checkbox is ticked, and the server re-checks it.
6. **Mobile works.** Sidebar collapses to a top bar under 900px; tables scroll inside their card, the page never scrolls sideways.

## Components

- **Hero band** — charcoal (`--steel`) strip with the page title in white Oswald and a subtle trailer photo (`sparks-hero.jpg`) at 18% opacity on the right, echoing the site's dark product banners.
- **Stat card** — label (Oswald, 12px, uppercase, muted) · number (Oswald 34px) · meaning sentence (Poppins 13px) · status pill.
- **Status pill** — uppercase 11px, squared, colour by state: LIVE green, SNAPSHOT ink outline, DEMO orange outline, NOT CONNECTED grey.
- **Buttons** — primary: orange fill, ink text, uppercase Oswald; secondary: ink outline.
- **Rank cells (map grid)** — 1–3 green, 4–10 amber, 11–20 red, not found grey "20+".
