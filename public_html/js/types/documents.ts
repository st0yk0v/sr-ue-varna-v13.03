/* ═══════════════════════════════════════════════════════════════════════
 *  UEV-ERP Document & Application Type Definitions (TypeScript)
 *  ═══════════════════════════════════════════════════════════════════════
 *  Drop-in ambient types for the JavaScript codebase.
 *  Place in js/types/ — loaded via tsconfig.json "include".
 *
 *  Usage:  add `/// <reference path="./types/documents.ts" />` at the top
 *  of any JS file that needs autocompletion for these shapes.
 * ═══════════════════════════════════════════════════════════════════════ */

declare namespace ERP {

  // ── Core Identity ─────────────────────────────────────────────────
  type ProjectType = 'ФНИ' | 'ПНИ' | 'ДНП' | 'НПФ';
  type UserRole    = 'admin' | 'reviewer' | 'applicant' | 'ckk_member';
  type DocOrigin   = 'uploaded' | 'generated' | 'pregen' | 'predictive' | 'copied' | 'attached' | 'drive_mirror' | 'official';
  type DocCategory = 'application' | 'report' | 'monitoring' | 'library' | 'template' | 'signed' | 'official' | 'logo' | 'other';
  type SyncStatus  = 'pending' | 'synced' | 'failed' | 'modified';
  type DocMime     = 'application/pdf' | 'application/vnd.google-apps.document'
                   | 'application/vnd.google-apps.spreadsheet'
                   | 'application/vnd.google-apps.folder'
                   | 'image/png' | 'image/jpeg' | 'text/plain'
                   | 'application/msword'
                   | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                   | string;

  // ── Document ──────────────────────────────────────────────────────
  interface ERP_Document {
    id:               string;
    name:             string;
    mimeType:         DocMime;
    size:             number;
    folderName?:      string;
    category?:        DocCategory;
    typeLabel?:       string;
    docType?:         string;
    description?:     string;
    driveId?:         string;
    webViewLink?:     string;
    downloadUrl?:     string;
    editLink?:        string;
    googleDocEditLink?: string;
    previewLink?:     string;
    thumbnailLink?:   string;
    iconLink?:        string;
    templateSourceId?: string;
    templateSourceName?: string;
    origin?:          DocOrigin;
    formId?:          string;
    projectType?:     ProjectType;
    isStatic?:        boolean;
    content?:         string;
    userEmail?:       string;
    md5Hash?:         string;
    syncVersion?:     number;
    parentFolderId?:  string;
    driveCreated?:    string;
    driveModified?:   string;
    lastSynced?:      string;
    created?:         string;
    modified?:        string;
  }

  // ── Drive File Blob (mirrored content) ────────────────────────────
  interface ERP_DriveFileBlob {
    driveFileId:   string;
    name:          string;
    mimeType?:     DocMime;
    sizeBytes:     number;
    contentBase64?: string;
    contentText?:  string;
    md5Hash?:      string;
    category?:     DocCategory;
    projectType?:  ProjectType;
    docType?:      string;
    parentFolderId?: string;
    webViewLink?:  string;
    downloadUrl?:  string;
    editLink?:     string;
    lastSynced?:   string;
    syncStatus?:   SyncStatus;
  }

  // ── Generated Document Cache ──────────────────────────────────────
  interface ERP_GeneratedDoc {
    id:                string;
    formId:            string;
    projectType:       ProjectType;
    docType:           string;
    fileName:          string;
    mimeType?:         DocMime;
    driveFileId?:      string;
    sizeBytes:         number;
    origin?:           DocOrigin;
    generationMethod?: string;
    templateSourceId?: string;
    templateSourceName?: string;
    hasSignature:      boolean;
    embedUrl?:         string;
    editUrl?:          string;
    downloadUrl?:      string;
    previewUrl?:       string;
    userEmail?:        string;
    isApplicantCopy:   boolean;
    isActive:          boolean;
    created?:          string;
    modified?:         string;
  }

  // ── Document Template ─────────────────────────────────────────────
  interface ERP_DocumentTemplate {
    id:           string;
    name:         string;
    projectType:  ProjectType;
    docType:      string;
    mime?:        DocMime;
    driveFileId:  string;
    label?:       string;
    description?: string;
    isActive:     boolean;
  }

  // ── Required Template per Project Type ────────────────────────────
  interface ERP_RequiredTemplate {
    id:               string;
    projectTypeCode:  ProjectType;
    docKey:           string;
    name:             string;
    mimeType?:        DocMime;
    outputPdf:        boolean;
    embedSignature:   boolean;
    isBudget:         boolean;
    aliasOf?:         string;
    sortOrder:        number;
    isActive:         boolean;
  }

  // ── Folder Mirror ─────────────────────────────────────────────────
  interface ERP_FolderMirror {
    folderId:        string;
    name:            string;
    parentFolderId?: string;
    folderType:      string;
    projectType?:    ProjectType;
    fileCount:       number;
    totalSizeBytes:  number;
    lastSynced?:     string;
    syncStatus:      SyncStatus;
    syncToken?:      string;
    isActive:        boolean;
  }

  // ── Application (проектно предложение) ────────────────────────────
  interface ERP_Application {
    id:               string;
    userEmail:        string;
    competition:      string;
    projectType:      ProjectType;
    status:           string;
    title?:           string;
    titleEn?:         string;
    acronym?:         string;
    description?:     string;
    durationMonths?:  number;
    teamSize?:        number;
    budgetTotal?:     number;
    budget?:          Record<string, Record<string, number>>;
    fileIds?:         string[];
    attachedDocs?:    string[];
    selfAssessment?:  number;
    trl?:             number;
    scientificField?: string;
    reviewers?:       string[];
    reviewScores?:    Record<string, number>;
    created?:         string;
    modified?:        string;
  }

  // ── API Response Envelope ────────────────────────────────────────
  interface ERP_Response<T = unknown> {
    success:    boolean;
    error?:     string;
    data?:      T;
    _source?:   'sql' | 'mysql' | 'gas' | 'sheets';
    _version?:  number;
    _fromMySQL?: boolean;
    _via?:      string;
    _timing?:   number;
  }

  // ── Document List Response ────────────────────────────────────────
  interface ERP_DocumentListResponse extends ERP_Response {
    documents:     ERP_Document[];
    total?:        number;
    hasMore?:      boolean;
    _dataVersion?: number;
  }

  // ── Document Upload / Attach ─────────────────────────────────────
  interface ERP_DocumentActionPayload {
    documentId?:    string;
    formId?:        string;
    projectType?:   ProjectType;
    userEmail?:     string;
    file?:          File | Blob;
    name?:          string;
    mimeType?:      DocMime;
    category?:      DocCategory;
    origin?:        DocOrigin;
    /** For attach: list of doc IDs */
    documentIds?:   string[];
    /** For detach: list of doc IDs to remove */
    removeIds?:     string[];
  }

  // ── Type Guards ──────────────────────────────────────────────────
  function isERP_Document(obj: unknown): obj is ERP_Document {
    return typeof obj === 'object' && obj !== null && 'id' in obj && 'name' in obj;
  }
  function isERP_DocumentList(obj: unknown): obj is ERP_Document[] {
    return Array.isArray(obj) && obj.every(isERP_Document);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  v18.0.0 — Complete Entity Types
  // ═══════════════════════════════════════════════════════════════════

  // ── Collaborator ─────────────────────────────────────────────────
  interface ERP_Collaborator {
    id:           string;
    proposalId:   string;
    email:        string;
    name:         string;
    position?:    string;
    faculty?:     string;
    specialty?:   string;
    createdAt?:   string;
  }

  // ── Work Program ────────────────────────────────────────────────
  interface ERP_WorkProgram {
    id:              string;
    proposalId:      string;
    activityOrder:   number;
    description:     string;
    method?:         string;
    expectedResult?: string;
    startMonth?:     number;
    durationMonths?: number;
  }

  // ── TRL Record ─────────────────────────────────────────────────
  interface ERP_TRLRecord {
    id:              string;
    proposalId:      string;
    trlLevel:        number;
    description?:    string;
    currentEvidence?: string;
    targetTrl?:      number;
    updatedAt?:      string;
  }

  // ── Support Letter ─────────────────────────────────────────────
  interface ERP_SupportLetter {
    id:                string;
    proposalId:        string;
    authorName:        string;
    authorPosition?:   string;
    authorAffiliation?: string;
    authorEmail?:      string;
    content?:          string;
    fileId?:           string;
    createdAt?:        string;
  }

  // ── Self-Assessment ────────────────────────────────────────────
  interface ERP_SelfAssessment {
    id:          string;
    proposalId:  string;
    score:       number;
    criteria?:   string;
    notes?:      string;
    createdAt?:  string;
  }

  // ── Library Folder ─────────────────────────────────────────────
  interface ERP_LibraryFolder {
    id:          string;
    name:        string;
    parentId?:   string;
    description?: string;
    sortOrder:   number;
    isActive:    boolean;
    createdAt?:  string;
  }

  // ── Board Data Item ────────────────────────────────────────────
  interface ERP_BoardData {
    id:              string;
    name:            string;
    deadline?:       string;
    status:          string;
    year?:           number;
    applicationCount?: number;
    myApplications?:  number;
  }

  // ── Competition Feed Item ──────────────────────────────────────
  interface ERP_CompetitionFeed {
    id:          string;
    name:        string;
    deadline:    string;
    status:      string;
    year?:       number;
    description?: string;
  }

  // ── Application Version ────────────────────────────────────────
  interface ERP_ApplicationVersion {
    id:            string;
    status:        string;
    versionDate:   string;
    version:       number;
    statusChanges: number;
  }

  // ── Documents Summary ──────────────────────────────────────────
  interface ERP_DocumentsSummary {
    totalDocuments: number;
    lastCreated?:   string;
    lastModified?:  string;
  }

  // ── Library Submission ─────────────────────────────────────────
  interface ERP_LibrarySubmission {
    id:                string;
    projectId:         string;
    projectTitle?:     string;
    publicationType?:  string;
    title:             string;
    authors?:          string;
    status:            string;
    createdAt?:        string;
  }

  // ── Application Document Link ──────────────────────────────────
  interface ERP_ApplicationDocument {
    id:             string;
    applicationId:  string;
    documentId:     string;
    documentType?:  string;
    origin?:        string;
    addedAt?:       string;
    addedBy?:       string;
  }
}

/* ── Global Augmentation for window.__ERP_* ─────────────────────── */
interface Window {
  __ERP_BUILD?:        string;
  __ERP_DOCUMENTS?:    ERP.ERP_Document[];
  __uevApi:            (action: string, params?: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<ERP.ERP_Response>;
  __uevBatchApi:       (requests: Array<{ action: string; body?: Record<string, unknown> }>) => Promise<ERP.ERP_Response>;
  __PHP_API_URL?:      string;
  __PHP_API_POOL?:     Array<{ url: string; weight: number }>;
}
