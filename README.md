# daily-carousel-images

Photo store and slide builder for the @khaled.estates daily news Story pipeline.

## Rights rule

**Only images with confirmed redistribution rights may be stored here.** This repository is public, so every file in it is openly downloadable.

- **Library photos** (`images/library/`) come from Wikimedia Commons and are limited to CC0, public domain and CC BY licences. No share-alike, no non-commercial, and nothing with a restriction flag. Every one has its source, licence and attribution in `manifest.json` and `LICENSES.md`, and the attribution is printed under the photo on the slide.
- **Article photos** from news sites are used only for domains listed in `config/authorized-sources.json`, which you add only with written permission on file. The list is empty by default, so no article photos are used.
- If no approved photo fits, the slide keeps the empty placeholder. A missing photo never holds up the batch.

## How it works

1. `.github/workflows/library.yml` (GitHub Actions, free for public repos) adds photos when `library/queries.json` changes or when run by hand (Actions tab → Refresh photo library → Run workflow). It never runs on a timer, so no unreviewed photo reaches a slide without a commit you can see; review new photos before the next daily run and add rejects to `library/excluded.json`. It commits with the repository's own token. `library/excluded.json` lists photos reviewed and rejected, which are never re-added.
2. The daily 07:00 Dubai routine clones this repo (read-only), writes the ranked stories to `stories.json`, and runs:
   ```
   npm ci
   node scripts/pick.js stories.json
   node build.js stories.json out/
   ```
   `pick.js` binds each photo to the story's **article URL**, so re-ranking moves the photo with its story. `build.js` renders 1080×1350 PNGs with Playwright and writes `build-report.json`, which lists the photo, its SHA-256 and the attribution for each slide.

## Layout

```
images/library/         approved photos (commons-<pageid>.jpg)
manifest.json           one entry per photo: file, topic, keywords, source URL, licence basis, attribution, date added
LICENSES.md             table of image source, licence basis, attribution text (generated)
library/queries.json    topics, search terms and matching keywords
library/excluded.json   reviewed and rejected photos
config/authorized-sources.json   news domains whose article photos may be used (empty)
scripts/fetch-library.mjs        library refresh (runs in Actions)
scripts/pick.js         photo-to-story matching
build.js                slide renderer
```
