# AI Translation Context Contract

## Purpose

This file defines what the AI translator receives and how each context layer should be used.

The application must not build free-form prompts from scattered strings. It should build a structured request matching `request.schema.json`.

## Context Layers

## 1. Global Rules

Rules that always apply:

- Translate English OCR text to Arabic.
- Return JSON only.
- Respect glossary.
- Do not add story facts.
- Use the requested translation level.

These rules come from the agent files, not from project data.

## 2. Project Context

Project context describes the whole work:

- English title.
- Arabic title.
- Short synopsis.
- Genre/tone if known.
- Translation policy notes.

Use it to understand setting, tone, and recurring concepts.

## 3. Chapter Context

Chapter context describes the current chapter:

- Chapter title.
- Current chapter summary.
- Previous chapter summary.
- Important characters present in the chapter.
- Scene notes if the user added them.

Use it to resolve pronouns, references, and tone.

## 4. Page Context

Page context describes the page containing a text unit:

- Page order.
- Reading direction.
- Nearby text units.
- Optional page summary.

Use it for local continuity.

## 5. Text Unit Context

Each OCR text unit contains:

- `textUnitId`
- `pageId`
- `pageIndex`
- `sequenceIndex`
- `sourceText`
- Optional OCR confidence.
- Optional speaker.
- Optional bounding box.
- Optional Microsoft translation.
- Optional neighboring text.

The source text is the main translation target.

## 6. Glossary Context

Glossary contains two groups:

- `characters`
- `terms`

Characters may include:

- English name.
- Arabic name.
- Gender.
- Aliases with Arabic aliases.
- Description.

Terms may include:

- English term.
- Arabic term.
- Category.
- Description.

Use glossary entries exactly unless the request says they are only suggestions.

## 7. Microsoft Translation Candidate

Microsoft output is optional.

Use it as:

- A weak hint for meaning.
- A possible baseline when source text is simple.

Do not use it as:

- Final authority.
- Replacement for context.
- Reason to preserve bad Arabic.

## Batch Rules

For `chapter` scope, the application may split the chapter into batches. Every batch should include:

- Stable text unit IDs.
- Enough previous translated context to preserve continuity.
- Relevant glossary entries.
- Chapter summary.

The AI response must be mergeable by `textUnitId`.

## Revision Rules

Future revision requests may include existing Arabic translation.

In that case:

- Preserve good parts.
- Fix meaning, style, glossary, or fit issues.
- Return the revised `arabicText`.
- Mention major changes in warnings only if useful to the editor.
