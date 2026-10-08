<?php
/**
 * UEV-ERP v18 Complete Handlers — PHP API Handler Functions
 * ══════════════════════════════════════════════════════════════════════════════
 * Bridges the gap between action_map.php and the v18 bridge layer.
 * Include this from api.php after findHandler() and after including _v18_bridge.php.
 *
 * v12.47.9-v18load: This file intentionally defines ONLY the handlers that do
 * NOT already exist in api.php. The 9 collaborators/work-program/trl/support-letters/
 * self-assessment handlers are defined in api.php itself, so they are NOT repeated
 * here — repeating them would cause "Cannot redeclare" fatals. The include guard in
 * api.php keys off handleListLibraryFolders (a function unique to this file) so the
 * file loads exactly when its handlers are needed.
 *
 * Each handler follows the standard pattern:
 *   1. Extract params from request array $b
 *   2. Call the corresponding sql* function from _v18_bridge.php
 *   3. Return standardized response array
 */

// ── Category F: Library Folders (unique to this file) ──

function handleListLibraryFolders(array $b): array {
    return sqlGetLibraryFolders($b['parentId'] ?? '');
}

function handleCreateLibraryFolder(array $b): array {
    $id = $b['id'] ?? 'lf_' . bin2hex(random_bytes(8));
    $name = $b['name'] ?? '';
    if (!$name) return ['success' => false, 'error' => 'Missing name'];
    return sqlCreateLibraryFolder($id, $name, $b['parentId'] ?? '', $b['description'] ?? '', (int)($b['sortOrder'] ?? 0));
}

// ── Category G: Board Data & Competition Feed (unique) ──

function handleGetBoardData(array $b): array {
    $userEmail = $b['userEmail'] ?? $b['userId'] ?? $b['email'] ?? '';
    if (!$userEmail) return ['success' => false, 'error' => 'Missing userEmail'];
    return sqlGetBoardData($userEmail);
}

function handleGetCompetitionsFeed(array $b): array {
    return sqlGetCompetitionsFeed();
}

// ── Category H: Application Versions (unique) ──

function handleGetApplicationVersions(array $b): array {
    $appId = $b['applicationId'] ?? $b['formId'] ?? $b['id'] ?? '';
    if (!$appId) return ['success' => false, 'error' => 'Missing applicationId'];
    return sqlGetApplicationVersions($appId);
}

// ── Category H2: Document Versions (D10) ──

function handleGetDocVersions(array $b): array {
    $docId = $b['docId'] ?? $b['id'] ?? '';
    $driveId = $b['driveId'] ?? '';
    if (!$docId && !$driveId) return ['success' => false, 'error' => 'Missing docId or driveId'];
    return sqlGetDocVersions($docId, $driveId);
}

// ── Category I: Documents Summary (unique) ──

function handleGetDocumentsSummary(array $b): array {
    return sqlGetDocumentsSummary();
}

// ── Category J: Library Submissions (unique) ──

function handleGetLibrarySubmissions(array $b): array {
    return sqlGetLibrarySubmissions($b['projectId'] ?? '', $b['status'] ?? '');
}

// ── Category K: Publications & Application Document Links (unique) ──

function handleRegisterPublication(array $b): array {
    $id = $b['id'] ?? 'pub_' . bin2hex(random_bytes(8));
    $projectId = $b['projectId'] ?? '';
    $pubType = $b['publicationType'] ?? $b['type'] ?? '';
    $title = $b['title'] ?? '';
    if (!$projectId || !$title) return ['success' => false, 'error' => 'Missing projectId or title'];
    return sqlRegisterPublication($id, $projectId, $pubType, $title,
        $b['authors'] ?? '', $b['publishedAt'] ?? '', $b['createdBy'] ?? '');
}

function handleLinkDocumentToApplication(array $b): array {
    $id = $b['id'] ?? 'ad_' . bin2hex(random_bytes(8));
    $appId = $b['applicationId'] ?? $b['formId'] ?? '';
    $docId = $b['documentId'] ?? '';
    if (!$appId || !$docId) return ['success' => false, 'error' => 'Missing applicationId or documentId'];
    return sqlLinkDocumentToApplication($id, $appId, $docId,
        $b['documentType'] ?? '', $b['origin'] ?? 'attached', $b['addedBy'] ?? '');
}

function handleUnlinkDocumentFromApplication(array $b): array {
    $docId = $b['documentId'] ?? '';
    $appId = $b['applicationId'] ?? $b['formId'] ?? '';
    if (!$docId || !$appId) return ['success' => false, 'error' => 'Missing documentId or applicationId'];
    return sqlUnlinkDocumentFromApplication($docId, $appId);
}
