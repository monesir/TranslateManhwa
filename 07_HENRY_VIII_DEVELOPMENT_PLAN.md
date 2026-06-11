# خطة هنري الثامن

## تعريف الخطة

خطة "هنري الثامن" هي خطة تطوير شاملة لتحويل نظام حذف النصوص وتنظيف الصفحات من أداة بسيطة تعمل بعد OCR إلى طبقة تحرير ذكية، حذرة، قابلة للتوسع، وتصلح للاستخدام طويل المدى داخل برنامج ترجمة وتحرير المانهوات.

هذه الخطة لا تنفذ ميزة واحدة فقط. هدفها بناء أساس واضح لما يلي:

- تنظيف تلقائي آمن بعد OCR.
- منع الحذف التلقائي فوق الخلفيات الحرة أو المؤثرات إلا بقرار صريح.
- دعم أكثر من مزود تنظيف.
- فصل تنظيف الفقاعات البسيطة عن تنظيف الخلفيات المعقدة.
- حفظ قرارات التنظيف ونتائجه كبيانات قابلة للمراجعة والتراجع.
- فتح الطريق لاحقا لمزود AI Inpainting أكثر دقة من OpenCV.

## الوضع الحالي

النظام الحالي يملك:

- OCR متعدد المزودات.
- أداة `Smart Clean` يدوية.
- تنظيف تلقائي اختياري بعد OCR.
- تخزين رقع التنظيف في `page_clean_patches`.
- خوارزمية تنظيف مبنية على OpenCV:
  - `Telea` باسم Fast.
  - `NS` باسم Smooth.
- قناع نص يحاول التقاط النص الداكن والفاتح داخل المنطقة المحددة.
- تركيب الرقع السابقة قبل إنشاء رقعة جديدة حتى لا تتولد بقع بسبب الاعتماد على الصورة الأصلية فقط.

المشكلة الحالية:

- OCR يعطي أحيانا صندوق نص ضيق.
- التنظيف التلقائي قد يترك أطراف حروف أو خطوط رفيعة.
- إذا كان النص فوق خلفية مرسومة أو مؤثرات، فإن الحذف التلقائي قد يضر الخلفية.
- OpenCV مناسب للفقاعات البيضاء والسوداء والخلفيات البسيطة، لكنه ليس كافيا للخلفيات الحرة المعقدة.

## القرار العام

التنظيف التلقائي بعد OCR يجب ألا يكون أداة عدوانية.

القرار:

```text
Auto Clean بعد OCR يعمل افتراضيا فقط على الفقاعات الآمنة:
- فقاعات بيضاء أو فاتحة وبسيطة.
- فقاعات سوداء أو داكنة وبسيطة.

أما الخلفيات الحرة، المؤثرات، الرسم، التدرجات القوية، أو المناطق غير الواضحة:
- لا تنظف تلقائيا افتراضيا.
- تعرض للمستخدم كحالة تحتاج قرارا.
- يمكن تنظيفها يدويا أو عبر مزود AI Inpainting اختياري لاحقا.
```

## أهداف الخطة

## 1. تقليل الضرر

الهدف الأول ليس إزالة أكبر قدر ممكن من النص، بل منع إفساد الصفحة.

معايير الهدف:

- لا يحدث تنظيف تلقائي فوق خلفية حرة إلا إذا اختار المستخدم ذلك صراحة.
- إذا كان التصنيف غير واثق، يتم التخطي بدل المخاطرة.
- كل رقعة تنظيف تلقائية يجب أن تكون قابلة للتراجع.
- يجب حفظ سبب تنفيذ التنظيف أو تخطيه.

## 2. تحسين جودة الفقاعات البيضاء والسوداء

الفقاعات البيضاء والسوداء هي الحالة الأكثر شيوعا والأكثر أمانا.

معايير الهدف:

- النص داخل الفقاعات البيضاء يحذف دون ترك أطراف واضحة.
- النص داخل الفقاعات السوداء يحذف دون ترك هالات فاتحة أو بقع.
- لا يكبر التبييض مع تكبير خط الترجمة.
- لا تتغير حدود صندوق الترجمة بسبب التنظيف.
- يتم توسيع منطقة التنظيف داخليا عند الحاجة دون تغيير مربع النص.

## 3. فصل أنواع التنظيف

لا يجب أن يكون لدينا زر واحد بمعنى غامض.

نحتاج إلى:

- تنظيف آمن للفقاعات.
- تنظيف يدوي عام.
- تنظيف دقيق للخلفيات الحرة لاحقا.
- مزودات قابلة للتبديل.
- سياسة تشغيل تحدد متى يستخدم كل مزود.

## 4. القابلية للتوسع

كل شيء يجب أن يكون قابلا للإضافة لاحقا دون إعادة كتابة الصفحة.

يجب أن نستطيع لاحقا إضافة:

- مزود LaMa.
- مزود Diffusion Inpainting.
- كاش للنماذج.
- معالجة GPU.
- تقييم جودة تلقائي.
- معاينة قبل التطبيق.
- إعدادات لكل مشروع أو فصل.

## المبادئ الحاكمة

## 1. التخطي أفضل من التخريب

إذا لم يكن النظام متأكدا أن المنطقة فقاعة آمنة، يجب أن يتخطى التنظيف التلقائي.

هذا مبدأ أساسي.

## 2. التنظيف اليدوي لا يخضع لنفس قيود التلقائي

إذا اختار المستخدم منطقة بنفسه عبر أداة `Clean Text`، يمكن السماح بتنظيفها حتى لو كانت خلفية معقدة.

السبب:

- المستخدم يرى المنطقة.
- المستخدم يتخذ القرار.
- يمكنه التراجع.

أما التنظيف التلقائي بعد OCR فيجب أن يكون محافظا.

## 3. لا نخلط OCR مع قرار التحرير

OCR مسؤول عن:

- قراءة النص.
- تحديد منطقة النص.
- حفظ النص وموقعه.

أما تنظيف الصورة فهو طبقة تحرير مستقلة.

لذلك لا يجب أن تصبح خدمة OCR نفسها مليئة بمنطق معقد. الأفضل أن تستدعي خدمة تنظيف بسياسات واضحة.

## 4. كل نتيجة يجب أن تحفظ سببها

لا يكفي أن تظهر الرقعة أو لا تظهر.

يجب أن نعرف:

- هل تم التنظيف؟
- لماذا تم؟
- لماذا تم التخطي؟
- ما المزود المستخدم؟
- ما تصنيف الخلفية؟
- ما درجة الثقة؟
- هل فشل المزود؟

## النطاق

## داخل الخطة

- تصنيف مناطق OCR إلى فقاعات آمنة أو خلفيات غير آمنة.
- تنظيف تلقائي محافظ للفقاعات البيضاء والسوداء.
- مزود تنظيف محسّن للفقاعات.
- توسيع بنية `page_clean_patches`.
- حالات UI واضحة للتنظيف التلقائي.
- واجهة إعدادات للسياسة والمزودات.
- تصميم مزود AI Inpainting اختياري للخلفيات الحرة.
- معايير اختبار وتقييم.

## خارج الخطة حاليا

- تدريب نموذج خاص من الصفر.
- تغيير بنية OCR كلها.
- تصدير نهائي للمانهوات.
- بناء محرر طباعي كامل مثل Photoshop.
- كشف كل الفقاعات هندسيا بدقة مثالية من المرحلة الأولى.

## تصنيفات الخلفية المطلوبة

كل منطقة OCR موسعة تمر بمرحلة تصنيف قبل التنظيف التلقائي.

التصنيفات الأساسية:

```text
white_bubble
black_bubble
flat_light_box
flat_dark_box
textured_background
effect_text
unknown
unsafe
```

## white_bubble

منطقة يغلب عليها لون فاتح قريب من الأبيض أو الرمادي الفاتح، مع تفاوت منخفض، وتشبع لوني منخفض.

مناسبة للتنظيف التلقائي.

## black_bubble

منطقة يغلب عليها لون داكن، مع تفاوت منخفض، وتشبع لوني منخفض أو متوسط.

مناسبة للتنظيف التلقائي لكن تحتاج حذرا أكبر لأن الحواف البيضاء للنص قد تترك هالات.

## flat_light_box

صندوق فاتح ليس فقاعة تقليدية، لكنه مسطح وبسيط.

مناسب للتنظيف التلقائي إذا كانت الثقة عالية.

## flat_dark_box

صندوق داكن مسطح وبسيط.

مناسب للتنظيف التلقائي إذا كانت الثقة عالية.

## textured_background

خلفية مرسومة، شعر، ملابس، سماء، نار، ضباب، حركة، تدرجات قوية، أو أي سطح يحتوي تفاصيل كثيرة.

لا ينظف تلقائيا في الوضع الافتراضي.

## effect_text

نص مؤثرات صوتية أو نص مرسوم كجزء من اللوحة، غالبا كبير، مائل، سميك، أو متداخل مع الرسم.

لا ينظف تلقائيا في الوضع الافتراضي.

## unknown

منطقة لا يمكن تصنيفها بثقة.

لا ينظف تلقائيا.

## unsafe

منطقة تشير المقاييس إلى احتمال ضرر واضح.

لا ينظف تلقائيا.

## طريقة تصنيف الفقاعة الآمنة

## مدخلات التصنيف

لكل Text Unit نستخدم:

- صندوق OCR الأصلي.
- صندوق موسع قليلا للتنظيف.
- الصورة الحالية بعد تطبيق رقع التنظيف السابقة.
- قناع النص المتوقع.
- معلومات الصفحة: العرض، الارتفاع، رقم الصفحة.

## المقاييس البصرية

يجب حساب المقاييس التالية من المنطقة:

- متوسط الإضاءة `meanLuma`.
- انحراف الإضاءة `lumaStd`.
- متوسط التشبع `meanSaturation`.
- انحراف التشبع `saturationStd`.
- كثافة الحواف `edgeDensity`.
- مقياس النسيج `textureScore`.
- نسبة بكسلات النص `textMaskRatio`.
- تباين النص مع الخلفية `textContrast`.
- انتظام الخلفية بعد استبعاد النص `backgroundUniformity`.
- نسبة الحواف الكبيرة غير النصية `nonTextEdgeRatio`.

## استبعاد النص قبل تقييم الخلفية

لا يصح تقييم الخلفية وفيها النص نفسه، لأن النص يرفع الحواف والتباين.

الخطوات:

1. بناء قناع نص أولي من المنطقة.
2. توسيع القناع قليلا.
3. عكس القناع للحصول على عينة خلفية.
4. حساب مقاييس الخلفية من العينة لا من المنطقة كلها.

## قواعد التصنيف الأولية

هذه أرقام بداية وليست نهائية:

```text
white_bubble:
  meanLuma >= 205
  lumaStd <= 24
  meanSaturation <= 45
  edgeDensity <= 0.09
  textureScore <= 0.16

black_bubble:
  meanLuma <= 55
  lumaStd <= 28
  edgeDensity <= 0.11
  textureScore <= 0.18

flat_light_box:
  meanLuma >= 175
  lumaStd <= 32
  edgeDensity <= 0.11
  textureScore <= 0.20

flat_dark_box:
  meanLuma <= 85
  lumaStd <= 34
  edgeDensity <= 0.12
  textureScore <= 0.22

textured_background:
  lumaStd > 36
  or edgeDensity > 0.14
  or textureScore > 0.24
```

هذه القيم يجب أن تضبط لاحقا على عينات حقيقية من المانهوات.

## الثقة

كل تصنيف يجب أن ينتج:

```ts
interface CleanRegionClassification {
  kind:
    | "white_bubble"
    | "black_bubble"
    | "flat_light_box"
    | "flat_dark_box"
    | "textured_background"
    | "effect_text"
    | "unknown"
    | "unsafe";
  confidence: number;
  metrics: Record<string, number>;
  reason: string;
}
```

قرار التنظيف التلقائي:

```text
ينفذ إذا:
- kind ضمن white_bubble, black_bubble, flat_light_box, flat_dark_box
- confidence >= 0.72

يتخطى إذا:
- kind ضمن textured_background, effect_text, unknown, unsafe
- أو confidence < 0.72
```

## مزودات التنظيف

## 1. Bubble Fill

مزود جديد مخصص للفقاعات الآمنة.

الفكرة:

- لا يستخدم inpainting عشوائي غالبا.
- يأخذ لون الخلفية من حول النص.
- يملأ بكسلات النص بلون أو تدرج محلي قريب من الخلفية.
- يستخدم feather خفيف لتنعيم الحواف.

مناسب لـ:

- فقاعة بيضاء.
- فقاعة سوداء.
- صندوق أبيض أو أسود بسيط.

أسباب إضافته:

- أسرع من OpenCV inpaint.
- أقل احتمالا لإنتاج بقع على الخلفيات المسطحة.
- أفضل من inpaint عندما تكون الخلفية موحدة.

مخرجاته:

- رقعة PNG شفافة.
- قناع النص.
- لون الخلفية المقدر.
- إحصاءات الجودة.

## 2. OpenCV Telea

المزود الحالي السريع.

يستخدم لـ:

- الحالات العامة البسيطة.
- التنظيف اليدوي.
- حالات لا يكفي فيها الملء بلون ثابت.

يبقى باسم:

```text
Fast
```

## 3. OpenCV NS

المزود الحالي الأكثر نعومة.

يستخدم لـ:

- المناطق التي تحتاج انتقالا أنعم.
- بعض الخلفيات ذات التدرج الخفيف.

يبقى باسم:

```text
Smooth
```

## 4. AI Inpaint - LaMa

مزود اختياري لاحق للخلفيات الحرة.

هدفه:

- تنظيف النص فوق خلفية مرسومة.
- التعامل مع تفاصيل مثل الشعر، الملابس، الدخان، الضوء، أو التدرجات.
- تقليل التشويه مقارنة بـ OpenCV.

خصائصه:

- يعمل محليا إن أمكن.
- يحتاج Python ونموذجا إضافيا.
- قد يكون بطيئا على CPU.
- يجب ألا يكون مفروضا على المستخدم.
- يجب أن يعمل كـ provider منفصل.

استخدامه:

- يدوي من أداة Clean Text.
- أو تلقائي فقط إذا اختار المستخدم وضعا متقدما.
- يفضل أن يعرض Preview قبل التطبيق في الخلفيات الحرة.

## 5. Diffusion Inpainting

ليس أولوية.

يمكن دراسته لاحقا لكن لا نعتمده مبكرا.

السبب:

- قد يهلوس تفاصيل.
- قد يغير الرسم.
- أثقل من LaMa.
- يحتاج إعدادا أكبر.

## سياسة التنظيف التلقائي

## الوضع الافتراضي

```text
Auto clean after OCR:
  enabled/disabled by user

Auto clean policy:
  Safe bubbles only

Provider:
  Bubble Fill for safe flat bubbles
  fallback to OpenCV Fast if Bubble Fill fails
```

## أوضاع السياسة

## Off

لا يتم أي تنظيف بعد OCR.

## Safe bubbles only

الوضع الافتراضي.

ينظف فقط:

- white_bubble
- black_bubble
- flat_light_box
- flat_dark_box

يتخطى:

- textured_background
- effect_text
- unknown
- unsafe

## Ask on unsafe

وضع لاحق.

إذا كانت المنطقة غير آمنة، يظهر للمستخدم قرار:

- Skip.
- Clean manually.
- Try AI Inpaint.

## Force all regions

وضع متقدم وخطر.

لا يكون افتراضيا.

الغرض منه:

- مستخدم يعرف ما يفعل.
- تجربة سريعة.
- صفحات ذات نمط معروف.

## سير العمل بعد OCR

## OCR صفحة واحدة

1. المستخدم يشغل Page OCR.
2. OCR ينتج Text Units.
3. لكل Text Unit:
   - توسعة منطقة التنظيف قليلا.
   - بناء قناع نص.
   - تصنيف الخلفية.
   - تطبيق السياسة.
4. إذا كانت آمنة:
   - إنشاء Clean Patch.
   - حفظ metadata.
5. إذا كانت غير آمنة:
   - لا يتم التنظيف.
   - تحفظ حالة `skipped`.
6. الواجهة تعرض النصوص وحالة التنظيف.

## OCR منطقة محددة

نفس Page OCR، لكن:

- لا يتم استبدال كل نصوص الصفحة.
- يتم التعامل مع المنطقة المحددة فقط.
- إذا كان المستخدم حدد المنطقة يدويا، يمكن عرض خيار "Force clean this selection" لاحقا.

## OCR فصل كامل

نفس المنطق، مع قيود:

- لا يجب أن يفتح dialogs لكل منطقة.
- الحالات غير الآمنة تحفظ كـ skipped.
- يجب عرض ملخص بعد التنفيذ:
  - عدد النصوص المقروءة.
  - عدد الرقع المنشأة.
  - عدد المناطق المتخطاة.
  - عدد الأخطاء.

## تغييرات البيانات

## توسيع page_clean_patches

الجدول الحالي يحفظ الرقعة الأساسية. نحتاج إضافة حقول اختيارية:

```sql
ALTER TABLE page_clean_patches ADD COLUMN provider TEXT;
ALTER TABLE page_clean_patches ADD COLUMN mode TEXT;
ALTER TABLE page_clean_patches ADD COLUMN source TEXT;
ALTER TABLE page_clean_patches ADD COLUMN source_text_unit_id TEXT;
ALTER TABLE page_clean_patches ADD COLUMN source_ocr_run_id TEXT;
ALTER TABLE page_clean_patches ADD COLUMN classification TEXT;
ALTER TABLE page_clean_patches ADD COLUMN confidence REAL;
ALTER TABLE page_clean_patches ADD COLUMN status TEXT;
ALTER TABLE page_clean_patches ADD COLUMN metadata_json TEXT;
```

القيم المقترحة:

```text
provider:
  bubble_fill
  opencv_telea
  opencv_ns
  lama
  diffusion

mode:
  auto_after_ocr
  manual_selection
  retry

source:
  ocr_page
  ocr_region
  ocr_chapter
  manual_clean

status:
  applied
  failed
  skipped
  pending
```

## جدول clean_attempts

نحتاج جدول يسجل حتى المحاولات التي لم تنتج رقعة.

السبب:

- إذا تم تخطي خلفية حرة، يجب أن نعرف ذلك.
- إذا فشل LaMa، يجب أن يظهر السبب.
- إذا أردنا لاحقا تحسين التصنيف، نحتاج بيانات حقيقية.

المقترح:

```sql
CREATE TABLE clean_attempts (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  text_unit_id TEXT,
  ocr_run_id TEXT,
  mode TEXT NOT NULL,
  provider TEXT,
  policy TEXT NOT NULL,
  region_json TEXT NOT NULL,
  classification TEXT,
  confidence REAL,
  status TEXT NOT NULL,
  patch_id TEXT,
  error_message TEXT,
  metrics_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  FOREIGN KEY (text_unit_id) REFERENCES text_units(id) ON DELETE SET NULL,
  FOREIGN KEY (ocr_run_id) REFERENCES ocr_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (patch_id) REFERENCES page_clean_patches(id) ON DELETE SET NULL
);
```

## إعدادات المشروع

نضيف إعدادات قابلة للحفظ:

```ts
interface CleanProjectSettings {
  autoCleanAfterOcr: boolean;
  autoCleanPolicy: "off" | "safe_bubbles_only" | "ask_on_unsafe" | "force_all_regions";
  safeBubbleProvider: "bubble_fill" | "opencv_telea" | "opencv_ns";
  texturedProvider: "none" | "lama";
  minClassificationConfidence: number;
  autoCleanRegionPadding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  keepCleanAttempts: boolean;
}
```

تخزينها يكون في إعدادات المشروع أو إعدادات البرنامج العامة، مع السماح لاحقا بإعدادات لكل مشروع.

## تغييرات طبقة الخدمات

## CleanService

يجب أن تتحول خدمة التنظيف إلى واجهة أعلى من مجرد `cleanText`.

المطلوب:

```ts
interface CleanService {
  cleanText(input: CleanTextInput): Promise<CleanPatchResult>;
  classifyRegion(input: CleanClassificationInput): Promise<CleanRegionClassification>;
  cleanAfterOcr(input: CleanAfterOcrInput): Promise<CleanAfterOcrSummary>;
}
```

## CleanProviderRegistry

نضيف Registry للمزودات:

```ts
interface CleanProvider {
  id: string;
  label: string;
  kind: "deterministic" | "opencv" | "ai";
  supportsPreview: boolean;
  supportsBatch: boolean;
  isAvailable(): Promise<ProviderAvailability>;
  clean(input: ProviderCleanInput): Promise<ProviderCleanResult>;
}
```

المزودات الأولى:

```text
bubble_fill
opencv_telea
opencv_ns
lama
```

## CleanPolicyEngine

طبقة مسؤولة عن القرار:

```ts
interface CleanPolicyDecision {
  action: "apply" | "skip" | "ask" | "queue";
  providerId?: string;
  reason: string;
  classification: CleanRegionClassification;
}
```

لا يجب أن تكون هذه القرارات داخل React ولا داخل سكربت Python.

## CleanClassifier

مسؤول عن:

- قراءة crop.
- بناء text mask.
- حساب metrics.
- إنتاج classification.

يمكن أن يكون Python في البداية لأن لدينا OpenCV هناك.

## تغييرات الواجهة

## شريط OCR العلوي

الحالة الحالية فيها `Auto clean`.

المطلوب لاحقا:

- إبقاء الزر بسيطا.
- عند الضغط على إعداد صغير أو popover:
  - Auto clean after OCR.
  - Policy:
    - Safe bubbles only.
    - Ask on unsafe.
    - Force all regions.
  - Safe bubble provider:
    - Bubble Fill.
    - Fast.
    - Smooth.
  - Textured provider:
    - None.
    - AI Inpaint.

لا نعرض كل التفاصيل للمستخدم العادي في الواجهة الرئيسية.

## قائمة Text Units اليسار

كل نتيجة OCR يمكن أن تعرض حالة تنظيف صغيرة:

```text
Cleaned
Skipped: textured
Skipped: low confidence
Failed
Pending AI clean
Manual only
```

هذه الحالة تساعد المترجم يفهم لماذا لم تختف بعض النصوص.

## لوحة Smart Clean اليمنى

تتطور إلى:

- زر Clean Text.
- Provider:
  - Bubble Fill.
  - Fast.
  - Smooth.
  - AI Inpaint.
- Strength.
- Preview قبل التطبيق للمزودات الثقيلة.
- Undo edit.

## عرض المناطق المتخطاة

يجب إضافة خيار بصري لاحقا:

```text
Show skipped auto-clean regions
```

الغرض:

- يرى المستخدم أين تخطى البرنامج التنظيف.
- يستطيع الضغط على المنطقة وتجربة تنظيف يدوي أو AI.

## قسم مستقل: إجراءات تشغيلية ناقصة في صفحة الترجمة

هذا القسم يضيف ثلاث وظائف مطلوبة حول صفحة الترجمة. هذه الوظائف ليست جزءا مباشرا من خوارزمية تنظيف النص، لكنها ضرورية كي تصبح صفحة الترجمة منصة عمل فعلية لا مجرد عارض OCR.

الوظائف:

- تفعيل زر ترجمة Microsoft.
- إضافة زر يحذف كل نتائج OCR.
- إضافة زر يدمج كل صفحتين متجاورتين في صفحة واحدة داخل الفصل لمعالجة الفقاعات أو الجمل المنقسمة بين صفحتين.

## 1. تفعيل ترجمة Microsoft

## المشكلة

زر Microsoft موجود حاليا في الواجهة لكنه لا ينفذ ترجمة فعلية.

هذا يسبب مشكلة تصميمية:

- الواجهة تعرض أمرا غير موصول.
- المترجم لا يستطيع مقارنة نتيجة الذكاء الاصطناعي بنتيجة ترجمة آلية مستقلة.
- لا توجد طبقة واضحة لمزودات الترجمة الآلية غير AI.

## الهدف

تفعيل Microsoft Translation كمسار ترجمة مستقل عن ترجمة الذكاء الاصطناعي.

يجب أن يستطيع المستخدم:

- ترجمة Text Unit واحد.
- ترجمة الصفحة الحالية.
- ترجمة الفصل كاملا.
- رؤية نتيجة Microsoft في حقل منفصل عن AI وعن الترجمة النهائية.
- اعتماد نتيجة Microsoft يدويا كترجمة نهائية إن أراد.

## السلوك المطلوب

عند ضغط زر Microsoft في صفحة الترجمة:

```text
إذا كان هناك Text Unit محدد:
  ترجم النص المحدد فقط.

إذا لم يوجد Text Unit محدد:
  اعرض قائمة صغيرة:
    - Translate current page
    - Translate chapter
```

لا يجب أن يكتب Microsoft فوق الترجمة النهائية مباشرة.

المسار الصحيح:

```text
sourceText -> Microsoft Translator -> microsoftTranslation candidate -> UI
```

ثم المستخدم يقرر:

- اعتمادها.
- تعديلها.
- تجاهلها.

## بنية المزود

نضيف طبقة مزودات ترجمة:

```ts
interface TranslationProvider {
  id: string;
  label: string;
  kind: "machine" | "ai";
  isAvailable(): Promise<ProviderAvailability>;
  translate(input: TranslationProviderInput): Promise<TranslationProviderResult>;
}
```

مزود Microsoft:

```text
id: microsoft
label: Microsoft Translator
kind: machine
```

## الإعدادات المطلوبة

Microsoft Translator يحتاج إعدادات Runtime:

```ts
interface MicrosoftTranslatorSettings {
  endpoint: string;
  apiKey: string;
  region?: string;
  sourceLanguage: string;
  targetLanguage: string;
}
```

هذه القيم لا تحفظ داخل ملفات الخطة ولا داخل الكود.

يجب أن تحفظ في إعدادات البرنامج أو بيئة التشغيل، مع تمييز المفاتيح الحساسة.

## التعامل مع القاموس

Microsoft لا يفهم قاموس العمل بنفس طريقة AI.

لذلك السياسة المقترحة:

- لا نحقن سياق العمل داخل Microsoft في المرحلة الأولى.
- بعد الترجمة، نطبق طبقة مراجعة مصطلحات اختيارية:
  - مقارنة أسماء الشخصيات.
  - مقارنة المصطلحات العامة.
  - تعليم التعارضات للمترجم.

هذا يمنع تشويه النص بسبب post-processing عدواني.

## التخزين

نتائج Microsoft تحفظ في جدول الترشيحات الحالي إن كان مناسبا:

```text
translation_candidates.provider = "microsoft"
translation_candidates.translated_text = result
translation_candidates.metadata_json = confidence / source / target / model info
```

إذا كان الجدول الحالي لا يكفي، نوسعه بدل إنشاء مسار خاص منفصل.

## حالات الواجهة

يجب أن تعرض الواجهة:

```text
Microsoft: Not translated
Microsoft: Translating...
Microsoft: Done
Microsoft: Failed
```

وعند الفشل:

- لا تضيع نتيجة AI.
- لا تضيع الترجمة النهائية.
- يظهر سبب الفشل باختصار.

## معايير القبول

- زر Microsoft لا يبقى زينة.
- يمكن ترجمة Text Unit واحد.
- يمكن ترجمة الفصل كاملا.
- النتائج تحفظ وتظهر بعد إعادة فتح الفصل.
- الترجمة النهائية لا تتغير إلا بأمر المستخدم.
- فشل Microsoft لا يكسر صفحة الترجمة.

## 2. زر حذف كل نتائج OCR

## المشكلة

أحيانا OCR يعطي نتائج سيئة، أو يختار المستخدم مزودا خاطئا، أو يريد إعادة تشغيل الفصل من الصفر.

حذف النتائج واحدة واحدة غير عملي.

## الهدف

إضافة أمر واضح لحذف كل نتائج OCR، مع الحفاظ على بقية بيانات المشروع.

## النطاق الدقيق للحذف

زر حذف OCR يجب أن يحذف:

- Text Units الناتجة من OCR.
- OCR candidates المرتبطة بها.
- OCR run records إذا كانت لم تعد مفيدة أو يتم تعليمها كملغاة.
- ترجمات Microsoft أو AI المرتبطة بهذه Text Units، لأنها بلا Text Unit بعدها.

ولا يجب أن يحذف:

- صفحات الفصل.
- الصور الأصلية.
- رقع الرسم اليدوي.
- رقع التنظيف اليدوية إلا إذا اختار المستخدم ذلك صراحة.
- القاموس.
- إعدادات المشروع.

## سؤال مهم: ماذا عن Clean Patches الناتجة تلقائيا بعد OCR؟

يجب فصل نوعين:

```text
clean_patch.mode = auto_after_ocr
clean_patch.mode = manual_selection
```

عند حذف كل OCR:

- نحذف رقع التنظيف التلقائية المرتبطة بـ OCR إذا اختار المستخدم حذف آثار OCR كاملة.
- نحافظ على رقع التنظيف اليدوية.

السلوك الافتراضي المقترح:

```text
Delete OCR results:
  - Delete text units
  - Delete OCR candidates
  - Delete auto clean patches created by OCR
  - Keep manual edits
```

## نطاق الزر

نحتاج مستويين:

```text
Delete OCR on current page
Delete OCR in chapter
```

لكن لا نكثر الأزرار في الواجهة.

الاقتراح:

- زر في لوحة OCR أو قائمة أدوات:
  - Delete OCR...
- عند الضغط تظهر خيارات:
  - Current page
  - Whole chapter

## تأكيد الحذف

هذه عملية مدمرة.

يجب عرض تأكيد مختصر:

```text
Delete OCR results for this chapter?
This removes OCR text units, OCR candidates, Microsoft/AI candidates tied to them, and auto-clean patches. Manual edits are kept.
```

## طبقة البيانات

نضيف use case:

```ts
deleteOcrResults(input: {
  chapterId: string;
  pageId?: string;
  includeAutoCleanPatches: boolean;
  keepManualEdits: boolean;
}): DeleteOcrResultsResult
```

المخرجات:

```ts
interface DeleteOcrResultsResult {
  chapterId: string;
  pageId?: string;
  textUnitsDeleted: number;
  candidatesDeleted: number;
  autoCleanPatchesDeleted: number;
  manualEditsKept: number;
}
```

## معايير القبول

- يمكن حذف OCR للصفحة الحالية.
- يمكن حذف OCR للفصل كاملا.
- لا تحذف الصفحات أو الصور.
- لا تحذف القاموس.
- لا تحذف الرسم اليدوي.
- تحذف الرقع التلقائية المرتبطة بـ OCR عند اختيار ذلك.
- الواجهة تحدث نفسها مباشرة بعد الحذف.

## 3. دمج كل صفحتين متجاورتين في صفحة واحدة داخل الفصل

## المشكلة

بعض الفصول تكون مقسمة بحيث الفقاعة أو الجملة تمتد بين صفحتين متجاورتين.

هذا يسبب مشاكل:

- OCR يرى النص مقطوعا.
- التبييض والتنظيف يصيران أصعب.
- المترجم لا يرى السياق البصري الكامل للفقاعة.
- صفحة الترجمة تعرض كل صفحة منفصلة رغم أن التحرير يحتاجهما كوحدة واحدة.

## الهدف

إضافة أمر يدمج كل صفحتين متجاورتين داخل الفصل في صفحة واحدة مركبة، مع الحفاظ على القدرة على معرفة أصل كل جزء.

## تعريف الدمج

الدمج المقترح ليس حذف الصفحات الأصلية.

بل إنشاء نسخة عرض/تحرير مركبة:

```text
Page 1 + Page 2 -> Merged Page 1
Page 3 + Page 4 -> Merged Page 2
Page 5 + Page 6 -> Merged Page 3
```

إذا كان عدد الصفحات فرديا:

```text
آخر صفحة تبقى وحدها أو تدمج كصفحة مركبة تحتوي صفحة واحدة.
```

## اتجاه الدمج

في webtoon غالبا الدمج يكون عموديا:

```text
top page + bottom page
```

لذلك الافتراضي:

```text
Vertical merge
```

لكن يجب تصميم البنية لتدعم لاحقا:

```text
Horizontal merge
```

## حفظ الأصل

يجب حفظ خريطة مصدر لكل صفحة مركبة:

```ts
interface MergedPageSourceMap {
  mergedPageId: string;
  sources: Array<{
    originalPageId: string;
    originalPageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}
```

السبب:

- إذا ضغط المستخدم على موضع معين، نعرف الصفحة الأصلية.
- إذا أردنا الرجوع للصفحة الأصلية، نستطيع.
- إذا أردنا تصدير أو مراجعة، لا نفقد العلاقة.

## نوع الدمج

نحتاج ألا نخلط الصفحات الأصلية بالصفحات المركبة.

خيارات التصميم:

## خيار A: إنشاء Asset جديد وصفحة جديدة

ننشيء صورة جديدة فعليا داخل cache:

```text
merged_page_0001.png
```

ثم ننشئ rows في `pages` بنوع جديد:

```text
page_kind = merged
```

ونحفظ المصدر في جدول `page_merge_sources`.

المزايا:

- OCR يعمل عليها بسهولة كأنها صفحة واحدة.
- التبييض والتنظيف يعمل عليها مباشرة.
- لا تحتاج الواجهة لتركيب الصور في كل مرة.

العيوب:

- يزيد حجم الملفات.
- يحتاج إدارة إعادة بناء إذا تغيرت الصفحات الأصلية.

## خيار B: دمج افتراضي في الواجهة فقط

الواجهة تعرض صفحتين كأنهما صفحة واحدة دون إنشاء صورة جديدة.

المزايا:

- لا يزيد التخزين.
- أسرع في التجربة.

العيوب:

- OCR والتنظيف أصعب.
- كل أداة يجب أن تفهم الإحداثيات المركبة.
- قد يزيد التعقيد في الواجهة.

## القرار المقترح

نستخدم خيار A:

```text
إنشاء صفحات مركبة فعلية كأصول جديدة محفوظة.
```

السبب:

- هدفنا ليس عرضا مؤقتا فقط.
- نحتاج OCR وتنظيف وتحرير على الصفحة المركبة.
- حفظ Source Map يحمي الرجوع للأصل.

## قاعدة البيانات

نضيف:

```sql
ALTER TABLE pages ADD COLUMN page_kind TEXT NOT NULL DEFAULT 'original';
ALTER TABLE pages ADD COLUMN merged_group_id TEXT;
```

وجدول:

```sql
CREATE TABLE page_merge_sources (
  id TEXT PRIMARY KEY,
  merged_page_id TEXT NOT NULL,
  source_page_id TEXT NOT NULL,
  source_page_index INTEGER NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (merged_page_id) REFERENCES pages(id) ON DELETE CASCADE,
  FOREIGN KEY (source_page_id) REFERENCES pages(id) ON DELETE CASCADE
);
```

## زر الواجهة

في صفحة الترجمة أو صفحة الفصل:

```text
Merge pages
```

عند الضغط:

```text
Merge every 2 pages in this chapter?
Direction: Vertical
Keep original pages: Yes
Use merged pages for OCR/editing: Yes
```

## العلاقة مع OCR

بعد الدمج:

- OCR يعمل على الصفحات المركبة.
- Text Units ترتبط بالصفحة المركبة.
- عند الحاجة يمكن تحويل إحداثيات Text Unit إلى الصفحة الأصلية عبر `page_merge_sources`.

## العلاقة مع القارئ

القارئ في Explorer أو Library يجب أن يظل قادرا على عرض الصفحات الأصلية.

الصفحات المركبة تخص طبقة الترجمة والتحرير.

لا يجب أن تغير القراءة الأصلية إلا إذا اختار المستخدم ذلك.

## Undo وإعادة البناء

يجب توفير:

```text
Remove merged pages
Rebuild merged pages
```

Remove:

- يحذف الصفحات المركبة.
- يحذف assets المركبة.
- يحافظ على الصفحات الأصلية.

Rebuild:

- يعيد إنشاء الصفحات المركبة من الأصل.
- يحتاج تحذير إذا كانت هناك OCR/Text Units مرتبطة بالنسخة القديمة.

## معايير القبول

- يمكن دمج كل صفحتين في الفصل.
- الصفحات الأصلية لا تحذف.
- OCR يعمل على الصفحات المركبة.
- الفقاعة المنقسمة بين صفحتين تظهر داخل صفحة واحدة مركبة.
- يمكن معرفة مصدر كل جزء من الصفحة المركبة.
- يمكن إزالة الصفحات المركبة والرجوع للأصل.
- لا يفسد ترتيب الفصل.

## خطة تنفيذ مرحلية

## المرحلة 0: تثبيت السلوك الحالي

الهدف:

توثيق ما لدينا الآن قبل البناء عليه.

المهام:

- مراجعة `page-clean-service.cjs`.
- مراجعة `smart-clean-text.py`.
- مراجعة `ocr-service.cjs`.
- تحديد شكل `page_clean_patches` الحالي.
- توثيق مسار Auto Clean الحالي.
- التأكد أن الرقع السابقة تطبق قبل الرقعة الجديدة.

معيار القبول:

- يوجد وصف دقيق للسلوك الحالي.
- لا يتم تغيير السلوك في هذه المرحلة.

## المرحلة 1: عقود تنظيف واضحة

الهدف:

فصل مفهوم "تنظيف منطقة" عن "مزود تنظيف" وعن "قرار سياسة".

المهام:

- إضافة أنواع Domain:
  - `CleanProviderId`.
  - `CleanPolicy`.
  - `CleanRegionClassification`.
  - `CleanAttempt`.
  - `CleanPatchMetadata`.
- تحديث IPC contracts.
- جعل `PageCleanTextInput` يدعم:
  - provider.
  - mode.
  - policy.
  - metadata.

معيار القبول:

- الواجهة لا تحتاج معرفة تفاصيل سكربت Python.
- يمكن إضافة مزود جديد دون تعديل صفحة الترجمة جذريا.

## المرحلة 2: جدول clean_attempts

الهدف:

تسجيل ما يحدث حتى عند التخطي.

المهام:

- إضافة migration.
- إضافة repository.
- ربط المحاولات بالصفحة والفصل وText Unit.
- حفظ:
  - classification.
  - confidence.
  - metrics.
  - status.
  - reason.

معيار القبول:

- عند تخطي التنظيف التلقائي، يظهر سجل في قاعدة البيانات.
- عند نجاح التنظيف، يظهر attempt مربوط بالpatch.
- عند الفشل، يظهر error message.

## المرحلة 3: Clean Classifier

الهدف:

تصنيف المنطقة قبل التنظيف.

المهام:

- إضافة سكربت Python أو توسيع `smart-clean-text.py` بوضع classification.
- حساب metrics:
  - meanLuma.
  - lumaStd.
  - meanSaturation.
  - edgeDensity.
  - textureScore.
  - textMaskRatio.
  - textContrast.
- إنتاج JSON classification.
- عدم إنشاء patch في وضع classification فقط.

معيار القبول:

- يمكن استدعاء classifier على region والحصول على classification.
- لا يعتمد التصنيف على UI.
- يعمل على الصورة الحالية بعد تطبيق الرقع السابقة.

## المرحلة 4: Bubble Fill Provider

الهدف:

مزود سريع ودقيق للفقاعات البسيطة.

المهام:

- بناء قناع النص.
- تقدير لون الخلفية من خارج النص.
- ملء النص بلون الخلفية أو بتدرج محلي بسيط.
- feather خفيف للحواف.
- حفظ patch شفاف.
- إرجاع metadata:
  - backgroundColor.
  - fillMode.
  - maskPixels.
  - classification.

معيار القبول:

- يعمل على الفقاعة البيضاء دون بقع واضحة.
- يعمل على الفقاعة السوداء دون هالات واضحة.
- أسرع من OpenCV inpaint في الحالات المسطحة.

## المرحلة 5: Policy Engine

الهدف:

جعل Auto Clean محافظا.

المهام:

- إضافة `safe_bubbles_only`.
- ربط Auto Clean بالتصنيف.
- إذا التصنيف آمن:
  - ينفذ Bubble Fill.
- إذا غير آمن:
  - يسجل clean_attempt status = skipped.
- لا يرمي خطأ يمنع OCR من النجاح.

معيار القبول:

- OCR ينجح حتى لو تخطى التنظيف.
- المناطق الحرة لا تنظف تلقائيا.
- يمكن معرفة سبب التخطي من البيانات.

## المرحلة 6: UI لحالات التنظيف

الهدف:

عدم ترك المستخدم يتساءل لماذا اختفى نص وبقي آخر.

المهام:

- إظهار حالة التنظيف لكل Text Unit.
- إضافة ملخص بعد Chapter OCR.
- إضافة إعداد Auto Clean Policy.
- إضافة خيار إظهار المناطق المتخطاة.

معيار القبول:

- المستخدم يرى أن المنطقة تخطيت لأنها textured أو low confidence.
- يستطيع اختيار تنظيف يدوي لاحقا.

## المرحلة 7: AI Inpaint Provider

الهدف:

دعم تنظيف أدق للخلفيات الحرة.

المهام:

- اختيار مزود LaMa محلي.
- إضافة availability check.
- إضافة تثبيت اختياري أو إعداد مسار Python/model.
- تشغيل المزود عبر job غير حاجب للواجهة.
- حفظ النتيجة كـ clean_patch.
- دعم preview قبل التطبيق إن أمكن.

معيار القبول:

- إذا لم يكن LaMa مثبتا، لا تنكسر الواجهة.
- يظهر المزود كغير جاهز مع سبب واضح.
- عند توفره يمكن تنظيف منطقة خلفية حرة بجودة أفضل من OpenCV.

## المرحلة 8: التقييم والضبط

الهدف:

منع التطوير العشوائي بالأرقام.

المهام:

- إنشاء مجموعة عينات داخلية:
  - 20 فقاعات بيضاء.
  - 20 فقاعات سوداء.
  - 20 خلفيات حرة.
  - 10 مؤثرات صوتية.
  - 10 حالات صعبة.
- تشغيل classifier على العينات.
- تسجيل النتائج.
- تعديل thresholds.
- مقارنة:
  - Bubble Fill.
  - Fast.
  - Smooth.
  - AI Inpaint.

معيار القبول:

- يوجد تقرير جودة.
- نعرف الحالات التي يفشل فيها كل مزود.
- لا يتم تغيير thresholds بلا عينات.

## المرحلة 9: إعدادات المشروع

الهدف:

جعل السلوك قابلا للتخصيص دون تغيير الكود.

المهام:

- إعدادات عامة للتنظيف.
- إعدادات لكل مشروع لاحقا.
- حفظ آخر سياسة اختارها المستخدم.
- عدم فرض AI Inpaint على مشاريع لا تحتاجه.

معيار القبول:

- يمكن للمستخدم جعل مشروع معين أكثر تحفظا أو أكثر عدوانية.
- الإعدادات محفوظة بعد إغلاق البرنامج.

## المرحلة 10: التوثيق

الهدف:

منع فقدان القرارات.

المهام:

- تحديث `03_OCR_LAYER_PLAN.md`.
- تحديث خطة البيانات عند إضافة الجداول.
- توثيق مزودات التنظيف.
- توثيق القيود:
  - OpenCV للفقاعات.
  - AI للخلفيات الحرة.
  - التخطي الافتراضي للخلفيات غير الآمنة.

معيار القبول:

- أي مطور لاحق يفهم لماذا لا ننظف كل شيء تلقائيا.

## المرحلة 11: تفعيل Microsoft Translation

الهدف:

تحويل زر Microsoft من عنصر واجهة غير فعال إلى مسار ترجمة آلية محفوظ وقابل للمراجعة.

المهام:

- إضافة مزود `microsoft` داخل طبقة Translation Providers.
- إضافة إعدادات Runtime للمفتاح والمنطقة واللغات.
- إضافة IPC/use case لترجمة:
  - Text Unit محدد.
  - الصفحة الحالية.
  - الفصل كاملا.
- حفظ النتائج في `translation_candidates` بمزود `microsoft`.
- عرض حالة الترجمة في بطاقة النص.
- عدم تعديل `finalTranslation` إلا بأمر المستخدم.

معيار القبول:

- زر Microsoft ينفذ ترجمة فعلية.
- النتائج تبقى بعد إعادة فتح الفصل.
- فشل Microsoft لا يكسر AI ولا الترجمة النهائية.
- يمكن اعتماد نتيجة Microsoft يدويا.

## المرحلة 12: حذف نتائج OCR جماعيا

الهدف:

إعطاء المستخدم وسيلة آمنة لإعادة تشغيل OCR من الصفر دون حذف صفحات الفصل أو تعديلاته اليدوية.

المهام:

- إضافة use case: `deleteOcrResults`.
- دعم نطاقين:
  - الصفحة الحالية.
  - الفصل كاملا.
- حذف Text Units وOCR candidates والترشيحات المرتبطة بها.
- حذف Clean Patches التلقائية المرتبطة بـ OCR فقط.
- إبقاء الرسم اليدوي والرقع اليدوية والقاموس.
- تحديث الواجهة بعد الحذف.

معيار القبول:

- يمكن حذف OCR للصفحة أو الفصل.
- لا تحذف الصور الأصلية.
- لا تحذف القاموس.
- لا تحذف التعديلات اليدوية.
- يتم عرض ملخص بعد الحذف.

## المرحلة 13: دمج صفحات الفصل زوجيا

الهدف:

تمكين OCR والتحرير على فقاعات أو جمل مقسمة بين صفحتين عبر إنشاء صفحات مركبة فعلية.

المهام:

- إضافة `page_kind` و`merged_group_id` للصفحات.
- إضافة جدول `page_merge_sources`.
- إضافة خدمة إنشاء صفحات مركبة من كل صفحتين.
- إنشاء Asset جديد لكل صفحة مركبة.
- حفظ خريطة مصادر الصفحة المركبة.
- جعل صفحة الترجمة تستطيع استخدام الصفحات المركبة.
- إضافة أوامر:
  - Merge every 2 pages.
  - Remove merged pages.
  - Rebuild merged pages.

معيار القبول:

- يمكن دمج كل صفحتين داخل الفصل.
- الصفحات الأصلية تبقى محفوظة.
- OCR يعمل على الصفحات المركبة.
- يمكن الرجوع للأصل.
- لا يفسد ترتيب الفصل.

## معايير قبول الخطة كاملة

تعتبر خطة هنري الثامن ناجحة عندما يتحقق التالي:

- Auto Clean لا يزيل النصوص تلقائيا من الخلفيات الحرة في الوضع الافتراضي.
- الفقاعات البيضاء والسوداء تنظف بجودة أعلى من السلوك الحالي.
- كل قرار تنظيف محفوظ أو قابل للتتبع.
- يمكن للمستخدم معرفة سبب تخطي منطقة.
- يمكن إضافة مزود AI دون تغيير جذري في الواجهة.
- يمكن التراجع عن رقع التنظيف.
- OCR لا يفشل بسبب فشل التنظيف.
- تشغيل Chapter OCR يعطي ملخص تنظيف واضح.
- بنية الكود تسمح بإضافة مزود جديد.
- زر Microsoft يعمل ويحفظ نتائجه كمترشح ترجمة مستقل.
- يمكن حذف كل نتائج OCR بأمان دون حذف التعديلات اليدوية.
- يمكن إنشاء صفحات مركبة من كل صفحتين مع حفظ Source Map والرجوع للأصل.

## المخاطر

## 1. التصنيف الخاطئ

قد تصنف خلفية حرة كفقاعة آمنة.

التخفيف:

- thresholds محافظة.
- التخطي عند انخفاض الثقة.
- حفظ metrics للمراجعة.
- عينات تقييم.

## 2. بقع في الفقاعات السوداء

النص الأبيض على الأسود قد يترك هالات.

التخفيف:

- Bubble Fill بدل inpaint عند الخلفية المسطحة.
- mask expansion محسوب.
- feather خفيف.
- اختبار خاص للفقاعات السوداء.

## 3. بطء AI Inpaint

مزود AI قد يكون بطيئا جدا.

التخفيف:

- لا يعمل افتراضيا.
- job background.
- preview.
- progress واضح.
- cancellation لاحقا.

## 4. تضخم البيانات

حفظ masks وpatches وattempts قد يزيد حجم المشروع.

التخفيف:

- حفظ metadata نصية خفيفة.
- حفظ patch فقط عند النجاح.
- تنظيف artifacts المؤقتة.
- إعداد لاحق لحذف المحاولات القديمة.

## 5. تعقيد الواجهة

كثرة الخيارات قد تربك المستخدم.

التخفيف:

- الواجهة الرئيسية تعرض الخيارات الأساسية فقط.
- الخيارات المتقدمة داخل popover أو settings.
- الافتراضي محافظ وواضح.

## قرارات مؤجلة

هذه القرارات لا نحسمها الآن:

- هل نجعل LaMa مثبتا مع البرنامج أم اختياريا؟
- هل نحتاج preview إلزامي للخلفيات الحرة؟
- هل نضيف كشف فقاعة هندسي كامل لاحقا؟
- هل نستخدم GPU إن توفر؟
- هل نضيف Diffusion Inpainting؟
- هل نسمح بسياسات مختلفة لكل فصل؟

## إضافات مفتوحة للخطة

هذه الخطة مصممة لتستقبل إضافات لاحقة قبل التنفيذ.

المحاور المفتوحة:

- تحسين OCR نفسه قبل التنظيف.
- ربط التنظيف بالطباعة العربية لاحقا.
- ربط التنظيف بحفظ نسخة أصلية ونسخة معدلة.
- تقييم جودة الترجمة المرئية بعد وضع النص.
- أدوات يدوية إضافية للرسم والتبييض.
- إدارة نسخ edits لكل صفحة.

## خلاصة القرار التنفيذي

الخطوة التنفيذية الأولى بعد اعتماد الخطة ليست AI Inpainting.

الترتيب الصحيح:

1. تسجيل محاولات التنظيف.
2. إضافة classifier محافظ.
3. جعل Auto Clean يعمل فقط على الفقاعات الآمنة.
4. إضافة Bubble Fill للفقاعات البيضاء والسوداء.
5. عرض حالات التخطي في الواجهة.
6. بعد ذلك نضيف AI Inpaint للخلفيات الحرة.

بهذا لا نبني أداة قوية ظاهريا لكنها خطرة، بل نبني طبقة تنظيف يمكن الوثوق بها وتوسيعها.

## تنفيذ مرحلي للنصوص الحرة

أضيف مزود محلي قابل للاستخدام باسم `free_text_inpaint`.

هذا المزود ليس LaMa حقيقيًا، بل خطوة تنفيذية قبل LaMa:

- يبني mask أقوى للنصوص الحرة.
- يستخدم inpainting متعدد المسارات.
- يحفظ النتيجة كـ `clean_patch`.
- يظهر في أداة Smart Clean باسم Free text.
- يمكن استخدامه في Auto-clean فقط إذا اختاره المستخدم صراحة.

## تنفيذ LaMa الفعلي

تمت إضافة LaMa كمزود حقيقي باسم `lama`.

القرار التنفيذي:

- لا يثبت LaMa داخل Python العام حتى لا يكسر مزودي OCR الآخرين.
- يستخدم بيئة معزولة داخل المشروع: `.venv-lama`.
- خدمة Electron تستدعي `FLORIS_LAMA_PYTHON` إذا كان معرفًا، وإلا تستخدم `.venv-lama\Scripts\python.exe`.
- السكريبت `smart-clean-text.py` يستدعي `simple-lama-inpainting` فعليًا عند اختيار `provider=lama`.
- يتم استخدام mask موسع مبني من `build_free_text_mask` حتى يناسب النصوص فوق الخلفيات الحرة أكثر من OpenCV.
- يتم حفظ الناتج كـ `clean_patch` بنفس نظام الرقع الحالي.

حالة التنفيذ الحالية:

- `free_text_inpaint` يبقى مزودًا محليًا خفيفًا.
- `lama` أصبح مزود AI Inpainting فعليًا ومتاحًا من Smart Clean ومن Auto-clean عند اختياره صراحة.
- Diffusion Inpainting يبقى قرارًا لاحقًا، لأنه يحتاج نموذجًا أثقل وإعدادًا مستقلًا.

## تنفيذ وضع الخوارزمية

تمت إضافة وضع جديد باسم `الخوارزمية` وقيمته الداخلية `algorithm`.

هذا الوضع ليس مزود inpainting جديدًا، بل router فوق المزودات الحالية:

- إذا صنف النظام المنطقة كفقاعة أو صندوق مسطح:
  - `white_bubble`
  - `black_bubble`
  - `flat_light_box`
  - `flat_dark_box`
  يستخدم `free_text_inpaint`.
- إذا صنف النظام المنطقة كنص حر أو خلفية غير فقاعة:
  - `textured_background`
  - `effect_text`
  - `unknown`
  - `unsafe`
  يستخدم `lama`.

الهدف:

- عدم استخدام LaMa بلا حاجة داخل الفقاعات والصناديق المسطحة.
- عدم استخدام الحذف المسطح أو OpenCV الضعيف فوق الخلفيات الحرة.
- جعل auto-clean أقرب لسلوك المترجم اليدوي: اختيار الأداة بحسب نوع المنطقة لا بحسب خيار واحد ثابت.

يتم حفظ المزود المطلوب كـ `algorithm`، ويتم حفظ المزود الفعلي داخل metadata باسم `effectiveProvider`.
