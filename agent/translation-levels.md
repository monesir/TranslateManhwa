# Translation Levels

## Design Decision

The five translation levels live in one file, not one file per level.

Reason:

- The grammar, glossary, and context rules are shared.
- The difference is register and phrasing, not a separate translation engine.
- A single file makes comparison easier.
- It avoids duplicated instructions that will drift over time.

## Level 5: فصحى أدبية رفيعة

Use for serious, dramatic, royal, poetic, or highly elevated scenes.

Characteristics:

- Elegant phrasing.
- Controlled rhetorical force.
- Rich but not archaic vocabulary.
- No casual wording.
- Still concise enough for bubbles.

Avoid:

- Heavy classical archaism.
- Needlessly long constructions.
- Turning every sentence into poetry.

Example:

```text
Source: You dare stand before me?
Arabic: أتجرؤ على الوقوف بين يدي؟
```

## Level 4: فصحى أدبية عالية

Use for polished dramatic translation without the highest literary density.

Characteristics:

- Elevated but clear.
- Suitable for fantasy, action, and serious scenes.
- More flexible than level 5.

Example:

```text
Source: You dare stand before me?
Arabic: أتجرؤ على الوقوف أمامي؟
```

## Level 3: فصحى أدبية متوسطة

Default recommended level for most manhwa.

Characteristics:

- Balanced.
- Natural but still polished.
- Works for action, drama, and normal dialogue.
- Avoids both stiffness and excessive simplification.

Example:

```text
Source: I am not the one who will be killing you.
Arabic: لست أنا من سيقتلك.
```

## Level 2: فصحى عادية

Use for direct readable translation.

Characteristics:

- Clear.
- Practical.
- Less literary.
- Good for comedy, daily dialogue, and fast scenes.

Example:

```text
Source: I am not the one who will be killing you.
Arabic: أنا لست من سيقتلك.
```

## Level 1: فصحى بسيطة جدا

Use for maximum simplicity.

Characteristics:

- Very easy wording.
- Short sentences.
- Minimal rhetorical weight.
- Suitable for simple works or young-reader style.

Example:

```text
Source: I am not the one who will be killing you.
Arabic: لن أكون أنا من يقتلك.
```

## Selection Rule

The agent must obey `translationLevel`.

If the level makes a sentence awkward, choose the closest natural Arabic form within that level and add no explanation unless the issue affects meaning.
