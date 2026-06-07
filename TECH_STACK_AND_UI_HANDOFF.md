# التقنية المعتمدة وتكليف بناء الواجهة

## الهدف

هذا الملف يحدد التقنيات المقترحة للمشروع، ثم يعطي تكليفًا واضحًا لأي AI أو مطور سيبني واجهة المستخدم.

القاعدة: نبني برنامجًا قابلًا للتعديل والتوسع، لا واجهة مؤقتة يصعب ربطها لاحقًا.

## التقنية المعتمدة

## 1. نوع التطبيق

الاختيار:

```text
Desktop app using Tauri v2
```

السبب:

- البرنامج يحتاج وصولًا محليًا للملفات والصور.
- البرنامج يحتاج قاعدة بيانات محلية.
- البرنامج يحتاج تشغيل OCR وعمليات طويلة.
- Tauri يسمح بواجهة Web حديثة مع backend محلي قوي.
- أخف من Electron عادة، ومناسب لتطبيق طويل العمر.

## 2. الواجهة

الاختيار:

```text
React + TypeScript + Vite
```

السبب:

- React مناسب لبناء واجهات غنية ومعقدة.
- TypeScript ضروري لأن المشروع كبير وسيعيش طويلًا.
- Vite سريع ومباشر لتطبيقات React.
- يمكن بناء الواجهة أولًا كتطبيق Web محلي ثم لفها داخل Tauri لاحقًا.

## 3. التصميم والمكونات

الاختيار:

```text
Tailwind CSS v4
shadcn/ui
Radix UI primitives
lucide-react icons
```

السبب:

- Tailwind يعطي تحكمًا سريعًا ودقيقًا بالتصميم.
- shadcn/ui مناسب لأنه ينسخ المكونات داخل المشروع بدل الاعتماد على مكتبة مغلقة.
- Radix يعطي primitives جيدة للتبويبات، القوائم، الحوارات، القوائم المنسدلة.
- lucide-react مناسب للأيقونات داخل أزرار الأدوات.

## 4. التنقل

الاختيار:

```text
React Router
```

السبب:

- كاف لمسارات التطبيق الحالية.
- معروف وسهل على AI أو مطور آخر.
- مناسب لتقسيم الصفحات:
  - Explorer.
  - Library.
  - Project page.
  - Translation page.
  - Settings.

## 5. حالة الواجهة والبيانات

الاختيار:

```text
TanStack Query
Zustand
```

الاستخدام:

- TanStack Query للبيانات القادمة من Application Layer لاحقًا.
- Zustand لحالة الواجهة المحلية:
  - الصفحة الحالية داخل الفصل.
  - النص المحدد.
  - مستوى التكبير.
  - اللوحات المفتوحة.
  - أداة التحرير النشطة.

## 6. الجداول والقوائم الكبيرة

الاختيار:

```text
TanStack Table
TanStack Virtual
```

الاستخدام:

- TanStack Table لجداول:
  - Chapters.
  - Characters.
  - General Glossary.
- TanStack Virtual لقوائم طويلة:
  - text units.
  - صفحات كثيرة.
  - مشاريع كثيرة لاحقًا.

## 7. النماذج والتحقق

الاختيار:

```text
React Hook Form
Zod
```

الاستخدام:

- نماذج إضافة شخصية.
- نماذج إضافة مصطلح.
- إعدادات المشروع.
- إعدادات المزودات.

## 8. عارض الصفحات والفقاعات

الاختيار للنسخة الأولى:

```text
Image viewer + SVG overlay
```

الاستخدام:

- الصورة تعرض كـ `img`.
- الفقاعات ومناطق OCR تعرض فوقها بـ SVG.
- يمكن تحديد فقاعة أو إبرازها.
- لا نحتاج Canvas مبكرًا.

لاحقًا يمكن استخدام:

```text
react-konva
```

إذا دخلنا مرحلة تايبست بصري متقدم.

## 9. قاعدة البيانات

الاختيار:

```text
SQLite
```

لكن الواجهة لا تتعامل مع SQLite مباشرة.

الوصول يكون عبر:

```text
Application Layer
Repositories
Tauri commands
```

## 10. Backend المحلي

الاختيار:

```text
Rust backend inside Tauri
```

مسؤول عن:

- SQLite.
- migrations.
- الملفات والأصول.
- jobs.
- تشغيل sidecars لاحقًا مثل OCR.
- استدعاء مزودات الترجمة.

## 11. الاختبارات

الاختيار:

```text
Vitest
React Testing Library
Playwright
```

الاستخدام:

- Vitest لاختبار المنطق والمكونات.
- React Testing Library لاختبار سلوك الواجهة.
- Playwright لفحص الشاشات الأساسية بصريًا وتفاعليًا.

## 12. مدير الحزم

الاختيار:

```text
pnpm
```

## ما لا نستخدمه الآن

## Next.js

لا نحتاجه الآن لأن التطبيق ليس موقع SSR ولا يحتاج SEO.

## Electron

لا نبدأ به كخيار افتراضي لأن Tauri أنسب إذا أردنا تطبيقًا محليًا خفيفًا مع backend Rust وقاعدة بيانات محلية وعمليات طويلة.

لكن Electron ليس مرفوضًا تقنيًا. هو خيار صالح إذا قررنا أن backend يجب أن يكون JavaScript/Node بدل Rust.

المقارنة العملية:

```text
Tauri
+ أخف عادة.
+ backend Rust قوي للملفات، SQLite، jobs، وعمليات النظام.
+ صلاحيات أوضح وأكثر صرامة.
+ مناسب لتطبيق طويل العمر إذا قبلنا كتابة backend بـ Rust.
- يحتاج خبرة Rust.
- تغليف sidecars وإعداد الصلاحيات يحتاجان ضبطًا دقيقًا.

Electron
+ أسهل إذا كان الفريق يريد JavaScript/Node في كل شيء.
+ تشغيل Python/Tesseract عبر child_process مباشر وبسيط.
+ بيئة ناضجة جدًا لتطبيقات سطح المكتب.
- أثقل عادة لأنه يأتي مع Chromium وNode.
- يحتاج انضباطًا أمنيًا أعلى بين main/renderer.
- native modules والتغليف قد يضيفان تعقيدًا حسب الحزم.
```

القرار الحالي:

```text
نبني الواجهة React/Vite بشكل مستقل عن Tauri أو Electron.
نستخدم Tauri كاختيار افتراضي للتطبيق النهائي.
نترك Electron كبديل إذا تبين أن تشغيل OCR/Python sidecars أو سرعة التطوير أهم من خفة التطبيق وbackend Rust.
```

## توافق OCR مع التقنية

محركات OCR لا تعمل داخل React مباشرة. يجب أن تعمل كـ worker/sidecar خلف `OcrProvider`.

المحركات المتوقعة:

```text
PaddleOCR  -> غالبًا Python package أو خدمة محلية.
Manga OCR  -> غالبًا Python package.
Tesseract  -> binary/CLI أو wrapper.
Cloud OCR  -> API provider.
```

التصميم الصحيح:

```text
UI
↓
RunOcrUseCase
↓
Job Layer
↓
OcrProvider Interface
↓
PaddleOCR / Tesseract / MangaOCR / Cloud Provider
```

بهذا لا يهم إن كان التطبيق النهائي Tauri أو Electron. الفرق فقط في Adapter الذي يشغل OCR:

```text
Tauri Adapter    -> shell sidecar / Rust command / local service
Electron Adapter -> Node child_process / local service
```

الواجهة لا تتغير.

## Redux

لا نحتاجه الآن. Zustand أبسط لحالة الواجهة، وTanStack Query يغطي بيانات الخادم أو Application Layer.

## Canvas كامل من البداية

لا نحتاجه في MVP. عارض صورة مع SVG overlay يكفي لصفحة الترجمة الأولى.

## تكليف AI لبناء الواجهة

انسخ القسم التالي للـ AI الآخر، وأرفق معه ملف:

```text
UI_IMPLEMENTATION_CONTRACT.md
```

هذا الملف هو المرجع التفصيلي للمسارات، الأنواع، mock API، وحالات القبول.

```text
You are building the UI only for a manhwa translation desktop app.

Use:
- React
- TypeScript
- Vite
- Tailwind CSS v4
- shadcn/ui
- lucide-react
- React Router
- TanStack Query
- Zustand
- TanStack Table
- React Hook Form
- Zod

Do not build backend logic.
Do not connect to SQLite yet.
Do not implement OCR or translation providers.
Use mock data and a mock application API layer.

The app is designed as a future Tauri desktop app, but the UI should run in the browser during development.

Required pages:

1. Library
- No dashboard page.
- At the top, show simple stats:
  - Last worked chapter.
  - Last modified time.
  - Active projects count.
  - Chapters in progress.
  - Completed chapters.
- Show project cards/list.
- Each project shows:
  - Cover.
  - Project name.
  - Original name.
  - Last worked chapter.
  - Last modified.
  - Progress.
  - Status.

2. Explorer
- Shows sources and manhwa list.
- Can be built with mock data.
- Opens a manhwa details page from Explorer.

3. Manhwa Project Page
- Use exactly three main tabs:
  - Overview
  - Chapters
  - Dictionary

Overview:
- Project name.
- Original title.
- Chapters count.
- Characters count.
- General terms count.
- Last worked chapter.
- Last modified.
- Project context summary.

Chapters:
- Table/list of chapters.
- Chapter statuses:
  - Not Started
  - In Progress
  - Completed
- Show internal progress as secondary detail when useful:
  - Images Ready
  - OCR Done
  - Draft Translated
  - Human Edited
  - Reviewed
  - Typeset
  - Completed

Dictionary:
- Two inner sections:
  - Characters
  - General Glossary

Characters fields:
- English Name
- Arabic Name
- Gender: Male, Female, Unknown only
- Aliases, each alias has English and Arabic values
- Description, optional

General Glossary fields:
- English Term
- Arabic Term
- Category
- Description, optional
- Category must be user-addable.

4. Translation Page
- Main working screen.
- Center: manhwa pages.
- Right: tools.
- Left: text and translations.
- Top-left inside the left panel: mini dictionary related to the selected text unit.
- The mini dictionary is not the full dictionary.
- It shows matched characters and terms for the selected text unit.
- Text unit card must show:
  - Source/OCR text.
  - AI translation.
  - Microsoft translation.
  - Final translation.
  - Review status.
- Selecting a text unit highlights its region on the page.
- Selecting a region highlights its text unit.

5. Settings
- Sections:
  - General.
  - OCR.
  - Translation.
  - Storage.
  - Sources.

Design requirements:
- Build an actual work tool, not a marketing landing page.
- Dense but clean interface.
- No decorative hero sections.
- No dashboard.
- Use icons for tool buttons.
- Use fixed/responsive panel dimensions so the translation page does not shift.
- Support RTL layout where Arabic text appears.
- Internal route names can be English.
- Display labels may be Arabic or English, but be consistent.

Architecture requirements:
- UI components must not call database or providers directly.
- Create a mock API layer such as:
  - listProjects()
  - getProjectOverview(projectId)
  - listChapters(projectId)
  - getDictionary(projectId)
  - getChapterForTranslation(chapterId)
  - updateFinalTranslation(textUnitId, text)
- Keep mock data in a separate folder.
- Keep reusable components separate from page components.

Suggested folder structure:

src/
├─ app/
│  ├─ router.tsx
│  └─ providers.tsx
├─ ui/
│  ├─ components/
│  ├─ layout/
│  └─ primitives/
├─ features/
│  ├─ library/
│  ├─ explorer/
│  ├─ project/
│  ├─ dictionary/
│  ├─ translation/
│  └─ settings/
├─ mock/
│  ├─ api.ts
│  └─ data.ts
├─ stores/
│  └─ translation-workspace-store.ts
└─ types/
   └─ domain.ts

Deliverables:
- Working Vite React app.
- All required pages connected by routing.
- Mock data visible in every page.
- Translation page layout implemented.
- No backend integration.
- No OCR implementation.
- No AI translation implementation.
```

## ملاحظات للمنفذ

لا تبن صفحة جميلة فقط. المطلوب واجهة عمل.

أهم شاشة هي `Translation Page`. يجب أن تكون قابلة للاستخدام فعلًا:

- اختيار صفحة.
- اختيار text unit.
- رؤية الترجمات الثلاث.
- تعديل الترجمة النهائية.
- رؤية قاموس مصغر مرتبط بالنص.
- رؤية أدوات اليمين.

إذا نجحت هذه الصفحة، بقية التطبيق سيكون أسهل.

## مصادر تقنية رسمية

- Tauri v2 docs: https://v2.tauri.app/
- Tauri file system plugin: https://v2.tauri.app/plugin/file-system/
- Tauri SQL plugin: https://v2.tauri.app/reference/javascript/sql/
- React docs: https://react.dev/
- Vite docs: https://vite.dev/guide/
- Tailwind CSS docs: https://tailwindcss.com/docs
- shadcn/ui docs: https://ui.shadcn.com/docs/components
- TanStack Query docs: https://tanstack.com/query/
