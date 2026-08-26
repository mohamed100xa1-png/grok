// GPT Image 2 Studio - Frontend logic implementing skill operating loop
let currentSize = '1k';
let currentQuality = 'high';
let selectedImages = [];
let selectedMask = null;
let galleryData = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function toast(msg, ms=3000){
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    setTimeout(()=> t.classList.add('hidden'), ms);
}

// Language toggle
let isArabic = true;
$('#langToggle').addEventListener('click', ()=>{
    isArabic = !isArabic;
    document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
    document.documentElement.lang = isArabic ? 'ar' : 'en';
    toast(isArabic ? 'تم التحويل للعربية' : 'Switched to English');
});

// Size & Quality
$$('.size-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
        $$('.size-btn').forEach(b=> b.classList.remove('active','bg-white','text-black'));
        btn.classList.add('active');
        currentSize = btn.dataset.size;
        $('#customSize').value = '';
    });
});
$('#customSize').addEventListener('input', (e)=>{
    if(e.target.value.trim()){
        $$('.size-btn').forEach(b=> b.classList.remove('active'));
        currentSize = e.target.value.trim();
    }
});
$$('.quality-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
        $$('.quality-btn').forEach(b=> b.classList.remove('active'));
        btn.classList.add('active');
        currentQuality = btn.dataset.quality;
    });
});
$$('.quick-prompt').forEach(btn=>{
    btn.addEventListener('click', ()=>{
        $('#promptInput').value = btn.dataset.prompt;
        updateCharCount();
    });
});

// Char count
function updateCharCount(){
    const len = $('#promptInput').value.length;
    $('#charCount').textContent = `${len} حرف • ${Math.ceil(len/4)} tokens تقريباً`;
}
$('#promptInput').addEventListener('input', updateCharCount);

// Enhance prompt - uses craft principles
$('#enhancePrompt').addEventListener('click', ()=>{
    let p = $('#promptInput').value.trim();
    if(!p){ toast('اكتب برومبت أولاً'); return; }
    // Simple craft enhancement based on skill
    if(!p.toLowerCase().includes('lighting') && !p.includes('إضاءة')){
        p += ', soft cinematic lighting, detailed, high resolution';
    }
    if(currentSize.includes('portrait') || currentSize==='tall'){
        if(!p.toLowerCase().includes('portrait') && !p.toLowerCase().includes('vertical')){
            p = p + ' -- vertical poster composition, 3:4 aspect, elegant negative space';
        }
    }
    if(currentQuality==='high'){
        p = p + ', crisp text if any, publication-quality, 4K';
    }
    $('#promptInput').value = p;
    updateCharCount();
    toast('✨ تم تحسين البرومبت حسب craft.md');
});

// Drag & drop
const dropZone = $('#dropZone');
const imageInput = $('#imageInput');
dropZone.addEventListener('click', ()=> imageInput.click());
dropZone.addEventListener('dragover', (e)=>{ e.preventDefault(); dropZone.classList.add('border-violet-500'); });
dropZone.addEventListener('dragleave', ()=> dropZone.classList.remove('border-violet-500'));
dropZone.addEventListener('drop', (e)=>{
    e.preventDefault();
    dropZone.classList.remove('border-violet-500');
    handleFiles(e.dataTransfer.files);
});
imageInput.addEventListener('change', (e)=> handleFiles(e.target.files));

function handleFiles(files){
    for(let f of files){
        if(!f.type.startsWith('image/')) continue;
        selectedImages.push(f);
    }
    renderImagePreview();
}
function renderImagePreview(){
    const preview = $('#imagePreview');
    preview.innerHTML = '';
    selectedImages.forEach((file, idx)=>{
        const url = URL.createObjectURL(file);
        const div = document.createElement('div');
        div.className = 'relative w-20 h-20 rounded-xl overflow-hidden border border-white/10';
        div.innerHTML = `<img src="${url}" class="w-full h-full object-cover"><button data-idx="${idx}" class="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full text-[10px]">✕</button><span class="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] px-1">Image ${idx+1}</span>`;
        preview.appendChild(div);
    });
    preview.querySelectorAll('button').forEach(b=>{
        b.addEventListener('click', (e)=>{
            const i = parseInt(e.target.dataset.idx);
            selectedImages.splice(i,1);
            renderImagePreview();
        });
    });
}
$('#maskInput').addEventListener('change', (e)=>{
    if(e.target.files[0]) selectedMask = e.target.files[0];
});

// API status
async function checkApi(){
    try{
        const r = await fetch('/api/health');
        const j = await r.json();
        const dot = $('#apiStatus');
        if(j.has_api_key){
            dot.classList.add('online'); dot.classList.remove('offline');
            dot.title = 'API Key موجود • Ready';
        } else {
            dot.classList.add('offline'); dot.classList.remove('online');
            dot.title = 'API Key غير موجود - ضع OPENAI_API_KEY في .env';
        }
    }catch{
        $('#apiStatus').classList.add('offline');
    }
}
checkApi();

// Gallery loading - implements skill's "search references first"
async function loadGallery(search='', category=''){
    try{
        const params = new URLSearchParams();
        if(search) params.set('search', search);
        if(category) params.set('category', category);
        const r = await fetch('/api/gallery?'+params.toString());
        const data = await r.json();
        galleryData = data;
        renderCategories(data.categories);
        renderGalleryItems(data.items);
    }catch(e){
        $('#galleryItems').innerHTML = `<p class="text-xs text-red-400">فشل تحميل المعرض: ${e.message}</p>`;
    }
}
function renderCategories(cats){
    const el = $('#categoryList');
    el.innerHTML = '<button data-cat="" class="cat-btn active px-2.5 py-1 rounded-full bg-white text-black text-[11px] font-bold">الكل</button>';
    cats.forEach(c=>{
        const b = document.createElement('button');
        b.className = 'cat-btn px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px]';
        b.dataset.cat = c.id;
        b.textContent = `${c.name} (${c.count})`;
        el.appendChild(b);
    });
    el.querySelectorAll('.cat-btn').forEach(btn=>{
        btn.addEventListener('click', ()=>{
            el.querySelectorAll('.cat-btn').forEach(x=> x.classList.remove('active','bg-white','text-black'));
            btn.classList.add('active','bg-white','text-black');
            loadGallery($('#gallerySearch').value, btn.dataset.cat);
        });
    });
}
function renderGalleryItems(items){
    const el = $('#galleryItems');
    $('#galleryCount').textContent = items.length;
    if(!items.length){
        el.innerHTML = '<p class="text-sm text-white/30 text-center py-6">لا نتائج</p>';
        return;
    }
    el.innerHTML = '';
    items.slice(0,30).forEach(item=>{
        const div = document.createElement('div');
        div.className = 'gallery-card';
        div.innerHTML = `
            <div class="flex items-start justify-between gap-2 mb-1.5">
                <h4 class="font-bold text-[13px] leading-tight">${item.title}</h4>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 border border-white/10 whitespace-nowrap">${item.size_hint} • ${item.quality_hint}</span>
            </div>
            <p class="prompt-text">${item.prompt.slice(0,220)}...</p>
            <div class="mt-2 flex items-center justify-between">
                <span class="text-[10px] text-white/30">${item.category} • #${item.id}</span>
                <button class="use-btn text-[11px] px-2 py-1 rounded-full bg-violet-600 hover:bg-violet-500">استخدام</button>
            </div>
        `;
        div.querySelector('.use-btn').addEventListener('click', (e)=>{
            e.stopPropagation();
            $('#promptInput').value = item.prompt;
            currentSize = item.size_hint || currentSize;
            currentQuality = item.quality_hint || currentQuality;
            // update UI
            $$('.size-btn').forEach(b=> b.classList.toggle('active', b.dataset.size===currentSize));
            $$('.quality-btn').forEach(b=> b.classList.toggle('active', b.dataset.quality===currentQuality));
            updateCharCount();
            toast(`تم تحميل برومبت: ${item.title}`);
            window.scrollTo({top:0, behavior:'smooth'});
        });
        div.addEventListener('click', ()=>{
            $('#promptInput').value = item.prompt;
            updateCharCount();
        });
        el.appendChild(div);
    });
}
let searchTimeout;
$('#gallerySearch').addEventListener('input', (e)=>{
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(()=> loadGallery(e.target.value), 400);
});
loadGallery();

// Craft modal
$('#openCraft').addEventListener('click', async ()=>{
    $('#craftModal').classList.remove('hidden');
    $('#craftModal').classList.add('flex');
    try{
        const r = await fetch('/api/craft');
        const j = await r.json();
        $('#craftContent').textContent = j.content.slice(0,20000);
    }catch{
        $('#craftContent').textContent = 'فشل التحميل';
    }
});
$('#closeCraft').addEventListener('click', ()=>{
    $('#craftModal').classList.add('hidden');
    $('#craftModal').classList.remove('flex');
});

// Generate - implements skill's execute via CLI only logic but via API
$('#generateBtn').addEventListener('click', async ()=>{
    const prompt = $('#promptInput').value.trim();
    if(!prompt){ toast('اكتب البرومبت أولاً'); return; }

    const btn = $('#generateBtn');
    const spinner = $('#genSpinner');
    btn.disabled = true;
    btn.classList.add('opacity-60');
    spinner.classList.remove('hidden');

    // Prepare form - same flags as CLI
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('size', currentSize);
    form.append('quality', currentQuality);
    form.append('n', $('#nSelect').value);
    const bg = $('#bgSelect').value;
    if(bg) form.append('background', bg);
    form.append('moderation', $('#modSelect').value);
    form.append('format', $('#formatSelect').value);
    form.append('model', 'gpt-image-2');

    selectedImages.forEach(f=> form.append('images', f));
    if(selectedMask) form.append('mask', selectedMask);

    // Determine endpoint mode for UI
    const mode = selectedImages.length ? 'edit' : 'generate';
    toast(`جاري التوليد عبر ${mode} • ${currentSize} • ${currentQuality}...`, 4000);

    try{
        const r = await fetch('/api/generate', { method:'POST', body: form });
        const j = await r.json();
        if(!r.ok){
            throw new Error(j.detail || 'فشل التوليد');
        }
        renderResults(j);
        addToHistory(prompt, j);
        toast(`✅ تم توليد ${j.images.length} صورة`);
    }catch(e){
        console.error(e);
        // Show error with guidance from skill
        $('#resultsGrid').innerHTML = `
            <div class="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm">
                <p class="font-bold text-red-300">خطأ في التوليد</p>
                <p class="text-white/60 mt-1 text-xs leading-relaxed">${e.message}</p>
                <p class="text-[11px] text-white/30 mt-2">تأكد من وجود OPENAI_API_KEY في .env • اقرأ SKILL.md للقواعد • إذا كان الخطأ moderation، جرب صياغة أخرى حسب craft.md</p>
            </div>
        ` + $('#resultsGrid').innerHTML;
        toast('❌ ' + e.message, 5000);
    }finally{
        btn.disabled = false;
        btn.classList.remove('opacity-60');
        spinner.classList.add('hidden');
    }
});

function renderResults(data){
    const grid = $('#resultsGrid');
    // Clear placeholder if exists
    if(grid.textContent.includes('الصور المولدة ستظهر هنا')){
        grid.innerHTML = '';
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'space-y-3';
    wrapper.innerHTML = `<div class="flex items-center justify-between"><span class="text-xs text-white/50">${new Date().toLocaleTimeString()} • ${data.size} • ${data.quality} • ${data.endpoint}</span><span class="text-[10px] px-2 py-0.5 rounded-full bg-violet-600">${data.model}</span></div>`;
    
    data.images.forEach((img, i)=>{
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
            <img src="data:image/${img.format};base64,${img.b64}" alt="generated ${i}">
            <div class="p-3 flex items-center justify-between">
                <span class="text-xs text-white/50">${img.filename}</span>
                <div class="flex gap-1">
                    <a href="${img.url}" download class="px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[11px]">تحميل</a>
                    <button class="copy-btn px-2 py-1 rounded-full bg-white text-black text-[11px] font-bold" data-b64="${img.b64.slice(0,20)}">نسخ</button>
                </div>
            </div>
        `;
        // Copy base64 not needed, but provide download via blob
        const blobUrl = `data:image/${img.format};base64,${img.b64}`;
        card.querySelector('a').href = blobUrl;
        card.querySelector('a').download = img.filename;
        wrapper.appendChild(card);
    });
    // Add prompt used
    const promptEl = document.createElement('div');
    promptEl.className = 'text-[11px] text-white/30 bg-white/[0.03] border border-white/5 rounded-xl p-3';
    promptEl.textContent = data.prompt.slice(0,300);
    wrapper.appendChild(promptEl);

    grid.prepend(wrapper);
}

function addToHistory(prompt, data){
    const hist = JSON.parse(localStorage.getItem('g2_history')||'[]');
    hist.unshift({ prompt: prompt.slice(0,120), time: new Date().toISOString(), count: data.images.length, size: data.size, quality: data.quality });
    localStorage.setItem('g2_history', JSON.stringify(hist.slice(0,20)));
    renderHistory();
}
function renderHistory(){
    const hist = JSON.parse(localStorage.getItem('g2_history')||'[]');
    const el = $('#historyList');
    if(!hist.length){ el.innerHTML = '<p>لا يوجد سجل بعد</p>'; return; }
    el.innerHTML = '';
    hist.forEach(h=>{
        const d = document.createElement('div');
        d.className = 'flex items-center justify-between py-1.5 border-b border-white/5 last:border-0';
        d.innerHTML = `<span class="truncate max-w-[200px]">${h.prompt}</span><span class="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">${h.size} • ${h.quality}</span>`;
        d.addEventListener('click', ()=>{
            $('#promptInput').value = h.prompt;
            updateCharCount();
        });
        el.appendChild(d);
    });
}
renderHistory();

$('#clearResults').addEventListener('click', ()=>{
    $('#resultsGrid').innerHTML = '<div class="rounded-2xl border border-dashed border-white/10 p-8 text-center"><div class="text-3xl mb-3">✨</div><p class="text-sm text-white/50">الصور المولدة ستظهر هنا</p></div>';
});

// Initial char count
updateCharCount();
