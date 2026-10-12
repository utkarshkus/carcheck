# Adding a car

The website is not the hard part. This is. Budget 3 to 6 hours per car, not 30 minutes.

Work in this order. Do not skip step 1, because a car you cannot source is a car you cannot add.

## 1. Source the manual (30 to 60 min)

In order of preference:

1. **The manufacturer's own HTML manual.** Mahindra publishes one. These are the easiest to work with.
2. **The manufacturer's PDF**, from the brand site or a regional distributor.
3. **The in-car or in-app manual.** Tata's ZConnect and Mahindra's Me4U both carry one. Screenshots are slow but authoritative.
4. **The printed manual in the glovebox.** Slowest, but it is the only source for cars whose manual is not published online.

Avoid scraper sites. They paginate, block automated fetching, and often serve only the table of contents. Two of the three cars in this repo hit exactly that wall.

Save the raw source under `sources/raw/<car-id>/`. That folder is gitignored on purpose: do not commit manufacturer PDFs.

## 2. Extract to text (15 min)

```bash
# PDF to text, keeping layout so tables survive
pdftotext -layout sources/raw/<car-id>/manual.pdf sources/raw/<car-id>/manual.txt
```

For HTML manuals, save the page and strip tags. For screenshots, run OCR.

## 3. Write the digest (60 to 90 min)

`digests/<car-id>.md` is what the chat reads. It is not the manual. It is a condensed, owner-facing extract.

Rules that matter:

- **Keep section numbers.** Every claim needs a reference the chat can cite. A digest without references produces answers you cannot defend.
- **Target 15,000 to 25,000 tokens**, roughly 10,000 to 18,000 words. That fits comfortably in context and keeps the per-question cost near 3 to 5 cents.
- **Cut the legal boilerplate, warranty text and marketing.** Keep procedures, numbers, indicator meanings, warnings and limits.
- **End with a "Not covered by this extract" section** listing what you left out. This is what stops the model inventing an answer. See `digests/mahindra-xev-9e.md` for the pattern.
- **Never paste the manual wholesale.** Manuals are copyrighted. A condensed, restructured extract that cites its source is defensible; a full copy is not.

## 4. Write the guided checks (60 to 120 min)

`public/data/cars/<car-id>.json`, against `schema/car.schema.json`.

A good check starts from a symptom an owner would actually type, not a system name. "Car won't lock, chimes and flashes 5 times" beats "Central locking system".

Severity is the product. Pick one:

| `sev` | Means | Use when |
|---|---|---|
| `normal` | Nothing is wrong | The manual documents this behaviour as expected |
| `diy` | The owner can fix it | There is a procedure the owner may safely perform |
| `service` | Book a service visit | It needs a technician but the car is drivable |
| `stop` | Stop driving | Safety critical, or driving risks damage |

Order steps cheapest-first. The first step should be the one that takes 10 seconds and resolves half the cases.

Every issue needs a `ref`. If you are reasoning beyond the manual, set `inferred: true` and write a `note` saying what the manual does and does not say. The build fails if you forget.

## 5. Register and validate (10 min)

Add the car to `public/data/cars.json`, then:

```bash
npm run validate
```

The validator fails the build on a missing reference, an unknown category, a broken signal link, a missing digest, or a count that does not match. Fix everything it reports before pushing.

## 6. Verify against the real car (30 min, only if you have access)

Mark a car `complete` only when someone has checked the procedures against the actual vehicle. Otherwise use `partial` and write an honest `coverageNote`. A wrong instruction about a car's brakes is worse than no page at all.

## Status values

| Status | What it promises |
|---|---|
| `complete` | Every category populated, checked against the manual, ideally verified on the car |
| `partial` | Some content sourced. The coverage note says what is missing. Chat works. |
| `stub` | Schema only. Chat is disabled. The page says so. |

## Cost note

Each chat turn sends the whole digest. A 20,000-token digest costs roughly 3 to 5 cents per turn at current GPT-4o pricing, less with prompt caching. If a car's digest grows past about 40,000 tokens, split it by chapter and retrieve only the relevant chapters, or move that car to embeddings. Do not do that work before you need it.
