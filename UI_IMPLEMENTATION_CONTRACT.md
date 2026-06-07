# عقد تنفيذ الواجهة

## الغرض

هذا الملف هو العقد العملي لمن سيبني الواجهة. الهدف أن تكون الواجهة قابلة للربط لاحقًا بطبقات البرنامج، لا مجرد تصميم بصري.

يجب على منفذ الواجهة الالتزام بهذا الملف مع:

- `00_SYSTEM_ARCHITECTURE_PLAN.md`
- `01_UI_LAYER_PLAN.md`
- `TECH_STACK_AND_UI_HANDOFF.md`

## نطاق العمل

المطلوب بناء واجهة فقط.

يدخل في العمل:

- صفحات التطبيق.
- routing.
- mock API.
- mock data.
- types.
- components.
- layout.
- حالات loading/empty/error الأساسية.

لا يدخل في العمل:

- SQLite.
- Tauri commands.
- Electron.
- OCR حقيقي.
- ترجمة AI حقيقية.
- Microsoft Translator حقيقي.
- Export حقيقي.
- نظام ملفات حقيقي.

## التقنية المطلوبة

```text
React
TypeScript
Vite
Tailwind CSS v4
shadcn/ui
lucide-react
React Router
TanStack Query
Zustand
TanStack Table
React Hook Form
Zod
```

## المسارات المطلوبة

```text
/library
/explorer
/explorer/:externalSeriesId
/projects/:projectId
/projects/:projectId/chapters/:chapterId/translate
/settings
```

المسار الافتراضي:

```text
/library
```

## أسماء الصفحات

## Library Page

تعرض مكتبة المشاريع.

في الأعلى إحصائيات بسيطة:

- Last worked chapter.
- Last modified.
- Active projects.
- Chapters in progress.
- Completed chapters.

بعدها قائمة أو شبكة مشاريع.

كل مشروع يعرض:

- Cover.
- Project title.
- Original title.
- Source language.
- Last worked chapter.
- Last modified.
- Progress.
- Status.

## Explorer Page

تعرض مصادر ومانهوات وهمية.

تحتاج:

- Source selector.
- Search.
- Series list/grid.
- Series card.

الضغط على عمل يفتح:

```text
/explorer/:externalSeriesId
```

## Explorer Series Details Page

تعرض تفاصيل العمل من الإكسبلور.

تعرض:

- Cover.
- Title.
- Original title.
- Description.
- Source.
- Source language.
- Genres.
- Chapters list.
- Button: Add to Library.
- Button: Open in Library إذا كان العمل موجودًا في المكتبة.

الأزرار تستخدم mock actions فقط.

## Project Page

المسار:

```text
/projects/:projectId
```

تستخدم ثلاثة تبويبات رئيسية فقط:

- Overview.
- Chapters.
- Dictionary.

لا تضف Dashboard ولا تبويب رابع.

## Overview Tab

يعرض:

- Project title.
- Original title.
- Source language.
- Target language.
- Chapters count.
- Characters count.
- General terms count.
- Last worked chapter.
- Last modified.
- Project context summary.
- Cover.

## Chapters Tab

يعرض جدول فصول.

أعمدة مقترحة:

- Chapter.
- Title.
- Status.
- Internal status.
- Pages.
- Text units.
- Progress.
- Last modified.
- Action: Open translation.

حالات `status`:

```text
Not Started
In Progress
Completed
```

حالات `internalStatus`:

```text
Images Ready
OCR Done
Draft Translated
Human Edited
Reviewed
Typeset
Completed
```

## Dictionary Tab

يحتوي قسمين داخليين:

- Characters.
- General Glossary.

يمكن استخدام tabs داخلية أو segmented control.

## Characters

الحقول:

- English Name.
- Arabic Name.
- Gender.
- Aliases.
- Description.

قيم Gender فقط:

```text
Male
Female
Unknown
```

كل Alias يحتوي:

- English.
- Arabic.

Description اختياري.

## General Glossary

الحقول:

- English Term.
- Arabic Term.
- Category.
- Description.

Description اختياري.

Category قابلة للإضافة من المستخدم في الواجهة الوهمية.

## Translation Page

المسار:

```text
/projects/:projectId/chapters/:chapterId/translate
```

هذه أهم صفحة.

التخطيط الثابت:

```text
┌──────────────────────────────────────────────────────────────┐
│ Top chapter bar                                               │
├─────────────────┬─────────────────────────────┬──────────────┤
│ Left panel       │ Center page viewer          │ Right tools   │
│ Mini dictionary  │ Image + region overlays     │ Tool groups   │
│ Text units       │                             │              │
└─────────────────┴─────────────────────────────┴──────────────┘
```

## Top Chapter Bar

يعرض:

- Project title.
- Chapter label.
- Save state.
- Current page.
- Chapter status.
- Buttons:
  - Back.
  - Run OCR.
  - AI Translate.
  - Microsoft Translate.
  - Quality Check.
  - Export.

كل الأزرار mock فقط.

## Center Page Viewer

يعرض:

- صورة الصفحة الحالية من mock assets أو placeholder.
- مناطق text units كـ SVG overlay.
- المنطقة المحددة تكون بارزة.
- الضغط على منطقة يحدد text unit.
- Zoom controls.
- Page navigation.

## Left Panel

أعلى اليسار:

Mini Dictionary مرتبط بالـ selected text unit.

يعرض:

- Matched characters.
- Matched glossary terms.
- Warning إذا الترجمة النهائية تخالف مصطلحًا معتمدًا.
- Button: Add Character.
- Button: Add Term.

أسفل ذلك:

قائمة text units.

كل text unit يعرض:

- Order.
- Source text.
- AI translation.
- Microsoft translation.
- Final translation editable.
- Review status.

تعديل final translation يحدث mock state.

## Right Tools

تقسم الأدوات إلى مجموعات:

- Navigation.
- Selection.
- OCR.
- Translation.
- Review.
- Typesetting.
- Export.

استخدم icons من `lucide-react`.

الأزرار يجب أن تكون واضحة بأيقونة وtooltip.

## Settings Page

أقسام:

- General.
- OCR.
- Translation.
- Storage.
- Sources.

كلها mock forms.

## Domain Types

يجب إنشاء ملف:

```text
src/types/domain.ts
```

ويحتوي أنواعًا قريبة من التالي.

```ts
export type ProjectStatus = "Active" | "Paused" | "Completed" | "Archived";

export type ChapterStatus = "Not Started" | "In Progress" | "Completed";

export type ChapterInternalStatus =
  | "Images Ready"
  | "OCR Done"
  | "Draft Translated"
  | "Human Edited"
  | "Reviewed"
  | "Typeset"
  | "Completed";

export type Gender = "Male" | "Female" | "Unknown";

export type ReviewStatus = "Not Reviewed" | "Needs Review" | "Approved";

export interface CharacterAlias {
  id: string;
  english: string;
  arabic: string;
}

export interface Character {
  id: string;
  projectId: string;
  englishName: string;
  arabicName: string;
  gender: Gender;
  aliases: CharacterAlias[];
  description?: string;
}

export interface GlossaryCategory {
  id: string;
  projectId: string;
  name: string;
}

export interface GlossaryTerm {
  id: string;
  projectId: string;
  englishTerm: string;
  arabicTerm: string;
  categoryId: string;
  categoryName: string;
  description?: string;
}

export interface Project {
  id: string;
  title: string;
  arabicTitle?: string;
  originalTitle: string;
  sourceLanguage: string;
  targetLanguage: string;
  coverUrl: string;
  status: ProjectStatus;
  lastWorkedChapterId?: string;
  lastWorkedChapterLabel?: string;
  lastModifiedAt: string;
  progress: number;
}

export interface Chapter {
  id: string;
  projectId: string;
  number: string;
  title?: string;
  displayLabel: string;
  status: ChapterStatus;
  internalStatus: ChapterInternalStatus;
  pagesCount: number;
  textUnitsCount: number;
  progress: number;
  updatedAt: string;
}

export interface Page {
  id: string;
  chapterId: string;
  index: number;
  imageUrl: string;
  width: number;
  height: number;
}

export interface RegionBox {
  type: "box";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextUnit {
  id: string;
  chapterId: string;
  pageId: string;
  order: number;
  region: RegionBox;
  sourceText: string;
  aiTranslation: string;
  microsoftTranslation: string;
  finalTranslation: string;
  reviewStatus: ReviewStatus;
  matchedCharacterIds: string[];
  matchedGlossaryTermIds: string[];
}
```

## Mock API

يجب إنشاء:

```text
src/mock/api.ts
src/mock/data.ts
```

الدوال المطلوبة:

```ts
listProjects()
getLibraryStats()
listExplorerSeries()
getExplorerSeriesDetails(externalSeriesId)
getProjectOverview(projectId)
listProjectChapters(projectId)
getProjectDictionary(projectId)
getChapterForTranslation(chapterId)
updateFinalTranslation(textUnitId, text)
addCharacter(projectId, input)
addCharacterAlias(characterId, input)
addGlossaryTerm(projectId, input)
addGlossaryCategory(projectId, name)
listSourceCatalog()
browseSourceTitles(sourceId, page)
searchSourceTitles(sourceId, query, page)
getSourceTitleDetails(sourceId, titleId)
getSourceChapterPages(sourceId, titleId, chapterId)
```

كلها mock async functions.

## Translation Workspace State

يجب إنشاء Zustand store:

```text
src/stores/translation-workspace-store.ts
```

يحفظ:

- selectedPageId.
- selectedTextUnitId.
- activeTool.
- zoom.
- leftPanelWidth.
- rightPanelWidth.

لا يحفظ البيانات القادمة من mock API إلا إذا كانت UI-only state.

## قواعد التصميم

- واجهة عمل، لا landing page.
- لا Dashboard.
- لا hero.
- لا زخارف كبيرة.
- الصفحة الأهم هي Translation Page.
- استخدم panels ثابتة ومساحات قابلة للتمرير.
- لا تجعل text unit card يتغير حجمه بشكل يكسر layout.
- النص العربي يجب أن يظهر باتجاه RTL داخل حقول الترجمة النهائية.
- أسماء المسارات والكود بالإنجليزية.
- النصوص الظاهرة يمكن أن تكون إنجليزية مبدئيًا، لكن يجب أن تكون متسقة.
- استخدم icons للأدوات لا أزرار نصية طويلة.

## حالات يجب دعمها

كل صفحة رئيسية يجب أن تملك حالات:

- Loading.
- Empty.
- Error.
- Normal.

## Acceptance Criteria

يعتبر تنفيذ الواجهة مقبولًا إذا:

- التطبيق يعمل عبر `pnpm dev`.
- كل المسارات المطلوبة تعمل.
- Library تعرض إحصائيات ومشاريع.
- Project Page تحتوي Overview/Chapters/Dictionary فقط.
- Dictionary يدعم Characters وGeneral Glossary.
- Translation Page تعرض 3 أعمدة واضحة.
- اختيار text unit يبرز region في الصورة.
- اختيار region يبرز text unit.
- final translation قابلة للتعديل عبر API الحالي أو fallback mock state.
- Mini dictionary يتغير حسب selected text unit.
- Explorer يستخدم backend مصادر حقيقي عند التشغيل داخل Electron.
- قاعدة البيانات موجودة خلف Application API، ولا تكتب الواجهة SQL مباشرة.
- لا يوجد OCR حقيقي.
- لا يوجد AI API حقيقي.

## ملاحظة نهائية للمنفذ

لا تخترع architecture جديدة. ابن الواجهة فوق `src/mock/api.ts` ودوال `window.florisApi` المتاحة عبر preload.

الهدف أن تبقى الصفحات مستقلة عن تفاصيل Electron وSQLite والمصادر الخارجية. بعض المسارات أصبحت تملك backend حقيقيًا، وما بقي من mock يجب أن يحافظ على نفس العقد حتى نستبدله تدريجيًا.

## Explorer Backend Update

طبقة الإكسبلور لم تعد mock بالكامل. توجد الآن دوال مصادر حقيقية عبر Electron:

```text
window.florisApi.listSourceCatalog()
window.florisApi.browseSourceTitles(sourceId, page)
window.florisApi.searchSourceTitles(sourceId, query, page)
window.florisApi.getSourceTitleDetails(sourceId, titleId)
window.florisApi.getSourceChapterPages(sourceId, titleId, chapterId)
```

يجب على واجهة الإكسبلور استخدام هذه الدوال بدل الاعتماد على `listExplorerSeries()` القديمة عندما تعمل داخل Electron. المصادر المبدئية هي `azora.series` و`mangaswat.series`.

ملاحظة مهمة: `canReadChapters` يعني أن المصدر يستطيع إرجاع الفصول وروابط الصفحات. أما `canDownload` فهو `false` حاليًا إلى أن ننفذ workflow تحميل/استيراد الفصل إلى قاعدة بيانات المشروع.
