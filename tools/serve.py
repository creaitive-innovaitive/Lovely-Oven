"""Local preview with clean URLs like GitHub Pages (/menu -> menu.html). Run: python3 tools/serve.py"""
import http.server, os

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?')[0].split('#')[0]
        if path != '/' and '.' not in os.path.basename(path) and os.path.exists('.' + path + '.html'):
            self.path = path + '.html'
        super().do_GET()
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

http.server.test(HandlerClass=H, port=8000)
