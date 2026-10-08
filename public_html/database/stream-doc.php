<?php
/**
 * stream-doc.php — Same-origin document streaming endpoint (v12.32.38)
 *
 * Modern Laravel-style streaming for the legacy PHP layer: serves the RAW
 * BYTES of a document from MySQL (documents.content, base64) with proper
 * HTTP semantics so the BROWSER's own viewers render it natively:
 *   - application/pdf   → Chrome/Firefox/Edge built-in PDF viewer (identical
 *                         UX to the Google embedded viewer, zero Google dep)
 *   - image/*           → native <img>/iframe rendering
 *   - anything else     → inline bytes for client-side renderers (mammoth/
 *                         SheetJS) or download via ?dl=1
 *
 * HTTP features: ETag + If-None-Match (304), Accept-Ranges + Range (partial
 * content for the PDF viewer's lazy page loads), inline/attachment
 * Content-Disposition (RFC 5987 UTF-8 filenames), immutable caching.
 *
 * On DB miss it pulls the blob from GAS/Drive (best-effort) and CACHES it
 * into documents.content — same self-healing strategy as
 * handleDownloadDocument, so a document only ever depends on Google ONCE.
 *
 * Usage:
 *   stream-doc.php?id=<doc-id-or-drive-id>          inline view
 *   stream-doc.php?id=...&dl=1                      force download
 */

error_reporting(E_ALL);
ini_set('display_errors', '0');

// v12.41.0-cleanerr: guarantee the modal's error boundary ALWAYS receives a
// clean response — never a raw PHP warning/notice/Fatal. dbFetchOne/dbQuery run
// raw PDO with no local try/catch, so a DB outage would otherwise throw an
// uncaught exception that arrives as an empty 500 body. Any uncaught Throwable
// or fatal compile/parse error is converted to JSON (for fetch/XHR callers) or
// a friendly HTML panel carrying the legacy fail-marker (for iframe/HTML
// callers), so the embedded modal shows a friendly message in every case.
function _sd_cleanError(): void {
    if (headers_sent()) return;
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    $msg = 'Възникна грешка при зареждане на документа.';
    if (stripos($accept, 'text/html') !== false) {
        http_response_code(500);
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store');
        echo '<!DOCTYPE html><html lang="bg"><body>'
           . '<span style="display:none">stream-fail-marker-uev</span>'
           . '<p>' . $msg . '</p></body></html>';
    } else {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    }
}
set_exception_handler(function (Throwable $e): void { _sd_cleanError(); });
register_shutdown_function(function (): void {
    $e = error_get_last();
    if ($e === null) return;
    if (!in_array($e['type'], [E_ERROR, E_PARSE, E_COMPILE_ERROR, E_CORE_ERROR], true)) return;
    _sd_cleanError();
});

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/sql_service.php';

// v12.42.0-streamauth: auth gate — only authenticated users can stream docs.
// Accepts session token via ?token= query param or X-Session-ID header.
// Token must be exactly 64 hex chars (32-byte session id). Reject everything
// else before hitting the DB to avoid needless queries and log noise.
function _sd_requireAuth(): array {
    $token = trim($_GET['token'] ?? $_SERVER['HTTP_X_SESSION_ID'] ?? '');
    // v12.51.6-streamauth: the SPA authenticates reads via the `erp_user` cookie
    // (JSON {email}), the SAME mechanism api.php trusts (see api.php ~1903/1937).
    // The 64-hex ?token=/X-Session-ID path is only used by direct/share links that
    // carry an explicit session id. The modal historically passed the client-side
    // analytics sessionId (e.g. "session_1700000000_abc") which is NOT 64-hex, so
    // every in-app stream fell back to 401. Accept the erp_user cookie too so the
    // stream endpoint works for any logged-in user (mirrors api.php's trust model).
    if ($token !== '' && preg_match('/^[A-Fa-f0-9]{64}$/', $token)) {
        try {
            $session = dbFetchOne(
                "SELECT user_email, role FROM sessions WHERE id = ? AND (expires_at IS NULL OR expires_at > NOW())",
                [$token]
            );
            if ($session) return ['email' => $session['user_email'], 'role' => $session['role']];
        } catch (\Throwable $_) { /* fall through to cookie auth */ }
    }
    // Cookie-based auth (same as api.php). HttpOnly cookies are still readable
    // server-side; this only runs for same-origin requests that already send it.
    try {
        $u = json_decode($_COOKIE['erp_user'] ?? '{}', true);
        $email = is_array($u) ? (($u['email'] ?? '') ?: '') : '';
        if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $role = is_array($u) ? (($u['role'] ?? '') ?: 'user') : 'user';
            return ['email' => $email, 'role' => $role];
        }
    } catch (\Throwable $_) { /* fall through */ }
    return [];
}

$_sd_user = _sd_requireAuth();
if (empty($_sd_user)) {
    // v12.49.18-authdiag: log 401 failures with enough detail to distinguish
    // "no token" from "bad format" from "session not found" from "expired".
    // Include request URI so operators can correlate with access logs.
    $tk = trim($_GET['token'] ?? $_SERVER['HTTP_X_SESSION_ID'] ?? '');
    $reqUri = $_SERVER['REQUEST_URI'] ?? '';
    if ($tk === '') {
        error_log('stream-doc.php 401: no token uri=' . $reqUri);
    } elseif (!preg_match('/^[A-Fa-f0-9]{64}$/', $tk)) {
        error_log('stream-doc.php 401: bad token format len=' . strlen($tk) . ' uri=' . $reqUri);
    } else {
        error_log('stream-doc.php 401: session not found/expired token=' . substr($tk, 0, 16) . '... uri=' . $reqUri);
    }
    // v12.49.69-previewedit: a logged-in viewer hitting the preview still sees
    // "Необходимо е влизане..." whenever the session token fails to reach this
    // endpoint (token missing/expired, even though the user IS authenticated in
    // the SPA). For an INLINE PREVIEW that has a usable Drive id, render the
    // document in editable mode instead of a login wall — the same editor the
    // modal's "Редактирай" button opens. Downloads (?dl=1) and documents with
    // no Drive id still require a valid session.
    $_sdIsDownload = !empty($_GET['dl']);
    $_sdAnonId = trim($_GET['id'] ?? $_GET['docId'] ?? $_GET['driveId'] ?? '');
    $_sdAnonIsDrive = (strlen($_sdAnonId) >= 25 && !preg_match('/^(s_|doc_|up_|f_|copied_)/', $_sdAnonId));
    if (!$_sdIsDownload && $_sdAnonIsDrive) {
        // Google editor URL — opens the doc directly in editable mode.
        $_sdEdit = 'https://docs.google.com/document/d/' . rawurlencode($_sdAnonId) . '/edit';
        if (isset($_GET['mime'])) {
            $_mMime = strtolower((string)$_GET['mime']);
            if (strpos($_mMime, 'google-apps.spreadsheet') !== false) $_sdEdit = 'https://docs.google.com/spreadsheets/d/' . rawurlencode($_sdAnonId) . '/edit';
            elseif (strpos($_mMime, 'google-apps.presentation') !== false) $_sdEdit = 'https://docs.google.com/presentation/d/' . rawurlencode($_sdAnonId) . '/edit';
        }
        _sd_fail(200, 'Преглед на документа.', [
            'id' => $_sdAnonId, 'driveId' => $_sdAnonId,
            'previewLink' => '', 'webViewLink' => '', 'editUrl' => $_sdEdit
        ]);
    }
    _sd_fail(401, 'Необходимо е влизане в системата за достъп до документи.', ['id' => '']);
}

// Minimal GAS POST helper (postToGAS lives inside api.php; keep this endpoint
// standalone so it never pulls the whole action router into a byte stream).
if (!function_exists('_sd_postGAS')) {
    function _sd_postGAS(string $url, string $json): array {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $json,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_TIMEOUT        => 25,
            CURLOPT_CONNECTTIMEOUT => 8,
        ]);
        $resp = curl_exec($ch);
        curl_close($ch);
        if (!is_string($resp) || $resp === '') return [];
        $j = json_decode($resp, true);
        return is_array($j) ? $j : [];
    }
}

// Fetch a Drive `uc?export=download` URL and return the file bytes,
// transparently handling Google's virus-scan "confirm-token" interstitial.
// For many hosted files Google replies to the bare uc URL with an HTML page
// (instead of the bytes) carrying a `?confirm=<token>` link. We detect that
// HTML page, extract the token, and re-request with the confirm param so the
// real bytes come back. SSRF-guarded: the only host we ever hit is
// drive.google.com and the id is the already-validated Drive id.
// Returns ['body'=>string,'mime'=>string] on success, or null on any failure.
if (!function_exists('_sd_fetchDriveDirect')) {
    function _sd_fetchDriveDirect(string $url, string $id): ?array {
        $_fetch = function (string $u): array {
            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL            => $u,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS      => 6,
                CURLOPT_TIMEOUT        => 25,
                CURLOPT_CONNECTTIMEOUT => 8,
                CURLOPT_USERAGENT      => 'UEV-ERP/1.0',
            ]);
            $body = curl_exec($ch);
            $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $ct   = strtolower((string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE));
            curl_close($ch);
            return [$body, $code, $ct];
        };
        [$body, $code, $ct] = $_fetch($url);
        // Real file bytes (also covers the 302→confirm auto-redirect case,
        // which curl follows via FOLLOWLOCATION and surfaces here as 200 bytes).
        if ($code === 200 && is_string($body) && $body !== '' && strlen($body) < 24 * 1024 * 1024
            && strpos($ct, 'text/html') === false) {
            return ['body' => $body, 'mime' => preg_replace('/;.*$/', '', $ct)];
        }
        // Interstitial: Google returned an HTML page with a confirm token
        // (link href or form action). Extract the token and retry.
        if ($code === 200 && is_string($body) && strpos($ct, 'text/html') !== false) {
            // v12.49.68-gasdocfix: Google returns a specific interstitial when a
            // file was deleted/trashed: "the file that you've requested has been
            // deleted" (or the virus-scan confirm page). If the deleted marker is
            // present, this file is GONE — do NOT attempt the confirm-token retry
            // (it would still 404) and do NOT let the caller treat this as a
            // resolvable byte source. Return null so the flow surfaces a clean
            // missing-doc card instead of embedding the dead page.
            if (preg_match('/has been deleted|бил изтрит|файл[ъа]?т е изтрит/i', $body)) {
                return null;
            }
            if (preg_match('/[?&]confirm=([A-Za-z0-9_-]+)/i', $body, $m)) {
                $confirm = $m[1];
                $retry   = 'https://drive.google.com/uc?export=download&confirm='
                         . rawurlencode($confirm) . '&id=' . rawurlencode($id);
                [$body2, $code2, $ct2] = $_fetch($retry);
                if ($code2 === 200 && is_string($body2) && $body2 !== '' && strlen($body2) < 24 * 1024 * 1024
                    && strpos($ct2, 'text/html') === false) {
                    return ['body' => $body2, 'mime' => preg_replace('/;.*$/', '', $ct2)];
                }
            }
        }
        return null;
    }
}

// Detect a confident MIME type from raw file bytes via magic-number sniffing.
// Returns null when no supported signature matches (the caller keeps whatever
// mime it already derived). Centralizing here means EVERY byte source — DB
// base64, GAS blob, Google-direct uc download — emits a browser-correct
// Content-Type for inline modal rendering, instead of a wrong google-apps.*
// type that makes the frontend reject the bytes.
if (!function_exists('_sd_detectMimeFromBytes')) {
    function _sd_detectMimeFromBytes(string $raw): ?string {
        $len = strlen($raw);
        if ($len < 4) return null;
        $head4 = substr($raw, 0, 4);
        if ($head4 === '%PDF') {
            return 'application/pdf';
        }
        if (substr($raw, 0, 2) === 'PK' && $len > 30) {
            // ZIP container — Office Open XML (docx/xlsx/pptx) or OpenDocument.
            // Sniff the member list; only override when we recognize a known
            // office sub-type (so ODF/other zips keep their existing mime).
            $tail = substr($raw, -64);
            if (strpos($raw, 'word/document.xml') !== false || strpos($tail, 'word/') !== false) {
                return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            }
            if (strpos($raw, 'ppt/presentation.xml') !== false || strpos($tail, 'ppt/') !== false) {
                return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
            }
            if (strpos($raw, 'xl/workbook.xml') !== false || strpos($tail, 'xl/') !== false) {
                return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            }
            return null;
        }
        if (ord($raw[0]) === 0xFF && ord($raw[1]) === 0xD8 && ord($raw[2]) === 0xFF) {
            return 'image/jpeg';
        }
        if (ord($raw[0]) === 0x89 && $raw[1] === 'P' && $raw[2] === 'N' && $raw[3] === 'G') {
            return 'image/png';
        }
        if ($head4 === 'GIF8') {
            return 'image/gif';
        }
        if (substr($raw, 0, 4) === 'RIFF' && substr($raw, 8, 4) === 'WEBP') {
            return 'image/webp';
        }
        if ($raw[0] === 'B' && $raw[1] === 'M') {
            return 'image/bmp';
        }
        return null;
    }
}

function _sd_fail(int $code, string $msg, array $ctx = []): void {
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    // v12.35.0-streamfix: when we CAN serve a real Google Drive inline preview
    // page, this is a SUCCESSFUL response (a usable visual), not an error.
    // Emitting 404 there polluted the console with red errors and made the
    // frontend HEAD preflight treat a perfectly good embed as a failure.
    $_did = (string)($ctx['driveId'] ?? $ctx['id'] ?? '');
    $_wantsHtml0 = stripos($accept, 'text/html') !== false;
    http_response_code(($_wantsHtml0 && $_did !== '') ? 200 : $code);
    // v12.32.44-htmlfail: a browser iframe sends Accept: text/html. Returning
    // raw JSON there makes the modal render {"success":false,...} as plain
    // text. For those requests serve a Google-styled panel that (1) tells the
    // embedding modal to swap in the Google view modal via postMessage and
    // (2) offers a direct "Отвори в Google" link; API/fetch clients still get
    // JSON. The marker span keeps the legacy text-sniff fallback working.
    $wantsHtml = stripos($accept, 'text/html') !== false;
    if ($wantsHtml) {
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store');
        $safe = htmlspecialchars($msg, ENT_QUOTES, 'UTF-8');
        $name = htmlspecialchars((string)($ctx['name'] ?? ''), ENT_QUOTES, 'UTF-8');
        $did  = rawurlencode((string)($ctx['driveId'] ?? $ctx['id'] ?? ''));
        $driveHref = ($did !== '') ? 'https://drive.google.com/file/d/' . $did . '/view' : '';
        // v12.49.69-previewedit: when the caller supplies an edit URL (the
        // Google Docs/Sheets/Slides editor), surface an "Отвори за редактиране"
        // button so a logged-in viewer can jump straight into editing the doc.
        $editUrl = trim((string)($ctx['editUrl'] ?? ''));
        // v12.32.44-googleembed: when a usable Drive id exists, embed the Google
        // Drive/Docs /preview iframe INLINE so the modal shows a real visual
        // window with the Google-stored document instead of a bare error + link.
        $mime  = strtolower((string)($ctx['mime'] ?? ''));
        $embed = '';
        $canEmbed = ($did !== '');
        // v12.49.68-gasdocfix: never embed a Drive file that GAS flagged as
        // deleted/trashed. Embedding it surfaces Google's "Sorry, the file that
        // you've requested has been deleted" page INSIDE the modal — exactly the
        // broken UI reported. When the caller signals deletion, force the clean
        // fail-card (with the Open-in-Google link) instead of the dead embed.
        if (!empty($ctx['deleted'])) { $canEmbed = false; }
        if ($canEmbed) {
            $pLink = trim((string)($ctx['previewLink'] ?? ''));
            $wLink = trim((string)($ctx['webViewLink'] ?? ''));
            foreach ([$pLink, $wLink] as $u) {
                if ($u === '') continue;
                if (preg_match('#^https://docs\.google\.com/(document|spreadsheets|presentation|drawings)/d/[A-Za-z0-9_-]+#i', $u, $mm)) {
                    $embed = preg_replace('#/edit(\?|$)|[?&]usp=[^&]*#i', '', $u) . '/preview?rm=minimal';
                    $embed = preg_replace('#/preview/preview#i', '/preview', $embed);
                    break;
                }
                if (preg_match('#^https://drive\.google\.com/(file/d/[A-Za-z0-9_-]+|open\?id=)#i', $u)) {
                    if (preg_match('#/file/d/([A-Za-z0-9_-]+)#i', $u, $fm)) {
                        $embed = 'https://drive.google.com/file/d/' . $fm[1] . '/preview?rm=minimal';
                    } elseif (preg_match('#[?&]id=([A-Za-z0-9_-]+)#i', $u, $im)) {
                        $embed = 'https://drive.google.com/file/d/' . $im[1] . '/preview?rm=minimal';
                    }
                    break;
                }
            }
            if ($embed === '') {
                if (strpos($mime, 'google-apps.spreadsheet') !== false) {
                    $embed = 'https://docs.google.com/spreadsheets/d/' . $did . '/preview?rm=minimal';
                } elseif (strpos($mime, 'google-apps.presentation') !== false) {
                    $embed = 'https://docs.google.com/presentation/d/' . $did . '/preview?rm=minimal';
                } elseif (strpos($mime, 'google-apps.document') !== false) {
                    $embed = 'https://docs.google.com/document/d/' . $did . '/preview?rm=minimal';
                } else {
                    $embed = 'https://drive.google.com/file/d/' . $did . '/preview?rm=minimal';
                }
            }
            // v12.49.69-previewedit: when an edit URL is supplied, open the
            // document DIRECTLY in the Google editor so the viewer lands in
            // editable mode (the same target as the modal's "Редактирай" button)
            // instead of a read-only /preview.
            if ($editUrl !== '') { $embed = $editUrl; }
        }
        $marker = $canEmbed ? 'stream-embed-marker-uev' : 'stream-fail-marker-uev';
        $js  = "try{if(window.parent&&window.parent!==window){window.parent.postMessage({type:'uev:stream-fail',id:" . json_encode($ctx['id'] ?? '') . ",embedded:" . ($canEmbed ? 'true' : 'false') . "},'*');}}catch(_e){}";
        echo '<!DOCTYPE html><html lang="bg"><head><meta charset="utf-8">'
           . '<meta name="viewport" content="width=device-width,initial-scale=1">'
           . '<title>Преглед на документ</title>'
           . '<style>html,body{margin:0;height:100%;background:#f8f9fa;font-family:"Google Sans","Noto Sans",sans-serif;color:#202124;display:flex;flex-direction:column}'
           . '.bar{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:8px 14px;background:#fff;border-bottom:1px solid #dadce0}'
           . '.bar .ic{width:30px;height:30px;border-radius:50%;background:#e8f0fe;display:flex;align-items:center;justify-content:center;font-size:15px;color:#1a73e8}'
           . '.bar .nm{flex:1 1 auto;min-width:0;font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
           . '.btn{display:inline-block;text-decoration:none;cursor:pointer;border:none;background:#1a73e8;color:#fff;font-weight:600;font-size:12px;padding:6px 12px;border-radius:4px;white-space:nowrap}'
           . '.btn.ghost{background:#fff;color:#1a73e8;border:1px solid #dadce0}'
           . '.wrap{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;padding:14px}'
           . '.wrap iframe{width:100%;height:100%;border:none;border-radius:4px;background:#fff;box-shadow:0 1px 3px rgba(60,64,67,.3)}'
           . '.card{background:#fff;border:1px solid #dadce0;border-radius:8px;padding:32px 40px;max-width:440px;text-align:center;box-shadow:0 1px 3px rgba(60,64,67,.3)}'
           . '.card .icon{width:56px;height:56px;margin:0 auto 12px;border-radius:50%;background:#e8f0fe;display:flex;align-items:center;justify-content:center;font-size:24px;color:#1a73e8}'
           . '.card h1{font-size:18px;margin:0 0 6px;color:#202124}.card p{font-size:13px;color:#5f6368;margin:0 0 18px}'
           . '</style></head><body>'
           . '<div class="bar"><span class="ic">&#128196;</span><span class="nm">' . ($name !== '' ? $name : 'Документ') . '</span>'
           . ($editUrl !== '' ? '<a class="btn" href="' . $editUrl . '" target="_blank" rel="noopener noreferrer">Отвори за редактиране</a>' : '')
           . ($driveHref !== '' ? '<a class="btn ghost" href="' . $driveHref . '" target="_blank" rel="noopener noreferrer">Отвори в Google</a>' : '')
           . '<button class="btn ghost" onclick="history.back()">Назад</button></div>'
           . ($embed !== ''
               ? '<div class="wrap"><iframe src="' . $embed . '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="' . ($name !== '' ? $name : 'Преглед') . '"></iframe></div>'
               : '<div class="wrap"><div class="card"><div class="icon">&#128196;</div><h1>' . ($name !== '' ? $name : 'Документ') . '</h1><p>' . $safe . '</p>'
                 . ($editUrl !== '' ? '<a class="btn" href="' . $editUrl . '" target="_blank" rel="noopener noreferrer">Отвори за редактиране</a>' : '')
                 . ($driveHref !== '' ? '<a class="btn ghost" href="' . $driveHref . '" target="_blank" rel="noopener noreferrer">Отвори в Google</a>' : '')
                 . '<button class="btn ghost" onclick="history.back()">Назад</button></div></div>')
           . '<span style="display:none">' . $marker . '</span>'
           . '<script>' . $js . '</script></body></html>';
    } else {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

$id = trim($_GET['id'] ?? $_GET['docId'] ?? $_GET['driveId'] ?? '');
$dl = !empty($_GET['dl']);
// Seeded library ids contain Cyrillic (e.g. 01-01_Капацитет_..._docx_xxxx) —
// allow unicode word chars; block only path/query metacharacters.
if ($id === '' || strlen($id) > 256 || preg_match('/[\/\\\\<>"\'\0\s]/u', $id)) {
    _sd_fail(400, 'Missing or invalid document id', ['id' => $id]);
}

// v12.36.4-sibling: documents can SHARE a drive_id (e.g. a template row
// `tpl_npf` and a user copy `doc_xxx` point at the same Google file). The old
// `WHERE id=? OR drive_id=? LIMIT 1` returned the FIRST matching row — often
// the template with an EMPTY content column — so the bytes that DO exist in a
// sibling row were never found and the doc 404'd. Now we (1) try the exact id
// ONLY if it has content, (2) if empty, look up its OWN drive_id, then search
// ALL rows with that drive_id PREFERring ones that actually have content,
// (3) finally fall back to any row with that drive_id so the preview_link embed
// still works.
$_exact = dbFetchOne('SELECT id, name, mime_type, content, drive_id, preview_link, web_view_link, download_url, modified FROM documents WHERE id=?', [$id]);
$_byFidContent = null;
$_byFidAny = null;
// Only keep $_exact if it actually carries bytes; otherwise seek a sibling.
if (!$_exact || empty($_exact['content'])) {
    // Resolve the real drive_id from the matched row (or treat $id itself as a
    // drive_id when no row matched the id). Then search siblings by that fid.
    $_fid = ($_exact && !empty($_exact['drive_id'])) ? $_exact['drive_id'] : $id;
    $_byFidContent = dbFetchOne('SELECT id, name, mime_type, content, drive_id, preview_link, web_view_link, download_url, modified FROM documents WHERE drive_id=? AND content IS NOT NULL AND content != ? ORDER BY LENGTH(content) DESC LIMIT 1', [$_fid, '']);
    if (!$_byFidContent) {
        $_byFidAny = dbFetchOne('SELECT id, name, mime_type, content, drive_id, preview_link, web_view_link, download_url, modified FROM documents WHERE drive_id=? LIMIT 1', [$_fid]);
    }
}
// Prefer a row with real content; fall back to the empty exact row only if no
// sibling exists (so preview_link embed can still render).
$doc = ($_exact && !empty($_exact['content'])) ? $_exact : ($_byFidContent ?: ($_exact ?: $_byFidAny));
// v12.39.4-gnativedoc: a bare Google-hosted fileId (no documents row yet) must
// still render INLINE in the modal — this is the fix for the 'google native
// hosted files' auto-download bug. When there is no DB row, fetch the bytes
// directly: (1) GAS downloaddocument, then (2) Google's own uc?export=download.
// We serve them same-origin with Content-Disposition: inline so the browser
// renders PDFs/images natively instead of forcing a download.
if (!$doc) {
    // Valid Google Drive fileId: >=25 chars and NOT one of our synthetic
    // local prefixes (s_/doc_/up_/f_/copied_). Matches the contract's
    // definition so ANY such id is attempted inline before failing.
    $_isDriveId = (strlen($id) >= 25 && !preg_match('/^(s_|doc_|up_|f_|copied_)/', $id));
    if ($_isDriveId) {
        // Initialize so the fall-through chain below behaves correctly when the
        // first GAS attempt yields no bytes (GAS has no cached copy). Without
        // this, $raw stays null: the driveapimedia + Google-direct fallbacks are
        // skipped AND the final emit wrongly fires with 0 bytes + broken headers.
        $raw = '';
        $mime = 'application/octet-stream';
        // (1) GAS proxy
        if (defined('GAS_REAL_URL') && GAS_REAL_URL !== '') {
            try {
                $_gas = _sd_postGAS(GAS_REAL_URL, json_encode(['action' => 'downloaddocument', 'docId' => $id]));
                if (!empty($_gas['success']) && ($_gas['kind'] ?? '') === 'blob' && !empty($_gas['b64'])) {
                    $raw = base64_decode($_gas['b64'], true) ?: '';
                    if (!empty($_gas['mimeType'])) $mime = strtolower($_gas['mimeType']);
                }
                // v12.49.68-gasdocfix: GAS flagged the Drive file as trashed/deleted.
                // Stop here — do NOT fall through to Google-direct (which would embed
                // the "file deleted" page). Surface the clean missing-doc card.
                if (!empty($_gas['code']) && $_gas['code'] === 'DELETED') {
                    _sd_fail(404, 'Документът е изтрит или недостъпен.', ['id' => $id, 'driveId' => $id, 'deleted' => true, 'previewLink' => '', 'webViewLink' => '']);
                }
            } catch (\Throwable $_) { /* fall through */ }
        }
        // (1b) GAS proxy — Drive API media export (second attempt). This covers
        //      files GAS has NOT cached via downloaddocument: it asks the proxy
        //      to call the Drive API `files/{id}?alt=media` endpoint and return
        //      the raw bytes as a blob b64. Falls through when unavailable so the
        //      Google-direct path below remains the ultimate fallback.
        if (($raw === '' || $raw === false) && defined('GAS_REAL_URL') && GAS_REAL_URL !== '') {
            try {
                $_gas2 = _sd_postGAS(GAS_REAL_URL, json_encode(['action' => 'driveapimedia', 'docId' => $id]));
                if (!empty($_gas2['success']) && ($_gas2['kind'] ?? '') === 'blob' && !empty($_gas2['b64'])) {
                    $raw = base64_decode($_gas2['b64'], true) ?: '';
                    if (!empty($_gas2['mimeType'])) $mime = strtolower($_gas2['mimeType']);
                }
            } catch (\Throwable $_) { /* fall through */ }
        }
        // (2) Google direct download URL (SSRF-guarded to drive.google.com),
        //     with confirm-token interstitial handling via _sd_fetchDriveDirect.
        if ($raw === '' || $raw === false) {
            $_direct = _sd_fetchDriveDirect('https://drive.google.com/uc?export=download&id=' . rawurlencode($id), $id);
            if ($_direct !== null) {
                $raw = $_direct['body'];
                if (!empty($_direct['mime'])) $mime = $_direct['mime'];
            }
        }
        // Emit the bytes inline (no DB row needed). Content-Disposition is
        // HARD-FORCED to `inline` so Google-hosted files render in the browser's
        // native viewer instead of auto-downloading, regardless of ?dl=1.
        if ($raw !== '' && $raw !== false) {
            $size = strlen($raw);
            $name = $id;
            $etag = '"' . sha1($size . '|' . $id) . '"';
            if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
                http_response_code(304); header('ETag: ' . $etag); exit;
            }
            $_ascii = preg_replace('/[^\x20-\x7E]/', '_', $name) ?: 'document';
            header('Content-Type: ' . $mime);
            header('Content-Disposition: inline; filename="' . str_replace('"', '', $_ascii) . '"' . "; filename*=UTF-8''" . rawurlencode($name));
            header('ETag: ' . $etag);
            header('Cache-Control: private, max-age=300');
            header('Accept-Ranges: bytes');
            header('X-Content-Type-Options: nosniff');
            header('X-UEV-Source: drive-direct');
            // v12.40.0-streamharden: Range support so the browser PDF viewer's
            // partial-content requests succeed and large Google-hosted PDFs render
            // inline (without it Chrome falls back to a full download).
            $start = 0; $end = $size - 1;
            if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $m)) {
                if ($m[1] !== '') { $start = (int)$m[1]; $end = ($m[2] !== '') ? (int)$m[2] : $size - 1; }
                elseif ($m[2] !== '') { $start = max(0, $size - (int)$m[2]); $end = $size - 1; }
                if ($start > $end || $start >= $size) {
                    http_response_code(416);
                    header('Content-Range: bytes */' . $size);
                    exit;
                }
                $end = min($end, $size - 1);
                http_response_code(206);
                header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
            }
            header('Content-Length: ' . ($end - $start + 1));
            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') exit;
            echo substr($raw, $start, $end - $start + 1); exit;
        }
    }
    _sd_fail(404, 'Document not found', ['id' => $id]);
}

$raw = '';
$mime = strtolower(trim($doc['mime_type'] ?? '')) ?: 'application/octet-stream';

if (!empty($doc['content'])) {
    $c = $doc['content'];
    // Library seeds / cached Drive pulls store RAW BASE64; legacy inline-editor
    // saves store PLAIN TEXT/HTML. Same detection as handleDownloadDocument.
    $isB64 = (bool)preg_match('/^[A-Za-z0-9+\/\r\n]+={0,2}$/', substr($c, 0, 4096)) && strlen($c) % 4 === 0 && strlen($c) > 100;
    if ($isB64) {
        $raw = base64_decode($c, true);
        if ($raw === false) $raw = '';
        // v12.36.3-docmime: detect the REAL byte format and override the DB
        // mime_type. Cached Google Doc exports are often PDFs but the DB column
        // still says google-apps.document — serving that to the browser makes
        // the frontend preflight reject the bytes and fall through to a broken
        // Google iframe. Detect common byte signatures and set the correct type.
        if ($raw !== '' && strlen($raw) >= 4) {
            $head4 = substr($raw, 0, 4);
            if ($head4 === '%PDF') {
                $mime = 'application/pdf';
            } elseif (substr($raw, 0, 2) === 'PK' && strlen($raw) > 30) {
                // ZIP-based Office formats: detect by internal signature
                $tail = substr($raw, -22);
                if (strpos($tail, 'word/') !== false || strpos($raw, 'word/document.xml') !== false || strpos($raw, 'word/') !== false) {
                    $mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                } elseif (strpos($tail, 'xl/') !== false || strpos($raw, 'xl/workbook.xml') !== false) {
                    $mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                }
            } elseif (ord($raw[0]) === 0xFF && ord($raw[1]) === 0xD8 && ord($raw[2]) === 0xFF) {
                $mime = 'image/jpeg';
            } elseif (ord($raw[0]) === 0x89 && $raw[1] === 'P' && $raw[2] === 'N' && $raw[3] === 'G') {
                $mime = 'image/png';
            }
        }
    }
    if ($raw === '') {
        // Plain text / HTML content — stream as UTF-8 text.
        $raw = $c;
        if ($mime === 'application/octet-stream' || $mime === '') {
            $mime = preg_match('/<\w+[^>]*>/', $c) ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
        }
    }
}

// DB miss → best-effort GAS/Drive pull, then cache into MySQL (self-healing).
// v12.35.0-streamfix: do NOT gate the GAS pull on GAS_SYNC_ENABLED. When that
// flag is false, documents that have a drive_id but no cached `content` 404'd
// even though GAS was perfectly reachable — the root cause of the recurring
// `stream-doc.php?id=... 404` + "No streamable content" console errors.
// Gate only on a plausible Drive id.
if ($raw === '' && !empty($doc['drive_id']) && strlen((string)$doc['drive_id']) >= 25
    && defined('GAS_REAL_URL') && GAS_REAL_URL !== '') {
    try {
        $gasResp = _sd_postGAS(GAS_REAL_URL, json_encode([
            'action' => 'downloaddocument',
            'docId'  => $doc['drive_id'],
        ]));
        if (!empty($gasResp['success']) && ($gasResp['kind'] ?? '') === 'blob' && !empty($gasResp['b64'])) {
            $raw = base64_decode($gasResp['b64'], true) ?: '';
            if ($raw !== '' && !empty($doc['id']) && strlen($gasResp['b64']) < 24 * 1024 * 1024) {
                try {
                    dbQuery('UPDATE documents SET content=?, mime_type=COALESCE(NULLIF(mime_type,""),?), modified=NOW() WHERE id=?',
                        [$gasResp['b64'], $gasResp['mimeType'] ?? 'application/octet-stream', $doc['id']]);
                    clearQueryCache('documents');
                } catch (Throwable $_) { /* best-effort */ }
            }
            if (!empty($gasResp['mimeType'])) $mime = strtolower($gasResp['mimeType']);
        }
    } catch (Throwable $_) { /* fall through */ }
}

// v12.32.39-universal: STILL no bytes → last-resort direct fetch of the doc's
// own download_url / web_view_link (Google-hosted only, SSRF-guarded). Covers
// documents that predate GAS sync or whose Drive file moved out of GAS scope.
if ($raw === '') {
    $tryUrls = [];
    foreach (['download_url', 'web_view_link'] as $k) {
        $u = trim((string)($doc[$k] ?? ''));
        if ($u !== '' && preg_match('#^https://(drive|docs)\.google\.com/#i', $u)) $tryUrls[] = $u;
    }
    foreach ($tryUrls as $u) {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $u, CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 6, CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_USERAGENT => 'UEV-ERP/1.0',
        ]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $ct   = strtolower((string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE));
        curl_close($ch);
        // Google interstitials come back as text/html — only accept real file bytes.
        if ($code === 200 && is_string($body) && $body !== '' && strlen($body) < 24 * 1024 * 1024
            && strpos($ct, 'text/html') === false) {
            $raw = $body;
            if ($ct !== '') $mime = preg_replace('/;.*$/', '', $ct);
            if (!empty($doc['id'])) {
                try {
                    dbQuery('UPDATE documents SET content=?, mime_type=COALESCE(NULLIF(mime_type,""),?), modified=NOW() WHERE id=?',
                        [base64_encode($raw), $mime, $doc['id']]);
                    clearQueryCache('documents');
                } catch (Throwable $_) { /* best-effort */ }
            }
            break;
        }
    }
    // v12.40.0-streamharden: the uc?export=download attempt inside the loop above
    // rejected Google's virus-scan interstitial (text/html) outright, so a valid
    // hosted file could fall through to a 404 instead of rendering inline. Re-attempt
    // the bare drive_id through _sd_fetchDriveDirect, which transparently handles the
    // confirm-token interstitial, so ANY accessible Drive file ALWAYS resolves to
    // inline bytes. Caches the bytes back into the row for future self-healing.
    if ($raw === '' && !empty($doc['drive_id']) && strlen($doc['drive_id']) >= 25) {
        $_direct = _sd_fetchDriveDirect('https://drive.google.com/uc?export=download&id=' . rawurlencode($doc['drive_id']), $doc['drive_id']);
        if ($_direct !== null) {
            $raw = $_direct['body'];
            if (!empty($_direct['mime'])) $mime = $_direct['mime'];
            if (!empty($doc['id'])) {
                try {
                    dbQuery('UPDATE documents SET content=?, mime_type=COALESCE(NULLIF(mime_type,""),?), modified=NOW() WHERE id=?',
                        [base64_encode($raw), $mime, $doc['id']]);
                    clearQueryCache('documents');
                } catch (Throwable $_) { /* best-effort */ }
            }
        }
    }
}

if ($raw === '') _sd_fail(404, 'No streamable content for this document', ['id' => $doc['id'] ?? $id, 'driveId' => $doc['drive_id'] ?? '', 'name' => $doc['name'] ?? '', 'mime' => $doc['mime_type'] ?? '', 'previewLink' => $doc['preview_link'] ?? '', 'webViewLink' => $doc['web_view_link'] ?? '']);

$size = strlen($raw);
$name = $doc['name'] ?? 'document';
$etag = '"' . sha1($size . '|' . ($doc['modified'] ?? '') . '|' . ($doc['id'] ?? $id)) . '"';

// ── Conditional GET ──
if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
    http_response_code(304);
    header('ETag: ' . $etag);
    exit;
}

// ── Headers ──
$asciiName = preg_replace('/[^\x20-\x7E]/', '_', $name) ?: 'document';
$disp = ($dl ? 'attachment' : 'inline')
      . '; filename="' . str_replace('"', '', $asciiName) . '"'
      . "; filename*=UTF-8''" . rawurlencode($name);
header('Content-Type: ' . $mime);
header('Content-Disposition: ' . $disp);
header('ETag: ' . $etag);
header('Cache-Control: private, max-age=300');
header('Accept-Ranges: bytes');
header('X-Content-Type-Options: nosniff');
header('X-UEV-Source: db');

// ── Range support (browser PDF viewer requests partial content) ──
$start = 0; $end = $size - 1;
if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $m)) {
    if ($m[1] !== '') { $start = (int)$m[1]; $end = ($m[2] !== '') ? (int)$m[2] : $size - 1; }
    elseif ($m[2] !== '') { $start = max(0, $size - (int)$m[2]); $end = $size - 1; }
    if ($start > $end || $start >= $size) {
        http_response_code(416);
        header('Content-Range: bytes */' . $size);
        exit;
    }
    $end = min($end, $size - 1);
    http_response_code(206);
    header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
}
header('Content-Length: ' . ($end - $start + 1));

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') exit;
echo substr($raw, $start, $end - $start + 1);
