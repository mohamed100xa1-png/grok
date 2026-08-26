# GPT Image 2 Studio — موقع توليد الصور

موقع متكامل لتوليد الصور باستخدام نموذج **GPT Image 2** مبني على Skill الرسمي **wuyoscar/GPT-Image2-Skill**.

> تم بناء هذا المشروع باتباع دليل الـ Skill الكامل: `SKILL.md` + `references/craft.md` + `references/gallery.md` (162 prompt منظم).

## ✨ المميزات

- **واجهة عربية/إنجليزية** RTL/LTR مع Tailwind
- **تنفيذ نفس منطق الـ Skill:**
  1. Classify request (generate / edit / inpaint / multi-reference)
  2. Search references first (gallery.md routing)
  3. Refine with craft.md
  4. Execute via CLI logic (`client.images.generate` / `client.images.edit`)
- **دعم كامل للبارامترات من الـ Skill:**
  - `-p` prompt (مطلوب)
  - `-i` reference images (متعدد) → يفعل `/v1/images/edits`
  - `-m` mask → inpaint (شفاف = إعادة توليد)
  - `--size` shortcuts: `1k, 2k, 4k, portrait, landscape, square, wide, tall` أو literal `1024x1536`
  - `--quality` low/medium/high/auto (سياسة الميزانية من الـ Skill)
  - `-n` عدد الصور، `--background`, `--moderation`, `--format`, `--compression`
- **مكتبة Prompts** من 32 فئة: Anime, Gaming, Posters, UI, Photography, Research Figures...
- **دليل Craft** مدمج (18 قاعدة للصياغة)
- **مثال جاهز:** صورة مصغرة لنمر يمشي في الغابة `tiger-forest-thumbnail.jpg`

## 🚀 التشغيل

```bash
cd image2-studio
pip install -r requirements.txt
# ضع مفتاح OpenAI
echo "OPENAI_API_KEY=sk-..." > .env

# تشغيل
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
# افتح http://localhost:8000
```

### بدون مفتاح (وضع المعاينة)
الموقع يعمل للمعاينة حتى بدون مفتاح، لكن التوليد يحتاج `OPENAI_API_KEY`.

## 🖼️ الصورة المصغرة المطلوبة

تم توليد `static/tiger-forest-thumbnail.jpg`:

> **Prompt المستخدم (مطابق لـ craft.md):**
> ```
> Photorealistic thumbnail of a majestic Bengal tiger walking gracefully through a lush green forest, morning sunlight filtering through tall trees creating soft light rays, cinematic lighting, shallow depth of field, highly detailed fur texture, mossy ground, dense foliage background, shot on Canon EOS R5 with 85mm lens, National Geographic wildlife photography style, ultra-detailed, 4K, natural colors
> ```
> **Flags:** `--size 1k --quality high --format jpeg`

## 📂 الهيكل

```
image2-studio/
├── app.py              # FastAPI backend - نفس منطق cli.py من الـ Skill
├── static/
│   ├── index.html      # واجهة كاملة RTL
│   ├── style.css
│   ├── app.js          # تنفيذ operating loop
│   └── tiger-forest-thumbnail.jpg
├── references/         # نسخة من skill references (gallery + craft)
├── outputs/            # الصور المولدة
├── SKILL.md            # دليل الـ Skill الأصلي
├── cli_reference.py    # مرجع CLI الأصلي
└── requirements.txt
```

## 🔧 كيف يطبق الـ Skill؟

من `SKILL.md`:

| Skill Rule | تطبيقنا |
|---|---|
| **Classify** | نفحص وجود `-i` لتحديد generate vs edit vs inpaint |
| **Search references** | `/api/gallery` يحلل `gallery-*.md` ويعرض 162 prompt |
| **Craft** | `/api/craft` + زر ✨ تحسين يطبق 18 قاعدة |
| **Preflight** | نتحقق من `OPENAI_API_KEY` قبل الاستدعاء |
| **Execute via CLI only** | نستخدم نفس `openai` SDK و `resolve_size` و `slugify` |
| **Quality policy** | low=مسودة رخيصة, medium=متوازن, high=نهائي |
| **Size policy** | 1k اجتماعي, portrait بوستر, landscape تصوير, 2k طباعة, 4k hero |

## 🌍 مثال استخدام CLI (من الـ Skill)

```bash
# توليد نص → صورة
gpt-image -p "a photorealistic convenience store at 10pm" --size 1k --quality high -f store.png

# تعديل بصورة مرجعية
gpt-image -p "Make it a winter evening with heavy snowfall" -i chess.png --quality high -f chess-winter.png

# Multi-reference
gpt-image -p "Place the dog from image 2 next to the woman in image 1" -i woman.png -i dog.png --size portrait -f out.png

# Inpaint بقناع
gpt-image -p "replace sky with aurora" -i photo.jpg -m sky_mask.png -f aurora.png
```

نفس المنطق مطبق في `/api/generate`.

## 📜 الرخصة

MIT - نفس رخصة Skill الأصلي + Grok repo
