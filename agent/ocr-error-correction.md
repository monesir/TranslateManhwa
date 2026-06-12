# OCR Error Correction Guide

## Purpose

OCR text is a noisy reading of the image, not an unquestionable source. Use project context, neighboring text units, dictionaries, punctuation, and normal English grammar to infer the intended sentence before translating it into Arabic.

This layer does not rewrite the stored OCR text. It only guides how you understand the text while producing `arabicText`.

## Non-Negotiable Rules

- Keep the returned `sourceText` exactly aligned with the input text unit. Do not silently replace it with your corrected reading.
- Do not invent words to make a sentence easier.
- Do not "fix" names, aliases, titles, faction names, ability names, ranks, or glossary terms unless the dictionary or surrounding context makes the correction clear.
- If an OCR correction materially affects meaning, add a warning with code `ocr_corrected`.
- If the correction is uncertain, translate the most likely meaning, reduce confidence, and add warning code `ocr_uncertain`.
- If the text appears to be a sound effect, stylized chant, spell, shout, or UI/game term, preserve its intent instead of forcing it into normal English.

## Mixed-Case OCR Noise

OCR may return random capitalization inside normal English words.

Examples:

- `DeSrEvE` should usually be read as `deserve`.
- `KiLlInG` should usually be read as `killing`.
- `YoU` should usually be read as `you`.

How to handle:

- Normalize random internal capitalization when the result is a clear English word in context.
- Do not normalize if the mixed case is likely a proper name, acronym, system label, magic term, or deliberate visual emphasis.
- Translate the corrected meaning, not the damaged capitalization.

## Touching Or Merged Words

OCR may merge neighboring words, especially when letters touch in bold or italic comic fonts.

Common patterns:

- `Iam` -> `I am`
- `Im` -> `I'm` or `I am`
- `youre` -> `you're` or `you are`
- `dont` -> `don't`
- `wont` -> `won't`
- `thats` -> `that's`
- `whatre` -> `what are`
- `gonna` / `wanna` should be treated as informal speech when appropriate.

How to handle:

- Split merged words only when grammar and context strongly support the split.
- Use neighboring text units if the sentence continues across bubbles or lines.
- If multiple splits are possible and they change meaning, add `ocr_uncertain`.

## Broken Or Confused Letters

Common OCR confusions:

- `I`, `l`, `1`, and `|`.
- `O`, `0`, and `Q`.
- `S` and `5`.
- `B` and `8`.
- `rn` read as `m`, or `m` read as `rn`.
- `cl` read as `d`.
- `vv` read as `w`.
- Missing apostrophes in contractions.
- Missing periods, commas, exclamation marks, and question marks.

How to handle:

- Correct only when the intended word is clear from syntax and context.
- Treat punctuation as semantic when it affects tone: question, threat, shock, hesitation, or interruption.
- Do not force a correction if the result would conflict with character names or glossary terms.

## Split Lines And Split Bubbles

OCR often breaks one sentence into many visual lines.

Example:

```text
I AM NOT THE
ONE WHO WILL BE
KILLING YOU.
```

Read this as one sentence before translating.

Rules:

- Join visual line breaks into one sentence when grammar requires it.
- If a sentence continues across multiple text units, preserve continuity in Arabic.
- Do not translate each OCR line as a separate sentence unless each line is semantically independent.

## Text Effects, Shouts, And Distorted Fonts

Some letters are intentionally stretched, tilted, broken, or overlapped for dramatic effect.

Rules:

- Preserve emotional force in Arabic.
- Remove accidental OCR duplication only when it is clearly accidental.
- Keep intentional shouting, hesitation, stuttering, or drawn-out sounds when it carries meaning.
- Do not convert every distorted word into polished formal Arabic if the source is a scream, insult, panic line, or sound effect.

## Warning Codes

Use these warning codes when relevant:

- `ocr_corrected`: You corrected a likely OCR error with high confidence.
- `ocr_uncertain`: You inferred a likely reading but alternatives remain plausible.
- `ocr_name_or_term_uncertain`: OCR may have damaged a name, alias, rank, skill, or glossary term.
- `ocr_split_sentence`: The sentence was reconstructed from multiple OCR lines or text units.

Warnings should be short and attached to the affected text unit when possible.
