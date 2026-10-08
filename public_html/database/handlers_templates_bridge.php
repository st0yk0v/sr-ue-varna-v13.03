<?php
/**
 * handlers_templates_bridge.php — Template-copy bridge for the Proposal Wizard.
 *
 * Adds two actions that let the SPA list + copy the funding-program Google-Doc
 * templates (ФНИ / ПНИ / ДНП / НПФ) into the applicant's own Drive:
 *
 *   listFolderTemplates  → forwards to GAS `listFolderTemplates` (enumerates the
 *                           Docs in a program's shared Drive folder); falls back
 *                           to the static `project_templates` table if GAS is down.
 *   copyTemplateForUser  → forwards to GAS `copyFolderTemplate` (copies a single
 *                           template file, by drive id, into the caller's Drive
 *                           and returns the new file URL/id).
 *
 * GAS exposes `listFolderTemplates({folderId, projectType})` and
 * `copyFolderTemplate({projectType, templateId, userId})` — both added to
 * gas/GAS.GS (registry + doPost switch). The bridge forwards the caller's userId
 * so GAS resolveAuthContext() can satisfy its authenticated guard.
 *
 * Safe to require from api.php: only declares functions + uses postToGAS().
 */

if (!function_exists('handleListFolderTemplates')) {
    // Funding-program → shared Drive template-folder map (mirrors the client-side
    // program-template-folders.js). Kept server-side so the API can return a
    // direct "open folder" link even when GAS folder-listing is unavailable.
    $PW_TEMPLATE_FOLDERS = [
        'ФНИ' => '1hj_COrKRQVpLKLp8fazYmXqFoZfBGlDA',
        'ПНИ' => '1FIbgjCTsfpVKDE92AWZuX1f6wty0tyl4',
        'ДНП' => '1Osx7-epb97eQgDT5XUzt7FZjcvBAQGLS',
        'НПФ' => '13_oGAlHQdHAzo33OW9imEjcqtcUVbSb2', // from GAS _getTemplateFolderIds_
    ];
    function handleListFolderTemplates(array $b): array
    {
        global $PW_TEMPLATE_FOLDERS;
        $folderId    = $b['folderId'] ?? $b['folder_id'] ?? '';
        $projectType = $b['projectType'] ?? $b['project_type'] ?? '';
        if (!$folderId) {
            return ['success' => false, 'error' => 'Missing folderId'];
        }
        $folderUrl = 'https://drive.google.com/drive/folders/' . $folderId;

        // Primary path: ask GAS to enumerate the folder.
        if (defined('GAS_REAL_URL') && GAS_REAL_URL !== '' && defined('GAS_SYNC_ENABLED') && GAS_SYNC_ENABLED) {
            try {
                $gasResp = postToGAS(GAS_REAL_URL, json_encode([
                    'action'      => 'listFolderTemplates',
                    'folderId'    => $folderId,
                    'projectType' => $projectType,
                ]));
                if (!empty($gasResp['success']) && isset($gasResp['templates'])) {
                    return ['success' => true, 'templates' => $gasResp['templates'], 'folderUrl' => $folderUrl, '_source' => 'gas'];
                }
            } catch (Throwable $_) { /* fall through to static */ }
        }

        // Fallback: static template rows so the UI never goes blank when GAS
        // folder-listing is unavailable. Always include the folder URL so
        // applicants can open the program folder directly.
        // v12.54.17: ensure project_templates table exists and is seeded
        if (function_exists('ensureProjectTemplatesTable')) ensureProjectTemplatesTable();
        try {
            $rows = dbFetchAll(
                "SELECT drive_id, label, doc_type FROM project_templates
                  WHERE project_type = ? AND is_active = 1 AND drive_id <> ''
                  ORDER BY doc_type, label",
                [$projectType]
            );
            $fallback = array_map(function ($r) {
                return [
                    'id'       => $r['drive_id'],
                    'name'     => $r['label'],
                    'mimeType' => 'application/vnd.google-apps.' . ($r['doc_type'] === 'budget' ? 'spreadsheet' : 'document'),
                    'url'      => 'https://drive.google.com/file/d/' . $r['drive_id'] . '/view',
                ];
            }, $rows ?: []);
            return ['success' => true, 'templates' => [], 'fallback' => $fallback, 'folderUrl' => $folderUrl, '_source' => 'static'];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage(), 'templates' => [], 'folderUrl' => $folderUrl];
        }
    }
}

if (!function_exists('handleCopyTemplateForUser')) {
    function handleCopyTemplateForUser(array $b): array
    {
        $templateId  = $b['templateId'] ?? $b['template_id'] ?? '';
        $projectType = $b['projectType'] ?? $b['project_type'] ?? '';
        $name        = $b['name'] ?? '';
        // Forward the caller's identity so GAS resolveAuthContext() can satisfy
        // the authenticated guard (the SPA api() does not inject it globally).
        $userId      = $b['userId'] ?? $b['email'] ?? $b['userEmail'] ?? '';
        if (!$templateId) {
            return ['success' => false, 'error' => 'Missing templateId'];
        }

        if (!defined('GAS_REAL_URL') || GAS_REAL_URL === '' || !defined('GAS_SYNC_ENABLED') || !GAS_SYNC_ENABLED) {
            return ['success' => false, 'error' => 'GAS sync not configured'];
        }

        try {
            $gasResp = postToGAS(GAS_REAL_URL, json_encode([
                'action'      => 'copyFolderTemplate',
                'projectType' => $projectType,
                'templateId'  => $templateId,
                'name'        => $name,
                'userId'      => $userId,
            ]));
            if (!empty($gasResp['success'])) {
                $file = $gasResp['file'] ?? [];
                return [
                    'success' => true,
                    'url'     => $gasResp['url'] ?? ($file['editLink'] ?? ($file['previewLink'] ?? ($file['downloadUrl'] ?? ''))),
                    'fileId'  => $gasResp['fileId'] ?? ($file['id'] ?? $file['driveId'] ?? $templateId),
                    '_source' => 'gas',
                ];
            }
            return ['success' => false, 'error' => $gasResp['error'] ?? 'GAS copy failed'];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}
