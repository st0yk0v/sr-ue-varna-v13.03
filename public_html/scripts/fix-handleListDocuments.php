<?php
/**
 * Fix handleListDocuments in database/api.php.
 * Replaces the broken handler that throws exceptions with SAR34 v18.0.2 version.
 */
$apiFile = __DIR__ . '/../database/api.php';
$api = file_get_contents($apiFile);

// Find the start of handleListDocuments function
$startMarker = "function handleListDocuments(array \$b = []): array {";
$endMarker   = "\nfunction handleListMyDocuments";

$startPos = strpos($api, $startMarker);
if ($startPos === false) {
    echo "ERROR: handleListDocuments not found in api.php\n";
    exit(1);
}

$endPos = strpos($api, $endMarker, $startPos);
if ($endPos === false) {
    echo "ERROR: end of handleListDocuments not found\n";
    exit(1);
}

// The new function body (SAR34 v18.0.2 - fixed leanCols + _enrichDocPreviews)
$newFunc = <<<'FUNC'
function handleListDocuments(array $b = []): array {
    // v12.28.0-RBAC: Server-side role resolution
    $u = $b['userId'] ?? $b['email'] ?? '';
    $role = resolveRole($b);
    $result = sqlGetDocuments($u, $role, '', '', '', '', '', false, 0, 500);
    // v3.39.2-perf: Use a LEAN column list (no content/blob) for the fallback so
    // opening the library does not pull multi-MB blobs for every document row.
    // v3.39.3-libfix: Removed non-existent columns (document_type, file_type, status, status_group, application_id)
    $leanCols = 'id,name,description,folder_name,category,type_label,doc_type,origin,project_type,mime_type,size,drive_id,web_view_link,download_url,edit_link,google_doc_edit_link,preview_link,template_source_id,template_source_name,user_email,form_id,is_static,created,modified,_data_version';
    $localDocs = !empty($result['data']) ? $result['data'] : dbFetchAll("SELECT $leanCols FROM documents ORDER BY name ASC");

    // v18.0.2: Enrich documents — ensure every document with a valid Drive file ID
    // has a working previewLink. This fixes "file does not exist" when the DB has
    // the correct drive_id but the preview_link field is empty.
    $localDocs = _enrichDocPreviews($localDocs);

    // If local documents table is too sparse (< 3 docs), proxy to GAS for the
    // real Drive document list. The MySQL documents table is a mirror that may
    // not be fully populated yet — GAS has the authoritative Drive-scanned list.
    if (count($localDocs) < 3 && defined('GAS_REAL_URL') && GAS_REAL_URL !== '' && GAS_SYNC_ENABLED) {
        try {
            $gasResp = postToGAS(GAS_REAL_URL, json_encode([
                'action' => 'listdocuments', 'userId' => $u,
                'isAdmin' => resolveRole($b) !== 'applicant',
                '_gasSync' => true, 'forceRefresh' => $b['forceRefresh'] ?? false
            ]));
            if (!empty($gasResp['success']) && !empty($gasResp['documents']))
                return ['success'=>true,'documents'=>$gasResp['documents'],'_source'=>'gas_proxy'];
        } catch (\Throwable $_) {
            // GAS unreachable — return whatever we have locally
        }
    }

    return ['success'=>true,'documents'=>$localDocs,'_source'=>'mysql'];
}

FUNC;

// Replace old function with new
$oldFunc = substr($api, $startPos, $endPos - $startPos);
$api = substr($api, 0, $startPos) . $newFunc . substr($api, $endPos);

file_put_contents($apiFile, $api);
echo "OK: handleListDocuments replaced in api.php\n";
echo "Old function length: " . strlen($oldFunc) . " bytes\n";
echo "New function length: " . strlen($newFunc) . " bytes\n";
echo "File size: " . strlen($api) . " bytes\n";
