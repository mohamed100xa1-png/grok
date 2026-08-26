"""Optional SkyworkAI Matrix-Game bridge for Street Rush.

The browser game remains fully playable without this bridge. When Matrix-Game 3.0
and its checkpoint are installed on a compatible NVIDIA GPU, this module starts
an isolated generation job and exposes its output to the local game server.

The upstream project is intentionally not vendored here because its model
weights are several gigabytes and its runtime expects a Linux CUDA environment.
Configure it with:

    MATRIX_GAME_ROOT=/path/to/Matrix-Game/Matrix-Game-3
    MATRIX_GAME_CHECKPOINT=/path/to/Matrix-Game-3-checkpoint

The public source is https://github.com/SkyworkAI/Matrix-Game.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any


MATRIX_SOURCE = "https://github.com/SkyworkAI/Matrix-Game"
REGION_PROMPTS = {
    "city": "A cinematic realistic open-world street racing game in a dense modern megacity at dusk, wet asphalt, neon signs, black performance car, dynamic chase camera, fast traffic and dramatic reflections.",
    "mountains": "A cinematic realistic open-world driving game on a winding alpine mountain road, snow-capped peaks, guardrails, warm sunrise light, a black performance car, dynamic chase camera.",
    "forest": "A cinematic realistic open-world street racing game through a dense forest highway, mist between tall trees, narrow wet road, a black performance car, dynamic chase camera.",
    "lakes": "A cinematic realistic open-world driving game beside a blue mountain lake, winding roads, pine forests, golden evening light, a black performance car, dynamic chase camera.",
    "industry": "A cinematic realistic open-world street race through an industrial district, warehouses, cranes, sodium lights, wet concrete and a black performance car, dynamic chase camera.",
    "coast": "A cinematic realistic open-world coastal highway race, ocean cliffs, palm trees, late sunlight and a black performance car, dynamic chase camera.",
    "desert": "A cinematic realistic open-world desert pursuit on a dusty highway, red rock formations, heat haze, dramatic sunset and a black performance car, dynamic chase camera.",
    "airport": "A cinematic realistic open-world night race around a modern airport, runway lights, hangars, rain-slick roads and a black performance car, dynamic chase camera.",
}


class MatrixBridge:
    """Small process bridge that keeps Matrix-Game optional and non-blocking."""

    def __init__(self, project_root: Path) -> None:
        self.project_root = project_root.resolve()
        self.output_root = self.project_root / "matrix-output"
        self.output_root.mkdir(exist_ok=True)
        self._jobs: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def configured_root(self) -> Path:
        configured = os.environ.get("MATRIX_GAME_ROOT", "").strip()
        if configured:
            root = Path(configured).expanduser().resolve()
        else:
            # Useful defaults for a sibling clone or a deliberately vendored copy.
            candidates = [
                self.project_root.parent / "Matrix-Game" / "Matrix-Game-3",
                self.project_root / "vendor" / "Matrix-Game" / "Matrix-Game-3",
            ]
            root = next((candidate.resolve() for candidate in candidates if candidate.exists()), candidates[0].resolve())
        if (root / "Matrix-Game-3").is_dir() and not (root / "generate.py").exists():
            root = root / "Matrix-Game-3"
        return root

    def checkpoint_path(self) -> Path | None:
        configured = os.environ.get("MATRIX_GAME_CHECKPOINT", "").strip()
        if not configured:
            return None
        return Path(configured).expanduser().resolve()

    def status(self) -> dict[str, Any]:
        root = self.configured_root()
        checkpoint = self.checkpoint_path()
        generator = root / "generate.py"
        repo_ready = generator.is_file()
        checkpoint_ready = checkpoint is not None and checkpoint.exists()
        gpu_available = shutil.which("nvidia-smi") is not None
        ready = repo_ready and checkpoint_ready and gpu_available
        if not repo_ready:
            message = "Set MATRIX_GAME_ROOT to a Matrix-Game-3 checkout."
        elif not checkpoint_ready:
            message = "Set MATRIX_GAME_CHECKPOINT to downloaded Matrix-Game-3 weights."
        elif not gpu_available:
            message = "Matrix-Game requires a CUDA/NVIDIA runtime; local renderer remains active."
        else:
            message = "Matrix-Game-3 is ready for scene generation."
        with self._lock:
            active = sum(1 for job in self._jobs.values() if job["status"] == "running")
        return {
            "provider": "SkyworkAI / Matrix-Game",
            "source": MATRIX_SOURCE,
            "version": "Matrix-Game-3.0",
            "repo_root": str(root),
            "checkpoint_configured": checkpoint is not None,
            "repo_found": repo_ready,
            "gpu_detected": gpu_available,
            "ready": ready,
            "active_jobs": active,
            "message": message,
        }

    def _safe_image(self, image: str | None) -> Path:
        requested = (image or "assets/open-world-map.jpg").strip().lstrip("/")
        candidate = (self.project_root / requested).resolve()
        if self.project_root not in candidate.parents and candidate != self.project_root:
            raise ValueError("Input image must be inside the Street Rush project.")
        if not candidate.is_file():
            raise ValueError(f"Input image does not exist: {requested}")
        return candidate

    def start_generation(self, payload: dict[str, Any]) -> dict[str, Any]:
        current_status = self.status()
        if not current_status["ready"]:
            raise RuntimeError(current_status["message"])
        with self._lock:
            if any(job["status"] == "running" for job in self._jobs.values()):
                raise RuntimeError("A Matrix-Game generation is already running.")

        root = self.configured_root()
        checkpoint = self.checkpoint_path()
        image = self._safe_image(payload.get("image"))
        region = str(payload.get("region", "city")).lower()
        prompt = str(payload.get("prompt") or REGION_PROMPTS.get(region, REGION_PROMPTS["city"]))[:1800]
        job_id = uuid.uuid4().hex[:10]
        output_dir = self.output_root / job_id
        output_dir.mkdir(parents=True, exist_ok=True)
        save_name = f"street_rush_{region}_{job_id}"
        log_path = output_dir / "matrix-game.log"
        command = [
            sys.executable,
            str(root / "generate.py"),
            "--size", "704*1280",
            "--ckpt_dir", str(checkpoint),
            "--image", str(image),
            "--prompt", prompt,
            "--save_name", save_name,
            "--output_dir", str(output_dir),
            "--num_iterations", os.environ.get("MATRIX_GAME_ITERATIONS", "6"),
            "--num_inference_steps", os.environ.get("MATRIX_GAME_STEPS", "3"),
            "--vae_type", "mg_lightvae_v2",
        ]
        log_file = log_path.open("w", encoding="utf-8")
        try:
            process = subprocess.Popen(
                command,
                cwd=str(root),
                stdout=log_file,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                start_new_session=True,
            )
        except Exception:
            log_file.close()
            raise

        job = {
            "id": job_id,
            "status": "running",
            "region": region,
            "prompt": prompt,
            "pid": process.pid,
            "created_at": time.time(),
            "output_dir": output_dir,
            "save_name": save_name,
            "log_path": log_path,
            "process": process,
        }
        with self._lock:
            self._jobs[job_id] = job
        threading.Thread(target=self._watch_job, args=(job, log_file), daemon=True).start()
        return self.public_job(job)

    def _watch_job(self, job: dict[str, Any], log_file: Any) -> None:
        process = job["process"]
        return_code = process.wait()
        log_file.close()
        video = job["output_dir"] / f"{job['save_name']}.mp4"
        with self._lock:
            job["status"] = "completed" if return_code == 0 and video.is_file() else "failed"
            job["return_code"] = return_code
            job["video"] = video if video.is_file() else None

    def public_job(self, job: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": job["id"],
            "status": job["status"],
            "region": job["region"],
            "created_at": job["created_at"],
            "message": "Matrix-Game scene generation started.",
            "output_url": f"/matrix-output/{job['id']}/{job['save_name']}.mp4" if job.get("video") else None,
        }

    def job_status(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            return self.public_job(job) | {
                "message": "Scene ready." if job["status"] == "completed" else ("Generation failed; inspect matrix-game.log." if job["status"] == "failed" else "Generating a world transition...")
            }

    def json_status(self) -> str:
        return json.dumps(self.status(), ensure_ascii=False)
