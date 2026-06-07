# Data Layer

This folder implements the project data layer.

## Rules

- SQLite is the source of truth.
- The renderer never imports this folder.
- The renderer never writes SQL.
- All UI access goes through Electron IPC and the application API.
- Schema changes must be added as migrations.
- Repeated or expandable data uses separate tables, not fixed columns.
- Draft/candidate/final data stays separate:
  - `ocr_candidates`
  - `translation_candidates`
  - `text_units.final_translation`

## Structure

```text
electron/data/
├─ database.cjs
├─ migrations.cjs
├─ seed.cjs
└─ repositories/
   ├─ project-repository.cjs
   ├─ chapter-repository.cjs
   ├─ dictionary-repository.cjs
   ├─ translation-workspace-repository.cjs
   └─ mappers.cjs
```

## Boundaries

```text
Renderer UI
↓
preload florisApi
↓
Electron IPC
↓
Application API
↓
Repositories
↓
SQLite
```

## Extension Points

- Add a new table: create a new migration.
- Add a new screen query: add a repository method, then expose it through application API and IPC.
- Add a new provider result: write candidates into provider-specific candidate tables or existing candidate tables.
- Switch SQLite driver later: keep repository APIs stable and replace `database.cjs`.
