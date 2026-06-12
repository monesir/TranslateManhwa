# Arabic Style Guide

## General Arabic Style

Use Modern Standard Arabic. The exact register is controlled by `translationLevel`, but all levels must remain grammatically sound.

The translation should feel like readable manhwa dialogue, not machine translation and not classical prose unless level 5 requires elevated language.

## Dialogue

- Keep dialogue direct.
- Preserve the speaker's intent.
- Avoid stiff literal structures such as "الشخص الذي سوف يكون يقتلك".
- Prefer natural Arabic verbs over copied English phrasing.
- Use short sentences when the bubble is small.

## Names

If a character has an approved Arabic name, use it exactly.

If a character has aliases, use the approved Arabic alias when the English alias appears.

Do not invent Arabic spellings for known names if a dictionary entry exists.

## Gender and Pronouns

Use character gender from the request:

- `Male`: masculine Arabic forms.
- `Female`: feminine Arabic forms.
- `Unknown`: infer from context if clear, otherwise choose a neutral construction when possible and add a warning.

Do not ignore gender because English is ambiguous.

## Terms

Approved glossary terms are binding unless the request explicitly asks for revision.

If the source uses a term that appears in the glossary, use its Arabic term.

If the source contains a likely recurring term not in the glossary, translate it normally and add a glossary suggestion.

## Punctuation

Use Arabic punctuation where natural:

- `؟` for questions.
- `،` for comma-like pauses.
- `!` for strong exclamation when needed.
- `...` for hesitation or trailing speech when present in the source.

Avoid excessive punctuation.

## Honorifics and Titles

Translate titles by meaning if the glossary has no fixed form.

Keep honorifics only when they are meaningful to the setting or character relationship. Do not force Japanese/Korean honorific structures into Arabic unless the project style requires it.

## Sound Effects

Sound effects can be translated, adapted, or left as stylized Arabic depending on project policy. If no policy is provided:

- Common readable effects may be translated.
- Large decorative SFX should be treated cautiously and may need manual editing.

## Line Breaks

Do not preserve OCR line breaks mechanically. OCR line breaks are often visual, not grammatical.

The returned `arabicText` may contain line breaks only when they improve bubble fit or preserve a deliberate pause.

## Forbidden Patterns

Avoid:

- Literal English syntax.
- Long explanations inside the bubble.
- Adding story facts.
- Changing the speaker's intent.
- Translating a name inconsistently.
- Overly ornate prose at levels 1 to 3.
