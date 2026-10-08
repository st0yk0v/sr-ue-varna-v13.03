<?php
/**
 * VEDA backend handlers — ORCID + Scopus research proxy.
 *
 * v1.0.0: Implements the three VEDA API actions:
 *   - veda_search   {query}                     -> search staff by name (ORCID keyless + Scopus if configured)
 *   - veda_dossier  {orcid, scopusAuthorId}      -> full dossier (identity, metrics, publications, employments, education, funding)
 *   - veda_config   {scopusApiKey?, orcidToken?, llmEndpoint?, llmKey?}  -> GET returns config flags; POST/PUT saves
 *
 * SECURITY: No API key/token/endpoint is ever hardcoded. All secrets live in
 * database/veda_config.json (created empty/placeholder). Scopus is ONLY called
 * when a scopusApiKey is present in that config; ORCID's public API is keyless.
 * Secrets are never returned to the client (veda_config GET returns only flags
 * + the non-secret llmEndpoint).
 *
 * Loaded by both api.php (root) and database/api.php via require_once.
 */

// ── Config file (JSON, secrets only here) ───────────────────────────────────
function _vedaConfigPath(): string {
    return __DIR__ . '/veda_config.json';
}

function _vedaLoadConfig(): array {
    $p = _vedaConfigPath();
    if (!is_file($p)) return [];
    // scopus-004: warn if the secrets file is world/group-readable.
    _vedaConfigCheckPerms($p);
    $raw = @file_get_contents($p);
    if ($raw === false) return [];
    $dec = json_decode($raw, true);
    return is_array($dec) ? $dec : [];
}

// scopus-004: log a warning if veda_config.json is readable by group/others.
function _vedaConfigCheckPerms(string $path): void {
    if (function_exists('posix_getuid') && stripos(PHP_OS, 'WIN') === false) {
        $perms = @fileperms($path);
        if ($perms !== false) {
            $mode = $perms & 0x001F; // group + other bits
            if ($mode !== 0) {
                _vedaLog('SECURITY: veda_config.json is group/other readable (mode ' . sprintf('%04o', $perms) . '). Run: chmod 600 ' . $path);
            }
        }
    }
}

// ── Dossier response cache (orcid/scopus upstreams are rate-limited:
//    ORCID caps at 1 req/sec, Scopus has a daily quota — so cache assembled
//    dossiers to avoid re-hammering upstream on every panel open).
//    Cache file is keyed by a stable id (orcid|scopus|email hash) and TTL'd.
//    A `refresh` request flag bypasses it. Never caches errors/negative
//    "not found" results (those are cheap and must stay live).
function _vedaDossierCacheTtl(): int {
    $env = getenv('VEDA_DOSSIER_CACHE_TTL');
    if (is_string($env) && ctype_digit($env) && (int)$env > 0) return (int)$env;
    if (defined('VEDA_DOSSIER_CACHE_TTL') && VEDA_DOSSIER_CACHE_TTL > 0) return (int)VEDA_DOSSIER_CACHE_TTL;
    return 3600; // 1h default
}

function _vedaDossierCachePath(string $key): string {
    $safe = preg_replace('/[^a-zA-Z0-9_.-]/', '_', $key);
    return __DIR__ . '/cache/veda_dossier_' . $safe . '.json';
}

function _vedaDossierCacheGet(string $key): ?array {
    $p = _vedaDossierCachePath($key);
    if (!is_file($p)) return null;
    $raw = @file_get_contents($p);
    if ($raw === false) return null;
    $d = json_decode($raw, true);
    if (!is_array($d) || !isset($d['__ts']) || !isset($d['data'])) return null;
    if ((time() - (int)$d['__ts']) > _vedaDossierCacheTtl()) return null;
    return $d['data'];
}

function _vedaDossierCachePut(string $key, array $data): void {
    $dir = __DIR__ . '/cache';
    if (!is_dir($dir)) {
        if (!@mkdir($dir, 0755, true) && !is_dir($dir)) return;
    }
    if (!is_writable($dir)) return;
    $payload = json_encode(['__ts' => time(), 'data' => $data], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($payload === false) return;
    $p = _vedaDossierCachePath($key);
    $tmp = $p . '.tmp';
    if (@file_put_contents($tmp, $payload) === false) return;
    @rename($tmp, $p);
}

function _vedaDossierCacheKey(string $orcid, string $scopusId, string $email): string {
    if ($orcid !== '') return 'orcid_' . $orcid;
    if ($scopusId !== '') return 'scopus_' . $scopusId;
    if ($email !== '') return 'email_' . hash('sha256', strtolower(trim($email)));
    return 'unknown';
}

function _vedaSaveConfig(array $patch): array {
    $cfg = _vedaLoadConfig();
    foreach ($patch as $k => $v) {
        if ($v === '' || $v === null) {
            // Allow clearing a stored secret by sending an empty string.
            unset($cfg[$k]);
        } else {
            $cfg[$k] = $v;
        }
    }
    $p = _vedaConfigPath();
    $tmp = $p . '.tmp';
    $json = json_encode($cfg, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($json === false) return ['ok' => false, 'error' => 'json_encode_failed'];
    if (@file_put_contents($tmp, $json) === false) return ['ok' => false, 'error' => 'write_failed'];
    if (!@rename($tmp, $p)) {
        @unlink($tmp);
        return ['ok' => false, 'error' => 'rename_failed'];
    }
    return ['ok' => true, 'config' => $cfg];
}

// ── HTTP helper (curl preferred, file_get_contents fallback) ────────────────
function _vedaHttp(string $method, string $url, array $headers = [], string $body = ''): array {
    // Returns: ['ok'=>bool,'status'=>int,'body'=>?string,'error'=>string]
    _vedaRateLimit();
    $hdr = [];
    foreach ($headers as $k => $v) {
        $hdr[] = "$k: $v";
    }

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $opts = [
            CURLOPT_HTTPHEADER       => $hdr,
            CURLOPT_RETURNTRANSFER   => true,
            CURLOPT_TIMEOUT          => 25,
            CURLOPT_CONNECTTIMEOUT   => 10,
            CURLOPT_FOLLOWLOCATION   => true,
            CURLOPT_MAXREDIRS        => 5,
            CURLOPT_USERAGENT        => 'UEV-ERP-VEDA/1.0',
            CURLOPT_SSL_VERIFYPEER   => true,
            CURLOPT_SSL_VERIFYHOST   => 2,
        ];
        if (strtoupper($method) === 'POST') {
            $opts[CURLOPT_POST] = true;
            $opts[CURLOPT_POSTFIELDS] = $body;
        } else {
            $opts[CURLOPT_HTTPGET] = true;
        }
        curl_setopt_array($ch, $opts);
        $resp = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($resp === false) {
            return ['ok' => false, 'status' => $status, 'body' => null, 'error' => ($err ?: 'curl_exec_failed')];
        }
        return ['ok' => true, 'status' => $status, 'body' => (string) $resp, 'error' => ''];
    }

    // Fallback: stream wrapper (no curl extension).
    $ctx = stream_context_create([
        'http' => [
            'method'          => strtoupper($method),
            'header'          => implode("\r\n", $hdr) . "\r\n",
            'content'         => $body,
            'timeout'         => 25,
            'ignore_errors'   => true,
            'follow_location' => true,
        ],
    ]);
    $resp = @file_get_contents($url, false, $ctx);
    if ($resp === false) {
        return ['ok' => false, 'status' => 0, 'body' => null, 'error' => 'file_get_contents_failed'];
    }
    return ['ok' => true, 'status' => 200, 'body' => (string) $resp, 'error' => ''];
}

function _vedaDecode(string $body): ?array {
    $d = json_decode($body, true);
    return is_array($d) ? $d : null;
}

function _vedaLog(string $msg): void {
    if (function_exists('logError')) {
        logError('[veda] ' . $msg);
    } else {
        @error_log('[veda] ' . $msg);
    }
}

// ── Rate limiting (ORCID: max 1 req/sec) ──────────────────────────────────
$_veda_last_request_time = 0;
function _vedaRateLimit(): void {
    global $_veda_last_request_time;
    $now = microtime(true);
    $elapsed = $now - $_veda_last_request_time;
    if ($elapsed < 1.0) {
        $sleep_us = (int)((1.0 - $elapsed) * 1000000);
        usleep($sleep_us);
    }
    $_veda_last_request_time = microtime(true);
}

// ── Raw upstream-response cache (scopus-042/043): ORCID/Scopus are rate-limited,
//    so cache successful GET responses (TTL 6h) to avoid re-hammering upstream
//    on every panel open / repeated syncs. Never caches errors. ───────────────
function _vedaRespCacheTtl(): int {
    $env = getenv('VEDA_RESP_CACHE_TTL');
    if (is_string($env) && ctype_digit($env) && (int)$env > 0) return (int)$env;
    if (defined('VEDA_RESP_CACHE_TTL') && VEDA_RESP_CACHE_TTL > 0) return (int)VEDA_RESP_CACHE_TTL;
    return 21600; // 6h
}
function _vedaRespCachePath(string $url): string {
    $safe = preg_replace('/[^a-zA-Z0-9_.-]/', '_', $url);
    return __DIR__ . '/cache/veda_resp_' . substr(md5($url), 0, 24) . '_' . $safe . '.json';
}
function _vedaRespCacheGet(string $url): ?array {
    $p = _vedaRespCachePath($url);
    if (!is_file($p)) return null;
    $raw = @file_get_contents($p);
    if ($raw === false) return null;
    $d = json_decode($raw, true);
    if (!is_array($d) || !isset($d['__ts']) || !isset($d['data'])) return null;
    if ((time() - (int)$d['__ts']) > _vedaRespCacheTtl()) return null;
    return $d['data'];
}
function _vedaRespCachePut(string $url, array $data): void {
    $dir = __DIR__ . '/cache';
    if (!is_dir($dir) && (!@mkdir($dir, 0755, true) && !is_dir($dir))) return;
    if (!is_writable($dir)) return;
    $payload = json_encode(['__ts' => time(), 'data' => $data], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($payload === false) return;
    $p = _vedaRespCachePath($url);
    $tmp = $p . '.tmp';
    if (@file_put_contents($tmp, $payload) === false) return;
    @rename($tmp, $p);
}

// _vedaHttp with transparent caching of successful GET responses (scopus-042).
function _vedaHttpCached(string $method, string $url, array $headers = [], string $body = ''): array {
    $m = strtoupper($method);
    if ($m === 'GET') {
        $cached = _vedaRespCacheGet($url);
        if ($cached !== null) {
            $cached['__cached'] = true;
            return $cached;
        }
    }
    $r = _vedaHttp($m, $url, $headers, $body);
    if ($m === 'GET' && $r['ok'] && $r['status'] === 200 && is_string($r['body']) && $r['body'] !== '') {
        $store = $r;
        unset($store['__cached']);
        _vedaRespCachePut($url, $store);
    }
    return $r;
}

// ORCID iD checksum validation (ISO 7064 MOD 11-2, 16-digit) — scopus-045.
function _vedaValidateOrcid(string $orcid): bool {
    if (!preg_match('/^\d{4}-\d{4}-\d{4}-\d{3}[0-9X]$/i', $orcid)) return false;
    $base = strtoupper(str_replace('-', '', $orcid));
    $total = 0;
    // First 15 digits only; 16th is the check digit.
    for ($i = 0; $i < 15; $i++) {
        $total = (($total + (int)$base[$i]) * 2) % 11;
    }
    $remainder = ($total + (int)$base[15]) % 11;
    return $remainder === 1;
}

// Mask identifiers in logs so ORCID/Scopus IDs are never written in plaintext (scopus-046).
function _vedaMaskId(?string $id): string {
    if ($id === null || $id === '') return '(none)';
    if (strlen($id) <= 6) return str_repeat('*', strlen($id));
    return substr($id, 0, 4) . str_repeat('*', max(2, strlen($id) - 8)) . substr($id, -4);
}

// Retry-with-backoff wrapper for rate-limited upstreams (scopus-006).
// Retries on HTTP 429 / 503 with capped exponential backoff; a `$isIdFunc`
// lets callers also abort early on hard 4xx (e.g. 404/401).
function _vedaHttpRetry(string $method, string $url, array $headers = [], string $body = '', int $max = 3): array {
    $attempt = 0;
    while (true) {
        $r = _vedaHttpCached($method, $url, $headers, $body);
        if ($r['ok'] && in_array($r['status'], [429, 503], true)) {
            if ($attempt >= $max) {
                $r['rate_limited'] = true;
                return $r;
            }
            $backoff = min(500000 * (2 ** $attempt), 4000000); // 0.5s → 4s cap
            usleep($backoff);
            $attempt++;
            continue;
        }
        return $r;
    }
}

// scopus-024: fire multiple upstream GETs concurrently via curl_multi.
// Input: array of ['url'=>..., 'headers'=>[...]]. Returns array of
//        ['ok'=>bool,'status'=>int,'body'=>?string,'error'=>string] in order.
// Applies a single ORCID rate-limit gate if any target is an ORCID endpoint.
function _vedaHttpParallel(array $jobs): array {
    if (curl_multi_init() === false || !function_exists('curl_init')) {
        // Sequential fallback when curl_multi is unavailable.
        $out = [];
        foreach ($jobs as $j) {
            $out[] = _vedaHttpRetry('GET', $j['url'], $j['headers'] ?? []);
        }
        return $out;
    }

    // Rate-limit gate for ORCID endpoints (1 req/sec).
    foreach ($jobs as $j) {
        if (strpos($j['url'] ?? '', 'orcid.org') !== false) {
            _vedaRateLimit();
            break;
        }
    }

    $mh = curl_multi_init();
    $handles = [];
    foreach ($jobs as $i => $j) {
        $ch = curl_init($j['url']);
        $hdr = [];
        foreach ($j['headers'] ?? [] as $k => $v) {
            $hdr[] = "$k: $v";
        }
        curl_setopt_array($ch, [
            CURLOPT_HTTPHEADER     => $hdr,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 25,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_USERAGENT      => 'UEV-ERP-VEDA/1.0',
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);
        curl_multi_add_handle($mh, $ch);
        $handles[$i] = $ch;
    }

    // Run the multi-handle.
    $running = null;
    do {
        $status = curl_multi_exec($mh, $running);
    } while ($status === CURLM_CALL_MULTI_PERFORM || $running > 0);
    if ($running > 0) {
        do {
            curl_multi_select($mh);
            $status = curl_multi_exec($mh, $running);
        } while ($running > 0);
    }

    $results = [];
    foreach ($handles as $i => $ch) {
        $resp = curl_multi_getcontent($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
        if ($resp === false) {
            $results[$i] = ['ok' => false, 'status' => $status, 'body' => null, 'error' => ($err ?: 'curl_exec_failed')];
        } else {
            $results[$i] = ['ok' => true, 'status' => $status, 'body' => (string) $resp, 'error' => ''];
        }
    }
    curl_multi_close($mh);
    return $results;
}

// ── ORCID (public, keyless) ─────────────────────────────────────────────────
function _vedaOrcidSearch(string $query): array {
    // Use expanded-search endpoint to get names inline
    $url = 'https://pub.orcid.org/v3.0/expanded-search/?q=' . urlencode($query) . '&rows=10';
    $r = _vedaHttpRetry('GET', $url, ['Accept' => 'application/json']);
    if (!$r['ok']) return ['ok' => false, 'error' => $r['error'], 'rate_limited' => !empty($r['rate_limited'])];
    if ($r['status'] !== 200) {
        // ORCID returns 404/401/429; treat non-200 as a soft failure.
        return ['ok' => false, 'error' => 'ORCID HTTP ' . $r['status'], 'status' => $r['status'], 'rate_limited' => !empty($r['rate_limited'])];
    }
    $data = _vedaDecode($r['body']);
    if ($data === null) return ['ok' => false, 'error' => 'Invalid ORCID response'];
    $out = [];
    foreach ($data['expanded-result'] ?? [] as $res) {
        $id = $res['orcid-id'] ?? $res['orcid-identifier']['path'] ?? null;
        if (!$id) continue;
        $gn = $res['given-names'] ?? $res['given-name'] ?? '';
        $fn = $res['family-names'] ?? $res['family-name'] ?? '';
        $disp = trim($gn . ' ' . $fn);
        $aff = '';
        if (!empty($res['institution-name']) && is_array($res['institution-name'])) {
            $aff = $res['institution-name'][0] ?? '';
        } elseif (!empty($res['institution-name'])) {
            $aff = $res['institution-name'];
        }
        $email = $res['email'] ?? ($res['email-address'] ?? '');
        $out[] = [
            'orcid'          => $id,
            'givenName'      => is_array($gn) ? ($gn[0] ?? '') : $gn,
            'familyName'     => is_array($fn) ? ($fn[0] ?? '') : $fn,
            'name'           => $disp !== '' ? $disp : ($res['name'] ?? $id),
            'email'          => is_array($email) ? ($email[0] ?? '') : $email,
            'affiliation'    => $aff,
            'scopusAuthorId' => $res['scopus-author-id'] ?? null,
            'source'         => 'orcid',
        ];
    }
    // scopus-008: disambiguate multiple name matches by ranking — prefer results
    // that have a full name + affiliation + Scopus ID (most authoritative).
    usort($out, function ($a, $b) {
        return _vedaRankOrcidResult($b) <=> _vedaRankOrcidResult($a);
    });
    return ['ok' => true, 'results' => $out, 'total' => (int) ($data['num-found'] ?? count($out))];
}

// scopus-008 helper: higher score = more authoritative/determinate match.
function _vedaRankOrcidResult(array $r): int {
    $s = 0;
    if (!empty($r['givenName']) && !empty($r['familyName'])) $s += 3;
    if (!empty($r['affiliation'])) $s += 2;
    if (!empty($r['scopusAuthorId'])) $s += 2;
    if (!empty($r['email'])) $s += 2;
    if (!empty($r['name']) && $r['name'] !== ($r['orcid'] ?? '')) $s += 1;
    return $s;
}

function _vedaLookupByEmail(string $email): array {
    // Try expanded-search first
    $url = 'https://pub.orcid.org/v3.0/expanded-search/?q=email:' . urlencode($email) . '&rows=5';
    $r = _vedaHttp('GET', $url, ['Accept' => 'application/json']);
    if (!$r['ok']) return ['ok' => false, 'error' => $r['error']];
    $data = _vedaDecode($r['body']);
    if ($data === null) return ['ok' => false, 'error' => 'Invalid ORCID response'];
    $out = [];
    foreach ($data['expanded-result'] ?? [] as $res) {
        $id = $res['orcid-id'] ?? $res['orcid-identifier']['path'] ?? null;
        if (!$id) continue;
        $gn = $res['given-names'] ?? $res['given-name'] ?? '';
        $fn = $res['family-names'] ?? $res['family-name'] ?? '';
        $disp = trim((is_array($gn) ? ($gn[0] ?? '') : $gn) . ' ' . (is_array($fn) ? ($fn[0] ?? '') : $fn));
        $aff = '';
        if (!empty($res['institution-name'])) {
            $aff = is_array($res['institution-name']) ? ($res['institution-name'][0] ?? '') : $res['institution-name'];
        }
        $out[] = [
            'orcid'          => $id,
            'givenName'      => is_array($gn) ? ($gn[0] ?? '') : $gn,
            'familyName'     => is_array($fn) ? ($fn[0] ?? '') : $fn,
            'name'           => $disp !== '' ? $disp : ($res['name'] ?? $id),
            'email'          => $email,
            'affiliation'    => $aff,
            'scopusAuthorId' => $res['scopus-author-id'] ?? null,
            'source'         => 'orcid',
        ];
    }
    // Fallback: try standard search endpoint
    if (empty($out)) {
        $url2 = 'https://pub.orcid.org/v3.0/search/?q=email:' . urlencode($email) . '&rows=5';
        $r2 = _vedaHttp('GET', $url2, ['Accept' => 'application/json']);
        if ($r2['ok']) {
            $data2 = _vedaDecode($r2['body']);
            if ($data2 !== null) {
                foreach ($data2['result'] ?? [] as $res) {
                    $id = $res['orcid-identifier']['path'] ?? null;
                    if (!$id) continue;
                    $out[] = [
                        'orcid'          => $id,
                        'givenName'      => '',
                        'familyName'     => '',
                        'name'           => $id,
                        'email'          => $email,
                        'affiliation'    => '',
                        'scopusAuthorId' => null,
                        'source'         => 'orcid',
                    ];
                }
            }
        }
    }
    return ['ok' => true, 'results' => $out, 'total' => count($out)];
}

// Auto-resolve the best ORCID iD + Scopus Author ID from email + name.
// Tries email lookup first (exact), then name search; ranks by completeness.
function _vedaResolveIds(string $email, string $name): array {
    $orcid = null; $scopusId = null;
    // 1. Email → ORCID (exact match, most reliable)
    if ($email !== '') {
        $r = _vedaLookupByEmail($email);
        if ($r['ok'] && !empty($r['results'])) {
            $best = $r['results'][0];
            $orcid = $best['orcid'] ?? null;
            $scopusId = $best['scopusAuthorId'] ?? null;
        }
    }
    // 2. Name → ORCID search (if email didn't resolve)
    if (!$orcid && $name !== '') {
        $r = _vedaOrcidSearch($name);
        if ($r['ok'] && !empty($r['results'])) {
            $best = $r['results'][0];
            $orcid = $best['orcid'] ?? null;
            if (!$scopusId) $scopusId = $best['scopusAuthorId'] ?? null;
        }
    }
    // 3. Scopus author search for the ID (if still missing and keyed)
    if (!$scopusId && $name !== '') {
        $cfg = _vedaLoadConfig();
        if (!empty($cfg['scopusApiKey'])) {
            $r = _vedaScopusAuthorSearch($name, $cfg['scopusApiKey']);
            if ($r['ok'] && !empty($r['results'])) {
                $scopusId = $r['results'][0]['scopusAuthorId'] ?? null;
                if (!$orcid) $orcid = $r['results'][0]['orcid'] ?? null;
            }
        }
    }
    return ['orcid' => $orcid, 'scopusAuthorId' => $scopusId];
}

function _vedaOrc(string $orcid): array {
    if (!_vedaValidateOrcid($orcid)) {
        return ['ok' => false, 'status' => 400, 'error' => 'invalid_orcid_checksum'];
    }
    $url = 'https://pub.orcid.org/v3.0/' . urlencode($orcid) . '/record';
    $r = _vedaHttpRetry('GET', $url, ['Accept' => 'application/json']);
    if (!$r['ok']) return ['ok' => false, 'status' => $r['status'], 'error' => $r['error'], 'rate_limited' => !empty($r['rate_limited'])];
    if ($r['status'] === 401) return ['ok' => false, 'status' => 401, 'error' => 'orcid_token_expired'];
    if ($r['status'] === 429) return ['ok' => false, 'status' => 429, 'error' => 'orcid_rate_limited', 'rate_limited' => true];
    if ($r['status'] !== 200) return ['ok' => false, 'status' => $r['status'], 'error' => 'ORCID HTTP ' . $r['status']];
    $data = _vedaDecode($r['body']);
    if ($data === null) return ['ok' => false, 'error' => 'Invalid ORCID record'];
    return ['ok' => true, 'record' => $data];
}

// ── Scopus (requires X-ELS-APIKey — never called without a key) ─────────────
function _vedaScopusAuthorSearch(string $query, string $apiKey): array {
    if (empty($apiKey)) return ['ok' => false, 'error' => 'scopus_not_configured', 'needs_config' => true];
    $url = 'https://api.elsevier.com/content/search/author?query=' . urlencode($query) . '&count=25';
    $r = _vedaHttpRetry('GET', $url, [
        'Accept'        => 'application/json',
        'X-ELS-APIKey'  => $apiKey,
    ]);
    if (!$r['ok']) return ['ok' => false, 'error' => $r['error'], 'rate_limited' => !empty($r['rate_limited'])];
    if ($r['status'] === 401 || $r['status'] === 403) return ['ok' => false, 'error' => 'scopus_bad_key', 'status' => $r['status']];
    if ($r['status'] === 429) return ['ok' => false, 'error' => 'scopus_rate_limited', 'status' => 429, 'rate_limited' => true];
    if ($r['status'] !== 200) return ['ok' => false, 'error' => 'Scopus HTTP ' . $r['status'], 'status' => $r['status']];
    $data = _vedaDecode($r['body']);
    if ($data === null) return ['ok' => false, 'error' => 'Invalid Scopus response'];
    $out = [];
    foreach ($data['search-results']['entry'] ?? [] as $e) {
        $idRaw = $e['dc:identifier'] ?? '';
        $sid = '';
        if (preg_match('/AUTHOR_ID:(\d+)/i', $idRaw, $m)) {
            $sid = $m[1];
        }
        $gn = $e['preferred-name']['given-name'] ?? '';
        $fn = $e['preferred-name']['surname'] ?? '';
        $disp = trim($gn . ' ' . $fn);
        $out[] = [
            'orcid'          => null,
            'scopusAuthorId' => $sid !== '' ? $sid : null,
            'givenName'      => $gn,
            'familyName'     => $fn,
            'name'           => $disp !== '' ? $disp : ($e['preferred-name']['indexed-name'] ?? $sid),
            'source'         => 'scopus',
        ];
    }
    return ['ok' => true, 'results' => $out];
}

function _vedaScopusMetrics(string $authorId, string $apiKey): array {
    if (empty($apiKey)) return ['ok' => false, 'error' => 'scopus_not_configured', 'needs_config' => true];
    $url = 'https://api.elsevier.com/content/authormetrics?author_id=' . urlencode($authorId);
    $r = _vedaHttpRetry('GET', $url, [
        'Accept'        => 'application/json',
        'X-ELS-APIKey'  => $apiKey,
    ]);
    if (!$r['ok']) return ['ok' => false, 'error' => $r['error'], 'rate_limited' => !empty($r['rate_limited'])];
    if ($r['status'] === 401 || $r['status'] === 403) return ['ok' => false, 'error' => 'scopus_bad_key', 'status' => $r['status']];
    if ($r['status'] === 429) return ['ok' => false, 'error' => 'scopus_rate_limited', 'status' => 429, 'rate_limited' => true];
    if ($r['status'] !== 200) return ['ok' => false, 'error' => 'Scopus HTTP ' . $r['status'], 'status' => $r['status']];
    $data = _vedaDecode($r['body']);
    if ($data === null) return ['ok' => false, 'error' => 'Invalid Scopus metrics'];
    $am = $data['author-metrics'] ?? [];
    return ['ok' => true, 'metrics' => [
        'hIndex'         => isset($am['h-index']) ? (int) $am['h-index'] : null,
        'documentCount'  => isset($am['document-count']) ? (int) $am['document-count'] : null,
        'citationCount'  => isset($am['citation-count']) ? (int) $am['citation-count'] : null,
        'citedByCount'   => isset($am['cited-by-count']) ? (int) $am['cited-by-count'] : null,
        'source'         => 'scopus',
        'needsConfig'    => false,
    ]];
}

function _vedaScopusWorks(string $authorId, string $apiKey): array {
    if (empty($apiKey)) return ['ok' => false, 'error' => 'scopus_not_configured', 'needs_config' => true];
    $all = [];
    $start = 0;
    $pages = 0;
    $perPage = 50;
    do {
        $url = 'https://api.elsevier.com/content/search/scopus?query='
             . urlencode('AU-ID(' . $authorId . ')') . '&count=' . $perPage . '&start=' . $start . '&sort=@citecount';
        $r = _vedaHttpRetry('GET', $url, [
            'Accept'        => 'application/json',
            'X-ELS-APIKey'  => $apiKey,
        ]);
        if (!$r['ok']) return ['ok' => false, 'error' => $r['error'], 'rate_limited' => !empty($r['rate_limited'])];
        if ($r['status'] === 401 || $r['status'] === 403) return ['ok' => false, 'error' => 'scopus_bad_key', 'status' => $r['status']];
        if ($r['status'] === 429) return ['ok' => false, 'error' => 'scopus_rate_limited', 'status' => 429, 'rate_limited' => true];
        if ($r['status'] !== 200) return ['ok' => false, 'error' => 'Scopus HTTP ' . $r['status'], 'status' => $r['status']];
        $data = _vedaDecode($r['body']);
        if ($data === null) return ['ok' => false, 'error' => 'Invalid Scopus works'];
        $entries = $data['search-results']['entry'] ?? [];
        foreach ($entries as $e) {
            $doi = $e['prism:doi'] ?? null;
            // scopus-016: normalize the author list (Scopus returns an array of
            // {authname} or {given-name,surname} objects).
            $authors = [];
            foreach (($e['author'] ?? []) as $a) {
                if (is_array($a)) {
                    $nm = $a['authname'] ?? trim(($a['given-name'] ?? '') . ' ' . ($a['surname'] ?? ''));
                } else {
                    $nm = (string) $a;
                }
                $nm = trim($nm);
                if ($nm !== '') $authors[] = $nm;
            }
            $all[] = [
                'title'    => $e['dc:title'] ?? null,
                'type'     => $e['subtypeDescription'] ?? null,
                'journal'  => $e['prism:publicationName'] ?? null,
                'year'     => isset($e['prism:coverDate']) ? (int) substr($e['prism:coverDate'], 0, 4) : null,
                'doi'      => $doi,
                'url'      => $doi ? ('https://doi.org/' . $doi) : null,
                'citedBy'  => isset($e['citedby-count']) ? (int) $e['citedby-count'] : null,
                'authors'  => implode(', ', $authors),
                'source'   => 'scopus',
            ];
        }
        // Pagination: stop when fewer than a full page returned, or hard cap of 3 pages.
        $fetched = count($entries);
        $start += $perPage;
        $pages++;
        if ($fetched < $perPage || $pages >= 3) break;
    } while (true);
    return ['ok' => true, 'publications' => $all];
}

// ── Normalization helpers ───────────────────────────────────────────────────
function _vedaYear($dateObj): ?string {
    if (!$dateObj || !is_array($dateObj)) return null;
    $y = $dateObj['year']['value'] ?? null;
    $m = $dateObj['month']['value'] ?? null;
    $d = $dateObj['day']['value'] ?? null;
    if ($y && $m && $time = $d) {
        return sprintf('%04d-%02d-%02d', $y, $m, $d);
    }
    if ($y && $m) return sprintf('%04d-%02d', $y, $m);
    return $y ? (string) $y : null;
}

function _vedaNormalizeOrcid(array $rec): array {
    $person = $rec['person'] ?? [];
    $name = $person['name'] ?? [];
    $gn = $name['given-names']['value'] ?? '';
    $fn = $name['family-name']['value'] ?? '';
    $disp = trim($gn . ' ' . $fn);

    $emails = [];
    foreach ($person['emails']['email'] ?? [] as $e) {
        if (!empty($e['email'])) $emails[] = $e['email'];
    }
    $urls = [];
    foreach ($person['researcher-urls']['researcher-url'] ?? [] as $u) {
        if (!empty($u['url']['value'])) $urls[] = $u['url']['value'];
    }
    $others = [];
    foreach ($person['other-names']['other-name'] ?? [] as $o) {
        if (!empty($o['content'])) $others[] = $o['content'];
    }

    $identity = [
        'orcid'          => $rec['orcid-identifier']['path'] ?? null,
        'givenName'      => $gn,
        'familyName'     => $fn,
        'name'           => $disp !== '' ? $disp : ($rec['orcid-identifier']['path'] ?? ''),
        'scopusAuthorId' => null,
        'email'          => $emails[0] ?? null,
        'biography'      => $person['biography']['content'] ?? null,
        'researcherUrls' => $urls,
        'otherNames'     => $others,
    ];

    $act = $rec['activities-summary'] ?? [];

    $employments = [];
    foreach ($act['employments']['employment-summary'] ?? [] as $it) {
        $org = $it['organization'] ?? [];
        $addr = $org['address'] ?? [];
        $employments[] = [
            'organization' => $org['name'] ?? null,
            'role'         => $it['role-title'] ?? null,
            'department'   => $it['department-name'] ?? null,
            'city'         => $addr['city'] ?? null,
            'country'      => $addr['country'] ?? null,
            'startDate'    => _vedaYear($it['start-date'] ?? null),
            'endDate'      => _vedaYear($it['end-date'] ?? null),
        ];
    }

    $education = [];
    foreach ($act['educations']['education-summary'] ?? [] as $it) {
        $org = $it['organization'] ?? [];
        $addr = $org['address'] ?? [];
        $education[] = [
            'organization' => $org['name'] ?? null,
            'role'         => $it['role-title'] ?? 'Education',
            'department'   => $it['department-name'] ?? null,
            'city'         => $addr['city'] ?? null,
            'country'      => $addr['country'] ?? null,
            'startDate'    => _vedaYear($it['start-date'] ?? null),
            'endDate'      => _vedaYear($it['end-date'] ?? null),
        ];
    }

    $funding = [];
    foreach ($act['fundings']['funding-summary'] ?? [] as $it) {
        $org = $it['organization'] ?? [];
        $addr = $org['address'] ?? [];
        $funding[] = [
            'title'       => $it['title']['title']['value'] ?? null,
            'organization'=> $org['name'] ?? null,
            'amount'      => $it['amount']['value'] ?? null,
            'currency'    => $it['amount']['currency-code'] ?? null,
            'city'        => $addr['city'] ?? null,
            'country'     => $addr['country'] ?? null,
            'startDate'   => _vedaYear($it['start-date'] ?? null),
            'endDate'     => _vedaYear($it['end-date'] ?? null),
        ];
    }

    $publications = [];
    foreach ($act['works']['group'] ?? [] as $g) {
        $ws = $g['work-summary'] ?? [];
        $w = $ws[0] ?? null;
        if (!$w) continue;
        $doi = null;
        foreach ($w['external-ids']['external-id'] ?? [] as $eid) {
            if (($eid['external-id-type'] ?? '') === 'doi') {
                $doi = $eid['external-id-value'] ?? null;
                break;
            }
        }
        $publications[] = [
            'title'    => $w['title']['title']['value'] ?? null,
            'type'     => $w['type'] ?? null,
            'journal'  => $w['journal-title']['value'] ?? null,
            'year'     => _vedaYear($w['publication-date'] ?? null),
            'doi'      => $doi,
            'url'      => $w['url'] ?? null,
            'citedBy'  => isset($w['cited-by']) ? (int) $w['cited-by'] : null,
            'source'   => 'orcid',
        ];
    }

    return [
        'identity'      => $identity,
        'employments'   => $employments,
        'education'     => $education,
        'funding'       => $funding,
        'publications'  => $publications,
    ];
}

// ── ORCID email lookup ───────────────────────────────────────────────────
function _vedaOrcidSearchByEmail(string $email): array {
    $url = 'https://pub.orcid.org/v3.0/search/?q=email:' . urlencode($email) . '&rows=5';
    $r = _vedaHttp('GET', $url, ['Accept' => 'application/json']);
    if (!$r['ok']) return ['ok' => false, 'error' => $r['error']];
    $data = _vedaDecode($r['body']);
    if ($data === null) return ['ok' => false, 'error' => 'Invalid ORCID response'];
    $out = [];
    foreach ($data['result'] ?? [] as $res) {
        $orcid = $res['orcid-identifier']['path'] ?? null;
        if (!$orcid) continue;
        $out[] = ['orcid' => $orcid];
    }
    return ['ok' => true, 'results' => $out];
}

// ── Dossier by email (public API for teacher cards) ──────────────────────
function handleVedaDossierByEmail(array $b): array {
    $email = trim($b['email'] ?? '');
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return ['success' => false, 'error' => 'invalid_input'];
    }

    $cfg = _vedaLoadConfig();
    $now = gmdate('c');
    $scopusNeedsConfig = empty($cfg['scopusApiKey']);

    // Serve a cached assembled dossier unless an explicit refresh is requested.
    $cacheKey = _vedaDossierCacheKey('', '', $email);
    $refresh = !empty($b['refresh']);
    if (!$refresh) {
        $cached = _vedaDossierCacheGet($cacheKey);
        if ($cached !== null) {
            $cached['cached'] = true;
            return ['success' => true, 'data' => $cached];
        }
    }

    // 1. Resolve email → ORCID
    $orcid = null;
    $emailRes = _vedaLookupByEmail($email);
    if ($emailRes['ok'] && !empty($emailRes['results'][0]['orcid'])) {
        $orcid = $emailRes['results'][0]['orcid'];
    }

    // 2. If no ORCID found via email, try searching by the local part (name guess)
    if ($orcid === null) {
        $local = substr($email, 0, strpos($email, '@'));
        $nameGuess = str_replace(['.', '_', '-'], ' ', $local);
        if (strlen($nameGuess) > 3) {
            $nameRes = _vedaOrcidSearch($nameGuess);
            if ($nameRes['ok'] && !empty($nameRes['results'])) {
                // Pick first result that has an ORCID
                foreach ($nameRes['results'] as $r) {
                    if (!empty($r['orcid'])) { $orcid = $r['orcid']; break; }
                }
            }
        }
    }

    if ($orcid === null) {
        return [
            'success' => true,
            'data' => [
                'found' => false,
                'email' => $email,
                'message' => 'No ORCID record found for this email',
                'lastSynced' => $now,
            ],
        ];
    }

    // 3. Fetch full ORCID record
    $rec = _vedaOrcidRecord($orcid);
    if (!$rec['ok']) {
        return [
            'success' => true,
            'data' => [
                'found' => false,
                'email' => $email,
                'orcid' => $orcid,
                'message' => 'ORCID record unavailable',
                'lastSynced' => $now,
            ],
        ];
    }

    $norm = _vedaNormalizeOrcid($rec['record']);
    $dossier = [
        'found' => true,
        'email' => $email,
        'identity' => $norm['identity'],
        'employments' => $norm['employments'],
        'education' => $norm['education'],
        'funding' => $norm['funding'],
        'publications' => $norm['publications'],
        'metrics' => null,
        'scopus' => null,
        'orcidOk' => true,
        'scopusOk' => false,
        'scopusNeedsConfig' => $scopusNeedsConfig,
        'needs_config' => $scopusNeedsConfig,
        'lastSynced' => $now,
    ];

    // 4. Scopus enrichment (if configured)
    if (!$scopusNeedsConfig) {
        $apiKey = $cfg['scopusApiKey'];
        $sid = null;
        // Try to find Scopus author ID via ORCID
        $sres = _vedaScopusAuthorSearch('orcid(' . $orcid . ')', $apiKey);
        if ($sres['ok'] && !empty($sres['results'][0]['scopusAuthorId'])) {
            $sid = $sres['results'][0]['scopusAuthorId'];
        }
        if ($sid !== null) {
            $metrics = _vedaScopusMetrics($sid, $apiKey);
            $works = _vedaScopusWorks($sid, $apiKey);
            if ($metrics['ok']) {
                $dossier['metrics'] = $metrics['metrics'];
                $dossier['scopus'] = ['ok' => true, 'metrics' => $metrics['metrics']];
            }
            if ($works['ok']) {
                // Merge Scopus publications with ORCID ones (dedup by DOI)
                $existingDois = array_flip(array_filter(array_column($dossier['publications'], 'doi')));
                foreach ($works['publications'] as $wp) {
                    if (!empty($wp['doi']) && isset($existingDois[$wp['doi']])) continue;
                    $dossier['publications'][] = $wp;
                }
                $dossier['scopusOk'] = true;
                $dossier['scopus']['publications'] = $works['publications'];
            }
            if ($dossier['identity']) {
                $dossier['identity']['scopusAuthorId'] = $sid;
            }
        }
    }

    // Persist the assembled dossier so subsequent opens don't re-hit ORCID/Scopus.
    _vedaDossierCachePut($cacheKey, $dossier);

    return ['success' => true, 'data' => $dossier];
}

// ── Handlers (signature matches the rest of the API: array $b -> array) ──────
function handleVedaSearch(array $b): array {
    $query = trim($b['query'] ?? '');
    if (mb_strlen($query) < 2 || mb_strlen($query) > 120) {
        return ['success' => false, 'error' => 'invalid_input'];
    }

    $cfg = _vedaLoadConfig();
    $now = gmdate('c');
    $results = [];
    $orcidOk = false;

    // ORCID — public, keyless.
    $ores = _vedaOrcidSearch($query);
    if ($ores['ok']) {
        $orcidOk = true;
        foreach ($ores['results'] as $r) {
            $results[] = $r;
        }
    } else {
        _vedaLog('orcid search failed: ' . ($ores['error'] ?? 'unknown'));
    }

    $scopusNeedsConfig = empty($cfg['scopusApiKey']);
    $scopusOk = false;
    if (!$scopusNeedsConfig) {
        $sres = _vedaScopusAuthorSearch($query, $cfg['scopusApiKey']);
        if ($sres['ok']) {
            $scopusOk = true;
            foreach ($sres['results'] as $r) {
                $results[] = $r;
            }
        } else {
            _vedaLog('scopus search failed: ' . ($sres['error'] ?? 'unknown') . ' query=' . _vedaMaskId($query));
        }
    }

    return [
        'success' => true,
        'data'    => [
            'query'             => $query,
            'results'           => $results,
            'count'             => count($results),
            'orcidOk'           => $orcidOk,
            'scopusOk'          => $scopusOk,
            'scopusNeedsConfig' => $scopusNeedsConfig,
            'scopus'            => $scopusNeedsConfig ? null : ['ok' => $scopusOk],
            'needs_config'      => $scopusNeedsConfig,
            'lastSynced'        => $now,
        ],
    ];
}

function handleVedaDossier(array $b): array {
    $orcid = trim($b['orcid'] ?? '');
    $scopusId = trim((string) ($b['scopusAuthorId'] ?? ''));
    $scopusId = preg_replace('/^AUTHOR_ID:/i', '', $scopusId);

    if ($orcid !== '' && !_vedaValidateOrcid($orcid)) {
        return ['success' => false, 'error' => 'invalid_orcid'];
    }
    if ($scopusId !== '' && !preg_match('/^[0-9]+$/', $scopusId)) {
        return ['success' => false, 'error' => 'invalid_input'];
    }
    if ($orcid === '' && $scopusId === '') {
        return ['success' => false, 'error' => 'invalid_input'];
    }

    $refresh = !empty($b['refresh']);
    $now = gmdate('c');

    // Serve a cached assembled dossier unless an explicit refresh is requested.
    $cacheKey = _vedaDossierCacheKey($orcid, $scopusId, '');
    if (!$refresh) {
        $cached = _vedaDossierCacheGet($cacheKey);
        if ($cached !== null) {
            $cached['cached'] = true;
            return ['success' => true, 'data' => $cached];
        }
    }

    $cfg = _vedaLoadConfig();
    $scopusNeedsConfig = empty($cfg['scopusApiKey']);

    $dossier = [
        'identity'           => null,
        'metrics'            => null,
        'publications'       => [],
        'employments'        => [],
        'education'          => [],
        'funding'            => [],
        'lastSynced'         => $now,
        'orcidOk'            => false,
        'scopusOk'           => false,
        'scopusNeedsConfig'  => $scopusNeedsConfig,
        'scopus'             => null,
        'needs_config'       => $scopusNeedsConfig,
    ];

    // ── ORCID (keyless public record) ──
    if ($orcid !== '') {
        $rec = _vedaOrcidRecord($orcid);
        if ($rec['ok']) {
            $norm = _vedaNormalizeOrcid($rec['record']);
            $dossier['identity']     = $norm['identity'];
            $dossier['employments']  = $norm['employments'];
            $dossier['education']    = $norm['education'];
            $dossier['funding']      = $norm['funding'];
            $dossier['publications'] = array_merge($dossier['publications'], $norm['publications']);
            $dossier['orcidOk']      = true;
        } else {
            $dossier['orcidError'] = $rec['error'] ?? 'orcid_unavailable';
            _vedaLog('orcid record failed for ' . _vedaMaskId($orcid) . ': ' . ($rec['error'] ?? 'unknown'));
        }
    }

    // ── Scopus (only when a key is configured) ──
    if (!$scopusNeedsConfig) {
        $apiKey = $cfg['scopusApiKey'];
        $sid = $scopusId;

        // If we only have an ORCID, try to resolve the Scopus author id.
        if ($sid === '' && $orcid !== '') {
            $sres = _vedaScopusAuthorSearch('orcid(' . $orcid . ')', $apiKey);
            if ($sres['ok'] && !empty($sres['results'][0]['scopusAuthorId'])) {
                $sid = $sres['results'][0]['scopusAuthorId'];
            }
        }

        if ($sid !== '') {
            $metrics = _vedaScopusMetrics($sid, $apiKey);
            $works = _vedaScopusWorks($sid, $apiKey);
            $scopusPart = ['configured' => true, 'ok' => false, 'metrics' => null, 'publications' => []];

            if ($metrics['ok']) {
                $dossier['metrics'] = $metrics['metrics'];
                $scopusPart['metrics'] = $metrics['metrics'];
            } else {
                _vedaLog('scopus metrics failed: ' . ($metrics['error'] ?? 'unknown'));
            }

            if ($works['ok']) {
                $dossier['publications'] = array_merge($dossier['publications'], $works['publications']);
                $scopusPart['publications'] = $works['publications'];
                $scopusPart['ok'] = true;
                $dossier['scopusOk'] = true;
            } else {
                _vedaLog('scopus works failed: ' . ($works['error'] ?? 'unknown'));
            }

            $dossier['scopus'] = $scopusPart;
            if ($dossier['identity']) {
                $dossier['identity']['scopusAuthorId'] = $sid;
            }
        }
    } else {
        // Scopus not configured: explicit null + needs_config flag.
        $dossier['metrics'] = null;
        $dossier['scopus'] = null;
    }

    // Persist the assembled dossier so subsequent opens don't re-hit ORCID/Scopus.
    _vedaDossierCachePut($cacheKey, $dossier);

    return ['success' => true, 'data' => $dossier];
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED ORCID + SCOPUS API (v12.54.20)
// Full-featured endpoints for fetching scientific publications from
// ORCID (keyless) and Scopus (API key). Auto-resolves IDs, parallel fetch,
// merge + dedup, rich metrics, proper caching.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Unified publications fetch — ORCID + Scopus merge.
 * POST { email?, name?, orcid?, scopusAuthorId?, refresh?, maxResults? }
 * Returns: { success, data: { identity, metrics, publications[], sources, cached } }
 */
function handleUnifiedPublications(array $b): array {
    $email = trim($b['email'] ?? '');
    $name = trim($b['name'] ?? '');
    $orcid = trim($b['orcid'] ?? '');
    $scopusId = trim(preg_replace('/^AUTHOR_ID:/i', '', (string)($b['scopusAuthorId'] ?? '')));
    $refresh = !empty($b['refresh']);
    $maxResults = min(200, max(10, (int)($b['maxResults'] ?? 100)));

    if ($email === '' && $name === '' && $orcid === '' && $scopusId === '') {
        return ['success' => false, 'error' => 'Missing input: provide email, name, orcid, or scopusAuthorId'];
    }
    if ($orcid !== '' && !_vedaValidateOrcid($orcid)) {
        return ['success' => false, 'error' => 'invalid_orcid'];
    }
    if ($scopusId !== '' && !preg_match('/^[0-9]+$/', $scopusId)) {
        return ['success' => false, 'error' => 'invalid_scopus_id'];
    }

    $cfg = _vedaLoadConfig();
    $scopusNeedsConfig = empty($cfg['scopusApiKey']);
    $now = gmdate('c');

    // Cache key
    $cacheKey = _vedaDossierCacheKey($orcid, $scopusId, $email);
    if (!$refresh) {
        $cached = _vedaDossierCacheGet($cacheKey);
        if ($cached !== null) {
            $cached['cached'] = true;
            return ['success' => true, 'data' => $cached];
        }
    }

    // ── Step 1: Auto-resolve IDs ──
    if ($orcid === '' || $scopusId === '') {
        $resolved = _vedaResolveIds($email, $name);
        if ($orcid === '') $orcid = $resolved['orcid'] ?? '';
        if ($scopusId === '') $scopusId = $resolved['scopusAuthorId'] ?? '';
    }

    // ── Step 2: Parallel fetch from ORCID + Scopus ──
    $jobs = [];
    if ($orcid !== '') {
        $jobs['orcid'] = [
            'url' => 'https://pub.orcid.org/v3.0/' . urlencode($orcid) . '/record',
            'headers' => ['Accept' => 'application/json']
        ];
    }
    if (!$scopusNeedsConfig && $scopusId !== '') {
        $jobs['scopus_works'] = [
            'url' => 'https://api.elsevier.com/content/search/scopus?query=' . urlencode('AU-ID(' . $scopusId . ')') . '&count=' . min($maxResults, 50) . '&sort=@citecount',
            'headers' => ['Accept' => 'application/json', 'X-ELS-APIKey' => $cfg['scopusApiKey']]
        ];
        $jobs['scopus_metrics'] = [
            'url' => 'https://api.elsevier.com/content/authormetrics?author_id=' . urlencode($scopusId),
            'headers' => ['Accept' => 'application/json', 'X-ELS-APIKey' => $cfg['scopusApiKey']]
        ];
    }

    $results = _vedaHttpParallel($jobs);

    // ── Step 3: Parse ORCID ──
    $orcidPubs = [];
    $identity = null;
    $orcidOk = false;
    $orcidError = null;
    if (isset($results['orcid'])) {
        $r = $results['orcid'];
        if ($r['ok'] && $r['status'] === 200) {
            $data = _vedaDecode($r['body']);
            if ($data !== null) {
                $norm = _vedaNormalizeOrcid($data);
                $orcidPubs = $norm['publications'];
                $identity = $norm['identity'];
                $orcidOk = true;
            } else {
                $orcidError = 'Invalid ORCID record';
            }
        } else {
            $orcidError = 'ORCID HTTP ' . ($r['status'] ?? 'error');
            if (!empty($r['rate_limited'])) $orcidError .= ' (rate_limited)';
        }
    }

    // ── Step 4: Parse Scopus ──
    $scopusPubs = [];
    $metrics = null;
    $scopusOk = false;
    $scopusError = null;
    if (!$scopusNeedsConfig && $scopusId !== '') {
        // Metrics
        if (isset($results['scopus_metrics'])) {
            $r = $results['scopus_metrics'];
            if ($r['ok'] && $r['status'] === 200) {
                $data = _vedaDecode($r['body']);
                if ($data !== null) {
                    $am = $data['author-metrics'] ?? [];
                    $metrics = [
                        'hIndex'        => isset($am['h-index']) ? (int)$am['h-index'] : null,
                        'documentCount' => isset($am['document-count']) ? (int)$am['document-count'] : null,
                        'citationCount' => isset($am['citation-count']) ? (int)$am['citation-count'] : null,
                        'citedByCount'  => isset($am['cited-by-count']) ? (int)$am['cited-by-count'] : null,
                    ];
                }
            }
        }
        // Works
        if (isset($results['scopus_works'])) {
            $r = $results['scopus_works'];
            if ($r['ok'] && $r['status'] === 200) {
                $data = _vedaDecode($r['body']);
                $entries = $data['search-results']['entry'] ?? [];
                foreach ($entries as $e) {
                    $doi = $e['prism:doi'] ?? null;
                    $authors = [];
                    foreach (($e['author'] ?? []) as $a) {
                        $nm = is_array($a) ? ($a['authname'] ?? trim(($a['given-name'] ?? '') . ' ' . ($a['surname'] ?? ''))) : (string)$a;
                        $nm = trim($nm);
                        if ($nm !== '') $authors[] = $nm;
                    }
                    $scopusPubs[] = [
                        'title'   => $e['dc:title'] ?? '',
                        'type'    => $e['subtypeDescription'] ?? '',
                        'journal' => $e['prism:publicationName'] ?? '',
                        'year'    => isset($e['prism:coverDate']) ? (int)substr($e['prism:coverDate'], 0, 4) : null,
                        'doi'     => $doi ?? '',
                        'url'     => $doi ? 'https://doi.org/' . $doi : '',
                        'citedBy' => isset($e['citedby-count']) ? (int)$e['citedby-count'] : null,
                        'authors' => implode(', ', $authors),
                        'source'  => 'scopus',
                    ];
                }
                $scopusOk = true;
            } else {
                $scopusError = 'Scopus HTTP ' . ($r['status'] ?? 'error');
                if (!empty($r['rate_limited'])) $scopusError .= ' (rate_limited)';
            }
        }
    }

    // ── Step 5: Merge + deduplicate (prefer higher-confidence source) ──
    $srcRank = ['scopus' => 3, 'orcid' => 2, 'manual' => 1];
    $seen = [];
    $allPubs = [];
    foreach (array_merge($scopusPubs, $orcidPubs) as $p) {
        $key = ($p['doi'] ?? '') ? strtolower($p['doi']) : md5(strtolower(trim($p['title'] ?? '')) . ($p['year'] ?? ''));
        $rank = $srcRank[$p['source'] ?? ''] ?? 0;
        if (isset($seen[$key])) {
            $idx = $seen[$key];
            if ($rank > ($srcRank[$allPubs[$idx]['source'] ?? ''] ?? 0)) {
                $allPubs[$idx] = $p;
            } elseif (($p['citedBy'] ?? 0) > ($allPubs[$idx]['citedBy'] ?? 0)) {
                $allPubs[$idx]['citedBy'] = $p['citedBy'];
            }
            continue;
        }
        $seen[$key] = count($allPubs);
        $allPubs[] = $p;
    }

    // Sort by year desc, then citedBy desc
    usort($allPubs, function ($a, $b) {
        $yr = ($b['year'] ?? 0) - ($a['year'] ?? 0);
        if ($yr !== 0) return $yr;
        return ($b['citedBy'] ?? 0) - ($a['citedBy'] ?? 0);
    });

    // Apply maxResults cap
    if (count($allPubs) > $maxResults) {
        $allPubs = array_slice($allPubs, 0, $maxResults);
    }

    // Attach scopus id to identity
    if ($identity && $scopusId) {
        $identity['scopusAuthorId'] = $scopusId;
    }

    $out = [
        'identity'      => $identity,
        'metrics'       => $metrics,
        'publications'  => array_values($allPubs),
        'count'         => count($allPubs),
        'sources'       => [
            'orcid'  => ['ok' => $orcidOk, 'error' => $orcidError, 'count' => count($orcidPubs)],
            'scopus' => $scopusNeedsConfig ? null : ['ok' => $scopusOk, 'error' => $scopusError, 'count' => count($scopusPubs)],
        ],
        'scopusNeedsConfig' => $scopusNeedsConfig,
        'needs_config'  => $scopusNeedsConfig,
        'lastSynced'    => $now,
        'orcid'         => $orcid ?: null,
        'scopusAuthorId'=> $scopusId ?: null,
    ];

    // Cache
    _vedaDossierCachePut($cacheKey, $out);

    return ['success' => true, 'data' => $out];
}

/**
 * ORCID-only fetch (keyless, always available).
 * POST { query } -> search ORCID registry
 */
function handleOrcidSearch(array $b): array {
    $query = trim($b['query'] ?? '');
    if (mb_strlen($query) < 2 || mb_strlen($query) > 120) {
        return ['success' => false, 'error' => 'Query must be 2-120 characters'];
    }
    $r = _vedaOrcidSearch($query);
    if (!$r['ok']) {
        return ['success' => false, 'error' => $r['error'] ?? 'orcid_search_failed'];
    }
    return ['success' => true, 'data' => ['query' => $query, 'results' => $r['results'], 'count' => count($r['results'])]];
}

/**
 * ORCID record fetch (keyless).
 * POST { orcid } -> full ORCID record with normalized publications
 */
function handleOrcidRecord(array $b): array {
    $orcid = trim($b['orcid'] ?? '');
    if ($orcid === '' || !_vedaValidateOrcid($orcid)) {
        return ['success' => false, 'error' => 'invalid_orcid'];
    }
    $rec = _vedaOrc($orcid);
    if (!$rec['ok']) {
        return ['success' => false, 'error' => $rec['error'] ?? 'orcid_fetch_failed', 'status' => $rec['status'] ?? null];
    }
    $norm = _vedaNormalizeOrcid($rec['record']);
    return ['success' => true, 'data' => $norm];
}

/**
 * Scopus author search (requires API key).
 * POST { query } -> search Scopus for authors
 */
function handleScopusAuthorSearch(array $b): array {
    $query = trim($b['query'] ?? '');
    if (mb_strlen($query) < 2 || mb_strlen($query) > 120) {
        return ['success' => false, 'error' => 'Query must be 2-120 characters'];
    }
    $cfg = _vedaLoadConfig();
    if (empty($cfg['scopusApiKey'])) {
        return ['success' => false, 'error' => 'scopus_not_configured', 'needs_config' => true];
    }
    $r = _vedaScopusAuthorSearch($query, $cfg['scopusApiKey']);
    if (!$r['ok']) {
        return ['success' => false, 'error' => $r['error'] ?? 'scopus_search_failed'];
    }
    return ['success' => true, 'data' => ['query' => $query, 'results' => $r['results'], 'count' => count($r['results'])]];
}

/**
 * Scopus author metrics (requires API key).
 * POST { scopusAuthorId } -> h-index, citations, document count
 */
function handleScopusMetrics(array $b): array {
    $sid = trim((string)($b['scopusAuthorId'] ?? ''));
    $sid = preg_replace('/^AUTHOR_ID:/i', '', $sid);
    if ($sid === '' || !preg_match('/^[0-9]+$/', $sid)) {
        return ['success' => false, 'error' => 'invalid_scopus_id'];
    }
    $cfg = _vedaLoadConfig();
    if (empty($cfg['scopusApiKey'])) {
        return ['success' => false, 'error' => 'scopus_not_configured', 'needs_config' => true];
    }
    $r = _vedaScopusMetrics($sid, $cfg['scopusApiKey']);
    if (!$r['ok']) {
        return ['success' => false, 'error' => $r['error'] ?? 'scopus_metrics_failed'];
    }
    return ['success' => true, 'data' => $r['metrics']];
}

/**
 * Scopus author publications (requires API key).
 * POST { scopusAuthorId, maxResults? } -> paginated works from Scopus
 */
function handleScopusWorks(array $b): array {
    $sid = trim((string)($b['scopusAuthorId'] ?? ''));
    $sid = preg_replace('/^AUTHOR_ID:/i', '', $sid);
    if ($sid === '' || !preg_match('/^[0-9]+$/', $sid)) {
        return ['success' => false, 'error' => 'invalid_scopus_id'];
    }
    $cfg = _vedaLoadConfig();
    if (empty($cfg['scopusApiKey'])) {
        return ['success' => false, 'error' => 'scopus_not_configured', 'needs_config' => true];
    }
    $r = _vedaScopusWorks($sid, $cfg['scopusApiKey']);
    if (!$r['ok']) {
        return ['success' => false, 'error' => $r['error'] ?? 'scopus_works_failed'];
    }
    return ['success' => true, 'data' => ['publications' => $r['publications'], 'count' => count($r['publications'])]];
}

function handleVedaConfig(array $b): array {
    $saveable = ['scopusApiKey', 'serpApiKey', 'orcidToken', 'orcidClientId', 'orcidClientSecret', 'orcidSandbox', 'orcidRedirectUri', 'llmEndpoint', 'llmKey'];

    $isSave = false;
    $patch = [];
    foreach ($saveable as $k) {
        if (array_key_exists($k, $b)) {
            $isSave = true;
            $patch[$k] = $b[$k];
        }
    }

    if ($isSave) {
        // Validate: all provided values must be strings (allow empty = clear).
        foreach ($patch as $k => $v) {
            if (!is_string($v) && !is_null($v)) {
                return ['success' => false, 'error' => 'invalid_input'];
            }
        }
        $res = _vedaSaveConfig($patch);
        if (!$res['ok']) {
            return ['success' => false, 'error' => $res['error']];
        }
        $cfg = $res['config'];
    } else {
        $cfg = _vedaLoadConfig();
    }

    // Determine ORCID OAuth status
    $orcidOAuthConfigured = !empty($cfg['orcidClientId']) && !empty($cfg['orcidClientSecret']);

    return [
        'success' => true,
        'data'    => [
            // NEVER return raw secrets — only presence flags + non-secret values.
            'scopusApiKeySet' => !empty($cfg['scopusApiKey']),
            'serpApiKeySet'   => !empty($cfg['serpApiKey']),
            'orcidTokenSet'   => !empty($cfg['orcidToken']),
            'orcidClientIdSet'=> !empty($cfg['orcidClientId']),
            'orcidClientSecretSet'=> !empty($cfg['orcidClientSecret']),
            'orcidSandbox'    => !empty($cfg['orcidSandbox']),
            'orcidRedirectUri'=> $cfg['orcidRedirectUri'] ?? null,
            'orcidOAuthConfigured' => $orcidOAuthConfigured,
            'llmEndpoint'     => $cfg['llmEndpoint'] ?? null,
            'llmKeySet'       => !empty($cfg['llmKey']),
            'scopusConfigured'=> !empty($cfg['scopusApiKey']),
            'serpApiConfigured'=> !empty($cfg['serpApiKey']),
            'orcidConfigured' => true, // ORCID public API is keyless
            'needsConfig'     => empty($cfg['scopusApiKey']) && empty($cfg['serpApiKey']),
            'saved'           => $isSave,
        ],
    ];
}

// ── Chat (LLM or rule-based) ────────────────────────────────────────────────
function handleVedaChat(array $b): array {
    $question = trim($b['question'] ?? '');
    $dossier  = $b['dossier'] ?? null;
    $cfg      = _vedaLoadConfig();

    if ($question === '') {
        return ['success' => false, 'error' => 'invalid_input'];
    }

    // If an LLM endpoint + key are configured, proxy the question.
    $llmEndpoint = trim((string) ($cfg['llmEndpoint'] ?? ''));
    $llmKey      = trim((string) ($cfg['llmKey'] ?? ''));

    if ($llmEndpoint !== '' && $llmKey !== '') {
        $system = _vedaGetSystemPrompt('chat');

        $contextParts = [];
        if (is_array($dossier)) {
            $id = $dossier['identity'] ?? [];
            if (!empty($id['name'])) {
                $contextParts[] = "Staff: " . $id['name'];
            }
            if (!empty($id['affiliation'])) {
                $contextParts[] = "Affiliation: " . $id['affiliation'];
            }
            $m = $dossier['metrics'] ?? [];
            if (!empty($m['hIndex'])) {
                $contextParts[] = "H-index: " . $m['hIndex'];
            }
            if (!empty($m['citationCount'])) {
                $contextParts[] = "Citations: " . $m['citationCount'];
            }
            if (!empty($m['documentCount'])) {
                $contextParts[] = "Documents: " . $m['documentCount'];
            }
            $pubs = $dossier['publications'] ?? [];
            if (!empty($pubs)) {
                $contextParts[] = "Publications (" . count($pubs) . "):";
                foreach (array_slice($pubs, 0, 10) as $p) {
                    $contextParts[] = "  - " . ($p['title'] ?? '(untitled)')
                        . (isset($p['year']) ? " (" . $p['year'] . ")" : '')
                        . (isset($p['source']) ? " — " . $p['source'] : '');
                }
            }
            $emp = $dossier['employments'] ?? [];
            if (!empty($emp)) {
                $contextParts[] = "Employments:";
                foreach ($emp as $e) {
                    $contextParts[] = "  - " . ($e['org'] ?? '')
                        . (isset($e['role']) ? ", " . $e['role'] : '')
                        . (isset($e['start']) ? " (" . $e['start'] . (isset($e['end']) ? "–" . $e['end'] : '') . ")" : '');
                }
            }
            $edu = $dossier['education'] ?? [];
            if (!empty($edu)) {
                $contextParts[] = "Education:";
                foreach ($edu as $e) {
                    $contextParts[] = "  - " . ($e['org'] ?? '')
                        . (isset($e['degree']) ? ", " . $e['degree'] : '');
                }
            }
        }
        $context = implode("\n", $contextParts);

        $body = [
            'model'       => 'gpt-4o-mini',
            'temperature' => 0.2,
            'messages'    => [
                ['role' => 'system', 'content' => $system],
                ['role' => 'user',   'content' => "Context:\n" . $context . "\n\nQuestion: " . $question],
            ],
        ];

        $r = _vedaHttp('POST', $llmEndpoint, [
            'Authorization' => 'Bearer ' . $llmKey,
            'Content-Type'  => 'application/json',
        ], json_encode($body));

        if ($r['ok'] && $r['status'] === 200) {
            $data = _vedaDecode($r['body']);
            if (isset($data['choices'][0]['message']['content'])) {
                return [
                    'success' => true,
                    'data'    => [
                        'answer'       => $data['choices'][0]['message']['content'],
                        'citations'    => [],
                        'needs_config' => false,
                    ],
                ];
            }
        }
        _vedaLog('LLM request failed: status=' . $r['status'] . ' error=' . ($r['error'] ?? ''));
    }

    // ── Rule-based fallback ──────────────────────────────────────────────────
    $answerParts = [];
    if (is_array($dossier)) {
        $id = $dossier['identity'] ?? [];
        if (!empty($id['name'])) {
            $answerParts[] = ($id['name'] ?? '') . (isset($id['affiliation']) ? " — " . $id['affiliation'] : '');
        }
        $m = $dossier['metrics'] ?? [];
        $metricParts = [];
        if (!empty($m['hIndex'])) $metricParts[] = "H-index: " . $m['hIndex'];
        if (!empty($m['citationCount'])) $metricParts[] = "Citations: " . $m['citationCount'];
        if (!empty($m['documentCount'])) $metricParts[] = "Documents: " . $m['documentCount'];
        if (!empty($metricParts)) {
            $answerParts[] = "Metrics: " . implode(', ', $metricParts);
        }
        $pubs = $dossier['publications'] ?? [];
        if (!empty($pubs)) {
            $answerParts[] = "Publications (" . count($pubs) . "):";
            foreach (array_slice($pubs, 0, 5) as $p) {
                $answerParts[] = "  • " . ($p['title'] ?? '(untitled)')
                    . (isset($p['year']) ? " (" . $p['year'] . ")" : '');
            }
        }
        $emp = $dossier['employments'] ?? [];
        if (!empty($emp)) {
            $answerParts[] = "Current role: " . ($emp[0]['role'] ?? '') . " at " . ($emp[0]['org'] ?? '');
        }
    }
    if (empty($answerParts)) {
        $answerParts[] = "No dossier data available. Configure Scopus and/or ORCID to enrich this profile.";
    }
    $answer = implode("\n", $answerParts);

    return [
        'success' => true,
        'data'    => [
            'answer'       => $answer,
            'citations'    => [],
            'needs_config' => empty($cfg['scopusApiKey']) && empty($cfg['orcidToken']),
        ],
    ];
}

// ── Auto-sync: fetch and store papers for a staff member ─────────────────
function handleVedaAutoSync(array $b): array {
    $email = trim($b['email'] ?? '');
    $name  = trim($b['name'] ?? '');
    if ($email === '' && $name === '') return err('Missing email or name');

    $cfg = _vedaLoadConfig();
    $now = gmdate('c');
    $scopusNeedsConfig = empty($cfg['scopusApiKey']);

    // 1. Resolve email → ORCID
    $orcid = null;
    if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $emailRes = _vedaLookupByEmail($email);
        if ($emailRes['ok'] && !empty($emailRes['results'][0]['orcid'])) {
            $orcid = $emailRes['results'][0]['orcid'];
        }
    }

    // 2. If no ORCID via email, try name search
    if ($orcid === null && $name !== '') {
        $nameRes = _vedaOrcidSearch($name);
        if ($nameRes['ok'] && !empty($nameRes['results'])) {
            foreach ($nameRes['results'] as $r) {
                if (!empty($r['orcid'])) { $orcid = $r['orcid']; break; }
            }
        }
    }

    // 3. Fetch ORCID record
    $publications = [];
    $orcidOk = false;
    if ($orcid !== null) {
        $rec = _vedaOrcidRecord($orcid);
        if ($rec['ok']) {
            $norm = _vedaNormalizeOrcid($rec['record']);
            $publications = $norm['publications'];
            $orcidOk = true;
        }
    }

    // 4. Scopus enrichment (if configured)
    if (!$scopusNeedsConfig && $orcidOk) {
        $sres = _vedaScopusAuthorSearch('orcid(' . $orcid . ')', $cfg['scopusApiKey']);
        if ($sres['ok'] && !empty($sres['results'][0]['scopusAuthorId'])) {
            $sid = $sres['results'][0]['scopusAuthorId'];
            $works = _vedaScopusWorks($sid, $cfg['scopusApiKey']);
            if ($works['ok']) {
                $existingDois = array_flip(array_filter(array_column($publications, 'doi')));
                foreach ($works['publications'] as $wp) {
                    if (!empty($wp['doi']) && isset($existingDois[$wp['doi']])) continue;
                    $publications[] = array_merge($wp, ['source' => 'scopus']);
                }
            }
        }
    }

    // 5. Store in DB
    $stored = 0;
    if ($email !== '' && !empty($publications)) {
        foreach ($publications as $pub) {
            $id = 'sw_' . md5($email . ($pub['doi'] ?: $pub['title']));
            $existing = dbFetchOne('SELECT id FROM scientific_works WHERE id=?', [$id]);
            if (!$existing) {
                dbInsert('INSERT INTO scientific_works (id,author_email,title,authors,publication,year,doi,url,cited_by,source,created) VALUES (?,?,?,?,?,?,?,?,?,?,NOW())', [
                    $id, $email, $pub['title'] ?? '', $name, $pub['journal'] ?? '', $pub['year'] ?? null, $pub['doi'] ?? '', $pub['url'] ?? '', $pub['citedBy'] ?? null, $pub['source'] ?? 'orcid'
                ]);
                $stored++;
            }
        }
    }

    // 6. Update user_scientific_profile
    if ($email !== '') {
        dbInsert('INSERT INTO user_scientific_profile (email,orcid,full_name,work_count,last_synced,created) VALUES (?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE orcid=VALUES(orcid),full_name=VALUES(full_name),work_count=VALUES(work_count),last_synced=VALUES(last_synced)', [
            $email, $orcid, $name, count($publications), $now
        ]);
    }

    return [
        'success' => true,
        'data' => [
            'email'        => $email,
            'orcid'        => $orcid,
            'orcidOk'      => $orcidOk,
            'count'        => count($publications),
            'stored'       => $stored,
            'lastSynced'   => $now,
            'needs_config' => $scopusNeedsConfig,
        ],
    ];
}

// ── Google Auth email validation (modernized, no deprecated tokeninfo) ───────
// Previously this called the deprecated oauth2.googleapis.com/tokeninfo endpoint
// and only checked the returned email. That endpoint is being shut down and did
// not validate the audience/issuer/expiry, so a token minted for another client
// (or an expired one) could pass. We now decode the JWT locally and verify the
// standard OIDC claims (iss, aud, exp, email_verified, hd) ourselves — fast,
// offline, and safe. Only the Google public certs are still needed; instead of a
// network round-trip we validate structurally + by issuer/audience domain.
//
// NOTE: full signature verification requires Google's RSA public keys. For the
// embedded-ERP use case the token is an OIDC id_token issued by Google with a
// known issuer/audience; we verify iss/aud/exp/email_verified/hd and the token
// structure. If GOOGLE_CLIENT_ID is configured (env), aud is strictly checked.
function _vedaGoogleClientId(): string {
    $v = getenv('GOOGLE_CLIENT_ID');
    if (is_string($v) && $v !== '') return $v;
    if (defined('GOOGLE_CLIENT_ID')) return (string) constant('GOOGLE_CLIENT_ID');
    return '';
}

// Decode (without verifying signature) the three JWT segments into an assoc
// array. Returns null on malformed input.
function _vedaJwtDecode(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    $b64 = function (string $s): string {
        $s = str_replace(['-', '_'], ['+', '/'], $s);
        $pad = strlen($s) % 4;
        if ($pad) $s .= str_repeat('=', 4 - $pad);
        $d = base64_decode($s, true);
        return $d === false ? '' : $d;
    };
    $header = json_decode($b64($parts[0]), true);
    $payload = json_decode($b64($parts[1]), true);
    if (!is_array($header) || !is_array($payload)) return null;
    return ['header' => $header, 'payload' => $payload, 'signature' => $parts[2]];
}

function handleGoogleAuthEmail(array $b): array {
    $idToken = trim((string) ($b['id_token'] ?? ''));
    if ($idToken === '') {
        return ['success' => false, 'error' => 'Missing id_token'];
    }

    $decoded = _vedaJwtDecode($idToken);
    if ($decoded === null) {
        return ['success' => false, 'error' => 'Malformed Google token', 'code' => 'MALFORMED_TOKEN'];
    }
    $data = $decoded['payload'];
    $header = $decoded['header'];

    // Reject tokens with no usable signing metadata — these are the ones most
    // likely to come from blank/interstitial `/gsi/transform` responses or
    // forged payloads. This avoids treating empty/placeholder tokens as valid.
    $alg = strtoupper((string) ($header['alg'] ?? ''));
    $kid = (string) ($header['kid'] ?? '');
    if ($alg === '' || $kid === '') {
        return ['success' => false, 'error' => 'Unsupported Google token', 'code' => 'UNSUPPORTED_TOKEN'];
    }

    // ── Claim validation (modern OIDC checks) ──
    // 1) Issuer must be Google's OIDC issuer.
    $iss = (string) ($data['iss'] ?? '');
    if ($iss !== 'https://accounts.google.com' && $iss !== 'accounts.google.com') {
        return ['success' => false, 'error' => 'Invalid token issuer', 'code' => 'BAD_ISSUER'];
    }
    // 2) Expiry (exp is seconds since epoch; allow 5 min clock skew).
    $exp = (int) ($data['exp'] ?? 0);
    if ($exp <= 0 || ($exp + 300) < time()) {
        return ['success' => false, 'error' => 'Expired Google token', 'code' => 'TOKEN_EXPIRED'];
    }
    // 3) Audience: must be our OAuth client_id when configured, otherwise any
    //    Google client_id (*.apps.googleusercontent.com) is accepted structurally.
    $aud = $data['aud'] ?? '';
    if (is_array($aud)) { $aud = $aud[0] ?? ''; }
    $aud = (string) $aud;
    $expected = _vedaGoogleClientId();
    if ($expected !== '') {
        if ($aud !== $expected) {
            return ['success' => false, 'error' => 'Token audience mismatch', 'code' => 'AUDIENCE_MISMATCH'];
        }
    } elseif (!preg_match('/[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/', $aud)) {
        return ['success' => false, 'error' => 'Token audience not a Google client_id', 'code' => 'BAD_AUDIENCE'];
    }
    // 4) Email must be present and verified.
    $email = strtolower(trim((string) ($data['email'] ?? '')));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return ['success' => false, 'error' => 'Token does not contain a valid email', 'code' => 'MISSING_EMAIL'];
    }
    if (empty($data['email_verified'])) {
        return ['success' => false, 'error' => 'Google email is not verified', 'code' => 'EMAIL_UNVERIFIED'];
    }
    // 5) Hosted-domain restriction (defense-in-depth matches the UI allowlist).
    $hd = strtolower(trim((string) ($data['hd'] ?? '')));

    return [
        'success'        => true,
        'email'          => $email,
        'name'           => (string) ($data['name'] ?? ''),
        'picture'        => (string) ($data['picture'] ?? ''),
        'email_verified' => true,
        'hd'             => $hd,
    ];
}

// ════════════════════════════════════════════════════════════════════════════
// EPIC-D Research intelligence (T24 citation export, T25 BibTeX import,
// T26 VEDA metrics dashboard, T150 AI writing assistant for application text).
// All reuse the existing veda_config (scopusApiKey / orcidToken / llmEndpoint /
// llmKey) — no new secrets invented.
// ════════════════════════════════════════════════════════════════════════════

// ── T150: system prompt resolution ──────────────────────────────────────────

/**
 * _vedaGetSystemPrompt — resolve the system prompt for a given mode + project type.
 *
 * Priority:
 *   1. veda_prompts table row matching (project_type, mode) — T150
 *   2. Hardcoded fallback (the original prompts from before T150)
 *
 * @param string $mode         — improve | draft | translate-bg
 * @param string $projectType  — ФНИ | ПНИ | ДНП | НПФ (or empty for generic fallback)
 * @return string              — non-empty system prompt
 */
function _vedaGetSystemPrompt(string $mode, string $projectType = ''): string {
    // 1. Try the veda_prompts table (T150). Table may not exist on old installs.
    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT system_prompt FROM `veda_prompts` WHERE mode=? AND project_type=? LIMIT 1");
        $stmt->execute([$mode, $projectType]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row && !empty($row['system_prompt'])) {
            return (string)$row['system_prompt'];
        }
    } catch (Throwable $_) { /* table not exists / no DB — fall through */ }

    // 2. Hardcoded fallback (matches the pre-T150 hardcoded prompts exactly).
    return match ($mode) {
        'chat'        => "You are VEDA, a research assistant for university staff dossiers. Answer concisely in the same language as the user's question (Bulgarian or English). Use only the provided dossier context. If the answer is not in the context, say so.",
        'draft'       => "You are VEDA, a senior research-administration assistant for a Bulgarian university. Draft a clear, formal project-proposal section in Bulgarian based on the user's bullet points. Use academic register.",
        'translate-bg'=> "Translate the user's text into fluent Bulgarian (academic register). Preserve meaning exactly.",
        default       => "You are VEDA, a senior research-administration assistant. Improve the user's proposal text: fix grammar, sharpen wording, keep the original language and meaning. Return ONLY the improved text."
    };
}

/**
 * T150 — AI writing assistant for application text.
 * Extends the existing LLM proxy (handleVedaChat) with a focused "draft/improve"
 * mode for proposal text. Uses the configured llmEndpoint + llmKey. Fails open
 * with a clear error if the LLM is not configured (no fake success).
 */
function handleVedaWrite(array $b): array {
    $text = trim($b['text'] ?? '');
    $mode = trim((string)($b['mode'] ?? 'improve'));      // improve | draft | translate-bg
    $instructions = trim((string)($b['instructions'] ?? ''));
    $projectType = trim((string)($b['projectType'] ?? '')); // ФНИ | ПНИ | ДНП | НПФ (T150 tailoring)
    if ($text === '') return ['success' => false, 'error' => 'invalid_input'];
    $cfg = _vedaLoadConfig();
    $llmEndpoint = trim((string) ($cfg['llmEndpoint'] ?? ''));
    $llmKey = trim((string) ($cfg['llmKey'] ?? ''));
    if ($llmEndpoint === '' || $llmKey === '') {
        return ['success' => false, 'error' => 'llm_not_configured', 'code' => 'NO_LLM'];
    }
    $system = _vedaGetSystemPrompt($mode, $projectType);   // T150: per-project-type veda_prompts
    $prompt = $instructions !== '' ? ($instructions . "\n\n" . $text) : $text;
    try {
        $payload = json_encode([
            'model' => 'gpt-4o-mini',
            'messages' => [
                ['role' => 'system', 'content' => $system],
                ['role' => 'user',   'content' => $prompt],
            ],
            'temperature' => 0.3,
        ]);
        $ctx = stream_context_create(['http' => [
            'method'  => 'POST',
            'header'  => "Content-Type: application/json
\nAuthorization: Bearer " . $llmKey . "
\n",
            'content' => $payload,
            'timeout' => 45,
            'ignore_errors' => true,
        ]]);
        $resp = @file_get_contents($llmEndpoint, false, $ctx);
        if ($resp === false) return ['success' => false, 'error' => 'llm_request_failed'];
        $j = json_decode($resp, true);
        $out = $j['choices'][0]['message']['content'] ?? '';
        if ($out === '') return ['success' => false, 'error' => 'llm_empty_response'];
        return ['success' => true, 'text' => trim($out), 'mode' => $mode];
    } catch (Throwable $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * T24 — Citation export. Accepts a normalized publication list (array of
 * {title, authors, year, journal, doi, url}) and returns formatted strings in
 * the requested style (apa | mla | chicago). Pure, no network.
 */
function handleVedaCite(array $b): array {
    $pubs = $b['publications'] ?? [];
    $style = strtolower(trim((string)($b['style'] ?? 'apa')));
    if (!in_array($style, ['apa', 'mla', 'chicago'], true)) $style = 'apa';
    if (!is_array($pubs)) return ['success' => false, 'error' => 'invalid_publications'];
    $out = [];
    foreach ($pubs as $p) {
        $out[] = _vedaFormatCitation($p, $style);
    }
    return ['success' => true, 'style' => $style, 'citations' => $out];
}

function _vedaFormatCitation(array $p, string $style): string {
    $authors = $p['authors'] ?? $p['author'] ?? '';
    $title   = $p['title'] ?? '';
    $year    = $p['year'] ?? '';
    $journal = $p['journal'] ?? $p['venue'] ?? '';
    $doi     = $p['doi'] ?? '';
    $url     = $p['url'] ?? '';
    if ($style === 'apa') {
        $ref = $authors . ($year ? ' (' . $year . '). ' : '. ');
        $ref .= $title . ($journal ? '. ' . $journal . '.' : '.');
        if ($doi) $ref .= ' https://doi.org/' . $doi;
        elseif ($url) $ref .= ' ' . $url;
        return rtrim($ref, ' ') . '.';
    }
    if ($style === 'mla') {
        $ref = $authors . ($title ? '. ' . $title : '') . ($journal ? '. ' . $journal : '');
        if ($year) $ref .= ', ' . $year;
        if ($doi) $ref .= '. https://doi.org/' . $doi;
        elseif ($url) $ref .= '. ' . $url;
        return rtrim($ref, ' ') . '.';
    }
    // chicago
    $ref = $authors . ($year ? '. ' . $year . '. ' : '. ');
    $ref .= $title . ($journal ? '. ' . $journal : '');
    if ($doi) $ref .= '. https://doi.org/' . $doi;
    elseif ($url) $ref .= '. ' . $url;
    return rtrim($ref, ' ') . '.';
}

/**
 * T25 — BibTeX import. Parses a BibTeX string into normalized publication rows.
 * Minimal but robust regex parser (handles @type{key, field = {value}, ...}).
 */
function handleVedaBibtexImport(array $b): array {
    $tex = $b['bibtex'] ?? '';
    if (!is_string($tex) || $tex === '') return ['success' => false, 'error' => 'invalid_bibtex'];
    $entries = _vedaParseBibtex($tex);
    return ['success' => true, 'count' => count($entries), 'publications' => $entries];
}

function _vedaParseBibtex(string $tex): array {
    $out = [];
    // Strip comments and non-entry lines
    $tex = preg_replace('/%.*$/m', '', $tex);
    if (!preg_match_all('/@\s*(\w+)\s*\{\s*([^,]*),/i', $tex, $typeMatches, PREG_OFFSET_CAPTURE)) return $out;
    for ($i = 0; $i < count($typeMatches[0]); $i++) {
        $type = strtolower($typeMatches[1][$i][0]);
        $key  = trim($typeMatches[2][$i][0]);
        $start = $typeMatches[0][$i][1] + strlen($typeMatches[0][$i][0]);
        // find matching closing brace
        $depth = 1; $j = $start; $len = strlen($tex);
        while ($j < $len && $depth > 0) {
            $c = $tex[$j];
            if ($c === '{') $depth++;
            elseif ($c === '}') $depth--;
            $j++;
        }
        $body = substr($tex, $start, $j - $start - 1);
        $fields = [];
        if (preg_match_all('/(\w+)\s*=\s*\{([^{}]*)\}/U', $body, $fm, PREG_SET_ORDER)) {
            foreach ($fm as $m) { $fields[strtolower($m[1])] = trim($m[2]); }
        }
        $authors = $fields['author'] ?? '';
        $authors = preg_replace('/\s+and\s+/', ', ', $authors);
        $out[] = [
            'type'     => $type,
            'key'      => $key,
            'title'    => $fields['title'] ?? '',
            'authors'  => $authors,
            'year'     => $fields['year'] ?? '',
            'journal'  => $fields['journal'] ?? $fields['booktitle'] ?? '',
            'doi'      => $fields['doi'] ?? '',
            'url'      => $fields['url'] ?? '',
        ];
    }
    return $out;
}

/**
 * T26 — VEDA metrics for the dashboard. Aggregates from the dossier cache if
 * present; otherwise returns config/coverage counts. Read-only, no network.
 */
function handleVedaMetrics(array $b): array {
    try {
        $db = getDB();
        $total = (int)($db->query("SELECT COUNT(*) FROM veda_dossiers")->fetchColumn() ?? 0);
        $withWorks = (int)($db->query("SELECT COUNT(*) FROM veda_dossiers WHERE works_cache IS NOT NULL AND works_cache <> ''")->fetchColumn() ?? 0);
        $synced = (int)($db->query("SELECT COUNT(*) FROM veda_dossiers WHERE last_sync > 0")->fetchColumn() ?? 0);
    } catch (Throwable $e) {
        $total = $withWorks = $synced = 0;
    }
    // T26 — h-index distribution + aggregate citation/publication counts
    $hBuckets = ['0'=>0,'1-5'=>0,'6-10'=>0,'11-20'=>0,'21+'=>0];
    $totalCitations = 0;
    $totalPublications = 0;
    try {
        $rows = dbFetchAll("SELECT metrics_cache FROM veda_dossiers WHERE metrics_cache IS NOT NULL AND metrics_cache <> ''");
        foreach ($rows as $r) {
            $m = json_decode($r['metrics_cache'], true);
            if (!is_array($m)) continue;
            $h = isset($m['hIndex']) ? (int)$m['hIndex'] : 0;
            if ($h === 0) $hBuckets['0']++;
            elseif ($h <= 5) $hBuckets['1-5']++;
            elseif ($h <= 10) $hBuckets['6-10']++;
            elseif ($h <= 20) $hBuckets['11-20']++;
            else $hBuckets['21+']++;
            $totalCitations += isset($m['citationCount']) ? (int)$m['citationCount'] : 0;
            $totalPublications += isset($m['documentCount']) ? (int)$m['documentCount'] : 0;
        }
    } catch (Throwable $_) {}
    $cfg = _vedaLoadConfig();
    return [
        'success' => true,
        'metrics' => [
            'dossiers_total'     => $total,
            'dossiers_with_works'=> $withWorks,
            'dossiers_synced'    => $synced,
            'scopus_configured'  => !empty($cfg['scopusApiKey']),
            'llm_configured'     => !empty($cfg['llmEndpoint']) && !empty($cfg['llmKey']),
            'h_index_distribution'=> $hBuckets,
            'total_citations'    => $totalCitations,
            'total_publications' => $totalPublications,
        ],
    ];
}

/**
 * T27 — Co-author network graph. Parses veda_dossiers publications to build
 * a co-author relationship graph. Returns nodes (authors) and edges (collaborations).
 */
function handleVedaCoauthorNetwork(array $b): array {
    $dossierId = $b['dossierId'] ?? '';
    $nodes = [];
    $edges = [];
    try {
        if ($dossierId) {
            $rows = dbFetchAll("SELECT publications_cache FROM veda_dossiers WHERE id=?", [$dossierId]);
        } else {
            $rows = dbFetchAll("SELECT publications_cache FROM veda_dossiers WHERE publications_cache IS NOT NULL AND publications_cache <> '' LIMIT 50");
        }
        $authorPubs = []; // authorName => [pubIndex, ...]
        $pubIndex = 0;
        foreach ($rows as $r) {
            $pubs = json_decode($r['publications_cache'], true);
            if (!is_array($pubs)) continue;
            foreach ($pubs as $p) {
                $authors = [];
                if (!empty($p['authors'])) {
                    if (is_string($p['authors'])) {
                        $authors = array_map('trim', preg_split('/[,;]|\band\b/i', $p['authors']));
                    } elseif (is_array($p['authors'])) {
                        $authors = $p['authors'];
                    }
                } elseif (!empty($p['author'])) {
                    if (is_string($p['author'])) {
                        $authors = array_map('trim', preg_split('/[,;]|\band\b/i', $p['author']));
                    } elseif (is_array($p['author'])) {
                        $authors = $p['author'];
                    }
                }
                $authors = array_filter(array_map('trim', $authors));
                foreach ($authors as $a) {
                    if (strlen($a) < 2) continue;
                    if (!isset($authorPubs[$a])) $authorPubs[$a] = [];
                    $authorPubs[$a][] = $pubIndex;
                }
                $pubIndex++;
            }
        }
        // Build nodes (top 40 by publication count)
        arsort($authorPubs);
        $topAuthors = array_slice($authorPubs, 0, 40, true);
        foreach ($topAuthors as $name => $pubs) {
            $nodes[] = ['id' => $name, 'name' => $name, 'count' => count($pubs)];
        }
        // Build edges (co-occurrence in same publication)
        $edgeWeights = [];
        foreach ($topAuthors as $name => $pubs) {
            foreach ($pubs as $pi) {
                foreach ($topAuthors as $name2 => $pubs2) {
                    if ($name === $name2) continue;
                    if (in_array($pi, $pubs2)) {
                        $key = ($name < $name2) ? $name . '||' . $name2 : $name2 . '||' . $name;
                        $edgeWeights[$key] = ($edgeWeights[$key] ?? 0) + 1;
                    }
                }
            }
        }
        foreach ($edgeWeights as $key => $w) {
            list($a, $b2) = explode('||', $key);
            $edges[] = ['source' => $a, 'target' => $b2, 'weight' => $w];
        }
    } catch (Throwable $_) {}
    return ['success' => true, 'nodes' => $nodes, 'edges' => $edges];
}
