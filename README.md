# Treasure Hunt

A simple mobile-first static webapp for a private treasure hunt. It uses only `index.html`, `styles.css`, `app.js`, and SVG images, so it can be published directly with GitHub Pages.

## Local usage

Serve the folder locally so the app can fetch the markdown diary:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Editing diary entries, hints, and codes

Edit `The_Rooms_That_Remember_Treasure_Hunt.md` as the source for clue cards.

- Each clue card is parsed from a `## Entry ...` heading.
- The heading becomes the clue title.
- The text below the heading becomes the diary/clue text.
- Add one bold `For you: ...` line inside an entry to create the hidden hint. That line is removed from the visible clue text and shown only by the hint button.
- Keep blank lines between paragraphs for readable spacing.

The app fetches this markdown file at runtime with a cache-busting query string, so GitHub Pages updates can come from markdown-only commits without copying diary text into `app.js`.

Edit the `clueCodes` array near the top of `app.js` to replace the 9 placeholder unlock codes (`ENTRY-01` through `ENTRY-09`). Keep one code per markdown entry, in the same order. The current clue code unlocks the next clue; codes entered on the start page can jump to the matching point in the hunt.

Do not put real locations or final codes in public repos until you are ready for players to see them. Anyone can inspect static JavaScript.

## Editing images

Replace the SVG placeholders in `images/` with your own images. Clue cards cycle through `images/step-1.svg` to `images/step-4.svg` from the `stepImages` array in `app.js`, so all 9 diary entries get an image. The start screen currently uses `images/saw_doll.jpeg`.

## GitHub Pages publish notes

1. Commit these files to a GitHub repository.
2. In repository settings, enable Pages for the main branch/root folder.
3. Keep `.nojekyll` in the repo so GitHub Pages serves files without Jekyll processing.
4. Share the Pages URL with players.

Progress is saved per device using `localStorage`. Reset controls clear only the current browser/device.
