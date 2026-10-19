# FilmOrganizer

A film pre-production tool: break a screenplay down scene by scene in a table, then schedule the shoot on a calendar and stripboard.

## Features

- **Breakdown table** — every scene is a row (sheet, scene, I/E, set, day/night, pages in eighths, synopsis, script day, location, …) with one column per breakdown category (cast, background, props, wardrobe, vehicles, effects, …). Elements are added as tags; cast members get ID numbers automatically.
- **Script import** — PDF, Word (`.docx`), Final Draft (`.fdx`), Fountain and plain-text screenplays. PDFs are read from the page layout (headings, action, character cues and dialogue sit at standard indents) and scene lengths are measured from the page in eighths; Word files use screenplay paragraph styles, indents, or plain screenplay conventions. Speaking characters are suggested as cast.
- **Rule-based breakdown (offline)** — runs automatically on import and from **Suggest elements**: finds characters (including ones introduced in capitals with an age), props, vehicles, animals, wardrobe, makeup, effects, sound, music and camera needs from keyword lists in English and Spanish; flags production risks (night exteriors, dawn/dusk light, minors, water, weapons, crowds, long scenes); estimates story days; and spreads any element you confirm to every other scene that mentions it. No internet or AI needed, and the same script always gives the same result.
- **AI breakdown (optional)** — plug in Claude, ChatGPT, Gemini, a local model (Ollama, LM Studio — works offline) or any OpenAI-compatible service with your own key (**Suggest elements → AI settings**). It adds what rules can't infer, such as implied props. Keys are stored only in this browser.
- **Creative briefs (with AI)** — a brief, treatment or script without scene headings (PDF, Word or text) can be broken down by the AI into proposed scenes: locations, Int/Ext, Day/Night, characters, key shots and production risks. The scenes arrive as rows to review, and the rule-based breakdown then runs on them. Needs an AI provider; scripts with scene headings never do.
- **Suggestions** — imported, rule and AI elements arrive as suggestions you accept or reject; hover a chip to see what produced it and the script line behind it. Your own edits always win, and rejected elements are never suggested again.
- **Schedule** — month calendar with month/year navigation; click any day to open that week's drag-and-drop stripboard with an Unscheduled pool and per-day page totals.
- **Export** — PDF with the breakdown, calendar and stripboard, each starting on its own page; an Excel workbook with the same three as separate tabs (plus an Elements tab); and a JSON project file.

Projects are saved automatically in the browser; use **Export → Project file** to keep a copy.

## Run locally

Requires Node.js 22+.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Use **Load sample script** to try it with the included sample screenplay.

## Build

```bash
npm run build
```

## License

[MIT](LICENSE) © 2026 nachobust
