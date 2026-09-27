#!/usr/bin/env python3
"""Static dev server for the site with caching disabled, so every edit shows on reload.

Usage: python3 dev/serve.py [port]   (default 8137)
"""
import functools
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8137
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    handler = functools.partial(NoCache, directory=ROOT)
    print(f"Serving {ROOT} on http://localhost:{PORT}")
    # Localhost only: this folder also holds the private notes in content/.
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler).serve_forever()
