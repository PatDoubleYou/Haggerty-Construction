# Photos to add (drop-in manifest)

The service-page galleries are already wired to the filenames below. To make
them appear, save each cleaned-up photo at the **exact path** shown, then commit.

> ⚠️ Until these files are added, those gallery slots will show broken images —
> so add them before deploying to production.
>
> All files go in: `src/assets/images/projects/`
> (Real Haggerty project photos only — no AI/stock.)

---

## Kitchen — `/services/kitchen-remodels/`

| Save as | This is the photo of… |
|---|---|
| `kitchen-oak-before.jpg` | Oak cabinets + white quartz counters + stainless gas range & LG microwave, vaulted ceiling (the existing/"before" kitchen). |
| `kitchen-demo-before.jpg` | Oak kitchen mid-demo — cabinet doors/drawers removed, tools/level/drill on the white island, fridge + dishwasher in place. |
| `kitchen-cabinet-install-crew.jpg` | Haggerty crew member (gray Haggerty shirt, ear protection) on a ladder working on an oak upper cabinet. |
| `kitchen-install-progress-1.jpg` | White/gray shaker kitchen — uppers installed (incl. glass-front), base + island boxes going in; opening to a room with a blue wall and black chairs. |
| `kitchen-install-progress-2.jpg` | White/gray shaker kitchen during install — ladder in center, cabinet boxes, terracotta floor protected, palm view through windows. |

*(Already-real finished anchors kept in this gallery: `after-850w.webp`, `kitchen-island-remodel-850w.webp`.)*

---

## Bathroom — `/services/bathroom-remodels/`

| Save as | This is the photo of… |
|---|---|
| `bathroom-freestanding-tub.jpg` | White freestanding soaking tub in front of two glass-block corner windows, gray tile, brushed-gold tub filler. |
| `bathroom-patterned-tile-shower.jpg` | Walk-in shower with cream + blue/black patterned (encaustic-look) wall tile and dark mosaic floor pan; niche. |
| `bathroom-shower-tile-install.jpg` | Shower with gray marble-look large-format tile partially installed (leveling wedges), niche, glass-block window. |
| `bathroom-shower-waterproofing.jpg` | Shower with the red waterproofing membrane applied over walls + mortar pan (waterproofing stage), toilet + Delta box at left. |
| `bathroom-floor-tile-install.jpg` | Large-format floor tile being set with leveling clips (looking-down angle), tools around the edges. |

*(Already-real anchors kept: `bathroom-door-renovation.jpg`, `portfolio/towel-rack.jpg`.)*

**Optional hero upgrade:** the freestanding-tub shot would make a stronger page
hero than the current crew shot. It's portrait, so eyeball the wide crop first;
if it looks good, set `heroImage: '/assets/images/projects/bathroom-freestanding-tub.jpg'`
in `src/services/bathroom-remodels.md`.

---

## Whole Home — `/services/home-remodeling/`

| Save as | This is the photo of… |
|---|---|
| `home-custom-built-in-bookcase.jpg` | FINISHED full-wall custom built-in bookcase/cabinetry (light maple) filled with books and a figure/dinosaur collection. |
| `home-great-room-progress.jpg` | Open-concept great room mid-remodel — wood-look flooring being installed (loose planks), cabinet boxes being set, vaulted ceiling, arched doorway. |
| `home-flooring-living-room.jpg` | Open living room with new dark hardwood floors (partly Ram-Board protected), furniture wrapped in plastic, linear fireplace, french doors to a patio. |
| `home-bedroom-protected.jpg` | Master bedroom — all furniture wrapped in plastic and floors protected with Ram Board, wood blinds. |

*(Already-real anchors kept: `conners-living-room.webp`, `gallery/mudroom.jpg`.)*

---

Once all files are committed, this manifest can be deleted.
