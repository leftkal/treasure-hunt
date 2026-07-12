# Treasure Hunt

A simple mobile-first static webapp for a private treasure hunt. It uses only `index.html`, `styles.css`, `app.js`, and SVG images, so it can be published directly with GitHub Pages.

## Local usage

Open `index.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Editing clues, hints, and codes

Edit the `clues` array near the top of `app.js`:

- `title`: step heading
- `image`: image path under `images/`
- `text`: clue shown on the card
- `hint`: hidden hint revealed by the hint button
- `code`: placeholder unlock code for that step

Do not put real locations or final codes in public repos until you are ready for players to see them. Anyone can inspect static JavaScript.

## Editing images

Replace the SVG placeholders in `images/` with your own images. Keep paths in `app.js` matching the filenames. The start screen currently uses `images/saw_doll.jpeg`.

## GitHub Pages publish notes

1. Commit these files to a GitHub repository.
2. In repository settings, enable Pages for the main branch/root folder.
3. Keep `.nojekyll` in the repo so GitHub Pages serves files without Jekyll processing.
4. Share the Pages URL with players.

Progress is saved per device using `localStorage`. Reset controls clear only the current browser/device.
