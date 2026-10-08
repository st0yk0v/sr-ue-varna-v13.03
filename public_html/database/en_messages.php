<?php
/**
 * T113: Complete English translation of error messages
 * English translations for all Bulgarian error/notification strings used in API handlers.
 * Used by the frontend to display messages in English when lang='en'.
 */

return [
    // ── Authentication ───────────────────────────────────────────────────────
    'auth_email_required' => 'Email is required',
    'auth_invalid_email' => 'Invalid email address',
    'auth_email_not_found' => 'No account found with this email',
    'auth_email_registered' => 'This email is already registered',
    'auth_password_required' => 'Password is required',
    'auth_password_weak' => 'Password is too weak — minimum 8 characters with letters and numbers',
    'auth_session_expired' => 'Your session has expired. Please log in again.',
    'auth_invalid_token' => 'Invalid authentication token',
    'auth_token_expired' => 'Authentication token has expired',
    'auth_access_denied' => 'Access denied — insufficient permissions',
    'auth_logout_success' => 'Logged out successfully',

    // ── Database ────────────────────────────────────────────────────────────
    'db_connection_failed' => 'Could not connect to the database. Please try again later.',
    'db_query_failed' => 'Database query failed. Please try again later.',
    'db_unexpected_error' => 'An unexpected database error occurred.',

    // ── Forms / Applications ─────────────────────────────────────────────────
    'form_required' => 'Form is required',
    'form_not_found' => 'Form not found',
    'form_invalid_status' => 'Invalid form status',
    'form_submit_success' => 'Application submitted successfully',
    'form_submit_failed' => 'Failed to submit application. Please try again.',
    'form_update_success' => 'Application updated successfully',
    'form_update_failed' => 'Failed to update application',
    'form_delete_success' => 'Application deleted',
    'form_delete_failed' => 'Failed to delete application',
    'form_status_invalid_transition' => 'Cannot transition to this status from current status',

    // ── Competitions ────────────────────────────────────────────────────────
    'competition_required' => 'Competition is required',
    'competition_not_found' => 'Competition not found',
    'competition_create_success' => 'Competition created',
    'competition_create_failed' => 'Failed to create competition',
    'competition_update_success' => 'Competition updated',
    'competition_update_failed' => 'Failed to update competition',
    'competition_delete_success' => 'Competition deleted',
    'competition_delete_failed' => 'Failed to delete competition',
    'competition_archive_success' => 'Competition archived',
    'competition_archive_failed' => 'Failed to archive competition',
    'competition_closed' => 'This competition is closed to new applications',

    // ── Documents ───────────────────────────────────────────────────────────
    'document_required' => 'Document is required',
    'document_not_found' => 'Document not found',
    'document_upload_success' => 'Document uploaded successfully',
    'document_upload_failed' => 'Failed to upload document',
    'document_delete_success' => 'Document deleted',
    'document_delete_failed' => 'Failed to delete document',
    'document_copy_success' => 'Document copied',
    'document_copy_failed' => 'Failed to copy document',
    'document_save_success' => 'Document saved',
    'document_save_failed' => 'Failed to save document',
    'document_file_too_large' => 'File is too large (max 50MB)',
    'document_invalid_file_type' => 'Invalid file type',
    'document_google_embed_failed' => 'Could not embed Google Doc — opening in new tab instead',

    // ── Uploads ─────────────────────────────────────────────────────────────
    'upload_no_file' => 'No file uploaded',
    'upload_file_too_large' => 'File exceeds maximum size (50MB)',
    'upload_invalid_type' => 'File type not allowed',
    'upload_failed' => 'Upload failed',

    // ── Admin ───────────────────────────────────────────────────────────────
    'admin_required' => 'Admin access required',
    'admin_not_found' => 'Admin account not found',
    'admin_action_success' => 'Action completed successfully',
    'admin_action_failed' => 'Admin action failed',
    'admin_export_success' => 'Export started — you will be notified when ready',
    'admin_export_failed' => 'Export failed',

    // ── Batch Import ─────────────────────────────────────────────────────────
    'batch_import_success' => 'Batch import completed',
    'batch_import_partial' => 'Batch import completed with errors — check logs',
    'batch_import_failed' => 'Batch import failed',
    'batch_import_progress' => 'Batch import in progress',

    // ── Email / Notifications ───────────────────────────────────────────────
    'email_send_failed' => 'Failed to send email',
    'email_template_not_found' => 'Email template not found',
    'email_template_saved' => 'Email template saved',
    'email_template_deleted' => 'Email template deleted',
    'notification_prefs_saved' => 'Notification preferences saved',
    'notification_prefs_loaded' => 'Notification preferences loaded',

    // ── Sessions ────────────────────────────────────────────────────────────
    'session_list_loaded' => 'Active sessions retrieved',
    'session_revoked' => 'Session revoked successfully',
    'session_cannot_revoke_own' => 'Cannot revoke your own active session',

    // ── Webhooks ────────────────────────────────────────────────────────────
    'webhook_registered' => 'Webhook registered',
    'webhook_deleted' => 'Webhook deleted',
    'webhook_list_loaded' => 'Webhooks retrieved',
    'webhook_invalid_url' => 'Invalid webhook URL',
    'webhook_no_events' => 'No valid events specified',

    // ── GraphQL ─────────────────────────────────────────────────────────────
    'graphql_auth_required' => 'Authentication required for GraphQL',
    'graphql_unsupported' => 'This GraphQL query is not supported — use REST API',

    // ── Validation ──────────────────────────────────────────────────────────
    'validation_failed' => 'Validation failed',
    'validation_email_invalid' => 'Please enter a valid email address',
    'validation_required_field' => 'This field is required',
    'validation_max_length' => 'Value exceeds maximum length',
    'validation_min_length' => 'Value is too short',
    'validation_pattern_mismatch' => 'Value does not match required format',

    // ── General ─────────────────────────────────────────────────────────────
    'success' => 'Success',
    'error' => 'Error',
    'not_found' => 'Not found',
    'unauthorized' => 'Unauthorized',
    'forbidden' => 'Forbidden',
    'invalid_request' => 'Invalid request',
    'method_not_allowed' => 'Method not allowed',
    'internal_error' => 'Internal server error',
    'service_unavailable' => 'Service temporarily unavailable',
    'timeout' => 'Request timed out',
    'rate_limited' => 'Too many requests — please wait and try again',
];
