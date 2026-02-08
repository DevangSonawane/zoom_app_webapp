#!/usr/bin/env python3
"""
OAuth Redirect Server for Zoom PKCE flow.

Zoom redirects to http://localhost:3000/auth/callback (or your IP:3000 for physical device)
with ?code=xxx. This server captures the redirect and sends the browser to
zoomtest://oauth?code=xxx so the Flutter app receives it via deep link.

Usage:
    python3 oauth-redirect-server.py

For physical Android device (same WiFi):
    Use your computer's IP: http://192.168.x.x:3000/auth/callback
    Find IP: ifconfig | grep "inet " | grep -v 127.0.0.1

Add the redirect URI to Zoom App Marketplace → Your App → Allow List
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

PORT = 3000
APP_DEEP_LINK = "zoomtest://oauth"


class OAuthRedirectHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/auth/callback":
            # Forward query string from Zoom (code, state, etc.) to app deep link
            query = parsed.query
            redirect_url = f"{APP_DEEP_LINK}?{query}" if query else APP_DEEP_LINK

            print(f"✓ OAuth callback received, redirecting to app...")
            print(f"  → {redirect_url[:80]}...")

            self.send_response(302)
            self.send_header("Location", redirect_url)
            self.end_headers()
            # 302 must not send a body; browser follows Location
        else:
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(
                b"<h1>OAuth Redirect Server</h1>"
                b"<p>Listening for Zoom OAuth callbacks at /auth/callback</p>"
            )


def main():
    server = HTTPServer(("0.0.0.0", PORT), OAuthRedirectHandler)
    print(f"OAuth Redirect Server running on http://0.0.0.0:{PORT}")
    print(f"  - localhost:  http://localhost:{PORT}/auth/callback")
    print(f"  - LAN (same WiFi):  http://<your-ip>:{PORT}/auth/callback")
    print(f"  - Android emulator:  http://10.0.2.2:{PORT}/auth/callback")
    print()
    print("Keep this running during OAuth flow. Press Ctrl+C to stop.")
    print("-" * 50)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.shutdown()


if __name__ == "__main__":
    main()