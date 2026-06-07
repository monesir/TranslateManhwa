# خطة البنية العامة للنظام

## الهدف

هذا الملف يحدد البنية العامة للبرنامج بحيث يكون قابلًا للتعديل والتوسع لسنوات.

المطلوب ليس فقط أن تعمل النسخة الأولى، بل أن نستطيع لاحقًا إضافة:

- مزود OCR جديد.
- مزود ترجمة جديد.
- مصدر مانهوات جديد.
- نظام تعاون.
- قاعدة بيانات مختلفة.
- واجهة جديدة.
- أنواع تصدير جديدة.
- مراحل مراجعة أكثر تعقيدًا.

دون إعادة بناء البرنامج من الصفر.

## القرار المعماري الأساسي

نعتمد بنية:

```text
Modular Monolith
```

أي أن البرنامج يكون تطبيقًا واحدًا في البداية، لكنه مقسم داخليًا إلى وحدات واضحة الحدود.

هذا أفضل من تقسيمه إلى خدمات كثيرة مبكرًا، وأفضل من كتابة كل شيء في واجهة واحدة أو طبقة واحدة.

## لماذا Modular Monolith؟

لأنه يعطي توازنًا جيدًا:

- أسهل في التطوير من Microservices.
- أقوى تنظيمًا من تطبيق عشوائي.
- مناسب لتطبيق محلي أو سطح مكتب.
- يسمح بفصل واضح بين الواجهة، البيانات، OCR، الترجمة، التصدير.
- يمكن تحويل أجزاء منه لاحقًا إلى خدمات مستقلة إذا احتجنا.

## القاعدة الذهبية

لا توجد طبقة تتكلم مع كل شيء مباشرة.

كل طبقة لها مسؤولية وحدود.

```text
UI لا تتعامل مع SQL.
UI لا تستدعي OCR مباشرة.
UI لا تستدعي مزود ترجمة مباشرة.
OCR لا يعدل الترجمة النهائية.
Translation لا يعدل القاموس مباشرة.
Data Layer لا تعرف تفاصيل الواجهة.
Provider Layer لا تعرف تفاصيل الشاشات.
```

## طبقات النظام

```text
App
├─ UI Layer
├─ Application Layer
├─ Domain Layer
├─ Data Layer
├─ Provider Layer
├─ Job Layer
└─ Infrastructure Layer
```

## 1. UI Layer

## المسؤولية

طبقة الواجهة تعرض البيانات وتستقبل أوامر المستخدم.

تشمل:

- Explorer.
- Library.
- Manhwa Page.
- Translation Page.
- Settings.

## ما يسمح لها به

- عرض البيانات.
- استدعاء Application Use Cases.
- إظهار حالات التحميل والأخطاء.
- استقبال إدخال المستخدم.

## ما لا يسمح لها به

- لا تكتب SQL.
- لا تعرف بنية قاعدة البيانات.
- لا تستدعي PaddleOCR أو Microsoft أو أي مزود مباشرة.
- لا تحفظ ملفات مباشرة إلا عبر الخدمات المخصصة.
- لا تحتوي منطق سير العمل العميق.

## مثال صحيح

```text
UI -> RunOcrForChapterUseCase -> Job Layer -> OCR Provider -> Data Layer
```

## مثال خاطئ

```text
UI -> PaddleOCR -> SQLite
```

## 2. Application Layer

## المسؤولية

هذه هي طبقة حالات الاستخدام. تنسق بين الواجهة، البيانات، المزودات، والوظائف الطويلة.

هي المكان الذي نكتب فيه منطق "ماذا يحدث عندما يضغط المستخدم زرًا".

## أمثلة Use Cases

```text
CreateProject
UpdateProjectOverview
AddChapter
ImportChapterPages
OpenChapterForTranslation
RunOcrForPage
RunOcrForChapter
RunAiTranslation
RunMicrosoftTranslation
UpdateFinalTranslation
AddCharacter
AddCharacterAlias
AddGlossaryTerm
UpdateProjectContext
ExportChapter
BackupProject
```

## قواعد Application Layer

- تنفذ workflow كامل.
- تستخدم Repositories بدل SQL مباشر.
- تستخدم Providers عبر Interfaces.
- تنشئ Jobs للعمليات الطويلة.
- تطبق validation عام قبل الحفظ.
- لا تحتوي كود واجهة.

## مثال

```text
RunAiTranslation
1. يقرأ الفصل من ChapterRepository.
2. يقرأ text units التي تحتاج ترجمة.
3. يقرأ context والقاموس.
4. يبني prompt.
5. يستدعي TranslationProvider.
6. يحفظ TranslationCandidates.
7. يحدث حالة الفصل.
```

## 3. Domain Layer

## المسؤولية

تعريف مفاهيم البرنامج وقواعده الأساسية.

هذه الطبقة هي لغة النظام الداخلية.

## الكيانات الأساسية

```text
Project
ProjectContext
Chapter
Page
TextUnit
Character
CharacterAlias
GlossaryCategory
GlossaryTerm
OcrRun
OcrCandidate
TranslationRun
TranslationCandidate
TypesettingItem
Asset
Export
```

## قواعد Domain

تحتوي قواعد لا تتغير بتغير الواجهة أو قاعدة البيانات.

أمثلة:

- `Gender` يقبل: `Male`, `Female`, `Unknown`.
- حالة الفصل المعروضة: `Not Started`, `In Progress`, `Completed`.
- الحالة الداخلية للفصل أعمق من الحالة المعروضة.
- الترجمة النهائية لا تتغير تلقائيًا بسبب ترجمة آلية.
- Alias للشخصية يجب أن يحتوي English وArabic.
- Category في القاموس قابلة للإضافة.

## ما لا يدخل Domain

- كود SQL.
- كود الواجهة.
- تفاصيل API خارجية.
- مسارات ملفات خاصة بالنظام.

## 4. Data Layer

## المسؤولية

التعامل مع قاعدة البيانات وتوفير Repositories.

قاعدة البيانات هي مصدر الحقيقة.

## المكونات

```text
Database
Migrations
Repositories
Query Builders
Transactions
```

## Repositories المطلوبة

```text
ProjectRepository
ChapterRepository
PageRepository
TextUnitRepository
DictionaryRepository
ContextRepository
OcrRepository
TranslationRepository
AssetRepository
ExportRepository
SettingsRepository
```

## قواعد Data Layer

- لا تستخدمها الواجهة مباشرة إلا عبر Application Layer.
- كل تعديل متعدد الجداول يكون داخل transaction.
- كل تغيير schema يمر عبر migration.
- لا تخزن الصور الثقيلة داخل قاعدة البيانات.
- تخزن مسارات الأصول وبياناتها في DB.

## سبب Repositories

حتى إذا غيرنا SQLite إلى PostgreSQL لاحقًا، لا نغير الواجهة ولا منطق التطبيق.

التغيير يبقى داخل Data Layer.

## 5. Provider Layer

## المسؤولية

تغليف أي مزود خارجي أو محرك قابل للتبديل.

لا نربط البرنامج بمزود واحد.

## أنواع المزودات

```text
OcrProvider
TranslationProvider
SourceProvider
ExportProvider
StorageProvider
```

## OCR Providers

واجهة موحدة:

```text
OcrProvider
├─ PaddleOcrProvider
├─ TesseractProvider
├─ MangaOcrProvider
├─ AzureVisionProvider
└─ GoogleVisionProvider
```

كل مزود يرجع نفس شكل النتيجة:

```text
text
confidence
region
language
warnings
```

## Translation Providers

واجهة موحدة:

```text
TranslationProvider
├─ AiTranslationProvider
└─ MicrosoftTranslationProvider
```

كل مزود يرجع:

```text
translatedText
provider
model
metadata
warnings
```

## Source Providers

واجهة موحدة لمصادر الإكسبلور:

```text
SourceProvider
├─ search()
├─ getSeriesDetails()
├─ listChapters()
└─ importChapter()
```

إضافة مصدر جديد يجب ألا تغير Explorer كله، بل تضيف Provider جديدًا.

## قاعدة مهمة

المزود لا يعرف شيئًا عن UI ولا SQL.

المزود يأخذ input ويرجع output.

Application Layer هي التي تحفظ النتيجة.

## 6. Job Layer

## المسؤولية

إدارة العمليات الطويلة.

OCR، الترجمة، التصدير، النسخ الاحتياطي، واستيراد الفصول لا يجب أن تعطل الواجهة.

## مفهوم Job

```text
Job
├─ id
├─ type
├─ status
├─ progress
├─ startedAt
├─ completedAt
├─ error
└─ payload
```

## أنواع Jobs

```text
RunOcrForPage
RunOcrForChapter
RunAiTranslationForChapter
RunMicrosoftTranslationForChapter
ImportChapterPages
ExportChapter
CreateBackup
RebuildDictionaryMatches
```

## حالات Job

- `Queued`
- `Running`
- `Completed`
- `Failed`
- `Cancelled`

## قواعد Job Layer

- كل Job يمكن تتبعه من الواجهة.
- كل Job طويل يجب أن يعطي progress.
- فشل Job لا يجب أن يفسد البيانات.
- يمكن إعادة تشغيل Job عند الفشل.
- نتائج Job تحفظ عبر Repositories.

## لماذا هذه الطبقة مهمة؟

بدونها ستصبح الواجهة مرتبطة مباشرة بعمليات ثقيلة، وسيصعب لاحقًا إضافة:

- تشغيل OCR في الخلفية.
- ترجمة عدة فصول.
- إيقاف واستئناف.
- طابور أعمال.
- سجل أخطاء.

## 7. Infrastructure Layer

## المسؤولية

الخدمات العامة التي لا تنتمي للواجهة ولا للدومين.

## تشمل

```text
FileStorage
AssetManager
Logger
SettingsManager
BackupManager
MigrationRunner
ConfigManager
ErrorReporter
Clock
IdGenerator
```

## أمثلة

## AssetManager

مسؤول عن:

- نسخ صور الصفحات إلى مجلد الأصول.
- حساب checksum.
- إنشاء thumbnails.
- التأكد من وجود الملف.

## MigrationRunner

مسؤول عن:

- قراءة schema version.
- تشغيل migrations.
- إنشاء backup قبل migration كبير.

## BackupManager

مسؤول عن:

- نسخ قاعدة البيانات.
- نسخ الأصول المرتبطة.
- إنشاء manifest.
- استعادة backup.

## اتجاه الاعتماد بين الطبقات

الاعتماد يجب أن يكون بهذا الاتجاه:

```text
UI
↓
Application
↓
Domain

Application
↓
Data Interfaces
↓
Data Implementations

Application
↓
Provider Interfaces
↓
Provider Implementations

Application
↓
Job Layer
↓
Providers + Repositories
```

## قاعدة منع الاعتماد العكسي

لا يجوز:

```text
Domain -> UI
Domain -> SQLite
Domain -> OCR Provider
Provider -> UI
Data -> UI
```

## نمط Ports and Adapters

نستخدم فكرة:

```text
Port = Interface
Adapter = Implementation
```

مثال:

```text
OcrProvider = Port
PaddleOcrProvider = Adapter
TesseractProvider = Adapter
```

هذا يجعل إضافة مزود جديد سهلة.

## سيناريوهات التوسع

## إضافة مزود OCR جديد

لا نعدل صفحة الترجمة.

نضيف:

```text
NewOcrProvider implements OcrProvider
```

ثم نسجله في إعدادات المزودات.

## إضافة مزود ترجمة جديد

لا نعدل text_units ولا صفحة الترجمة.

نضيف:

```text
NewTranslationProvider implements TranslationProvider
```

وتظهر نتائجه كـ `translation_candidates`.

## إضافة مصدر Explorer جديد

لا نعيد كتابة Explorer.

نضيف:

```text
NewSourceProvider implements SourceProvider
```

Explorer يستدعي الواجهة الموحدة.

## إضافة حقل جديد للشخصية

نضيف migration:

```text
ALTER TABLE characters ADD COLUMN new_field TEXT;
```

ثم نحدث:

```text
Domain model
DictionaryRepository
Dictionary UI form
```

بدون لمس OCR أو Translation أو Chapters.

## تغيير SQLite إلى PostgreSQL

نحافظ على:

```text
ProjectRepository
ChapterRepository
DictionaryRepository
```

ونغير implementations.

الواجهة وApplication Layer لا يجب أن تتغير إلا قليلًا أو لا تتغير.

## إضافة تعاون لاحقًا

لا نبدأ به الآن، لكن البنية تسمح به.

نحتاج لاحقًا:

- user table.
- permissions.
- change log.
- sync service.
- conflict resolution.

إذا كانت كل التعديلات تمر عبر Application Layer وRepositories، يصبح إدخال التعاون ممكنًا.

## قواعد التصميم القابل للتعديل

## 1. أي شيء يتكرر يوضع في جدول منفصل

مثال:

- Character aliases.
- Translation candidates.
- OCR candidates.
- Glossary categories.

لا نستخدم:

```text
alias_1
alias_2
alias_3
```

## 2. أي مزود خارجي يوضع خلف Interface

لا نكتب كود مزود داخل Use Case مباشرة.

## 3. أي عملية طويلة تتحول إلى Job

لا نربط OCR أو الترجمة بزر ينتظر حتى تنتهي العملية دون إدارة حالة.

## 4. أي تغيير في قاعدة البيانات له Migration

لا نعدل schema يدويًا دون سجل.

## 5. لا نخلط المسودة بالمعتمد

نفرق دائمًا بين:

- OCR candidate.
- source final text.
- translation candidate.
- final translation.

## 6. لا نستخدم JSON للعلاقات الأساسية

JSON مسموح للبيانات المرنة:

- region.
- provider settings.
- style settings.
- metadata.

لكن العلاقات الأساسية تكون جداول.

مثال:

- Aliases جدول.
- Categories جدول.
- Text Units جدول.

## 7. الواجهة لا تملك منطق العمل

الواجهة تستدعي Use Cases.

إذا تغيرت الواجهة لاحقًا، يبقى منطق البرنامج موجودًا في Application Layer.

## 8. كل طبقة قابلة للاختبار وحدها

لا نبني منطقًا لا يمكن اختباره إلا بفتح البرنامج كاملًا.

## الاختبار

## Domain Tests

تختبر القواعد:

- gender values.
- chapter status transitions.
- glossary validation.

## Application Tests

تختبر use cases:

- إنشاء مشروع.
- إضافة فصل.
- تشغيل OCR وهمي.
- حفظ ترجمة نهائية.

## Repository Tests

تختبر قاعدة البيانات:

- insert.
- update.
- delete.
- transactions.
- migrations.

## Provider Tests

تستخدم مزودات وهمية:

```text
FakeOcrProvider
FakeTranslationProvider
```

حتى لا تعتمد الاختبارات على خدمات حقيقية.

## Job Tests

تختبر:

- نجاح Job.
- فشل Job.
- إلغاء Job.
- حفظ progress.

## بنية مجلدات الكود المقترحة

هذه البنية عامة ويمكن تعديلها حسب التقنية المستخدمة:

```text
src/
├─ ui/
│  ├─ explorer/
│  ├─ library/
│  ├─ manhwa/
│  ├─ translation/
│  └─ settings/
│
├─ application/
│  ├─ projects/
│  ├─ chapters/
│  ├─ dictionary/
│  ├─ ocr/
│  ├─ translation/
│  └─ export/
│
├─ domain/
│  ├─ project/
│  ├─ chapter/
│  ├─ text-unit/
│  ├─ dictionary/
│  └─ shared/
│
├─ data/
│  ├─ migrations/
│  ├─ repositories/
│  └─ database/
│
├─ providers/
│  ├─ ocr/
│  ├─ translation/
│  ├─ sources/
│  └─ export/
│
├─ jobs/
│  ├─ queue/
│  ├─ workers/
│  └─ job-types/
│
└─ infrastructure/
   ├─ assets/
   ├─ backup/
   ├─ settings/
   ├─ logging/
   └─ ids/
```

## مبدأ Feature Modules

داخل كل طبقة يمكن التقسيم حسب الميزة.

مثال:

```text
application/dictionary/
domain/dictionary/
data/repositories/DictionaryRepository
ui/manhwa/dictionary/
```

هذا يجعل القاموس قابلًا للتطوير دون لمس كل أجزاء البرنامج.

## API داخلي بين الواجهة والتطبيق

حتى لو كان البرنامج محليًا، يجب أن نتعامل مع Application Layer كأن لها API واضحة.

أمثلة:

```text
createProject(input)
listLibraryProjects()
getProjectOverview(projectId)
listChapters(projectId)
getDictionary(projectId)
addCharacter(projectId, input)
addGlossaryTerm(projectId, input)
openChapter(chapterId)
runOcr(chapterId, options)
runTranslation(chapterId, provider, options)
updateFinalTranslation(textUnitId, text)
```

## فوائد هذا الأسلوب

- الواجهة تصبح أبسط.
- الاختبارات أسهل.
- تغيير التخزين أسهل.
- إضافة مزودات أسهل.
- التعاون لاحقًا أسهل.

## الأخطاء المعمارية الممنوعة

## 1. God Component

ممنوع أن تصبح صفحة الترجمة مسؤولة عن:

- OCR.
- SQL.
- الترجمة.
- حفظ الملفات.
- التصدير.

صفحة الترجمة تعرض وتستدعي use cases فقط.

## 2. God Service

ممنوع إنشاء خدمة واحدة اسمها:

```text
ProjectService
```

وتضع فيها كل شيء.

نقسم الخدمات حسب use cases أو modules.

## 3. Provider Coupling

ممنوع أن يكون الكود مكتوبًا حول مزود واحد.

لا نكتب:

```text
runPaddleOcr()
```

في الواجهة.

نكتب:

```text
runOcr(providerId)
```

## 4. Database Leakage

ممنوع أن تعرف الواجهة أسماء الجداول.

لا يظهر في UI شيء مثل:

```text
SELECT * FROM text_units
```

## 5. Mixing Draft and Final

ممنوع أن تحل ترجمة AI محل الترجمة النهائية تلقائيًا.

## قرارات مؤجلة

هذه لا نحسمها في هذا الملف:

- هل التطبيق Desktop أم Web محلي؟
- هل نستخدم Tauri أم Electron أم Web فقط؟
- هل نستخدم ORM أم SQL مباشر داخل repositories؟
- هل نبدأ بواجهة عربية بالكامل أم ثنائية اللغة؟
- هل نضيف تعاون في النسخة الأولى؟

لكن أي اختيار تقني لاحق يجب أن يحترم هذه البنية.

## القرار النهائي الحالي

البنية المعتمدة:

```text
Modular Monolith
SQLite as source of truth
Filesystem for heavy assets
Application Use Cases for workflows
Repositories for data access
Providers behind interfaces
Jobs for long-running work
Migrations from day one
Strict separation between draft, candidate, and final data
```

هذه البنية تجعل البرنامج قابلًا للتعديل والتوسع لأنها تمنع ربط الواجهة بقاعدة البيانات أو مزودات OCR والترجمة، وتجعل كل إضافة جديدة تدخل من مكانها الطبيعي بدل تفكيك النظام كل مرة.
