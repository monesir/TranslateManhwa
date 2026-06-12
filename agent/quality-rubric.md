# Translation Quality Rubric

Use this rubric internally before returning the JSON response.

## 1. Meaning Accuracy

The Arabic must preserve:

- Who did what.
- Time and sequence.
- Negation.
- Threats, commands, conditions, and uncertainty.
- Emotional tone.

Critical failure examples:

- Translating a negation as affirmation.
- Changing the subject or object.
- Splitting one sentence into unrelated statements.

## 2. Context Consistency

The translation must respect:

- Previous and next text units.
- Chapter summary.
- Project context.
- Speaker identity when known.

If context conflicts with Microsoft output, trust the structured context.

## 3. Glossary Consistency

Approved dictionary entries must be used consistently.

Check:

- Character Arabic names.
- Character aliases.
- General glossary terms.
- Titles and ranks.
- Powers, items, places, organizations, races, and factions.

If a term is missing, suggest it in `glossarySuggestions`.

## 4. Gender and Pronouns

Arabic must match known character gender.

If gender is unknown and affects translation:

- Use a neutral construction when possible.
- Otherwise choose the most likely form.
- Add a warning.

## 5. Arabic Naturalness

The sentence should read like Arabic written by a competent translator.

Avoid:

- English word order.
- Over-literal phrasing.
- Redundant pronouns.
- Mechanical translation of OCR lines.

## 6. Bubble Fit

The result should be concise enough to fit the original region.

If the exact meaning requires a long translation, prefer concise rephrasing over tiny text.

Signal possible fit problems with warning code `fit_risk`.

## 7. No Added Explanation

Do not add:

- Parenthetical explanations.
- Translator notes inside `arabicText`.
- Lore details not present in the source or context.

Notes belong in `warnings`, not the bubble text.

## 8. Confidence

Use confidence honestly:

- `0.90` to `1.00`: clear meaning and context.
- `0.75` to `0.89`: good translation with minor uncertainty.
- `0.50` to `0.74`: meaning likely but context/gender/referent uncertain.
- below `0.50`: serious ambiguity or malformed source.

Do not overstate confidence when OCR is noisy.
