"""
GPT Image 2 Studio - Web app based on wuyoscar/GPT-Image2-Skill
Implements the skill's operating loop: classify, search references, craft, execute via CLI logic
"""
from __future__ import annotations

import base64
import os
import re
import uuid
import tempfile
from pathlib import Path
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load env chain like CLI: process env -> ./.env -> ~/.env
load_dotenv(Path.cwd() / ".env", override=False)
load_dotenv(Path.home() / ".env", override=False)
load_dotenv(Path(__file__).parent / ".env", override=False)

# Size shortcuts from skill
SIZE_SHORTCUTS = {
    "1k": "1024x1024",
    "2k": "2048x2048",
    "4k": "3840x2160",
    "portrait": "1024x1536",
    "landscape": "1536x1024",
    "square": "1024x1024",
    "wide": "2048x1152",
    "tall": "2160x3840",
}

DEFAULT_MODEL = "gpt-image-2"
DEFAULT_SIZE = "1024x1024"

app = FastAPI(title="GPT Image 2 Studio", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
REF_DIR = BASE_DIR / "references"
OUTPUT_DIR = BASE_DIR / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

# Mount static
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

def resolve_size(value: str) -> str:
    if not value:
        return DEFAULT_SIZE
    return SIZE_SHORTCUTS.get(value.lower().strip(), value.strip())

def slugify(text: str, max_len: int = 30) -> str:
    s = re.sub(r"[^\w\s-]", "", text.lower()).strip()
    s = re.sub(r"[-\s]+", "-", s)[:max_len]
    return s or "image"

def parse_gallery_file(md_path: Path):
    """Parse gallery markdown into list of items"""
    content = md_path.read_text(encoding="utf-8", errors="ignore")
    items = []
    # Pattern: ### No. XX · Title
    pattern = re.compile(r"### No\. (\d+)\s*·\s*(.+?)\n(.*?)(?=\n### No\. |\Z)", re.DOTALL)
    for match in pattern.finditer(content):
        num = match.group(1)
        title = match.group(2).strip()
        block = match.group(3)

        # extract metadata line
        meta_match = re.search(r"Metadata:\s*(.+)", block)
        metadata = meta_match.group(1).strip() if meta_match else ""

        # extract size/quality hints from metadata
        size_hint = None
        quality_hint = None
        # look for `portrait` etc in metadata
        for token in re.findall(r"`([^`]+)`", metadata):
            tl = token.lower()
            if tl in SIZE_SHORTCUTS or "x" in tl:
                size_hint = token
            if tl in ["low","medium","high","auto"]:
                quality_hint = token

        # extract prompt in ```text block
        prompt_match = re.search(r"```(?:text)?\n(.*?)```", block, re.DOTALL)
        prompt = prompt_match.group(1).strip() if prompt_match else ""

        # image path
        img_match = re.search(r"Image:\s*`([^`]+)`", block)
        img_path = img_match.group(1).strip() if img_match else ""

        if prompt:
            items.append({
                "id": int(num),
                "title": title,
                "prompt": prompt,
                "metadata": metadata,
                "size_hint": size_hint or "1k",
                "quality_hint": quality_hint or "high",
                "image_path": img_path,
                "category": md_path.stem.replace("gallery-","").replace("-"," ").title()
            })
    return items

# Cache gallery
GALLERY_CACHE = None

def load_gallery():
    global GALLERY_CACHE
    if GALLERY_CACHE is not None:
        return GALLERY_CACHE
    all_items = []
    categories = []
    if REF_DIR.exists():
        for md_file in sorted(REF_DIR.glob("gallery-*.md")):
            if md_file.name == "gallery.md":
                continue
            try:
                items = parse_gallery_file(md_file)
                cat_name = md_file.stem.replace("gallery-","").replace("-"," ").title()
                categories.append({
                    "file": md_file.name,
                    "name": cat_name,
                    "count": len(items),
                    "id": md_file.stem
                })
                all_items.extend(items)
            except Exception as e:
                print(f"Failed to parse {md_file}: {e}")
    GALLERY_CACHE = {"items": all_items, "categories": categories}
    return GALLERY_CACHE

@app.get("/api/health")
def health():
    has_key = bool(os.environ.get("OPENAI_API_KEY"))
    return {"status": "ok", "has_api_key": has_key, "model": DEFAULT_MODEL}

@app.get("/api/gallery")
def get_gallery(category: Optional[str] = None, search: Optional[str] = None):
    data = load_gallery()
    items = data["items"]
    if category:
        # filter by category id or name
        items = [i for i in items if category.lower() in i["category"].lower() or category.lower() in i.get("title","").lower()]
    if search:
        s = search.lower()
        items = [i for i in items if s in i["title"].lower() or s in i["prompt"].lower() or s in i["category"].lower()]
    # limit to 100 for performance
    return {"categories": data["categories"], "items": items[:200], "total": len(items)}

@app.get("/api/craft")
def get_craft():
    craft_path = REF_DIR / "craft.md"
    if craft_path.exists():
        return {"content": craft_path.read_text(encoding="utf-8")}
    return {"content": "# Craft guide not found"}

@app.get("/api/skill")
def get_skill():
    skill_path = BASE_DIR / "SKILL.md"
    if skill_path.exists():
        return {"content": skill_path.read_text(encoding="utf-8")}
    return {"content": ""}

@app.post("/api/generate")
async def generate_image(
    prompt: str = Form(...),
    size: str = Form(DEFAULT_SIZE),
    quality: str = Form("high"),
    n: int = Form(1),
    background: Optional[str] = Form(None),
    moderation: Optional[str] = Form("low"),
    format: Optional[str] = Form("png"),
    compression: Optional[int] = Form(None),
    model: str = Form(DEFAULT_MODEL),
    images: List[UploadFile] = File(default=[]),
    mask: Optional[UploadFile] = File(default=None),
):
    # Validation
    if not prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")
    
    if n < 1 or n > 10:
        raise HTTPException(status_code=400, detail="n must be between 1 and 10")
    
    # Check API key
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        # Return mock for demo if no key - helpful for UI testing
        # But also provide clear error
        raise HTTPException(status_code=400, detail="OPENAI_API_KEY not set. Please set it in .env file or environment. For demo, the UI will work but generation requires a key.")
    
    # Resolve size
    resolved_size = resolve_size(size)
    
    # Prepare temp files for uploaded images
    temp_files = []
    image_handles = []
    mask_handle = None
    
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        
        # Save uploaded images to temp
        input_image_paths = []
        for img in images:
            if img.filename:
                suffix = Path(img.filename).suffix or ".png"
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
                content = await img.read()
                tmp.write(content)
                tmp.close()
                input_image_paths.append(Path(tmp.name))
                temp_files.append(tmp.name)
        
        mask_path = None
        if mask and mask.filename:
            suffix = Path(mask.filename).suffix or ".png"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            content = await mask.read()
            tmp.write(content)
            tmp.close()
            mask_path = Path(tmp.name)
            temp_files.append(tmp.name)
        
        # Build kwargs
        common_kwargs = {
            "model": model,
            "prompt": prompt,
            "size": resolved_size,
            "quality": quality,
            "n": n,
        }
        if background:
            common_kwargs["background"] = background
        if format:
            common_kwargs["output_format"] = format
        if compression is not None:
            common_kwargs["output_compression"] = compression
        
        # Decide endpoint
        if input_image_paths:
            # Edit endpoint
            # Open handles
            for p in input_image_paths:
                if not p.is_file():
                    raise HTTPException(status_code=400, detail=f"Image not found: {p}")
                image_handles.append(open(p, "rb"))
            if mask_path:
                if not mask_path.is_file():
                    raise HTTPException(status_code=400, detail="Mask not found")
                mask_handle = open(mask_path, "rb")
            
            # gpt-image-2 rejects input_fidelity, so we don't send it
            edit_kwargs = common_kwargs.copy()
            edit_kwargs["image"] = image_handles
            if mask_handle:
                edit_kwargs["mask"] = mask_handle
            # moderation not applicable to edits in same way, but API may accept?
            # According to skill, moderation is generations only
            edit_kwargs.pop("moderation", None)
            if "moderation" in common_kwargs:
                # Keep only for generations
                pass
            
            # Filter None
            edit_kwargs = {k: v for k, v in edit_kwargs.items() if v is not None}
            
            response = client.images.edit(**edit_kwargs)
        else:
            # Generate endpoint
            if moderation:
                common_kwargs["moderation"] = moderation
            gen_kwargs = {k: v for k, v in common_kwargs.items() if v is not None}
            response = client.images.generate(**gen_kwargs)
        
        # Save outputs
        saved_files = []
        result_images = []
        timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
        slug = slugify(prompt)
        
        for i, item in enumerate(response.data):
            b64 = getattr(item, "b64_json", None)
            url = getattr(item, "url", None)
            if b64:
                raw = base64.b64decode(b64)
            elif url:
                import urllib.request
                with urllib.request.urlopen(url, timeout=300) as r:
                    raw = r.read()
            else:
                continue
            
            # Determine extension
            ext = format or "png"
            if n == 1:
                fname = f"{timestamp}-{slug}.{ext}"
            else:
                fname = f"{timestamp}-{slug}_{i}.{ext}"
            fpath = OUTPUT_DIR / fname
            fpath.write_bytes(raw)
            saved_files.append(str(fpath))
            
            # Return base64 for immediate display
            b64_out = base64.b64encode(raw).decode("utf-8")
            result_images.append({
                "b64": b64_out,
                "format": ext,
                "filename": fname,
                "url": f"/outputs/{fname}"
            })
        
        return {
            "success": True,
            "images": result_images,
            "files": saved_files,
            "prompt": prompt,
            "size": resolved_size,
            "quality": quality,
            "model": model,
            "endpoint": "edit" if input_image_paths else "generate"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        # Surface API errors verbatim as per skill
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for h in image_handles:
            try:
                h.close()
            except:
                pass
        if mask_handle:
            try:
                mask_handle.close()
            except:
                pass
        for tf in temp_files:
            try:
                os.unlink(tf)
            except:
                pass

# Serve outputs
app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")

@app.get("/")
def root():
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return {"message": "GPT Image 2 Studio - frontend not built yet"}

# Catch-all for SPA
@app.get("/{full_path:path}")
def spa_fallback(full_path: str):
    # If requesting api, let 404 handle
    if full_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    index_path = STATIC_DIR / "index.html"
    if index_path.exists() and "." not in full_path.split("/")[-1]:
        return FileResponse(str(index_path))
    return JSONResponse(status_code=404, content={"detail": "Not found"})
