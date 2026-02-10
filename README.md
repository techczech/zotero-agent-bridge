# Zotero Agent Bridge for VS Code/Cursor

A local-first VS Code extension that lets coding/writing agents work with your Zotero library while you write academic papers.

It is designed for agent-assisted workflows in:
- VS Code
- Cursor
- other agentic IDE environments (including Google Antigravity-style workflows)

## Purpose

When writing an academic paper with an agent, you need your literature corpus in-context.
This extension gives you a practical bridge from Zotero into your workspace so agents can:
- reference your saved papers
- summarize highlights and notes
- compare sources
- draft sections grounded in your own library

## What It Does

- Searches your **local Zotero database** (offline-first).
- Supports **My Library + Group Libraries**.
- Lets you:
  - search and multi-select items
  - export a whole collection
- Exports each item into markdown + optional PDF so agents can use files directly.

## Exported Output

For each exported item:
- Markdown file with YAML frontmatter metadata
- `Highlights` section (from Zotero PDF annotations)
- `Notes` section (from Zotero child notes)
- PDF copy when available/selected

If no PDF exists, metadata/notes/highlights are still exported.

## Collection Export Modes

Collection exports always go into a collection-named subfolder under your export root.

Two modes:
- **Single collection folder**: all items into one folder
- **Mirror sub-collections**: nested subfolders matching Zotero sub-collections

## Current UX/Workflow

1. Run `Zotero: Search And Export Items` or `Zotero: Export Collection`.
2. Select items (or collection).
3. Review selected items in output panel.
4. Confirm export.
5. Files are written to your configured export folder.

## VS Code Commands

- `Zotero: Search And Export Items`
- `Zotero: Export Collection`
- `Zotero: Configure Local Paths`

## Workspace Settings

- `vscodezotero.sqlitePath`
- `vscodezotero.storagePath`
- `vscodezotero.outputPath`
- `vscodezotero.outputFolderName`
- `vscodezotero.layoutMode` (`item-folder`, `flat`, `year-item`)
- `vscodezotero.maxSearchResults`

The extension prompts once for missing destination/layout settings and then reuses them.

## Typical Agent Use Cases

After export, ask your agent to:
- "Summarize all papers in `/articles` relevant to section 2."
- "Compare findings from these 5 exported papers and list disagreements."
- "Build a literature review paragraph using notes/highlights from these files."
- "Extract methods and sample sizes from all markdown files in this collection folder."

## Privacy and Data

- Uses your local Zotero DB and local attachment storage.
- Does not require Zotero Web API credentials.
- No sync/write-back to Zotero in v1.

## Development

```bash
npm install
npm run compile
npm test
```

To run in extension dev host:
- open this project in VS Code
- press `F5`
