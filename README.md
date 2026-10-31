# وش السالفة؟ — موقع أخبار مستقل + لوحة إدارة + استيراد RSS

## بنية المشروع
- `index.html`, `styles.css`, `app.js`: الموقع العام.
- `admin.html`, `admin.css`, `admin.js`: لوحة الإدارة.
- `config.example.js`: نموذج إعداد Supabase.
- `supabase/schema.sql`: قاعدة البيانات وسياسات الوصول.
- `supabase/functions/import-rss/index.ts`: وظيفة استيراد RSS إلى قائمة انتظار المراجعة.
- `.github/workflows/import-rss.yml`: تشغيل الاستيراد المجدول كل 3 ساعات تقريباً.

## 1) إنشاء قاعدة البيانات المجانية
1. أنشئ مشروعاً في Supabase.
2. افتح SQL Editor والصق محتوى `supabase/schema.sql` ثم Run.
3. من Authentication > Users أنشئ مستخدم مدير (بريد وكلمة مرور).
4. عطّل التسجيل العام (Allow new users to sign up) من إعدادات Authentication.
5. من Project Settings > API انسخ Project URL و anon/public key.
6. انسخ `config.example.js` إلى `config.js` وضع القيم:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   لا تضع service_role key في ملفات الموقع أبداً.

## 2) تجربة محلية
شغّل مجلد المشروع عبر خادم ملفات محلي، مثلاً VS Code Live Server، ثم افتح:
- `/index.html` للموقع.
- `/admin.html` للوحة التحكم.
لا تستخدم `file://` مباشرة لأن تسجيل الدخول وطلبات قاعدة البيانات تحتاج origin عبر HTTP.

## 3) نشر الواجهة مجاناً
1. أنشئ GitHub repository وارفع محتويات المجلد إلى الجذر.
2. أضف `config.js` بقيم Supabase العامة. هذه القيم مخصصة للمتصفح؛ أمان البيانات يعتمد على RLS.
3. Settings > Pages > Deploy from a branch > main > /(root).
4. أضف دومينك لاحقاً إن رغبت. يمكن أيضاً استخدام Cloudflare Pages أو Netlify.

## 4) تشغيل مستورد RSS
1. ثبّت Supabase CLI وسجّل الدخول واربط المشروع.
2. أنشئ قيمة طويلة عشوائية كـ RSS_CRON_SECRET.
3. خزّن أسرار الوظيفة:
   `supabase secrets set RSS_CRON_SECRET=YOUR_LONG_RANDOM_SECRET`
   `supabase secrets set SUPABASE_URL=https://YOUR-PROJECT.supabase.co`
   `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY`
4. انشر الوظيفة:
   `supabase functions deploy import-rss --no-verify-jwt`
5. في GitHub repository > Settings > Secrets and variables > Actions أضف:
   - `SUPABASE_FUNCTION_URL` = `https://YOUR-PROJECT.supabase.co/functions/v1/import-rss`
   - `RSS_CRON_SECRET` = نفس السر الذي خزّنته في Supabase.
6. من Actions شغّل workflow يدوياً للتجربة، وبعدها يعمل الجدول كل 3 ساعات تقريباً.

## 5) سير العمل التحريري
- مستورد RSS يجلب عناوين وروابط ووصفاً من الخلاصات ويضيفها بحالة `pending`.
- المحرر يسجل الدخول إلى `admin.html`.
- يراجع الخبر، يعدّل العنوان والوصف والنص والصورة، ثم يضغط «نشر» أو «رفض».
- الموقع العام يعرض حالة `published` فقط.

## ملاحظات مهمة جداً
- الأخبار لا تنشر تلقائياً: الاستيراد إلى قائمة انتظار المراجعة فقط.
- راجع شروط استخدام كل مصدر RSS وحقوق إعادة نشر النصوص والصور. بعض المصادر قد لا توفر RSS عاماً أو قد تغيّر عنوانه؛ حدّث قائمة `feeds` في الوظيفة حسب المصادر المسموح بها.
- مستورد RSS الحالي بسيط ويتعامل مع RSS/Atom الشائع. قد تحتاج بعض الخلاصات معالجة خاصة، والصور لا تُستخرج من كل المصادر.
- لا تستخدم `service_role` في `config.js` أو أي ملف عام.
- سياسة RLS في المثال تسمح لأي حساب authenticated بإدارة المقالات؛ لذلك عطّل التسجيل العام ولا تنشئ إلا حسابات محررين موثوقين. لعدة أدوار وصلاحيات أدق أضف جدول profiles وأدواراً.
- هذه نسخة MVP عملية، وليست منصة إنتاجية كاملة بعد. قبل إطلاق عام، أضف نسخاً احتياطية، مراقبة للأخطاء، سياسة خصوصية، وصفحة تصحيح/مصادر، ومراجعة قانونية للمحتوى.
