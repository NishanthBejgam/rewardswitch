# Reward Switch

**https://rewardswitch.yourcardjourney.store** — every Amazon Pay cashback reward we
know of, named by the category it actually applies to.

Amazon shows each reward as "GET UP TO ₹300 BACK" and a logo; the category, window
and per-user limit are only on the reward's own page. This site reads those pages
(logged out — they answer with `rewardStatus`, headline, terms and redeem steps),
and lays them out so a visitor can:

1. enter an amount and pick what they are buying,
2. see only the rewards that apply, ranked by what they would actually get back,
3. **Collect on Amazon** — a link to Amazon's own reward page, where Amazon decides
   eligibility on the visitor's own account (no login here, no cookies, nothing stored).

## How it is built

```
watch.yml, every 15 min
  └─ python tools/harvest.py           DesiDime + Telegram → new ids committed to seed/catalog.json
       └─ new id? → build.yml (mode=new, reads only the new pages) + pokes coupon-watch
build.yml, every 2 h (13 and 43 past, alternating)
  └─ python tools/build_site.py _site   reads each id in seed/catalog.json
                                          └─ _site/catalog.json + the page → Pages
```

- `tools/harvest.py` — the one harvester (coupon-watch reads its output): DesiDime's new-deals and
  Amazon-store feeds plus public Telegram previews. DesiDime hides every outbound link behind
  `visit.desidime.com/visit/…` and Telegram posts use shorteners, so each link is walked hop by hop
  reading only the `Location` headers until the `rewardAd.<ID>` appears. Gift-card / brand rewards are
  targeted and never show on a Rewards page, so this is how they arrive; the site tags them **New** for 72 h.
  State (deals read, Telegram cursors) rides in the Actions cache; only new ids are committed.
- `seed/catalog.json` — the ids we know: harvested from a real Rewards page (section
  + list-only badge per id), the stable vanity slugs (`sendMoney`, `jewellery`, …) and
  ids shared by deal groups. Add new ids here; everything else is read from Amazon.
- `seed/published.json` — last good read per id, so a fresh runner never publishes
  an empty board and a page that fails keeps its last values with its real age.
- `tools/static/` — the page. `tools/build_site.py` copies it next to `catalog.json`.
- `Publish Catalog.cmd` — sweep from this PC and push the seed (use after adding ids).

`RS_TAG` (default `ycj05-21`) is the Associates tag on the Collect links.

Local preview: `python tools/build_site.py _site` then serve `_site/` (launch.json
has `rewardswitch-site` on 4325).
