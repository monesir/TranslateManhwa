# خطة طبقة القاموس

## الهدف

طبقة القاموس مسؤولة عن تثبيت أسماء الشخصيات والمصطلحات داخل مشروع المانهوا، حتى تبقى الترجمة متسقة بين الفصول.

القرار الحالي: لا نستخدم عدة قواميس منفصلة مثل Places وSkills وTitles. نعتمد بنية أبسط:

- `Characters`: للشخصيات فقط.
- `General Glossary`: لكل المصطلحات الأخرى، مع حقل `Category`.

هذا أبسط في الواجهة، وأسهل في التخزين، ويمنع تضخم البنية مبكرًا.

## لماذا هذا التصميم أفضل الآن؟

تقسيم القاموس إلى أنواع كثيرة من البداية يضيف تعقيدًا لا نحتاجه في MVP. أغلب العناصر غير الشخصيات يمكن تمثيلها كمصطلحات عامة مع تصنيف.

مثال:

```text
English Term: Shadow Monarch
Arabic Term: ملك الظلال
Category: Title

English Term: Mana Crystal
Arabic Term: بلورة المانا
Category: Power System

English Term: Hunter Association
Arabic Term: جمعية الصيادين
Category: Organization
```

بهذا نستطيع لاحقًا إضافة تصنيفات جديدة دون تعديل بنية قاعدة البيانات أو الواجهة.

## أقسام القاموس

## 1. Characters

قسم خاص بالشخصيات، لأن الشخصية تحتاج معلومات لا تنطبق على المصطلحات العادية.

### الحقول

- `English Name`
- `Arabic Name`
- `Gender`
- `Aliases`
- `Arabic Aliases`
- `Description`

### شرح الحقول

## English Name

الاسم الأصلي أو الإنجليزي للشخصية كما يظهر في المصدر أو المرجع.

مثال:

```text
Sung Jinwoo
```

## Arabic Name

الاسم العربي المعتمد الذي يجب استخدامه في الترجمة.

مثال:

```text
سونغ جين وو
```

## Gender

جنس الشخصية إن كان معروفًا. يفيد في الضمائر وصياغة الجمل العربية.

القيم المقترحة:

- `Male`
- `Female`
- `Unknown`

## Aliases

الأسماء البديلة أو الألقاب التي تشير إلى نفس الشخصية.

مثال:

```text
Jinwoo, Hunter Sung, Shadow Monarch
```

## Arabic Aliases

المقابل العربي المعتمد لكل اسم بديل.

مثال:

```text
جين وو، الصياد سونغ، ملك الظلال
```

الأفضل تخزين الأسماء البديلة كأزواج حتى لا تنفصل الصيغة الأصلية عن العربية.

مثال:

```json
[
  {
    "english": "Jinwoo",
    "arabic": "جين وو"
  },
  {
    "english": "Hunter Sung",
    "arabic": "الصياد سونغ"
  },
  {
    "english": "Shadow Monarch",
    "arabic": "ملك الظلال"
  }
]
```

ملاحظة: إذا كان اللقب مهمًا كمصطلح مستقل، يمكن إضافته أيضًا في `General Glossary`.

## Description

وصف مختصر للشخصية يفيد المترجم والذكاء الاصطناعي.

مثال:

```text
البطل الرئيسي. يتحدث غالبًا بهدوء وبجمل مباشرة. لا يميل إلى المبالغة العاطفية.
```

هذا الحقل اختياري.

## نموذج بيانات Character

```json
{
  "id": "character-001",
  "englishName": "Sung Jinwoo",
  "arabicName": "سونغ جين وو",
  "gender": "Male",
  "aliases": [
    {
      "english": "Jinwoo",
      "arabic": "جين وو"
    },
    {
      "english": "Hunter Sung",
      "arabic": "الصياد سونغ"
    }
  ],
  "description": "البطل الرئيسي. أسلوبه هادئ ومباشر.",
  "createdAt": "2026-06-07T00:00:00Z",
  "updatedAt": "2026-06-07T00:00:00Z"
}
```

## 2. General Glossary

القاموس العام يحتوي كل ما ليس شخصية.

### الحقول

- `English Term`
- `Arabic Term`
- `Description`
- `Category`

### شرح الحقول

## English Term

المصطلح الأصلي أو الإنجليزي.

مثال:

```text
Shadow Monarch
```

## Arabic Term

الترجمة العربية المعتمدة.

مثال:

```text
ملك الظلال
```

## Description

شرح قصير للمصطلح أو قاعدة استخدامه.

مثال:

```text
لقب رسمي. لا تستخدم "ملك الظل".
```

هذا الحقل اختياري.

## Category

تصنيف المصطلح. لا يكون جدولًا منفصلًا، بل قيمة داخل سجل المصطلح.

تصنيفات أولية مقترحة:

- `Title`
- `Place`
- `Organization`
- `Skill`
- `Power System`
- `Item`
- `Race`
- `Rank`
- `Faction`
- `General Term`

التصنيفات قابلة للإضافة من المستخدم. القائمة أعلاه هي بداية فقط، وليست قائمة مغلقة.

## نموذج بيانات General Glossary Item

```json
{
  "id": "term-001",
  "englishTerm": "Shadow Monarch",
  "arabicTerm": "ملك الظلال",
  "description": "لقب رسمي. لا تستخدم ملك الظل.",
  "category": "Title",
  "createdAt": "2026-06-07T00:00:00Z",
  "updatedAt": "2026-06-07T00:00:00Z"
}
```

## واجهة تبويب Dictionary

تبويب `Dictionary` داخل صفحة المانهوا يحتوي قسمين:

- `Characters`
- `General Glossary`

يمكن عرضه كـ tabs داخلية أو segmented control.

## تبويب Characters

يعرض جدول الشخصيات.

### الأعمدة

- English Name
- Arabic Name
- Gender
- Aliases
- Arabic Aliases
- Description

### الأفعال

- Add Character.
- Edit Character.
- Delete Character.
- Search.
- Filter by Gender.

## تبويب General Glossary

يعرض جدول المصطلحات العامة.

### الأعمدة

- English Term
- Arabic Term
- Category
- Description

### الأفعال

- Add Term.
- Edit Term.
- Delete Term.
- Search.
- Filter by Category.
- Add Category.

## القاموس في Overview

في تبويب `Overview` نعرض إحصائيات بسيطة:

- عدد الشخصيات.
- عدد المصطلحات العامة.
- آخر تعديل على القاموس.
- أكثر التصنيفات استخدامًا.

مثال:

```text
Characters: 18
General Terms: 74
Most Used Category: Skill
Last Dictionary Edit: 2026-06-07 16:40
```

## القاموس في صفحة الترجمة

في صفحة الترجمة نعرض قاموسًا مصغرًا مرتبطًا بوحدة النص الحالية.

يعرض:

- الشخصيات الموجودة في النص الحالي.
- المصطلحات العامة الموجودة في النص الحالي.
- الترجمة العربية المعتمدة لكل عنصر.
- تحذير إذا اختلفت الترجمة النهائية عن القاموس.
- زر إضافة شخصية.
- زر إضافة مصطلح.
- زر فتح القاموس الكامل.

## مثال في صفحة الترجمة

```text
Matched Dictionary

Characters:
Sung Jinwoo -> سونغ جين وو

Terms:
Shadow Monarch -> ملك الظلال [Title]
Mana Crystal -> بلورة المانا [Power System]

Warning:
استخدمت "ملك الظل" بدل "ملك الظلال".
```

## إضافة عنصر من صفحة الترجمة

## إضافة شخصية

1. يحدد المستخدم اسمًا من النص الأصلي.
2. يضغط `Add Character`.
3. يظهر نموذج:
   - English Name
   - Arabic Name
   - Gender
   - Aliases
   - Arabic Aliases
   - Description
4. يحفظ العنصر.
5. يظهر فورًا في القاموس المصغر.

## إضافة مصطلح عام

1. يحدد المستخدم مصطلحًا من النص الأصلي.
2. يضغط `Add Term`.
3. يظهر نموذج:
   - English Term
   - Arabic Term
   - Category
   - Description
4. يحفظ العنصر.
5. يبدأ النظام باستخدامه في التحذيرات والترجمة.

## استخدام القاموس مع الذكاء الاصطناعي

لا نرسل كل القاموس دائمًا. نرسل فقط ما يفيد النص الحالي.

نرسل:

- الشخصيات التي تظهر في النص الحالي.
- المصطلحات التي تظهر في النص الحالي.
- بعض الشخصيات الرئيسية من المشروع.
- المصطلحات كثيرة التكرار أو المهمة.

## صيغة مختصرة ترسل للذكاء الاصطناعي

```text
Characters:
- Sung Jinwoo => سونغ جين وو, Male, calm/direct speech style.

Glossary:
- Shadow Monarch => ملك الظلال, Category: Title, Do not translate as "ملك الظل".
- Mana Crystal => بلورة المانا, Category: Power System.
```

## استخدام القاموس في مراجعة الجودة

طبقة الجودة تستخدم القاموس لاكتشاف:

- اختلاف أسماء الشخصيات.
- اختلاف ترجمة المصطلحات.
- استخدام ترجمة غير معتمدة.
- مصطلح ظهر في النص الأصلي ولم يظهر في الترجمة.
- التباس بسبب Alias غير مربوط بالشخصية.

## المطابقة

يجب أن تطابق طبقة القاموس:

- `English Name`
- `Aliases`
- `Arabic Aliases`
- `English Term`
- اختلافات بسيطة في المسافات أو الشرطة.

ولا يجب أن تعدل الترجمة تلقائيًا. تعرض تحذيرًا للمترجم.

## الاستيراد والتصدير

يدعم القاموس:

- تصدير JSON.
- استيراد JSON.
- تصدير CSV لاحقًا.
- استيراد CSV لاحقًا.

## MVP طبقة القاموس

يدخل في MVP:

- قسم Characters.
- قسم General Glossary.
- حقول الشخصيات:
  - English Name
  - Arabic Name
  - Gender
  - Aliases
  - Arabic Aliases
  - Description, اختياري
- حقول القاموس العام:
  - English Term
  - Arabic Term
  - Description, اختياري
  - Category
- بحث.
- فلترة المصطلحات حسب Category.
- إحصائيات بسيطة في Overview.
- قاموس مصغر في صفحة الترجمة.
- إرسال العناصر المطابقة للذكاء الاصطناعي.
- تحذيرات اختلاف الترجمة.

## يؤجل لما بعد MVP

- اقتراح شخصيات تلقائيًا من النصوص.
- اقتراح مصطلحات تلقائيًا.
- دمج العناصر المتشابهة.
- سجل تغييرات لكل عنصر.
- تصنيف تلقائي للمصطلحات.
- علاقات تفصيلية بين الشخصيات.

## القرار الحالي

نعتمد قاموسًا عمليًا من مستويين فقط:

```text
Dictionary
├─ Characters
│  ├─ English Name
│  ├─ Arabic Name
│  ├─ Gender
│  ├─ Aliases
│  ├─ Arabic Aliases
│  └─ Description
│
└─ General Glossary
   ├─ English Term
   ├─ Arabic Term
   ├─ Description
   └─ Category
```

هذا التصميم يكفي للنسخة الأولى، ويحافظ على قابلية التوسع دون تعقيد زائد.
