#!/usr/bin/env python3
"""Street Rush static server plus optional SkyworkAI Matrix-Game API.

Run this instead of ``python -m http.server`` when Matrix-Game is configured:

    python3 serve.py --port 4173

The API is intentionally local and same-origin so the browser never needs to
know about localhost or a CUDA service address.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from matrix_bridge import MatrixBridge


PROJECT_ROOT = Path(__file__).resolve().parent
BRIDGE = MatrixBridge(PROJECT_ROOT)


class StreetRushHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_ROOT), **kwargs)

    def log_message(self, fmt, *args):
        # Keep the preview log useful without dumping every asset request.
        if self.path.startswith("/api/") or self.command == "POST":
            super().log_message(fmt, *args)

    def _send_json(self, payload: dict, status: int = 200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802 - stdlib handler API
        route = urlparse(self.path).path
        if route == "/api/matrix/status":
            self._send_json(BRIDGE.status())
            return
        if route.startswith("/api/matrix/jobs/"):
            job_id = unquote(route.rsplit("/", 1)[-1])
            payload = BRIDGE.job_status(job_id)
            if payload is None:
                self._send_json({"error": "Unknown Matrix-Game job."}, 404)
            else:
                self._send_json(payload)
            return
        super().do_GET()

    def do_POST(self):  # noqa: N802 - stdlib handler API
        route = urlparse(self.path).path
        if route != "/api/matrix/generate":
            self._send_json({"error": "Not found."}, 404)
            return
        try:
            length = min(int(self.headers.get("Content-Length", "0")), 64 * 1024)
            raw = self.rfile.read(length) if length else b"{}"
            payload = json.loads(raw.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("Request body must be a JSON object.")
            result = BRIDGE.start_generation(payload)
            self._send_json(result, 202)
        except RuntimeError as error:
            self._send_json({"ok": False, "fallback": True, "error": str(error)}, 503)
        except (ValueError, json.JSONDecodeError) as error:
            self._send_json({"ok": False, "error": str(error)}, 400)
        except Exception as error:  # Keep the game UI alive if CUDA setup fails.
            self._send_json({"ok": False, "fallback": True, "error": f"Matrix-Game bridge error: {error}"}, 500)

    def translate_path(self, path):
        # SimpleHTTPRequestHandler already prevents traversal, but explicitly
        # keep the generated output inside this checkout as defense in depth.
        translated = Path(super().translate_path(path)).resolve()
        if PROJECT_ROOT not in translated.parents and translated != PROJECT_ROOT:
            return str(PROJECT_ROOT / "404")
        return str(translated)


def main():
    parser = argparse.ArgumentParser(description="Serve Street Rush and the optional Matrix-Game bridge.")
    parser.add_argument("--host", default=os.environ.get("STREET_RUSH_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("STREET_RUSH_PORT", "4173")))
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), StreetRushHandler)
    print(f"Street Rush running at http://{args.host}:{args.port}")
    print(f"Matrix-Game: {BRIDGE.status()['message']}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Street Rush server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
