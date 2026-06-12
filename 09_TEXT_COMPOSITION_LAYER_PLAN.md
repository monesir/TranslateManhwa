# خطة طبقة تركيب النصوص

## الهدف

طبقة تركيب النصوص هي العهد الجديد للنصوص داخل صفحة الترجمة. هدفها نقل البرنامج من نموذج "نص مترجم داخل صندوق واحد بشكل موحد" إلى نموذج تحرير مانهوات حقيقي، حيث يكون النص عنصرًا بصريًا قابلًا للتشكيل حسب المعنى والسياق والفقاعة.

المشكلة الحالية ليست في الترجمة وحدها. الترجمة الآلية قد تكون صحيحة لغويًا، لكنها تظهر بشكل واحد تقريبًا:

- خط واحد.
- وزن واحد.
- لون واحد.
- صندوق واحد.
- تأثيرات محدودة.
- اختيار حجم آلي عام.

بينما عمل المترجم والمحرر الحقيقي يتعامل مع النص كجزء من الرسم:

- صراخ.
- همس.
- تهديد.
- تعليق جانبي.
- صندوق سرد.
- فقاعة سوداء.
- عنوان.
- مؤثر صوتي.
- نص مكتوب على لافتة أو ورقة.
- نص صغير خارج الحوار الأساسي.

لذلك يجب بناء طبقة مستقلة فوق الترجمة والتنظيف والـ OCR، ولا نخلطها مع إصلاحات `fontSize` المتفرقة.

## النسخة الاحتياطية

قبل هذه الخطة تم إنشاء فرع احتياطي على نفس حالة `main` المستقرة:

```text
codex/backup-before-text-composition-20260612
```

والفرع دُفع إلى GitHub.

هذا الفرع يمثل نقطة رجوع قبل أي تعديل خاص بطبقة تركيب النصوص.

## مبدأ التنفيذ

هذه الطبقة يجب أن تُبنى تدريجيًا. ممنوع استبدال `typesetting_items` دفعة واحدة.

القواعد:

- لا حذف للجداول الحالية في البداية.
- لا كسر لصفحة الترجمة الحالية.
- لا تغيير مفاجئ في export قبل أن يعمل العرض داخل الصفحة.
- لا migration مدمرة.
- أي مرحلة يجب أن تكون قابلة للاختبار والرجوع.
- التحويل إلى النظام الجديد يكون عبر قراءة مزدوجة أو توافق خلفي، ثم نقل تدريجي.

## الفرق بين النظام الحالي والنظام المطلوب

## النظام الحالي

الكيان الرئيسي الحالي:

```text
typesetting_items
```

يمثل غالبًا:

- `text_unit_id`
- `font_size`
- `box_json`
- `style_json`

هذا جيد كبداية، لكنه غير كاف لمنصة تحرير نصوص مانهوات.

مشاكله:

- عنصر نص واحد لكل OCR unit.
- لا يملك مفهوم preset.
- لا يفرق بين auto/manual بوضوح كاف.
- لا يدعم stroke/shadow/effects كحقول منظمة.
- لا يدعم أكثر من جزء نصي داخل نفس الفقاعة.
- لا يدعم تصنيف نوع النص.
- لا يملك طبقة مستقلة للـ export.
- أي تعديل صغير في القياس يؤثر على كل شيء.

## النظام المطلوب

النظام الجديد يجب أن يكون:

```text
Text Composition Layer
```

أي أن النص ليس `fontSize + box` فقط، بل composition كامل.

التركيب الواحد يمثل طريقة ظهور نص محدد على الصفحة، وقد يرتبط بـ OCR unit أو يكون عنصرًا يدويًا مستقلًا لاحقًا.

## المفاهيم الأساسية

## Text Composition

عنصر نص بصري قابل للتحرير.

يجب أن يدعم:

- النص المعروض.
- علاقته بـ `text_unit_id` إن وجدت.
- صندوق العرض.
- نوع التركيب.
- preset مستخدم.
- خط.
- حجم.
- وزن.
- لون.
- stroke.
- shadow.
- line height.
- padding.
- alignment.
- vertical alignment.
- rotation.
- opacity.
- اتجاه النص.
- auto fit settings.
- flags مثل `isManual`, `isLocked`, `isGenerated`.

## Text Style Preset

قالب شكل قابل لإعادة الاستخدام.

أمثلة:

- `normal_dialogue`
- `black_bubble`
- `shout`
- `whisper`
- `thought`
- `narration`
- `small_aside`
- `title`
- `sfx`
- `sign_text`

الهدف من preset أن لا يضطر المستخدم لتعديل كل نص يدويًا.

## Composition Kind

تصنيف وظيفي للنص:

```text
dialogue
thought
narration
shout
whisper
aside
sfx
title
sign
unknown
```

هذا التصنيف لا يعني شكلًا نهائيًا دائمًا، لكنه يساعد auto paste وHenry والـ AI لاحقًا.

## Manual Override

أي تركيب تم تعديله يدويًا يجب أن يُعلَّم بوضوح.

القاعدة:

- إذا عدل المستخدم صندوق النص أو حجمه أو لونه أو preset يدويًا، يصبح `is_manual = 1`.
- أوامر auto لا يجب أن تعيد الكتابة فوقه إلا إذا اختار المستخدم ذلك صراحة.

## قاعدة البيانات المقترحة

## المرحلة الأولى: إضافة بدون استبدال

لا نحذف `typesetting_items`.

نضيف جداول جديدة:

```sql
CREATE TABLE text_style_presets (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  style_json TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

ملاحظات:

- `project_id = NULL` يعني preset عام داخل البرنامج.
- `project_id != NULL` يعني preset خاص بمشروع.
- `style_json` يحمل التفاصيل بدل عشرات الأعمدة في البداية.

```sql
CREATE TABLE text_compositions (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  text_unit_id TEXT,
  preset_id TEXT,
  kind TEXT NOT NULL DEFAULT 'dialogue',
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'auto',
  box_json TEXT NOT NULL,
  style_json TEXT NOT NULL,
  layout_json TEXT,
  effect_json TEXT,
  render_order INTEGER NOT NULL DEFAULT 0,
  is_manual INTEGER NOT NULL DEFAULT 0,
  is_locked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  FOREIGN KEY (text_unit_id) REFERENCES text_units(id) ON DELETE SET NULL,
  FOREIGN KEY (preset_id) REFERENCES text_style_presets(id) ON DELETE SET NULL
);
```

فهارس:

```sql
CREATE INDEX idx_text_compositions_chapter ON text_compositions(chapter_id, render_order);
CREATE INDEX idx_text_compositions_page ON text_compositions(page_id, render_order);
CREATE INDEX idx_text_compositions_text_unit ON text_compositions(text_unit_id);
```

## لماذا JSON في البداية؟

لأننا ما زلنا نكتشف تفاصيل الطبقة. جعل كل خاصية عمودًا الآن سيجعل migration متكررًا.

الحقول المنظمة داخل JSON يجب أن تكون بعقد واضح، مثل:

```json
{
  "fontFamily": "JF Flat",
  "fontSize": 18,
  "fontWeight": 800,
  "color": "#17110B",
  "stroke": {
    "enabled": false,
    "color": "#FFFFFF",
    "width": 0
  },
  "shadow": {
    "enabled": false,
    "color": "#000000",
    "blur": 0,
    "x": 0,
    "y": 0
  },
  "opacity": 1
}
```

و:

```json
{
  "align": "center",
  "verticalAlign": "middle",
  "lineHeight": 1.28,
  "paddingX": 5,
  "paddingY": 3,
  "rotation": 0,
  "direction": "auto",
  "fitMode": "shrink_to_fit",
  "maxLines": null
}
```

## التوافق مع النظام الحالي

نحتاج طبقة mapping:

```text
typesetting_items -> legacy TextComposition view
```

في البداية:

- إذا وُجد `text_compositions` للنص، نعرضه.
- إذا لم يوجد، نعرض من `typesetting_items`.
- إذا لم يوجد `typesetting_items`، نعرض معاينة محسوبة فقط ولا نحفظها إلا عند أمر صريح.

هذا يمنع تكرار مشكلة أن الضغط على النص يحوله من معاينة إلى تنسيق محفوظ.

## العلاقة مع OCR والترجمة

الترجمة تنتج text candidates.

التركيب النصي يقرر كيف تظهر الترجمة.

يجب عدم خلطهما:

- `translation_candidates`: ماذا يقول النص؟
- `text_compositions`: كيف يظهر النص؟
- `text_units`: أين كان النص الأصلي وما مصدره؟
- `page_clean_patches`: ما الذي مُسح من الصورة؟

## العلاقة مع Henry

في المستقبل، `Henry page` و`Henry great` يجب أن ينتجا:

1. OCR.
2. clean.
3. translation.
4. composition.
5. render/export readiness.

لكن التنفيذ المرحلي يجب أن يبدأ بـ composition فقط بعد وجود الترجمة.

## اختيار preset تلقائيًا

لا نبدأ بنموذج معقد. نبدأ بقواعد deterministic.

## قواعد أولية

## لون الخلفية

إذا خلفية الصندوق داكنة:

- preset: `black_bubble`
- color: فاتح.
- stroke: غالبًا غير ضروري أو stroke داكن خفيف حسب الحالة.

إذا الخلفية فاتحة:

- preset: `normal_dialogue`
- color: داكن.

## حالة النص الأصلي

إذا النص الأصلي uppercase وغالبًا فيه `!`:

- preset: `shout`

إذا النص قصير جدًا ومعه `...`:

- preset: `whisper` أو `aside`.

إذا الصندوق مستطيل خارج فقاعة:

- preset: `narration`.

إذا OCR unit كبير جدًا أو مائل أو خارج الفقاعة:

- preset: `title` أو `sfx`، لكن في البداية نضعه `unknown` ولا نفرض تأثيرات خطرة.

## قواعد يجب عدم فعلها في البداية

- لا نحاول كشف كل المؤثرات من الصورة دفعة واحدة.
- لا نستخدم AI لاختيار الشكل في المرحلة الأولى.
- لا نغير كل النصوص القديمة تلقائيًا.
- لا نحذف `typesetting_items`.

## واجهة التحرير المطلوبة

عند اختيار نص، لوحة النص يجب أن تتطور تدريجيًا.

## المرحلة الأولى للواجهة

إضافة حقول بسيطة:

- Preset.
- Kind.
- Font size.
- Color.
- Stroke toggle.
- Stroke color.
- Stroke width.
- Shadow toggle.
- Reset to auto.
- Mark manual.

## المرحلة الثانية

- Font family.
- Line height.
- Padding X/Y.
- Rotation.
- Vertical align.
- Fit mode.
- Duplicate composition.
- Split composition.
- Merge with next.

## المرحلة الثالثة

- Preset editor على مستوى المشروع.
- حفظ preset من نص موجود.
- تطبيق preset على كل النصوص من نفس kind.

## العرض داخل صفحة الترجمة

لدينا خياران:

## HTML/CSS Renderer

مفيد للسرعة والتحرير.

مزاياه:

- سهل مع drag/resize.
- مناسب للوحة تحرير.
- سريع في الواجهة.

مشاكله:

- export عبر Python/Pillow قد لا يطابقه تمامًا.

## SVG Renderer

مفيد للتطابق بين العرض والتصدير.

مزاياه:

- يمكن حفظه أو تحويله.
- أسهل في stroke/shadow/rotation.

مشاكله:

- النص العربي وتشكيله والـ line wrap قد يكونان أصعب.

## القرار المبدئي

نبدأ بـ HTML/CSS Renderer داخل الواجهة، لكن نكتب عقد composition مستقلًا حتى لا يكون مربوطًا بـ CSS classes.

عند export نرسم من نفس JSON، وليس من DOM.

## التصدير

التصدير الحالي يجب ألا يكسر.

المرحلة الأولى:

- export يستمر باستخدام النصوص الحالية.
- إذا وجدت compositions جديدة، نضيف renderer لها.
- لا نغير سلوك export القديم إلا بعد اختبار صفحة فعلية.

المرحلة الثانية:

- جعل `ChapterExportService` يقرأ `text_compositions`.
- رسم الخلفية + patches + compositions.
- تجاهل `typesetting_items` إذا توجد compositions لنفس `text_unit`.

المرحلة الثالثة:

- اختبار تطابق بصري بين صفحة الترجمة وPNG الناتج.

## خطة التنفيذ المرحلية

## Phase 0: تثبيت الحدود

الهدف:

- لا تنفيذ فعلي.
- توثيق الخطة.
- التأكد من وجود backup branch.

المخرجات:

- `09_TEXT_COMPOSITION_LAYER_PLAN.md`
- فرع backup.

التحقق:

- `git status`
- وجود الفرع على remote.

## Phase 1: عقد الأنواع بدون UI

الهدف:

- تعريف أنواع TypeScript لـ `TextComposition`, `TextStylePreset`, `CompositionStyle`, `CompositionLayout`.
- لا migration بعد.
- لا تغيير سلوك صفحة الترجمة.

الملفات المتوقعة:

- `src/types/domain.ts`
- ربما ملف مساعد مثل `src/text-composition/types.ts` إذا أردنا فصل الطبقة.

التحقق:

- `pnpm build`

نقطة توقف:

- نراجع العقد قبل أي DB migration.

## Phase 2: migration غير مدمرة

الهدف:

- إضافة الجداول الجديدة.
- seed presets عامة.
- لا نقل تلقائي للبيانات القديمة.

الملفات المتوقعة:

- `electron/data/migrations.cjs`
- repository جديد أو توسيع `translation-workspace-repository.cjs`.

التحقق:

- فتح البرنامج.
- التأكد من إنشاء الجداول.
- التأكد أن الفصول القديمة لا تزال تفتح.

نقطة توقف:

- لا نربط الواجهة بعد.

## Phase 3: قراءة compositions مع fallback

الهدف:

- `getChapterForTranslation` يرجع `textCompositions` أو يدمجها مع `textUnits` بشكل واضح.
- إذا لا توجد compositions، السلوك الحالي يستمر.

القرار المفتوح:

- هل نضع compositions داخل `ChapterTranslationWorkspace.textCompositions`؟
- أم نضيفها داخل كل `TextUnit`؟

الاقتراح:

```ts
ChapterTranslationWorkspace {
  textUnits: TextUnit[];
  textCompositions: TextComposition[];
}
```

السبب:

- قد يوجد أكثر من composition لنفس text unit.
- قد يوجد composition لا يرتبط بـ OCR unit لاحقًا.

التحقق:

- الفصل القديم يفتح.
- لا تغيير بصري إن لم توجد compositions.

## Phase 4: إنشاء composition من auto paste

الهدف:

- auto paste لا يكتب فقط `typesetting_items`.
- نضيف خيار داخلي لإنشاء composition.

لكن في البداية:

- يمكن dual-write: يكتب `typesetting_items` و`text_compositions`.
- أو يكتب compositions فقط خلف feature flag.

الاقتراح الأكثر أمانًا:

```text
dual-write مؤقتًا
```

حتى إذا فشل renderer الجديد، يبقى القديم يعمل.

التحقق:

- auto paste يعمل كما هو.
- composition ينشأ في DB.
- لا تتغير الصفحة بصريًا إلا إذا فعلنا renderer الجديد.

## Phase 5: Renderer جديد خلف flag

الهدف:

- عرض compositions بدل textUnits عند تفعيل flag داخلي.
- لا نزيل renderer القديم.

Feature flag مقترح:

```ts
const ENABLE_TEXT_COMPOSITIONS = false;
```

ثم نفعله محليًا بعد اختبار.

التحقق:

- صفحة واحدة.
- فقاعات بيضاء.
- فقاعات سوداء.
- كلمات قصيرة.
- نصوص طويلة.
- سحب/تغيير حجم.
- عدم تغير الحجم عند الضغط فقط.

## Phase 6: لوحة تحرير النص

الهدف:

- تحرير خصائص composition.

لا نبدأ بكل شيء.

الحد الأدنى:

- preset.
- font size.
- color.
- stroke.
- reset.

التحقق:

- حفظ التعديل.
- إعادة فتح الفصل.
- التصدير لا ينكسر.

## Phase 7: Preset editor

الهدف:

- المستخدم يستطيع تعديل presets للمشروع.

أوامر:

- Create preset.
- Save from selected text.
- Apply preset to selected.
- Apply preset to all same kind غير اليدوية.

التحقق:

- preset عام.
- preset خاص بالمشروع.
- manual override لا يتغير عند تطبيق جماعي.

## Phase 8: Export renderer

الهدف:

- `ChapterExportService` يرسم compositions.

يجب اختبار:

- النص العربي.
- stroke.
- shadow.
- rotation.
- line height.
- فقاعة سوداء.
- صفحة كاملة.

نقطة الخطر:

- اختلاف القياس بين CSS وPillow.

حل مؤقت:

- في البداية نعتمد على نفس font file.
- نضع قيودًا محددة على line wrapping.
- لاحقًا نبحث عن renderer أدق إذا لزم.

## Phase 9: AI/Auto style detection

هذه مرحلة لاحقة، لا نبدأ بها.

الهدف:

- AI أو rules تساعد في اختيار kind/preset.

مدخلات ممكنة:

- OCR text.
- original text casing.
- علامات الترقيم.
- box geometry.
- background color.
- clean classification.

مخرجات:

- suggested kind.
- suggested preset.
- confidence.

لا نسمح لها بتعديل اليدوي.

## مخاطر معروفة

## اختلاف القياس بين الواجهة والتصدير

هذا أخطر خطر.

المعالجة:

- عقد composition مستقل.
- اختبارات export بصرية.
- تقليل الاعتماد على CSS غير قابل للرسم في Python.

## تضخم schema مبكرًا

المعالجة:

- JSON منظم في البداية.
- أعمدة أساسية فقط للبحث والعلاقات.

## كسر النصوص القديمة

المعالجة:

- fallback إلى `typesetting_items`.
- dual-write مؤقت.
- feature flag.

## إعادة ظهور مشكلة الضغط يغير الحجم

المعالجة:

- click لا يحفظ.
- drag فقط يحفظ.
- preview لا يتحول إلى explicit إلا بأمر واضح أو drag حقيقي.

## زيادة تعقيد الواجهة

المعالجة:

- نبدأ بـ panel صغير.
- advanced controls داخل قسم مطوي.
- presets قبل التفاصيل اليدوية.

## معايير النجاح

لا نعتبر الطبقة ناجحة لمجرد وجود الجداول.

تنجح عندما:

- يستطيع المستخدم لصق نص تلقائيًا بدون شكل موحد غبي.
- يستطيع اختيار preset وتعديله.
- لا يتغير النص عند الضغط فقط.
- الكلمات القصيرة لا تنكسر.
- النص لا يخرج من الفقاعة بشكل فج.
- الفقاعات السوداء لها لون مناسب.
- التصدير قريب بصريًا من الواجهة.
- التعديلات اليدوية لا تضيع عند تشغيل Henry مرة أخرى.

## أول تنفيذ مقترح عندما يأمر المستخدم

الأساسات يجب أن تكون:

1. إضافة أنواع `TextComposition` و`TextStylePreset`.
2. إضافة migration غير مدمرة للجداول.
3. seed presets عامة.
4. Repository بسيط للقراءة والكتابة.
5. إرجاع `textCompositions` داخل `ChapterTranslationWorkspace` بدون استخدامها بصريًا بعد.
6. `pnpm build`.
7. فحص DB للتأكد من الجداول.

لا نبدأ بالواجهة ولا auto paste في أول أمر تنفيذ إلا إذا طُلب ذلك صراحة.

## ملحق البحث المعمق قبل التنفيذ

هذا الملحق يراجع الخطة على ضوء الكود الحالي ومسار الرسم الفعلي، والهدف منه منع بناء طبقة نصوص تبدو صحيحة في قاعدة البيانات لكنها تعيد نفس هشاشة النظام الحالي.

## ما كشفه فحص الكود الحالي

المسار الحالي للنصوص مختصر جدًا:

```text
text_units
  -> typesetting_items
  -> TextUnit.typesetting
  -> src/App.tsx renderer
  -> electron/ocr/scripts/export-chapter-pages.py
```

الكيان الحالي `TextUnitTypesetting` في `src/types/domain.ts` لا يحمل إلا:

```text
box
color
fontSize
isExplicit
```

وهذا يفسر لماذا أي محاولة لتحسين شكل النص تتحول إلى تعديلات متفرقة في `fontSize` أو `box`.

المواضع الحرجة:

- `src/App.tsx`: يحسب حجم النص داخل `measureAutoTypesetFontSize` ثم يحفظه عبر `updateTextUnitTypesetting`.
- `electron/data/repositories/translation-workspace-repository.cjs`: يحفظ `typesetting_items`.
- `electron/application/chapter-export-service.cjs`: يبني manifest للتصدير من `workspace.textUnits`.
- `electron/ocr/scripts/export-chapter-pages.py`: يرسم النص في التصدير بطريقة مختلفة عن المتصفح.

الاستنتاج:

النظام الحالي لا يملك طبقة تركيب نصوص. هو يملك حالة عرض مبسطة مرتبطة مباشرة بوحدة OCR. لذلك لا ينبغي توسيع `typesetting_items` فقط، لأننا سنكبر نفس المشكلة بدل حلها.

## المشكلة الحقيقية ليست حجم الخط فقط

المشكلة تتكون من أربع طبقات منفصلة:

1. النص: ماذا سنكتب؟
2. التركيب: أين يظهر النص وكيف يلتف داخل المساحة؟
3. الشكل: الخط، الوزن، اللون، الحدود، الظل، الدوران، الشفافية.
4. الرندر: كيف يظهر في الواجهة وكيف يظهر في التصدير.

النظام الحالي يخلط الطبقات الأربع في `TextUnit.typesetting`.

طبقة `TextComposition` يجب أن تفصل هذه الأشياء، وإلا ستعود مشاكل مثل:

- كلمة قصيرة تنكسر إلى سطرين.
- الضغط على النص يغير حجمه.
- export لا يطابق الواجهة.
- Henry يكتب فوق تعديلات المستخدم.
- الفقاعات السوداء تحتاج لونًا مختلفًا لكن النظام لا يعرف لماذا.
- النصوص الحرة والمؤثرات تحتاج معاملة مختلفة عن فقاعة حوار عادية.

## قرار مهم: composition ليس بديلًا مباشرًا لـ text unit

`text_units` تمثل نتيجة OCR ومكان النص الأصلي.

أما `text_compositions` فتمثل عنصرًا بصريًا فوق الصفحة.

العلاقة الصحيحة:

```text
text_unit 0..1/n -> text_composition
page      1..n   -> text_composition
```

أي:

- قد يوجد composition مرتبط بـ OCR unit.
- قد يوجد أكثر من composition لنفس OCR unit لاحقًا إذا قسم المستخدم النص.
- قد يوجد composition لا علاقة له بـ OCR أصلًا، مثل عنوان يدوي أو مؤثر صوتي.
- حذف OCR unit لا يجب أن يمسح بالضرورة كل قرار بصري إذا اختار المستخدم فصل النص عنه لاحقًا.

لذلك وجود `text_unit_id` في `text_compositions` يجب أن يكون اختياريًا.

## تعديل مقترح على schema قبل التنفيذ

الخطة الأولية جيدة كبداية، لكنها تحتاج تدقيقًا قبل كتابة migration.

الصيغة الأدق:

```sql
CREATE TABLE text_style_presets (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  style_json TEXT NOT NULL,
  layout_json TEXT NOT NULL,
  effect_json TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

والأهم:

```sql
CREATE TABLE text_compositions (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  text_unit_id TEXT,
  preset_id TEXT,
  kind TEXT NOT NULL DEFAULT 'dialogue',
  plain_text TEXT NOT NULL,
  content_json TEXT,
  source TEXT NOT NULL DEFAULT 'auto',
  box_json TEXT NOT NULL,
  style_json TEXT NOT NULL,
  layout_json TEXT NOT NULL,
  effect_json TEXT,
  manual_fields_json TEXT NOT NULL DEFAULT '[]',
  origin_json TEXT,
  render_order INTEGER NOT NULL DEFAULT 0,
  is_locked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  FOREIGN KEY (text_unit_id) REFERENCES text_units(id) ON DELETE SET NULL,
  FOREIGN KEY (preset_id) REFERENCES text_style_presets(id) ON DELETE SET NULL
);
```

سبب التعديلات:

- `plain_text`: النص النهائي السريع للعرض والبحث.
- `content_json`: توسع لاحق لدعم أجزاء داخل النص نفسه، مثل كلمة بخط مختلف أو لون مختلف.
- `layout_json`: لا نخلطه مع الشكل؛ الالتفاف والمحاذاة والـ fit ليست style.
- `effect_json`: للظل والحدود والتأثيرات، ويمكن تركه `NULL` في البداية.
- `manual_fields_json`: أهم إضافة. تمنع النظام الآلي من الكتابة فوق حقول عدلها المستخدم.
- `origin_json`: يسجل هل أنشئ من Henry أو auto paste أو user، وبأي نسخة خوارزمية.

## preset يجب أن يكون snapshot لا اعتمادًا حيًا

عند إنشاء composition من preset لا نعتمد على preset حي فقط.

القاعدة:

```text
preset_id = مرجع لمعرفة الأصل
style_json/layout_json/effect_json = snapshot فعلي مستخدم في هذا النص
```

السبب:

إذا عدل المستخدم preset المشروع لاحقًا، لا يجب أن تتغير كل النصوص القديمة فجأة إلا إذا اختار أمرًا صريحًا مثل:

```text
Apply preset to selected
Apply preset to all non-manual of same kind
```

هذا ضروري لأن برنامج تحرير المانهوا يجب أن يحافظ على القرارات اليدوية، لا أن يعاملها كإعدادات عامة قابلة للانجراف.

## manual fields أهم من is_manual وحدها

`is_manual` وحدها غير كافية.

مثال:

- المستخدم عدل لون النص فقط.
- Henry لاحقًا يعيد حساب حجم الخط والصندوق.
- المطلوب أن يحافظ على اللون اليدوي، لكن يسمح بتحديث الحجم إن لم يكن يدويًا.

لذلك يجب أن يكون لدينا:

```json
["color", "box", "fontSize", "preset", "stroke", "shadow"]
```

أي أمر آلي يجب أن يمر عبر قاعدة:

```text
لا تعدل field موجودًا في manual_fields_json إلا إذا كان الأمر force.
```

هذا يحمينا من ضياع التعديل اليدوي عند تشغيل Henry Great مرة أخرى.

## سياسة القياس والالتفاف

الخطأ الذي يجب ألا يتكرر:

```text
نحسب حجم خط ثم نترك CSS أو Pillow يقرر الالتفاف وحده.
```

هذا سبب طبيعي لكسر كلمات قصيرة أو خروج النص عموديًا.

القاعدة الجديدة:

يجب أن تكون لدينا دالة layout واضحة، حتى لو كانت بسيطة في البداية:

```text
layoutTextToBox(text, box, style, layout) -> lines + fontSize + warnings
```

المخرجات المتوقعة:

```json
{
  "lines": ["أيمكن", "لأمثالك", "من الأوغاد"],
  "fontSize": 18,
  "lineHeightPx": 23,
  "fits": true,
  "warnings": []
}
```

في المرحلة الأولى لا نحتاج حفظ `lines` في DB كحقيقة دائمة، لكن نحتاج أن تكون الخوارزمية نفسها مركزية بدل أن تكون موزعة داخل `App.tsx`.

## قواعد منع كسر الكلمات القصيرة

للنص العربي خصوصًا:

- لا نكسر كلمة قصيرة إلى حرفين وسطر إلا كآخر حل.
- نفضل تصغير الخط على كسر كلمة مفردة.
- نفضل توسيع الصندوق تلقائيًا أثناء auto paste إذا كان النص قصيرًا والصندوق ضيقًا.
- `word-break` يجب أن يبقى `normal`.
- `overflow-wrap` يجب أن يكون `normal` في النصوص العادية.
- نستخدم كسر داخل الكلمة فقط لنصوص استثنائية طويلة جدًا، وليس للحوار العادي.

هذه السياسة يجب أن تكون جزءًا من `layout_json`:

```json
{
  "wrapMode": "word",
  "allowWordBreak": false,
  "fitMode": "shrink_to_fit",
  "verticalAlign": "middle",
  "lineHeight": 1.28,
  "paddingX": 5,
  "paddingY": 4
}
```

## خطأ الضغط الذي يغير الحجم

المشكلة التي ظهرت سابقًا عند الضغط على النص تعني غالبًا أن النظام يخلط بين:

- preview محسوب تلقائيًا.
- explicit typesetting محفوظ.

القاعدة الجديدة:

```text
click/select لا يحفظ شيئًا.
drag/resize/input صريح يحفظ.
auto paste يحفظ composition generated.
fit selected يحفظ بأمر واضح.
```

أي renderer جديد يجب أن يلتزم بهذه القاعدة قبل ربطه بالواجهة.

## الرندر داخل الواجهة

الواجهة يجب ألا تظل ترسم النصوص مباشرة من `TextUnit`.

لكن لا نغيرها فورًا.

المسار الآمن:

1. نضيف `textCompositions` إلى workspace بدون استخدامها.
2. نضيف adapter يحول `typesetting_items` إلى legacy composition للقراءة فقط.
3. نضيف renderer جديد خلف flag.
4. نقارن صفحة واحدة.
5. بعدها فقط نبدل الافتراضي.

القرار العملي:

```text
لا نضيف كود composition renderer داخل App.tsx مباشرة.
```

الأفضل إنشاء مجلد:

```text
src/text-composition/
  types.ts
  layout.ts
  presets.ts
  legacy-adapter.ts
  TextCompositionLayer.tsx
```

بهذا لا يتحول `App.tsx` إلى مركز لكل شيء.

## التصدير: أخطر نقطة

التصدير الحالي يستخدم Python/Pillow.

الواجهة تستخدم HTML/CSS/Canvas داخل Electron.

لذلك التطابق الكامل بينهما غير مضمون، خصوصًا مع:

- العربية.
- وزن الخط.
- ارتفاع السطر.
- تشكيل الحروف.
- stroke/shadow.
- التفاف النص.

المراجع التقنية تؤكد أن Canvas يعطي `TextMetrics` للقياس، وأن CSS يملك قواعد منفصلة للفراغات والالتفاف، بينما Pillow يحتاج Raqm للنصوص غير الإنجليزية إذا أردنا تشكيلًا أدق.

قرارنا المرحلي:

- لا نربط التصدير الجديد في أول التنفيذ.
- نحافظ على export القديم.
- نبني عقد `TextComposition` بحيث يمكن رسمه لاحقًا بأكثر من renderer.

الخيارات المستقبلية للتصدير:

1. `Pillow renderer`: الأسرع استمرارًا مع الموجود، لكنه يحتاج تدقيقًا كبيرًا للعربية.
2. `Chromium renderer`: أقرب للواجهة لأن البرنامج Electron أصلًا، وقد يعطي تطابقًا أفضل بين المعاينة والتصدير.
3. `Pango/Cairo renderer`: جيد typographically، لكنه يزيد تعقيد التثبيت على Windows.

الاقتراح طويل المدى:

إذا أصبحت مطابقة التصدير للواجهة مطلبًا أساسيًا، فالمرشح الأفضل هو Chromium-based export renderer، لأن نفس CSS/HTML الذي يراه المستخدم يمكن أن ينتج PNG.

لكن ليس في الأساسات.

## ترتيب التنفيذ الأدق للأساسات

عند طلب تنفيذ الأساسات، الترتيب الأدق هو:

1. إنشاء `src/text-composition/types.ts`.
2. تعريف `TextComposition`, `TextStylePreset`, `CompositionStyle`, `CompositionLayout`, `CompositionEffects`.
3. تحديث `src/types/domain.ts` لإضافة `textCompositions` إلى `ChapterTranslationWorkspace` فقط.
4. إضافة migration جديدة للجداول بدون backfill.
5. إضافة seed للـ presets العامة.
6. إنشاء `electron/data/repositories/text-composition-repository.cjs`.
7. جعل `TranslationWorkspaceRepository.getChapterForTranslation` يرجع `textCompositions: []` أو البيانات الحقيقية.
8. عدم تغيير renderer.
9. عدم تغيير auto paste.
10. عدم تغيير export.
11. تشغيل `pnpm build`.
12. فحص DB للتأكد من إنشاء الجداول.

هذا يعطي أساسًا حقيقيًا وقابلًا للرجوع دون تغيير تجربة المستخدم.

## presets أولية مقترحة

لا نحتاج presets كثيرة في البداية. نبدأ بما يخدم الحالات التي شاهدناها:

```text
normal_dialogue
black_bubble
narration_box
small_aside
shout
whisper
sign_text
sfx_basic
```

كل preset يجب أن يحدد:

- `kind`
- `style_json`
- `layout_json`
- `effect_json`

ولا نضع AI style detection في هذه المرحلة.

## قواعد Henry لاحقًا مع الطبقة الجديدة

Henry لا يجب أن يكتب مباشرة فوق كل شيء.

السياسة:

```text
Henry creates or updates generated compositions only.
Henry does not overwrite manual fields.
Henry may update text content if translation changed.
Henry may suggest preset changes, but does not force them on manual compositions.
```

هذا يحول Henry من أداة تمسح عمل المستخدم إلى مساعد قابل للثقة.

## معايير قبول مرحلة الأساسات

لا نعتبر الأساسات ناجحة إلا إذا تحقق التالي:

- `pnpm build` ينجح.
- البرنامج يفتح الفصول القديمة كما هي.
- `workspace.textUnits` لم يتغير شكله الحالي.
- `workspace.textCompositions` موجود لكنه لا يؤثر بصريًا بعد.
- الجداول الجديدة موجودة في SQLite.
- presets العامة موجودة مرة واحدة ولا تتكرر مع كل تشغيل.
- لا يوجد تغيير في export.
- لا يوجد تغيير في auto paste.
- لا يوجد تغيير في صفحة الترجمة إلا من ناحية بيانات غير مستخدمة.

## مراجع تقنية مختصرة

- MDN `CanvasRenderingContext2D.measureText`: قياس النص في المتصفح يرجع `TextMetrics` ويتأثر بالخط الحالي.
- MDN `TextMetrics`: يدعم قياسات العرض وبعض حدود النص مثل ascent/descent.
- MDN `white-space` و`overflow-wrap`: التفاف النص وكسر الكلمات قواعد مستقلة ويجب ضبطها صراحة.
- Pillow `ImageDraw` و`ImageFont`: رسم النص في Python يختلف عن CSS، وRaqm موصى به للنصوص غير الإنجليزية إذا كان متاحًا.
- Pango Layout: خيار لاحق للرندر النصي المتقدم، لكنه ليس اختيارًا مناسبًا للأساسات بسبب تعقيد التثبيت.

## القرار النهائي قبل الأساسات

ننفذ الأساسات كطبقة بيانات وعقود فقط.

لا نبدأ بتحسين شكل النص داخل الصفحة قبل أن تكون لدينا:

- schema صحيح.
- types واضحة.
- repository منفصل.
- fallback لا يكسر الموجود.
- plan للرندر لا يعتمد على `fontSize` وحده.

أي تنفيذ يتجاوز هذا الترتيب سيكون سريعًا لكنه سيعيدنا إلى نفس مشكلة “نص ملصوق بشكل موحد” بدل بناء منصة تحرير نصوص.
