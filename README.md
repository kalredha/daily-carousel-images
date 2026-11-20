# daily-carousel-images

Image store for the @khaled.estates daily news Story pipeline.

## Rights rule

**Only images with confirmed redistribution rights may be stored here.** This repository is public, so every file in it is openly downloadable. Before an image is added:

1. The licence or written permission must allow redistribution and use on social media.
2. The image must have an entry in `manifest.json`.
3. The source must be listed in `LICENSES.md` with its licence basis and the required attribution text.

Images without all three must not be committed.

## Layout

```
images/          one image per story, named NN-slug.jpg
                 NN = slide number, e.g. 01-abu-dhabi-transactions.jpg
manifest.json    maps each story to its image file, source URL, licence basis and date added
LICENSES.md      table of image source, licence or permission basis, attribution text
```

## manifest.json entry format

```json
{
  "story": "Abu Dhabi transactions",
  "file": "images/01-abu-dhabi-transactions.jpg",
  "source_url": "https://example.com/original-image-page",
  "licence_basis": "Unsplash Licence",
  "date_added": "2026-11-20"
}
```

## Raw image URLs

```
https://raw.githubusercontent.com/kalredha/daily-carousel-images/main/images/<file>
```
