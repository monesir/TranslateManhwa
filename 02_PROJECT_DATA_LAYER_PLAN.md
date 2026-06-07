# خطة طبقة بيانات المشروع وقاعدة البيانات

## الهدف

طبقة البيانات هي العمود الفقري للبرنامج. إذا أردنا برنامجًا يعيش لسنوات، يتوسع، ويدعم مشاريع كبيرة، فلا يجب أن نعتمد على ملفات JSON كمصدر الحقيقة.

القرار الحالي:

```text
قاعدة البيانات هي مصدر الحقيقة.
نظام الملفات يستخدم فقط للأصول الثقيلة مثل الصور، التصدير، الكاش، والنسخ الاحتياطية.
```

## القرار المعماري

نستخدم قاعدة بيانات من البداية.

الاختيار المقترح:

- `SQLite` كبداية محلية قوية.
- تصميم schema منظم بحيث يمكن نقله لاحقًا إلى `PostgreSQL` إذا احتجنا تعاونًا أو خادمًا.

السبب:

- SQLite مناسبة لتطبيق سطح مكتب أو تطبيق محلي.
- لا تحتاج خادمًا.
- تدعم معاملات `transactions`.
- تدعم فهارس وعلاقات ومفاتيح خارجية.
- سهلة النسخ الاحتياطي.
- مناسبة لمشاريع كبيرة إذا صممت الجداول والفهارس بشكل صحيح.

أما `PostgreSQL` فيكون خيارًا لاحقًا عند الحاجة إلى:

- تعاون بين عدة مستخدمين.
- مزامنة عبر أجهزة.
- خادم مركزي.
- صلاحيات متقدمة.

## مبدأ التخزين

## داخل قاعدة البيانات

نخزن:

- بيانات المكتبة.
- بيانات المانهوا.
- الفصول.
- الصفحات.
- وحدات النص.
- نتائج OCR.
- الترجمات الآلية.
- الترجمة النهائية.
- القاموس.
- سياق العمل.
- حالات المراجعة.
- إعدادات المشروع.
- سجل العمليات.

## خارج قاعدة البيانات

نخزن كملفات:

- صور الصفحات.
- الغلاف.
- ملفات التصدير.
- ملفات الكاش.
- النسخ الاحتياطية.

قاعدة البيانات تحفظ المسارات والبيانات الوصفية لهذه الملفات، لا تحفظ الصور نفسها.

## بنية مجلد العمل

حتى مع استخدام قاعدة بيانات، نحتاج مجلدًا منظمًا للأصول.

```text
FlorisWorkspace/
├─ floris.db
├─ assets/
│  ├─ projects/
│  │  └─ project_solo_leveling/
│  │     ├─ cover.jpg
│  │     └─ chapters/
│  │        └─ chapter_001/
│  │           └─ pages/
│  │              ├─ 001.png
│  │              ├─ 002.png
│  │              └─ ...
│  └─ thumbnails/
├─ exports/
├─ backups/
└─ cache/
```

## قاعدة مهمة

إذا اختلفت قاعدة البيانات مع الملفات، قاعدة البيانات هي المرجع.

لكن يجب وجود أدوات إصلاح:

- فحص الملفات المفقودة.
- إعادة بناء thumbnails.
- كشف الصفحات التي لها سجل في DB لكن ملفها مفقود.
- كشف ملفات أصول غير مرتبطة بأي سجل.

## الكيانات الأساسية

```text
Project
├─ Project Context
├─ Characters
│  └─ Character Aliases
├─ Glossary Terms
├─ Chapters
│  ├─ Pages
│  ├─ Text Units
│  │  ├─ OCR Candidates
│  │  ├─ Translation Candidates
│  │  ├─ Final Translation
│  │  └─ Review State
│  ├─ OCR Runs
│  ├─ Translation Runs
│  └─ Typesetting Items
└─ Exports
```

## الجداول المقترحة

## 1. projects

يمثل مانهوا داخل مكتبة المستخدم.

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  arabic_title TEXT,
  original_title TEXT,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL DEFAULT 'Arabic',
  cover_asset_id TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  last_worked_chapter_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## حالات المشروع

- `Active`
- `Paused`
- `Completed`
- `Archived`

## ملاحظات

- `slug` للعرض والمسارات.
- `id` هو المرجع الحقيقي.
- `cover_asset_id` يشير إلى جدول assets.

## 2. project_metadata

تفاصيل اختيارية عن العمل.

```sql
CREATE TABLE project_metadata (
  project_id TEXT PRIMARY KEY,
  author TEXT,
  artist TEXT,
  description TEXT,
  genres_json TEXT,
  external_status TEXT,
  start_year INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

## لماذا جدول منفصل؟

لأن هذه البيانات وصفية وقد تتوسع دون تضخيم جدول projects.

## 3. project_sources

يربط المشروع بمصدر أو أكثر.

```sql
CREATE TABLE project_sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_key TEXT,
  external_id TEXT,
  url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

## 4. project_contexts

يحفظ سياق العمل كنص Markdown داخل قاعدة البيانات.

```sql
CREATE TABLE project_contexts (
  project_id TEXT PRIMARY KEY,
  markdown TEXT NOT NULL DEFAULT '',
  summary TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

## لماذا داخل DB وليس ملف Markdown؟

لأن السياق جزء من بيانات المشروع ويجب أن:

- يدخل النسخ الاحتياطي.
- يدخل البحث.
- يدخل سجل التعديلات لاحقًا.
- يتزامن بسهولة إذا أضفنا مزامنة.

يمكن تصديره كـ Markdown عند الحاجة، لكن المصدر الحقيقي يكون في DB.

## 5. assets

يسجل الملفات الثقيلة مثل الصور والغلاف.

```sql
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER,
  checksum TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

## kind

- `cover`
- `page`
- `thumbnail`
- `export`
- `reference`

## 6. chapters

يمثل فصلًا داخل مشروع.

```sql
CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  number TEXT NOT NULL,
  title TEXT,
  display_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Not Started',
  internal_status TEXT NOT NULL DEFAULT 'Images Ready',
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

## الحالات المعروضة

- `Not Started`
- `In Progress`
- `Completed`

## الحالات الداخلية

- `Images Ready`
- `OCR Done`
- `Draft Translated`
- `Human Edited`
- `Reviewed`
- `Typeset`
- `Completed`

## فهرس مهم

```sql
CREATE INDEX idx_chapters_project_sort
ON chapters(project_id, sort_order);
```

## 7. pages

يمثل صفحة صورة داخل فصل.

```sql
CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  page_index INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT
);
```

## فهرس

```sql
CREATE UNIQUE INDEX idx_pages_chapter_index
ON pages(chapter_id, page_index);
```

## 8. text_units

أهم جدول في البرنامج.

يمثل فقاعة أو منطقة نصية قابلة للترجمة.

```sql
CREATE TABLE text_units (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  unit_order INTEGER NOT NULL,
  region_json TEXT,
  source_ocr_text TEXT,
  source_final_text TEXT,
  source_status TEXT NOT NULL DEFAULT 'Empty',
  final_translation TEXT,
  review_status TEXT NOT NULL DEFAULT 'Not Reviewed',
  review_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
);
```

## source_status

- `Empty`
- `OCR Ready`
- `Needs Review`
- `Reviewed`
- `Ignored`

## review_status

- `Not Reviewed`
- `Needs Review`
- `Approved`

## region_json

يحفظ مكان الفقاعة أو النص.

في البداية:

```json
{
  "type": "box",
  "x": 120,
  "y": 240,
  "width": 300,
  "height": 90
}
```

لاحقًا:

```json
{
  "type": "polygon",
  "points": [[120,240],[420,240],[420,330],[120,330]]
}
```

## فهارس

```sql
CREATE INDEX idx_text_units_chapter_order
ON text_units(chapter_id, unit_order);

CREATE INDEX idx_text_units_page_order
ON text_units(page_id, unit_order);
```

## 9. ocr_runs

يسجل كل عملية OCR.

```sql
CREATE TABLE ocr_runs (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  mode TEXT NOT NULL,
  language_hint TEXT,
  settings_json TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);
```

## 10. ocr_candidates

يحفظ نتائج OCR المرشحة لكل وحدة نص.

```sql
CREATE TABLE ocr_candidates (
  id TEXT PRIMARY KEY,
  ocr_run_id TEXT NOT NULL,
  text_unit_id TEXT,
  page_id TEXT NOT NULL,
  text TEXT NOT NULL,
  confidence REAL,
  region_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ocr_run_id) REFERENCES ocr_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (text_unit_id) REFERENCES text_units(id) ON DELETE SET NULL,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
);
```

## الفكرة

`ocr_candidates` تحفظ نتائج المزود كما هي.

أما النص الذي يعتمده المستخدم فيحفظ في:

```text
text_units.source_final_text
```

## 11. translation_runs

يسجل كل عملية ترجمة آلية.

```sql
CREATE TABLE translation_runs (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  settings_json TEXT,
  used_context INTEGER NOT NULL DEFAULT 0,
  used_dictionary INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);
```

## 12. translation_candidates

يحفظ الترجمات المقترحة من الذكاء الاصطناعي أو Microsoft.

```sql
CREATE TABLE translation_candidates (
  id TEXT PRIMARY KEY,
  translation_run_id TEXT NOT NULL,
  text_unit_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  confidence REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (translation_run_id) REFERENCES translation_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (text_unit_id) REFERENCES text_units(id) ON DELETE CASCADE
);
```

## قاعدة مهمة

الترجمات المقترحة لا تعدل `final_translation` تلقائيًا.

الترجمة النهائية هي قرار بشري وتحفظ في:

```text
text_units.final_translation
```

## 13. characters

قسم الشخصيات في القاموس.

```sql
CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  english_name TEXT NOT NULL,
  arabic_name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'Unknown',
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

## gender

القيم المقبولة:

- `Male`
- `Female`
- `Unknown`

## 14. character_aliases

يحفظ الأسماء البديلة مع مقابلها العربي.

```sql
CREATE TABLE character_aliases (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  english_alias TEXT NOT NULL,
  arabic_alias TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);
```

## 15. glossary_categories

تصنيفات القاموس العام، وهي قابلة للإضافة.

```sql
CREATE TABLE glossary_categories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

## فهرس

```sql
CREATE UNIQUE INDEX idx_glossary_categories_project_name
ON glossary_categories(project_id, name);
```

## 16. glossary_terms

القاموس العام.

```sql
CREATE TABLE glossary_terms (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  category_id TEXT,
  english_term TEXT NOT NULL,
  arabic_term TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES glossary_categories(id) ON DELETE SET NULL
);
```

## فهارس

```sql
CREATE INDEX idx_glossary_terms_project
ON glossary_terms(project_id);

CREATE INDEX idx_glossary_terms_category
ON glossary_terms(category_id);
```

## 17. dictionary_matches

يحفظ المطابقات بين وحدات النص والقاموس، حتى لا نعيد حسابها دائمًا.

```sql
CREATE TABLE dictionary_matches (
  id TEXT PRIMARY KEY,
  text_unit_id TEXT NOT NULL,
  match_type TEXT NOT NULL,
  character_id TEXT,
  glossary_term_id TEXT,
  matched_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (text_unit_id) REFERENCES text_units(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (glossary_term_id) REFERENCES glossary_terms(id) ON DELETE CASCADE
);
```

## match_type

- `character`
- `character_alias`
- `term`

## 18. typesetting_items

يحفظ بيانات إدخال النص النهائي داخل الصور.

```sql
CREATE TABLE typesetting_items (
  id TEXT PRIMARY KEY,
  text_unit_id TEXT NOT NULL,
  font_family TEXT,
  font_size REAL,
  font_weight TEXT,
  align TEXT,
  box_json TEXT,
  style_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (text_unit_id) REFERENCES text_units(id) ON DELETE CASCADE
);
```

## 19. exports

يسجل عمليات التصدير.

```sql
CREATE TABLE exports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chapter_id TEXT,
  kind TEXT NOT NULL,
  output_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);
```

## 20. app_events

سجل عمليات مهم للتتبع.

```sql
CREATE TABLE app_events (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  chapter_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
);
```

## أمثلة event_type

- `project_created`
- `chapter_created`
- `ocr_started`
- `ocr_completed`
- `translation_started`
- `translation_completed`
- `chapter_exported`

## العلاقات المهمة

```text
projects 1----n chapters
chapters 1----n pages
chapters 1----n text_units
pages 1----n text_units
text_units 1----n ocr_candidates
text_units 1----n translation_candidates
projects 1----n characters
characters 1----n character_aliases
projects 1----n glossary_terms
projects 1----n glossary_categories
text_units 1----n dictionary_matches
text_units 1----1/n typesetting_items
```

## قواعد المعرفات

كل معرف يكون نصيًا ثابتًا.

أمثلة:

```text
project_solo_leveling
chapter_001
page_001
text_001
character_001
alias_001
category_001
term_001
ocr_run_001
translation_run_001
```

الرقم أو الاسم الظاهر يمكن تغييره، لكن `id` لا يتغير.

## المعاملات Transactions

أي عملية تغير أكثر من جدول يجب أن تكون داخل transaction.

أمثلة:

## إنشاء فصل

يعدل:

- `chapters`
- `assets`
- `pages`
- `app_events`

كلها داخل transaction واحدة.

## تشغيل OCR

يعدل:

- `ocr_runs`
- `ocr_candidates`
- `text_units`
- `chapters.internal_status`

داخل transaction أو على دفعات آمنة.

## اعتماد ترجمة نهائية

يعدل:

- `text_units.final_translation`
- `text_units.review_status`
- إحصائيات الفصل.
- `chapters.updated_at`
- `projects.updated_at`

داخل transaction.

## الفهارس المطلوبة

فهارس MVP الأساسية:

```sql
CREATE INDEX idx_projects_updated_at
ON projects(updated_at);

CREATE INDEX idx_chapters_project_status
ON chapters(project_id, status);

CREATE INDEX idx_text_units_review
ON text_units(chapter_id, review_status);

CREATE INDEX idx_translation_candidates_text_unit
ON translation_candidates(text_unit_id);

CREATE INDEX idx_ocr_candidates_text_unit
ON ocr_candidates(text_unit_id);

CREATE INDEX idx_characters_project
ON characters(project_id);

CREATE INDEX idx_character_aliases_character
ON character_aliases(character_id);
```

## الإحصائيات

لا نحسب كل شيء من الصفر في كل شاشة.

نستخدم طريقتين:

## إحصائيات مباشرة بالاستعلام

مناسبة للأعداد الصغيرة والمتوسطة.

مثال:

```sql
SELECT COUNT(*) FROM chapters WHERE project_id = ?;
```

## إحصائيات مخزنة لاحقًا

إذا أصبح المشروع ضخمًا، يمكن إضافة جدول:

```sql
CREATE TABLE project_stats (
  project_id TEXT PRIMARY KEY,
  chapters_count INTEGER NOT NULL DEFAULT 0,
  characters_count INTEGER NOT NULL DEFAULT 0,
  glossary_terms_count INTEGER NOT NULL DEFAULT 0,
  chapters_in_progress INTEGER NOT NULL DEFAULT 0,
  chapters_completed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
```

لا نحتاج هذا في البداية إلا إذا ظهرت مشكلة أداء.

## الهجرات Migrations

يجب أن تكون الهجرات جزءًا من الطبقة من اليوم الأول.

نحتاج جدول:

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
```

## قواعد الهجرة

- كل تغيير schema له رقم.
- لا نعدل migration قديم بعد تطبيقه.
- قبل migration كبير، ننشئ نسخة احتياطية من `floris.db`.
- كل migration يجب أن يكون قابلًا للاختبار على قاعدة بيانات قديمة.

## النسخ الاحتياطي

قاعدة البيانات أهم ملف في البرنامج.

## أنواع النسخ

- نسخة يدوية.
- نسخة قبل migration.
- نسخة قبل حذف مشروع.
- نسخة دورية اختيارية.

## الشكل

```text
backups/
├─ floris-2026-06-07-1640.db
├─ floris-2026-06-07-1640.assets.zip
└─ floris-2026-06-07-1640.manifest.json
```

## manifest

يحفظ:

- وقت النسخ.
- نسخة schema.
- حجم DB.
- قائمة الأصول المرفقة.

## الاستيراد والتصدير

## تصدير مشروع واحد

ينتج ملفًا:

```text
solo-leveling.floris.zip
```

يحتوي:

```text
manifest.json
project-data.sqlite
assets/
exports/
```

## لماذا project-data.sqlite؟

لأن تصدير مشروع واحد من قاعدة البيانات الرئيسية يجب أن يكون مستقلًا.

نستخرج بيانات المشروع وفصوله وقاموسه وسياقه إلى قاعدة صغيرة داخل الحزمة.

## استيراد مشروع

عند الاستيراد:

1. نقرأ `manifest.json`.
2. نفتح `project-data.sqlite`.
3. نتحقق من schema.
4. إذا تعارض `project_id`، ننشئ id جديد أو نطلب دمجًا لاحقًا.
5. ننسخ الأصول إلى workspace.
6. ندخل البيانات داخل `floris.db`.

## البحث

نحتاج بحثًا قويًا لاحقًا.

في SQLite يمكن استخدام `FTS5` لاحقًا للبحث في:

- أسماء المشاريع.
- أسماء الشخصيات.
- المصطلحات.
- النصوص الأصلية.
- الترجمات النهائية.

جدول لاحق:

```sql
CREATE VIRTUAL TABLE search_index USING fts5(
  entity_type,
  entity_id,
  project_id,
  content
);
```

هذا يؤجل لما بعد بناء الهيكل الأساسي.

## التعامل مع الصور

الصور لا تدخل قاعدة البيانات.

لكن كل صورة لها سجل في `assets`.

عند إضافة صفحة:

1. نحسب checksum.
2. ننسخ الصورة إلى مجلد المشروع.
3. ننشئ سجل `assets`.
4. ننشئ سجل `pages`.

## فوائد checksum

- كشف تكرار الصور.
- كشف تغير ملف الصفحة.
- التأكد من سلامة الملف.

## طبقة الوصول للبيانات

لا يجب أن تكتب الواجهة SQL مباشرة.

نحتاج طبقة خدمة:

```text
ProjectRepository
ChapterRepository
PageRepository
TextUnitRepository
DictionaryRepository
OcrRepository
TranslationRepository
AssetRepository
```

## أمثلة عمليات

```text
ProjectRepository.createProject()
ProjectRepository.listLibraryProjects()
ChapterRepository.createChapter()
ChapterRepository.listProjectChapters()
TextUnitRepository.updateFinalTranslation()
DictionaryRepository.addCharacter()
DictionaryRepository.addGlossaryTerm()
OcrRepository.saveOcrRun()
TranslationRepository.saveTranslationCandidates()
```

## لماذا Repository؟

حتى لا تتوزع قواعد البيانات بين مكونات الواجهة.

إذا انتقلنا من SQLite إلى PostgreSQL لاحقًا، لا نعيد كتابة الواجهة.

## قواعد الفصل بين الطبقات

## الواجهة

تطلب البيانات من repositories.

لا تعرف مكان الملفات ولا شكل SQL.

## OCR

يقرأ الصفحات من `assets/pages`.

يكتب:

- `ocr_runs`
- `ocr_candidates`
- `text_units.source_ocr_text`

لا يكتب `final_translation`.

## الترجمة

تقرأ:

- `text_units.source_final_text`
- `project_contexts`
- `characters`
- `glossary_terms`

تكتب:

- `translation_runs`
- `translation_candidates`

لا تعدل `text_units.final_translation` إلا إذا اختار المستخدم اعتمادها.

## القاموس

يكتب:

- `characters`
- `character_aliases`
- `glossary_categories`
- `glossary_terms`

ويستخدمه:

- الترجمة.
- مراجعة الجودة.
- القاموس المصغر في صفحة الترجمة.

## الجودة

تقرأ:

- `text_units`
- `characters`
- `character_aliases`
- `glossary_terms`

تكتب:

- `dictionary_matches`
- `text_units.review_status`
- `text_units.review_notes`

## MVP قاعدة البيانات

يدخل من البداية:

- SQLite DB.
- جدول migrations.
- projects.
- project_metadata.
- project_contexts.
- assets.
- chapters.
- pages.
- text_units.
- characters.
- character_aliases.
- glossary_categories.
- glossary_terms.
- translation_candidates.
- ocr_candidates.
- repositories أساسية.
- نسخ احتياطي يدوي.

## يؤجل

- PostgreSQL.
- FTS5 search index.
- app_events المتقدم.
- project_stats المخزن.
- تصدير `.floris` الكامل.
- مزامنة متعددة الأجهزة.
- صلاحيات وتعاون.

## القرار النهائي الحالي

نعتمد:

```text
SQLite as source of truth
Filesystem for heavy assets
Repositories as data access boundary
Migrations from day one
Export/import designed around database packages
```

هذا مناسب لبرنامج طويل العمر: منظم، قابل للتوسع، قابل للنسخ، وقابل للانتقال لاحقًا إلى PostgreSQL دون هدم التصميم.
