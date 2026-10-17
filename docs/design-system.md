# Oyu AI web design system

This web workspace adapts the original mobile app's design for the Oyu AI brand. The reference app lives at `/Users/boldbat/Oyu/Work/Apps/LookLuxe-AI`. The design audit was performed on 15 October 2026 against its source and saved review images.

## Visual direction

Use warm ivory pages, white or warm-white surfaces, restrained lavender selections, and strong monochrome primary actions. Clothing imagery should carry most of the color. Keep titles clear, secondary copy quiet, and one primary action prominent in each context.

The October 10–11 Wardrobe, Settings, and calendar refreshes are the current palette reference. The mobile app also retains an older cool-gray page gradient in `core/theme.dart`; that file remains useful for typography and score colors but does not supersede the newer warm surface palettes.

## Colors

The implementation tokens are in [styles.css](../src/styles.css). These values come from the mobile `WardrobePalette`, `SettingsPalette`, and `HomeCalendarPalette` classes.

| Role                  | Light     | Dark      |
| --------------------- | --------- | --------- |
| Page                  | `#FAF7F2` | `#18161B` |
| Surface               | `#FFFFFF` | `#252128` |
| Warm wardrobe surface | `#FFFDFA` | `#252128` |
| Muted surface         | `#F3EEF8` | `#302B36` |
| Accent                | `#6C5589` | `#CAB8EA` |
| Accent surface        | `#EBE4F5` | `#3C3149` |
| Border                | `#E5DDE8` | `#4A3F52` |
| Main text             | `#242126` | `#F4EFF7` |
| Secondary text        | `#6D6570` | `#C2B6CA` |
| Destructive text      | `#A62E3E` | `#FF8A95` |

Lavender communicates selection, supporting actions, and quiet emphasis. The mobile primary action is near-black (`#0D0D0D`); the web uses a closely related charcoal. Do not use the accent as a substitute for every semantic color.

Score dimensions have their own colors in the source app: accessories `#FF3B30`, color harmony `#FF9500`, hairstyle `#007AFF`, and styling coherence `#20B0C8`. The overall score is monochrome. Always show labels and denominators; color alone does not identify a dimension. An unavailable dimension remains unavailable rather than becoming a zero.

## Typography and rhythm

The mobile source uses platform-native sans-serif text with English and Mongolian coverage. Its reference scale is 46/38px for display text, 32/28px for large headings, 21px for section titles, 17/15px for body text, and 13/12px for supporting labels. Heading weights are 700; body weights are 400. Large headings use slightly negative tracking.

The web adaptation uses DM Sans for UI copy and Manrope for headings, with system fallbacks declared in [styles.css](../src/styles.css). Font requests are configured in [index.html](../index.html). Georgia is used sparingly for editorial emphasis. These are web-specific choices, not fonts extracted from the mobile app. If Mongolian support is added, review actual Cyrillic text and fallback metrics before claiming localization parity.

Source spacing steps are 4, 8, 12, 16, 24, and 32px. Mobile page gutters are 20px, section spacing 28px, and card padding 18px. Desktop composition uses wider gutters and a persistent sidebar; mobile uses a navigation drawer and stacked content. The source radius ladder is 14px for inline controls, 18px for chips, 24px for surfaces, 28px for dialogs, 32px for sheets, and pill-shaped primary actions. The web uses slightly tighter control radii while keeping rounded content surfaces.

## Shared components

- Keep garment photos fully visible with `object-fit: contain` when identity or selection matters. Editorial portraits may use a deliberate crop.
- Garment cards show the photograph, name, category, color, and relevant availability. Favorite and laundry state are separate facts.
- Use the same garment IDs and photographs in the wardrobe, composer, saved looks, and wear journal.
- Distinguish selected, unavailable, processing, and failed states with text or icons as well as color.
- Keep local sample information visible. Do not present illustrative scores as actual AI analysis or synthetic clothing as purchasable stock.
- Scope feature CSS selectors to their component. In particular, an image-overlay category badge and a category label in card copy must not share positioning rules.

## Interaction and accessibility

Use semantic controls, a visible keyboard focus indicator, accessible names for dialogs and icon buttons, and explicit selected states for toggles and filters. A closed mobile drawer must not remain in the tab order. An open modal should contain focus, close with Escape, and restore focus to its trigger. Long dialogs and short-height sidebars need reachable scrolling.

The mobile reference uses at least 44px icon targets and a 48px explanation target. Prefer those sizes for touch controls. Let labels wrap or layouts stack instead of making meaningful text smaller to fit. Verify at 320px width, with long names, with text zoom, and with both themes.

Motion should finish quickly. Source examples include a 140ms press response, 220ms theme transition, and 320ms onboarding transition. Honor `prefers-reduced-motion`; state changes must remain understandable without movement. Avoid artificial progress percentages for asynchronous AI work.

## Asset provenance

The web assets in `public/assets/` originate in these source-app locations:

| Source                                       | Contents                               | Intended use                                       |
| -------------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| `apps/mobile/assets/brand/lookluxe_mark.png` | 512px transparent monogram             | Current brand mark; tint or invert for the surface |
| `assets/store-test/*.png`                    | Six square garment images, 1254px each | Clearly labeled synthetic sample inventory         |
| `apps/mobile/assets/onboarding/styles/*.png` | Nine 3:4 portraits, 1086 × 1448px      | Synthetic style examples                           |

The garment set is beige/navy tops, black/stone trousers, and white/black sneakers. Portrait styles include casual, business, formal, sporty, street, minimal, classic, romantic, and traditional. The source provenance documents are `docs/design/store-test-assets.md` and `docs/design/onboarding-assets.md`. They do not establish actual merchandise stock, materials, measurements, customer identities, or generated user results.

## Source references

All paths in this list are relative to the source app root above:

- `apps/mobile/lib/features/wardrobe/wardrobe_design.dart`
- `apps/mobile/lib/features/score/settings_design.dart`
- `apps/mobile/lib/features/score/home_calendar_design.dart`
- `apps/mobile/lib/core/theme.dart`
- `apps/mobile/lib/core/lookluxe_ui.dart`
- `docs/design/entry-refresh-2026-10-08/README.md`
- `docs/design/wardrobe-refresh-2026-10-10/README.md`
- `docs/design/settings-refresh-2026-10-10/README.md`
- `docs/design/home-calendar-style-refresh-2026-10-11/README.md`
- `docs/analysis/design-research-2026-10-08/README.md`
