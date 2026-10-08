#!/usr/bin/env python3
"""
Verify the live legacy ERP boots: every script/style referenced by index.html
returns 200, the Google Client ID decodes, and the GSI loader + login markup
are present. A single 404 here is what produces the Bulgarian
"блокирани от разширение за реклами, CORS или прекъсната връзка" banner.
"""
import re, ssl, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

BASE = "https://sr-ue-varna.com"
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
OP = urllib.request.build_opener(urllib.request.HTTPSHandler(context=CTX))

passed = failed = 0
def check(name, ok, detail=""):
    global passed, failed
    passed, failed = (passed + 1, failed) if ok else (passed, failed + 1)
    print(f"  [{'OK' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))

def get(url, timeout=45):
    req = urllib.request.Request(url, headers={"User-Agent": "uev-boot-verify/1.0",
                                               "Cache-Control": "no-cache"})
    try:
        with OP.open(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:
        return 0, f"ERR {e}"

cb = int(time.time() * 1000)
print("=== Live legacy ERP boot verification ===\n")

status, html = get(f"{BASE}/?cb={cb}")
check("GET / -> 200", status == 200, f"status={status}")
check("/ serves the legacy shell", '__ERP_BUILD' in html and 'id="root"' in html)
check("not the Laravel Inertia page", "data-page" not in html)

# GSI loader + login prerequisites
check("GSI client script present", "accounts.google.com/gsi/client" in html)
check("GSI ready event wired", "_gsiReady" in html and "gsi-ready" in html)
enc = re.search(r"__ERP_GOOGLE_CLIENT_ID_ENCODED:\s*'([^']+)'", html)
check("encoded Google Client ID in shell", bool(enc))

# Decode the client ID exactly as core-bundle.js does (base64 + char shift).
if enc:
    def decode(s, shift=7, prefix="v1."):
        if not s.startswith(prefix): return ""
        payload = s[len(prefix):]
        b64 = "".join(chr(ord(c) - shift) for c in payload)
        import base64
        pad = "=" * (-len(b64) % 4)
        try: return base64.b64decode(b64 + pad).decode("utf-8", "replace")
        except Exception: return ""
    cid = decode(enc.group(1))
    check("Client ID decodes to a Google OAuth ID",
          cid.endswith(".apps.googleusercontent.com"),
          f"len={len(cid)}")

# Every referenced asset must load. A 404 here = blank page + the CORS banner.
assets = sorted(set(re.findall(r'(?:src|href)="((?:js|css|assets)/[^"]+)"', html)))
check("shell references local assets", len(assets) > 10, f"{len(assets)} found")

def probe(a):
    st, _ = get(f"{BASE}/{a}" + ("&" if "?" in a else "?") + f"cb={cb}", timeout=40)
    return a, st

bad = []
with ThreadPoolExecutor(max_workers=12) as ex:
    for a, st in ex.map(probe, assets):
        if st != 200: bad.append((a, st))

check("all referenced assets return 200",
      not bad,
      "broken: " + ", ".join(f"{a}={s}" for a, s in bad[:6]) if bad else f"{len(assets)} ok")

# The login screen + Google button live in these bundles.
for f, needles in [
    ("js/config.js",        ["GOOGLE_CLIENT_ID"]),
    ("js/core-bundle.js",   ["__ERP_GOOGLE_CLIENT_ID_ENCODED"]),
    ("js/views-bundle.js",  ["login-divider", "google-signin-wrap", "или влезте с"]),
]:
    st, body = get(f"{BASE}/{f}?cb={cb}")
    check(f"{f} -> 200", st == 200, f"status={st}")
    if st == 200:
        miss = [n for n in needles if n not in body]
        check(f"{f} has login/GSI wiring", not miss, f"missing {miss}" if miss else "")

# Backend bridge still answers.
st, body = get(f"{BASE}/database/api.php?action=ping&cb={cb}")
check("legacy api.php reachable (not 5xx)", st in (200, 400, 401, 403), f"status={st}")

print(f"\n=== Result: {passed} passed, {failed} failed ===")
sys.exit(0 if failed == 0 else 1)
