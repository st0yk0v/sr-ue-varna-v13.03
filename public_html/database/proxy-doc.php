<?php
/**
 * proxy-doc.php — Google Docs CSP bypass proxy
 *
 * Google Docs/Drive sends `X-Frame-Options: SAMEORIGIN` and/or
 * `Content-Security-Policy: frame-ancestors 'self'` headers that block
 * embedding in iframes. This proxy fetches the Google Doc export (HTML)
 * server-side and returns it through our own domain — the browser sees a
 * same-origin response, so CSP/framing restrictions do not apply.
 *
 * Usage:  proxy-doc.php?driveId=1HLVrLrfRXaQD5wcqJkWTAwbcd1wp0PJeDEn_vgRxmb4
 *         proxy-doc.php?url=https://docs.google.com/document/d/.../export?format=html
 *
 * Cache:  5 min (Cache-Control: public, max-age=300) to reduce Drive API calls.
 *         Busts on ?refresh=1.
 *
 * Security:
 *   - Only allows google.com URLs (prevents open-redirect abuse).
 *   - Strips all Google CSP/X-Frame-Options headers from the response.
 *   - Limits response size to 5 MB.
 */

// ── Configuration ────────────────────────────────────────────────────────
$MAX_SIZE = 5 * 1024 * 1024;    // 5 MB
$CACHE_TTL = 300;                // 5 min
$TIMEOUT = 15;                   // curl timeout (seconds)

// ── Parse input ──────────────────────────────────────────────────────────
$driveId = trim($_GET['driveId'] ?? '');
$url     = trim($_GET['url'] ?? '');
$refresh = !empty($_GET['refresh']);

// Detect document type from optional type parameter, or mime_type from DB
$docType = trim($_GET['type'] ?? '');
$isSheet = ($docType === 'sheet' || stripos($docType, 'spreadsheet') !== false || stripos($_SERVER['HTTP_REFERER'] ?? '', 'sheets') !== false);
$editMode = !empty($_GET['edit']);
$erpMode  = !empty($_GET['erp']);   // v3.39.6-erpcontent: serve the ERP's own stored
                                     // copy of the document (documents.content) instead of
                                     // Google's export. Lets the modal VIEW the same content
                                     // that the inline text editor edits/saves — one source of
                                     // truth that bypasses Google's blocked /edit framing.
// v3.39.7-erpfix: the modal may pass the synthetic ERP id (up_/copied_, <25 chars)
// as driveId for the content lookup, plus the REAL Drive file id as fid for the
// Google-export fallback. Resolve both up front.
$fid = trim($_GET['fid'] ?? '');

// ── Helper: fetch plain-text export from Google (Docs txt / Sheets csv) ──
// Returns the text string on success, or null on any failure (404 / binary /
// network error). Used by erp mode so native Google files render as real text
// instead of a broken HTML export (404 for .docx/.xlsx, or raw markup for Docs).
if (!function_exists('_fetchGoogleText_')) {
    function _fetchGoogleText_($url) {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            CURLOPT_HTTPHEADER     => ['Accept: text/plain,text/csv,application/text,*/*'],
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code !== 200 || $body === false || $body === '') return null;
        // A 200 that is actually HTML means Google refused the text export
        // (e.g. binary office file) — treat as "no content" so we never inject
        // markup into the modal.
        if (preg_match('/^\s*<(!doctype|html)/i', $body)) return null;
        return $body;
    }
}

// ── ERP content mode: read documents.content from MySQL ──
if ($erpMode) {
    if ($driveId === '' && $fid === '') {
        http_response_code(400);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Missing document identifier.';
        exit;
    }
    try {
        if (!function_exists('getDB')) {
            require_once __DIR__ . '/config.php';
            require_once __DIR__ . '/sql_service.php';
        }
        // Prefer the synthetic ERP id; fall back to the real Drive id.
        // v3.39.7-erpfix: try BOTH ids (content may be stored under either).
        $candidates = array_values(array_unique(array_filter([$driveId, $fid], function($x){ return $x !== ''; })));
        $row = null;
        foreach ($candidates as $cid) {
            $row = dbFetchOne('SELECT content, mime_type, name FROM documents WHERE id=?', [$cid]);
            if ($row !== null) break;
        }
        if ($row !== null) {
            $ct = $row['mime_type'] ?? 'text/plain';
            $out = $row['content'] ?? '';
            if (preg_match('#html#i', $ct) || stripos($ct, 'html') !== false) {
                $out = preg_replace(
                    '/<meta[^>]*http-equiv=["\'](Content-Security-Policy|X-Frame-Options|X-Content-Security-Policy)["\'][^>]*>/i',
                    '', $out);
                header('Content-Type: text/html; charset=utf-8');
            } else {
                header('Content-Type: text/plain; charset=utf-8');
            }
            header('Cache-Control: no-store');
            header('X-Erp-Content: 1');
            header_remove('X-Frame-Options');
            echo $out;
            exit;
        }
        // v3.39.13-stable: No ERP copy stored (common for freshly-attached Drive
        // templates). Do NOT fall through to export?format=html — that 404s for
        // .docx/.xlsx and returns raw HTML *markup* for a Google Doc (junk inside
        // the "edit in system" textarea / a broken iframe). Instead serve the
        // authoritative plain-text export for native Google files (Docs->txt,
        // Sheets->csv) server-side; for binary office files return a clean JSON
        // "no inline copy" signal so the modal opens the proper
        // "Отвори в Google Drive" state instead of a broken iframe.
        $effFid = (preg_match('/^[A-Za-z0-9_-]{25,}$/', $driveId)) ? $driveId : $fid;
        if ($effFid !== '') {
            $textUrl = $isSheet
                ? 'https://docs.google.com/spreadsheets/d/' . $effFid . '/export?format=csv'
                : 'https://docs.google.com/document/d/' . $effFid . '/export?format=txt';
            $txt = _fetchGoogleText_($textUrl);
            if ($txt !== null && $txt !== '') {
                header('Content-Type: text/plain; charset=utf-8');
                header('Cache-Control: no-store');
                header('X-Erp-Content: 1');
                header('X-Erp-Source: google-export');
                header_remove('X-Frame-Options');
                echo $txt;
                exit;
            }
        }
        // Binary office file (or export unavailable): clean no-content signal.
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Erp-Content: 0');
        header('X-Erp-NoContent: 1');
        header_remove('X-Frame-Options');
        echo json_encode([
            'erp'        => 1,
            'hasContent' => false,
            'driveId'    => $effFid,
            'message'    => 'No inline copy available — open in Google Drive to view/edit.',
        ]);
        exit;
    } catch (Throwable $e) {
        error_log('proxy-doc erp-mode failed: ' . $e->getMessage());
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Erp-Content: 0');
        header('X-Erp-NoContent: 1');
        header_remove('X-Frame-Options');
        echo json_encode(['erp' => 1, 'hasContent' => false, 'error' => 'erp-mode error']);
        exit;
    }
}

// Build the export URL from driveId / fid
// v3.39.7-erpfix: the ERP-synthetic id is <25 chars and not a valid Drive id.
// Use the REAL Drive file id (fid) as the effective export target when the
// passed driveId is synthetic. This prevents "Invalid driveId format" from
// being rendered raw inside the iframe.
$effectiveId = (preg_match('/^[A-Za-z0-9_-]{25,}$/', $driveId)) ? $driveId : $fid;
if ($effectiveId !== '' && $url === '') {
    $url = $isSheet
        ? "https://docs.google.com/spreadsheets/d/{$effectiveId}/export?format=html"
        : "https://docs.google.com/document/d/{$effectiveId}/export?format=html";
} elseif ($url !== '') {
    // Validate URL: only allow *.google.com/*export* URLs

    if (!preg_match('#^https://(docs|drive|sheets|accounts)\.google\.com/.*(export|preview|view|edit).*$#i', $url)) {
        http_response_code(400);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success'=>false, 'error'=>'Only google.com export URLs allowed']);
        exit;
    }
} else {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success'=>false, 'error'=>'Missing driveId or url']);
    exit;
}

// ── Simple file cache ────────────────────────────────────────────────────
$cacheDir = sys_get_temp_dir() . '/erp-docproxy';
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);
$cacheKey = 'docproxy_' . md5($url);
$cacheFile = $cacheDir . '/' . $cacheKey;

if (!$refresh && is_file($cacheFile) && (time() - filemtime($cacheFile)) < $CACHE_TTL) {
    $cached = file_get_contents($cacheFile);
    if ($cached !== false) {
        $meta = json_decode($cached, true);
        if ($meta && isset($meta['content_type'])) {
            header("Content-Type: {$meta['content_type']}");
            header('Cache-Control: public, max-age=' . $CACHE_TTL);
            header('X-Proxy-Cache: HIT');
            echo base64_decode($meta['body']);
            exit;
        }
    }
}

// ── Fetch from Google ────────────────────────────────────────────────────
$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL            => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 5,
    CURLOPT_TIMEOUT        => $TIMEOUT,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    CURLOPT_HTTPHEADER     => [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language: bg,en-US;q=0.9,en;q=0.8',
    ],
]);

$body = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
$size = strlen($body);
curl_close($ch);

// ── Error handling ───────────────────────────────────────────────────────
// v3.39.7-erpfix: NEVER emit raw JSON into the iframe. Render a clean,
// same-origin HTML page with a "open in Google Drive" fallback instead. This
// applies to 404s (e.g. .docx/.xlsx templates that Google can't export as HTML)
// and any other fetch failure.
function _renderProxyError($title, $detail, $driveOpenUrl) {
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header_remove('X-Frame-Options');
    $escTitle   = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    $escDetail  = htmlspecialchars($detail, ENT_QUOTES, 'UTF-8');
    $escOpen    = htmlspecialchars($driveOpenUrl ?: '', ENT_QUOTES, 'UTF-8');
    echo '<!DOCTYPE html><html lang="bg"><head><meta charset="utf-8">'
       . '<meta name="viewport" content="width=device-width,initial-scale=1">'
       . '<style>body{font-family:Open Sans,Segoe UI,Arial,sans-serif;background:#f8f9fa;'
       . 'color:#333;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}'
       . '.card{background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:2rem 2.5rem;'
       . 'max-width:420px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.08)}'
       . '.ic{font-size:2.2rem;color:#b30b00;margin-bottom:.5rem}'
       . 'h3{margin:.2rem 0;font-size:1.05rem;color:#1a1a1a}'
       . 'p{font-size:.82rem;color:#666;line-height:1.5;margin:.4rem 0 .9rem}'
       . 'a.btn{display:inline-block;background:#1a73e8;color:#fff;text-decoration:none;'
       . 'padding:.5rem 1.1rem;border-radius:6px;font-size:.85rem;font-weight:600}'
       . 'a.btn:hover{background:#1666d6}</style></head><body>'
       . '<div class="card"><div class="ic">⚠️</div>'
       . '<h3>' . $escTitle . '</h3>'
       . '<p>' . $escDetail . '</p>'
       . ($escOpen ? '<a class="btn" href="' . $escOpen . '" target="_blank" rel="noopener noreferrer">Отвори в Google Drive</a>' : '')
       . '</div></body></html>';
    exit;
}

if ($httpCode !== 200 || $body === false || $body === '') {
    // Build a Google Drive open URL from the real id (works for .docx/.xlsx too).
    $driveOpen = $effectiveId !== ''
        ? 'https://drive.google.com/file/d/' . $effectiveId . '/view'
        : ($fid !== '' ? 'https://drive.google.com/file/d/' . $fid . '/view' : '');
    // v12.47.6-googlepreview: A 400/401 from the unauthenticated server export
    // means the doc is PRIVATE (not ANYONE_WITH_LINK shared) and Google refuses
    // the server-side fetch. But the viewer is ALREADY signed into Google with
    // access — so instead of showing a dead-end error, hand the iframe off to
    // Google's frameable /preview endpoint, which honors the viewer's OWN
    // browser session. This is the canonical "user is verified to view" path and
    // is the same surface the direct _dpDirectEmbed uses. Only genuine failures
    // (404 unsupportable type / 403 truly forbidden / no id) fall back to the
    // friendly error panel with an "Отвори в Google Drive" link.
    if (($httpCode == 400 || $httpCode == 401) && $effectiveId !== '') {
        $pv = $isSheet
            ? 'https://docs.google.com/spreadsheets/d/' . rawurlencode($effectiveId) . '/preview?rm=minimal'
            : 'https://docs.google.com/document/d/' . rawurlencode($effectiveId) . '/preview?rm=minimal';
        header('Location: ' . $pv, true, 302);
        exit;
    }
    $detail = 'Документът не може да се визуализира вътре в системата';
    if ($httpCode == 404) {
        $detail .= ' (Google не поддържа преглед на този файлов тип — отворете го в Google Drive).';
    } else {
        $detail .= ' (грешка при извличане от Google, код ' . (int)$httpCode . ').';
    }
    _renderProxyError('Прегледът не е наличен', $detail, $driveOpen);
}

if ($size > $MAX_SIZE) {
    http_response_code(413);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success'=>false, 'error'=>'Document too large (>5MB)']);
    exit;
}

// ── Strip Google's CSP/X-Frame-Options headers ───────────────────────────
// Google often embeds them IN the HTML as <meta> tags. Remove them.
$body = preg_replace(
    '/<meta[^>]*http-equiv=["\'](Content-Security-Policy|X-Frame-Options|X-Content-Security-Policy)["\'][^>]*>/i',
    '',
    $body
);

// ── Set response headers (OUR domain — no CSP issues) ────────────────────
$outContentType = $contentType ?: 'text/html; charset=utf-8';
header("Content-Type: $outContentType");
header('Cache-Control: public, max-age=' . $CACHE_TTL);
header('X-Proxy-Cache: MISS');
// Explicitly strip any framing restrictions
header_remove('X-Frame-Options');

// ── Cache ────────────────────────────────────────────────────────────────
$cacheData = json_encode([
    'content_type' => $outContentType,
    'body'         => base64_encode($body),
]);
@file_put_contents($cacheFile, $cacheData, LOCK_EX);

// ── Output ───────────────────────────────────────────────────────────────
echo $body;
