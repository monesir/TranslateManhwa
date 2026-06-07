# خطة طبقة الإكسبلور والمصادر

## الهدف

طبقة الإكسبلور ليست واجهة فقط. هي طبقة backend مسؤولة عن التعامل مع مصادر المانهوات، عرض الأعمال والفصول، وإعطاء الواجهة عقدًا ثابتًا يمكن البناء عليه بدون أن تعرف React تفاصيل كل موقع أو API.

القرار الحالي:

```text
Explorer UI -> preload IPC -> App API -> Source Registry -> Source Runtime
```

بهذا الشكل لا تصبح الواجهة مرتبطة بمصدر معين، ولا تتعامل مع HTML أو API خارجي مباشرة.

## ما تم استخلاصه من مشروع القراءة القديم

المسار القديم:

```text
D:\clwd\FloirsMNH\apps\desktop\src\services\sources
```

يحتوي على فكرة صحيحة يمكن إعادة استخدامها:

- عقد موحد للمصدر `SourceRuntimeContract`.
- سجل مصادر `source-registry`.
- قدرات لكل مصدر مثل browse/search/details/chapters/pages/downloads.
- مصادر جاهزة: `Azora`, `MangaSwat`, `MangaBat`, `Olympus`, و`Local Imports`.

لكن لا ننقل نظام الإضافات كاملًا الآن. برنامج الترجمة يحتاج مصدرًا ثابتًا وقابلًا للتوسع أولًا، ثم نضيف plugins خارجية لاحقًا إذا احتجنا. نقل نظام plugins كاملًا في هذه المرحلة سيزيد التعقيد قبل وجود احتياج فعلي.

## القرار التنفيذي

نبدأ بمصادر مدمجة داخل Electron:

- `Azora Manga`
- `MangaSwat`

سبب البدء بهما:

- يعتمدان على API لا scraping HTML.
- أسهل في الاختبار.
- أقل هشاشة عند تغيّر تصميم الموقع.
- يعطيان الواجهة شكل البيانات المطلوب سريعًا.

ثم نضيف لاحقًا:

- `MangaBat`: يحتاج HTML parser + تعامل أكثر صرامة مع تغيّر selectors.
- `Olympus`: يحتاج HTML parser وقد يكون أكثر حساسية لتغيّر البنية.
- `Local Imports`: يجب أن يبنى على قاعدة بيانات برنامج الترجمة، لا على repository البرنامج القديم.

## عقد المصدر

كل مصدر يجب أن يلتزم بالقدرات التالية:

```text
metadata
capabilities
browse(page)
search(query, page)
getTitleDetails(titleId)
listChapters(titleId)
getChapterPages(titleId, chapterId)
```

الواجهة لا تستدعي هذه الدوال مباشرة. الواجهة تستدعي `window.florisApi`، وElectron main هو الذي يقرر المصدر.

## شكل catalog

كل مصدر يظهر في catalog بهذا الشكل:

```text
metadata:
  pluginId
  sourceId
  displayName
  language
  baseUrl

capabilities:
  browse
  search
  title_details
  chapter_list
  chapter_pages
  downloads

actions:
  canBrowse
  canSearch
  canViewTitle
  canReadChapters
  canDownload
```

هذا يفيد الواجهة في تعطيل أو إظهار الأزرار حسب قدرات المصدر بدل افتراض أن كل مصدر يدعم كل شيء.

في الحالة الحالية، المصادر المدمجة تدعم التصفح والبحث والتفاصيل والفصول وروابط الصفحات. أما `downloads` فتظل `false` إلى أن ننفذ workflow مستقل لتحميل الفصل وإنشاء سجلاته داخل قاعدة بيانات المشروع.

## شكل بيانات العمل

نتيجة browse/search:

```text
items:
  titleId
  slug
  name
  coverUrl
  bannerUrl
  canonicalUrl
  status
  statusLabel
  tags
  latestChapterLabel
  descriptionSnippet
page
hasNextPage
```

تفاصيل العمل:

```text
details:
  نفس حقول summary
  description
  authors
  artists
  originalLanguage
  sourceLabel

chapters:
  chapterId
  title
  chapterNumber
  volumeNumber
  groupName
  releaseDate
  canonicalUrl
  availability
  availabilityLabel
```

صفحات الفصل:

```text
pageIndex
imageUrl
```

## واجهة IPC المطلوبة

القنوات الحالية:

```text
sources:listCatalog
sources:browse
sources:search
sources:getTitleDetails
sources:getChapterPages
```

وهذه تظهر للواجهة عبر:

```text
window.florisApi.listSourceCatalog()
window.florisApi.browseSourceTitles(sourceId, page)
window.florisApi.searchSourceTitles(sourceId, query, page)
window.florisApi.getSourceTitleDetails(sourceId, titleId)
window.florisApi.getSourceChapterPages(sourceId, titleId, chapterId)
```

## حدود طبقة الإكسبلور

طبقة الإكسبلور تفعل:

- تعرض المصادر.
- تتصفح الأعمال.
- تبحث في مصدر محدد.
- تجلب تفاصيل عمل وفصوله.
- تجلب روابط صفحات فصل.

طبقة الإكسبلور لا تفعل:

- لا تنشئ مشروع ترجمة مباشرة.
- لا تدير تنزيل الملفات الثقيلة وحدها.
- لا تشغل OCR.
- لا تحفظ الفصل كعمل مترجم.

هذه العمليات يجب أن تكون فوقها كـ application workflow:

```text
Explorer selection -> Import/Create Project job -> Assets download -> DB records -> Translation workspace
```

## التخزين لاحقًا

نحتاج لاحقًا جداول صغيرة لتثبيت نتائج المصادر بدل الاعتماد على الذاكرة فقط:

```text
source_catalog_cache
source_title_cache
source_chapter_cache
source_page_cache
source_import_jobs
```

الهدف من هذه الجداول:

- تسريع الإكسبلور.
- حفظ snapshot من بيانات المصدر عند إنشاء المشروع.
- تتبع jobs عند تحميل فصل.
- فصل تغيرات المصدر الخارجي عن بيانات المشروع الداخلية.

لكن هذه الجداول ليست مطلوبة قبل تثبيت عقد المصدر وIPC.

## قابلية التوسع

إضافة مصدر جديد لاحقًا يجب أن تكون بهذه الخطوات فقط:

1. إنشاء ملف source runtime جديد.
2. تعريف metadata وcapabilities.
3. إضافته إلى `builtInSourceRuntimes`.
4. اختباره عبر نفس دوال registry.

لا يجب تعديل الواجهة عند إضافة مصدر جديد، إلا إذا أضفنا قدرة جديدة غير موجودة في العقد.
