<?php
/**
 * UEV-ERP Action → Handler Map
 * v12.30.0: Extracted from findHandler() for maintainability.
 * Maps every API action string to its PHP handler function name.
 * Both api.php and database/api.php include this file.
 */
return [
    'ping'=>'handlePing','getversion'=>'handleGetVersion','getsystemhealth'=>'handleGetSystemHealth',
    // T49: Email notification templates
    'getemailtemplates'=>'handleGetEmailTemplates',
    'saveemailtemplate'=>'handleSaveEmailTemplate',
    'deleteemailtemplate'=>'handleDeleteEmailTemplate',
    // T52: Notification preferences
    'getuserprefs'=>'handleGetUserPreferences',
    'saveuserprefs'=>'handleSaveUserPreferences',
    // T71: Login analytics
    'recordloginattempt'=>'handleRecordLoginAttempt',
    'getloginanalytics'=>'handleGetLoginAnalytics',
    // T72: Session management
    'getsessionlist'=>'handleGetSessionList',
    'revokesession'=>'handleRevokeSession',
    // T73: MFA setup
    'setupmfa'=>'handleSetupMfa',
    'verifymfasetup'=>'handleVerifyMfaSetup',
    'disablemfa'=>'handleDisableMfa',
    // T75: Account lockout
    'checkaccountlockout'=>'handleCheckAccountLockout',
    'lockaccount'=>'handleLockAccount',
    'unlockaccount'=>'handleUnlockAccount',
    // T129: Admin cleanup
    'adminclnupolddocs'=>'handleAdminCleanupOldDocs',
    'adminclnupdupelib'=>'handleAdminCleanupDupeLib',
    // T139: Webhook registration
    'registerwebhook'=>'handleRegisterWebhook',
    'listwebhooks'=>'handleListWebhooks',
    'deletewebhook'=>'handleDeleteWebhook',
    // T140: GraphQL
    'graphql'=>'handleGraphql',
    'getforms'=>'handleGetForms','getmyforms'=>'handleGetMyForms','getform'=>'handleGetForm','createform'=>'handleCreateForm',
    'updateform'=>'handleUpdateForm','submitform'=>'handleSqlSubmitApplication','updatestatus'=>'handleUpdateStatus',
    'getcompetitions'=>'handleGetCompetitions','getpubliccompetitions'=>'handleGetPublicCompetitions',
    'getcompetitionsummary'=>'handleGetCompetitionSummary','getcontestboard'=>'handleGetContestBoard',
    'getapplicationsbycompetition'=>'handleGetApplicationsByCompetition',
    'getcompetitionpanel'=>'handleGetCompetitionPanel',
    'getdashboardcontext'=>'handleGetDashboardContext',
    'createcompetition'=>'handleCreateCompetition','editcompetition'=>'handleEditCompetition',
    'deletecompetition'=>'handleDeleteCompetition','archivecompetition'=>'handleArchiveCompetition',
    'getinitialdata'=>'handleGetInitialData',
    'listdocuments'=>'handleListDocuments','listmydocuments'=>'handleListMyDocuments',
    'copydocument'=>'handleCopyDocument','copydocforuser'=>'handleCopyDocForUser','uploadmydocument'=>'handleUploadMyDocument',
    'savedocumentcontent'=>'handleSaveDocumentContent',
    'getdocumentcontent'=>'handleGetDocumentContent',
    'downloaddocument'=>'handleDownloadDocument','downloaddoc'=>'handleDownloadDocument','getfilecontent'=>'handleDownloadDocument',

    'deletefile'=>'handleDeleteFile',
    'deletemydocument'=>'handleDeleteMyDocument',
    'deleteform'=>'handleDeleteDraft', // soft-delete draft application by id
    'createproject'=>'handleCreateProject','updateproject'=>'handleUpdateProject',
    'submitreport'=>'handleSubmitReport','acceptreport'=>'handleAcceptReport','returnreport'=>'handleReturnReport',
    'createchangerequest'=>'handleCreateChangeRequest','approvechangerequest'=>'handleApproveChangeRequest',
    'createexpense'=>'handleCreateExpense','approveexpense'=>'handleApproveExpense',
    'getreviewers'=>'handleGetReviewers','getreviewerforms'=>'handleGetReviewerForms',
    'addreviewer'=>'handleAddReviewer','deletereviewer'=>'handleDeleteReviewer',
    'consenttoreview'=>'handleConsentToReview','declineinvitation'=>'handleDeclineInvitation',
    'submitreview'=>'handleSubmitReview',
    'getprojects'=>'handleGetProjects','getproject'=>'handleGetProject','getprojectdashboard'=>'handleGetProjectDashboard',
    'getreports'=>'handleGetReports','getreport'=>'handleGetReport',
    'getmessages'=>'handleGetMessages','sendmessage'=>'handleSendMessage',
    'listckkmembers'=>'handleListCkkMembers','assignckkrequest'=>'handleAssignCkkRequest',
    'assignckkconfirm'=>'handleAssignCkkConfirm','removeckkmember'=>'handleRemoveCkkMember',
    'getchangerequests'=>'handleGetChangeRequests',
    'getnotifications'=>'handleGetNotifications',
    'getsanctions'=>'handleGetSanctions','checksanctions'=>'handleCheckSanctions',
    'checkeligibility'=>'handleCheckEligibility',
    'adminlogin'=>'handleAdminLogin','checkadmin'=>'handleCheckAdmin',
    'syncadminemails'=>'handleSyncAdminEmails','addadminemail'=>'handleAddAdminEmail',
    'removeadminemail'=>'handleRemoveAdminEmail','listadminemails'=>'handleListAdminEmails',
    'createsession'=>'handleCreateSession','getsession'=>'handleGetSession','deletesession'=>'handleDeleteSession','sessionheartbeat'=>'handleSessionHeartbeat',
    'getexpenses'=>'handleGetExpenses',
    'getcalendarevents'=>'handleGetCalendarEvents','getdashboardstats'=>'handleGetDashboardStats',
    'getbudgetsummary'=>'handleGetBudgetSummary',
    'bulkdeletereviewers'=>'handleBulkDeleteReviewers',
    'proposereviewers'=>'handleProposeReviewers','confirmreviewers'=>'handleConfirmReviewers','replacereviewer'=>'handleReplaceReviewer',
    'auditapplicationtemplates'=>'handleAuditApplicationTemplates',
    'validateprojectresults'=>'handleValidateProjectResults','getadminnotifications'=>'handleGetAdminNotifications',
    'exportmydata'=>'handleExportMyData','getmetricsdashboard'=>'handleGetMetricsDashboard',
    // EPIC-F: JSON ops metrics endpoint (latency/5xx/previews)
    'getmetrics'=>'handleGetMetrics',
    'metricsdashboard'=>'handleGetMetricsDashboard','systemmetrics'=>'handleGetMetricsDashboard',
    'getdataversion'=>'handleGetDataVersion',
    'batchapi'=>'handleBatchApi',
    'ensureuserpregenerateddocs'=>'handleEnsureUserPregeneratedDocs',
    // GAS cache + sync endpoints
    'gassetcache'=>'handleGasSetCache','gasgetcache'=>'handleGasGetCache','gassync'=>'handleGasSync',
    'syncnow'=>'handleSyncNow',
    'gassyncpull'=>'handleGasSyncPull',
    'warmusercache'=>'handleWarmUserCache','gascachesync'=>'handleGasCacheSync',
    // Batch sync + Drive file mirror
    '_batchsync'=>'handleBatchSync','batchsync'=>'handleBatchSync',
    '_syncdrivefile'=>'handleSyncDriveFile','syncdrivefile'=>'handleSyncDriveFile',
    '_syncdrivefilesbatch'=>'handleSyncDriveFilesBatch','syncdrivefilesbatch'=>'handleSyncDriveFilesBatch',
    '_syncstale'=>'handleSyncStale','syncstale'=>'handleSyncStale',
    '_fullmirror'=>'handleFullMirror','fullmirror'=>'handleFullMirror',
    // v12.30.0-clone: Batch sync handlers for GAS→SQL cloning
    'createreport'=>'handleCreateReport','updatereviewer'=>'handleUpdateReviewer',
    // Orphan table handlers
    'getdeliverables'=>'handleGetDeliverables','adddeliverable'=>'handleAddDeliverable','updatedeliverable'=>'handleSqlUpdateDeliverable',
    'getlibrarydeposits'=>'handleGetLibraryDeposits','addlibrarydeposit'=>'handleAddLibraryDeposit',
    'getministryreports'=>'handleGetMinistryReports','createmonreport'=>'handleCreateMonReport',
    'getauditlog'=>'handleGetAuditLog',
    // v12.54.22: Admin tools & scheduled tasks (T126-T138)
    'admingetauditlog'=>'handleAdminGetAuditLog','exportauditlog'=>'handleExportAuditLog',
    'getrolemanagement'=>'handleGetRoleManagement','updateuserrole'=>'handleUpdateUserRole',
    'listscheduledtasks'=>'handleListScheduledTasks','addscheduledtask'=>'handleAddScheduledTask',
    'updatescheduledtask'=>'handleUpdateScheduledTask','deletescheduledtask'=>'handleDeleteScheduledTask',
    'togglescheduledtask'=>'handleToggleScheduledTask','runscheduledtask'=>'handleRunScheduledTask',
    'admindashboardhealth'=>'handleAdminDashboardHealth',
    'getdocumenttemplates'=>'handleGetDocumentTemplates','savedocumenttemplate'=>'handleSaveDocumentTemplate',
    'deletedocumenttemplate'=>'handleDeleteDocumentTemplate','getprojecttypes'=>'handleGetProjectTypes',
    'runmigration'=>'handleRunMigration',
    'getrequiredapplicationtemplates'=>'handleGetRequiredApplicationTemplates',
    // v3.39: Pre-fetched project templates (SQL-backed, no GAS) — see schema_project_templates.sql
    'getprojecttemplates'=>'handleGetProjectTemplates',
    // Auto-generate + list endpoints
    'autogeneratefortype'=>'handleAutoGenerateForType',
    'getgenerateddocs'=>'handleGetGeneratedDocs',
    'predictivebatch'=>'handlePredictiveBatch',
    'exporttemplatefilestohostinger'=>'handleExportTemplateFilesToHostinger',
    // Instant document generation
        'copytypetemplatesforform'=>'handleCopyTypeTemplatesForForm',
        'checkproposer'=>'handleCheckProposer',
                'gettypedocuments'=>'handleGetTypeDocuments',
                'wizardadminlist'=>'handleWizardAdminList',
                'wizardadminget'=>'handleWizardAdminGet',
                'wizardadminstats'=>'handleWizardAdminStats',
                'wizardadmindelete'=>'handleWizardAdminDelete',
                'wizardadminexport'=>'handleWizardAdminExport',
        'docstream'=>'handleDocStream',
        'docstreamop'=>'handleDocStreamOp',
        'docstreamstate'=>'handleDocStreamState',
        'createversionsnapshot'=>'handleCreateVersionSnapshot',
        'listcollabdocuments'=>'handleListCollabDocuments',
            'attachdocumenttoform'=>'handleAttachDocumentToForm',
    'detachdocumentfromform'=>'handleDetachDocumentFromForm',
    'getformdocuments'=>'handleGetFormDocuments',
    // SQL data loading (v12.26.0+)
    'sqlgetforms'=>'handleSqlGetForms',
    'sqlgetcompetitions'=>'handleSqlGetCompetitions',
    'sqlgetinitialdata'=>'handleSqlGetInitialData',
    'sqlgetdocuments'=>'handleSqlGetDocuments',
    'sqlgetprojects'=>'handleSqlGetProjects',
    'sqlgetreviewerforms'=>'handleSqlGetReviewerForms',
    'sqlgetdashboardcontext'=>'handleSqlGetDashboardContext',
    'sqlgetcontestboard'=>'handleSqlGetContestBoard',
    'sqlgetcompetitionsummary'=>'handleSqlGetCompetitionSummary',
    'sqlgetprojectdashboard'=>'handleSqlGetProjectDashboard',
    'sqlgetreviewerbudgetsummary'=>'handleSqlGetReviewerBudgetSummary',
    'sqlgetfinancialsummary'=>'handleSqlGetFinancialSummary',
    'sqlvalidatesubmission'=>'handleSqlValidateSubmission',
    'sqlvalidatebudget'=>'handleSqlValidateBudgetCategories',
    'sqlcheckeligibility'=>'handleSqlCheckEligibility',
    'sqlvalidatetransition'=>'handleSqlValidateTransition',
    'sqlgetallowedtransitions'=>'handleSqlGetAllowedTransitions',
    'sqlcheckdeadline'=>'handleSqlCheckCompetitionDeadline',
    'sqlapplytransition'=>'handleSqlApplyTransition',
    'sqlcascadetransition'=>'handleSqlCascadeTransition',
    'sqlsearch'=>'handleSqlSearchEntities',
    'sqlgetsystemhealth'=>'handleSqlGetSystemHealth',
    'sqlgetaudittrail'=>'handleSqlGetAuditTrail',
    'sqlgetcalendarevents'=>'handleSqlGetCalendarEvents',
    'sqlgetusernotifications'=>'handleSqlGetUserNotifications',
    'sqlgetdashboardcounts'=>'handleSqlGetDashboardCounts',
    'sqlpurgeexpiredcache'=>'handleSqlPurgeExpiredCache',
    'sqlloadmoreforms'=>'handleSqlLoadMoreForms',
    'loadmoreforms'=>'handleSqlLoadMoreForms',
    'sqlloadmorecompetitions'=>'handleSqlLoadMoreCompetitions',
    'loadmorecompetitions'=>'handleSqlLoadMoreCompetitions',
    // Streaming & data diff
    'getdatadiff'=>'handleGetDataDiff',
    'streamdata'=>'handleStreamData',
    // v5 CRUD operations
    'sqlcreateapplication'=>'handleSqlCreateApplication',
    'sqlcreateapplicationfromgas'=>'handleSqlCreateApplication',
    // v12.49.48-wizard: the v17.0.0 wizard calls bare 'createapplication'
    // (WizardShell.js autosave); route it to the same handler as
    // sqlcreateapplication so the wizard draft is persisted.
    'createapplication'=>'handleSqlCreateApplication',
    'savereferee'=>'handleSaveReferee',
    'sendemail'=>'handleSendEmail',
    'sqlupdateapplication'=>'handleSqlUpdateApplication',
    'sqldeleteapplication'=>'handleSqlDeleteApplication',
    'sqlsubmitapplication'=>'handleSqlSubmitApplication',
    // v11 Remaining operations
    'sqlbulkupdateapplicationstatus'=>'handleSqlBulkUpdateApplicationStatus',
    'bulkupdateapplicationstatus'=>'handleSqlBulkUpdateApplicationStatus',
    'sqladdsanction'=>'handleSqlAddSanction',
    'addsanction'=>'handleSqlAddSanction',
    'sqltransitionprojectstatus'=>'handleSqlTransitionProjectStatus',
    'transitionprojectstatus'=>'handleSqlTransitionProjectStatus',
    'sqlsignprojectcontract'=>'handleSqlSignProjectContract',
    'signprojectcontract'=>'handleSqlSignProjectContract',
    'sqlconfirmlibrarysubmission'=>'handleSqlConfirmLibrarySubmission',
    'confirmlibrarysubmission'=>'handleSqlConfirmLibrarySubmission',
    'sqlgetcontractdeadlines'=>'handleSqlGetContractDeadlines',
    'getcontractdeadlines'=>'handleSqlGetContractDeadlines',
    'sqlsendcontractreminders'=>'handleSqlSendContractReminders',
    'sendcontractreminders'=>'handleSqlSendContractReminders',
    'sqlcreatecompetition'=>'handleSqlCreateCompetition',
    'sqlupdatecompetition'=>'handleSqlUpdateCompetition',
    'sqldeletecompetition'=>'handleSqlDeleteCompetition',
    'sqlcreateproject'=>'handleSqlCreateProject',
    'sqlcreatereport'=>'handleSqlCreateReport',
    'sqlcreateexpense'=>'handleSqlCreateExpense',
    'sqlcreatechangerequest'=>'handleSqlCreateChangeRequest',
    'sqlcreatedeliverable'=>'handleSqlCreateDeliverable',
    'sqlcreatelibrarydeposit'=>'handleSqlCreateLibraryDeposit',
    'sqlcreatenotification'=>'handleSqlCreateNotification',
    // v5 Sync procedures
    'sqlsyncapplication'=>'handleSqlSyncApplication',
    'sqlsynccompetition'=>'handleSqlSyncCompetition',
    'sqlgetdatachanges'=>'handleSqlGetDataChangesSince',
    // v5 Email/notification
    'sqlqueueemail'=>'handleSqlQueueEmail',
    'sqlgetpendingemails'=>'handleSqlGetPendingEmails',
    'sqlmarkemailsent'=>'handleSqlMarkEmailSent',
    'sqlnotifystatuschange'=>'handleSqlNotifyStatusChange',
    // v5 Maintenance
    'sqlautoexpireprojects'=>'handleSqlAutoExpireProjects',
    'sqlmarkoverduereviewers'=>'handleSqlMarkOverdueReviewers',
    'sqlcleanupolddata'=>'handleSqlCleanupOldData',
    // v6 Drive asset mirroring
    'sqlupsertdocument'=>'handleSqlUpsertDocument',
    'sqlupsertdrivefileblob'=>'handleSqlUpsertDriveFileBlob',
    'sqlupsertgenerateddoc'=>'handleSqlUpsertGeneratedDoc',
    'sqlmirrorfolder'=>'handleSqlMirrorFolder',
    'sqlgetdocumentsbyfolder'=>'handleSqlGetDocumentsByFolder',
    'sqlgetdriveassets'=>'handleSqlGetDriveAssets',
    'sqlgetlogoblobs'=>'handleSqlGetLogoBlobs',
    'sqlgetformgenerateddocs'=>'handleSqlGetFormGeneratedDocs',
    'sqlbulksyncdocuments'=>'handleSqlBulkSyncDocuments',
    // v12.27.0 Proposal Wizard
    'sqlgetproposal'=>'handleSqlGetProposal',
    'sqlcreateproposal'=>'handleSqlCreateProposal',
    'sqlupdateproposal'=>'handleSqlUpdateProposal',
    'sqlgetproposaldocuments'=>'handleSqlGetProposalDocuments',
    'sqlgetdocumentpreview'=>'handleSqlGetDocumentPreview',
    'sqlgetbudgetrules'=>'handleSqlGetBudgetRules',
    // v8 docSQL
    'sqlattachdocument'=>'handleSqlAttachDocument',
    'sqldetachdocument'=>'handleSqlDetachDocument',
    'sqlgetapplicationdocuments'=>'handleSqlGetApplicationDocuments',
    'sqlrepairattacheddocs'=>'handleSqlRepairAttachedDocs',
    'sqlbulkattachdocuments'=>'handleSqlBulkAttachDocuments',
    'sqlcopyapplicationdocuments'=>'handleSqlCopyApplicationDocuments',
    'sqlsearchdocuments'=>'handleSqlSearchDocuments',
    // v12.49.84-pw-templates: template-copy bridge (ФНИ/ПНИ/ДНП/НПФ Google-Doc templates)
    'listfoldertemplates'=>'handleListFolderTemplates',
    'copyTemplateForUser'=>'handleCopyTemplateForUser',
    'sqlgetdocumenturl'=>'handleSqlGetDocumentUrl',
    // v16.0.0-appconfig: Full app configuration endpoint
    'getappconfig'=>'handleSqlGetAppConfig',
    'sqlgetappconfig'=>'handleSqlGetAppConfig',
    // ══════════════════════════════════════════════════════════════════════
    //  v17.0.0-doclib-applicants: Document Templates Library + Applicant Views
    // ══════════════════════════════════════════════════════════════════════
    'sqltemplatelibrary'=>'handleSqlGetTemplateLibrary',
    'gettemplatelibrary'=>'handleSqlGetTemplateLibrary',
    'sqladddocumenttemplate'=>'handleSqlAddDocumentTemplate',
    'adddocumenttemplate'=>'handleSqlAddDocumentTemplate',
    'sqlupdatedocumenttemplate'=>'handleSqlAddDocumentTemplate',
    'updatedocumenttemplate'=>'handleSqlAddDocumentTemplate',
    'sqldeletedocumenttemplate'=>'handleSqlDeleteDocumentTemplate',
    'deletedocumenttemplate'=>'handleSqlDeleteDocumentTemplate',
    'sqlsynctemplatefromgas'=>'handleSqlSyncTemplateFromGas',
    'synctemplatefromgas'=>'handleSqlSyncTemplateFromGas',
    'sqlgetapplicationsbyuser'=>'handleSqlGetApplicationsByUser',
    'getapplicationsbyuser'=>'handleSqlGetApplicationsByUser',
    'getmyapplications'=>'handleSqlGetApplicationsByUser',
    'myapplications'=>'handleSqlGetApplicationsByUser',
    'sqlgetapplicantsummary'=>'handleSqlGetApplicantSummary',
    'getapplicantsummary'=>'handleSqlGetApplicantSummary',
    'sqlgetapplicantslist'=>'handleSqlGetApplicantsList',
    'getapplicantslist'=>'handleSqlGetApplicantsList',
    //  v16.1.0-complete: ALL remaining GAS endpoints with full PHP coverage
    // ══════════════════════════════════════════════════════════════════════
    // ── Category A: Read-only data access ──
    'gettemplates'=>'handleGetTemplates',
    'getprojecttypelabel'=>'handleGetProjectTypeLabel',
    'getreportdeadlines'=>'handleGetReportDeadlines',
    'senddeadlinereminders'=>'handleSendDeadlineReminders',
    'sendreminders'=>'handleSendDeadlineReminders',
    'sendreviewdeadlinereminders'=>'handleSendReviewDeadlineReminders',
    'getreviewdeadlines'=>'handleGetReviewDeadlinesSql',
    'getmynotifications'=>'handleGetMyNotifications',
    'getnotificationlog'=>'handleGetNotificationLog',
    'getmyactivitylog'=>'handleGetMyActivityLog',
    'getunreadmessagecount'=>'handleGetUnreadMessageCount',
    'marknotificationsseen'=>'handleMarkNotificationsSeen',
    'getnotificationsettings'=>'handleGetNotificationSettings',
    'saveuserpreferences'=>'handleSaveUserPreferences',
    'getuserpreferences'=>'handleGetUserPreferences',
    'getsystemnotificationsettings'=>'handleGetSystemNotificationSettings',
    'savesystemnotificationsettings'=>'handleSaveSystemNotificationSettings',
    'loguserlogout'=>'handleLogUserLogout',
    // ── Category B: Team change requests ──
    'createappteamchangerequest'=>'handleCreateAppTeamChangeRequest',
    'getappteamchangerequests'=>'handleGetAppTeamChangeRequests',
    // ── Category C: v6.8 module endpoints ──
    'saveselfassessment'=>'handleSaveSelfAssessment',
    'getselfassessment'=>'handleGetSelfAssessment',
    'savecollaborators'=>'handleSaveCollaborators',
    'getcollaborators'=>'handleGetCollaborators',
    'proposeexternalreviewers'=>'handleProposeExternalReviewers',
    'getexternalreviewerproposals'=>'handleGetExternalReviewerProposals',
    'approveexternalreviewer'=>'handleApproveExternalReviewer',
    'rejectexternalreviewer'=>'handleRejectExternalReviewer',
    'saveworkprogram'=>'handleSaveWorkProgram',
    'getworkprogram'=>'handleGetWorkProgram',
    'savetrl'=>'handleSaveTRL',
    'gettrl'=>'handleGetTRL',
    'savesupportletters'=>'handleSaveSupportLetters',
    'getsupportletters'=>'handleGetSupportLetters',
    'validatebudgetcategories'=>'handleValidateBudgetCategories',
    'checkbudgetlimits'=>'handleValidateBudgetCategories',
    'getbudgethistory'=>'handleGetBudgetHistory',
    'updatebudget'=>'handleUpdateBudget',
    'parsebudgetfile'=>'handleParseBudgetFile',
    'validatebudgetline'=>'handleValidateBudgetLine',
    'generatebudgetspreadsheet'=>'handleGenerateBudgetSpreadsheet',
    // T39: OCR Text Search
    'searchocrtext'=>'handleSearchOcrText',
    'extractocrtext'=>'handleExtractOcrText',
    // T40: Budget Templates
    'savebudgettemplate'=>'handleSaveBudgetTemplate',
    'listbudgettemplates'=>'handleListBudgetTemplates',
    'deletebudgettemplate'=>'handleDeleteBudgetTemplate',
    // T43: Budget Export
    'exportbudgetcsv'=>'handleExportBudgetCsv',
    // T44: Progress Reports
    'generateprogressreport'=>'handleGenerateProgressReport',
    // T45: Financial Summary
    'financialsummary'=>'handleFinancialSummary',
    'requestcorrection'=>'handleRequestCorrection',
    'admineditform'=>'handleAdminEditForm',
    'savedraft'=>'handleSaveDraft',
    'recoverdraft'=>'handleRecoverDraft',
    'deletedraft'=>'handleDeleteDraft',
    'batchaddreviewers'=>'handleBatchAddReviewers',
    'getreviewerproposals'=>'handleGetReviewerProposals',
    'rundeadlineautomation'=>'handleRunDeadlineAutomation',
    'getdocumentvisuals'=>'handleGetDocumentVisuals',
    // v12.49.88-deadpagefix: Drive-file EXISTENCE preflight. Proxies to GAS
    // drivefilemeta so the doc-preview modal can flip driveGone (and avoid
    // framing Google's cross-origin "file deleted" dead page). Registered here
    // because the PHP router returns "Unknown" for unrouted actions and the
    // frontend api() helper does NOT fall back to GAS on a 2xx JSON 404.
    'drivefilemeta'=>'handleDriveFileMeta',
    'listparticipants'=>'handleListParticipants',
    // v18.x-teachers: Senior-team readable URL endpoints
    'teacherbyemail'=>'handleTeacherByEmail',
    'getprojectmembers'=>'handleGetProjectMembers',
    'getprojectreports'=>'handleGetProjectReports',
    'markmessagesread'=>'handleMarkMessagesRead',
    'copytemplateforuser'=>'handleCopyTemplateForUser',
    'confirmlibrarydeposit'=>'handleConfirmLibraryDeposit',
    'addlibrarydepositfile'=>'handleAddLibraryDepositFile',
    'removelibrarydepositfile'=>'handleRemoveLibraryDepositFile',
    'getpublicresults'=>'handleGetPublicResults',
    'exportalldatacsv'=>'handleExportAllDataCsv',
    // ── Category D: MON (Ministry) report endpoints ──
    'generatemonreport'=>'handleGenerateMonReport',
    'getmonreports'=>'handleGetMonReports',
    'getmonreportsbatch'=>'handleGetMonReportsBatch',
    'getmonreport'=>'handleGetMonReport',
    'editmonreport'=>'handleEditMonReport',
    'refreshmonreportdata'=>'handleRefreshMonReportData',
    'finalizemonreport'=>'handleFinalizeMonReport',
    'submitmonreport'=>'handleSubmitMonReport',
    'acknowledgemonsubmission'=>'handleAcknowledgeMonSubmission',
    'rejectmonbyministry'=>'handleRejectMonByMinistry',
    'archivemonreport'=>'handleArchiveMonReport',
    'cancelmonreport'=>'handleCancelMonReport',
    'exportmonreportfile'=>'handleExportMonReportFile',
    'getmonreporthistory'=>'handleGetMonReportHistory',
    // ── Category E: Ranking & Results Approval ──
    'generateranking'=>'handleGenerateRanking',
    'approveresults'=>'handleApproveResults',
    'publishresults'=>'handlePublishResults',
    'acceptcontestresultsbyac'=>'handleAcceptContestResultsByAC',
    'approvecompetitionbyac'=>'handleApproveCompetitionByAC',
    'issuerectororder'=>'handleIssueRectorOrder',
    'assignfinalreportreviewer'=>'handleAssignFinalReportReviewer',
    'submitfinalreportreview'=>'handleSubmitFinalReportReview',
    'acceptfinalreport'=>'handleAcceptFinalReport',
    'assignreviewers'=>'handleAssignReviewers',
    // ══════════════════════════════════════════════════════════════════════
    //  v18.0.0-complete: Final migration handlers (schema_migration_v18_complete.sql)
    //  NOTE: savecollaborator, getcollaborators, saveworkprogram, getworkprogram,
    //  savetrl, gettrl, savesupportletters, getsupportletters, saveselfassessment,
    //  getselfassessment were already mapped in v16.1.0-complete above.
    // ══════════════════════════════════════════════════════════════════════
    // ── Category F: Library Folders ──
    'listlibraryfolders'=>'handleListLibraryFolders',
    'getlibraryfolders'=>'handleListLibraryFolders',
    'createlibraryfolder'=>'handleCreateLibraryFolder',
    // ── Category G: Board Data & Competition Feed ──
    'getboarddata'=>'handleGetBoardData',
    'getcompetitionsfeed'=>'handleGetCompetitionsFeed',
    // ── T28/T30: Competition Management (duplicate detection, bulk status) ──
    'detectduplicatecompetitions'=>'handleDetectDuplicateCompetitions',
    'bulkupdatecompetitionstatus'=>'handleBulkUpdateCompetitionStatus',
    // ── Category H: Application Versions ──
    'getapplicationversions'=>'handleGetApplicationVersions',
    // ── Category I: Documents Summary ──
    'getdocumentssummary'=>'handleGetDocumentsSummary',
    // ── Category I.1: Proposal Wizard admin dispatcher ──
    'wizard_admin_action'=>'handleWizardAdminAction',
    // ── Category J: Library Submissions ──
    'getlibrarysubmissions'=>'handleGetLibrarySubmissions',
    'registerpublication'=>'handleRegisterPublication',
    // ── Category K: Application Documents Link ──
    'linkdocumenttoapplication'=>'handleLinkDocumentToApplication',
    'unlinkdocumentfromapplication'=>'handleUnlinkDocumentFromApplication',
    // v3.39.11-officetext: seed the real local document library (generated
    // by scripts/seed-local-docs.php) into the documents table.
    'seedlocaldocs'=>'handleSeedLocalDocs',
    // ══════════════════════════════════════════════════════════════════════
    // v12.32.6-uifix: wire frontend actions that previously returned 404.
    // ── New handlers (database/_v18_handlers.php) ──
    'clearmydrafts'=>'handleClearMyDrafts',
    'deletelibraryfile'=>'handleDeleteLibraryFile',
    'deletelibraryfolder'=>'handleDeleteLibraryFolder',
    'uploadlibraryfile'=>'handleUploadLibraryFile',
    'cleanupmonduplicates'=>'handleCleanupMonDuplicates',
    // ── Aliases to existing handlers ──
    'getdatachangestream'=>'handleSqlGetDataChangesSince',
    'exportaudit'=>'handleGetAuditLog',
    'adminassets'=>'handleSqlGetDriveAssets',
    'sendadminmessage'=>'handleSendMessage',
    'generateapplicationdocument'=>'handleAutoGenerateForType',
    'savedocumentcontent'=>'handleSaveDocumentContent',
    'getdocumentcontent'=>'handleGetDocumentContent',
    // ── VEDA: ORCID + Scopus research proxy (stored config, no hardcoded keys) ──
    'veda_search'=>'handleVedaSearch','veda_dossier'=>'handleVedaDossier','veda_config'=>'handleVedaConfig',
    // v12.54.20: Full ORCID + Scopus API
    'orcid_search'=>'handleOrcidSearch','orcid_record'=>'handleOrcidRecord',
    'scopus_author_search'=>'handleScopusAuthorSearch','scopus_metrics'=>'handleScopusMetrics','scopus_works'=>'handleScopusWorks',
    'unified_publications'=>'handleUnifiedPublications',
    'veda_chat'=>'handleVedaChat','veda_dossier_by_email'=>'handleVedaDossierByEmail','veda_auto_sync'=>'handleVedaAutoSync',
    'getscientificworks'=>'handleGetScientificWorks','fetchscientificworks'=>'handleFetchScientificWorks','fetchscientificpublications'=>'handleFetchScientificPublications',
    'fetchstaffpublications'=>'handleFetchStaffPublications',
    'savestafforcid'=>'handleSaveStaffOrCreate',
    'getstafforcid'=>'handleGetStaffOrCreate',
    // v12.54.41: ORCID OAuth connection
    'orcid_auth_url'=>'handleGetOrcIDAuthUrl',
    'orcid_callback'=>'handleOrcIDCallback',
    'orcid_disconnect'=>'handleDisconnectOrcID',
    'saveorcidconnection'=>'handleSaveOrcIDConnection',
    'getorcidstatus'=>'handleGetOrcIDStatus',
    // v12.54.19: Reviewer publications aggregate API
    'getreviewerpublications'=>'handleGetReviewerPublications','syncallreviewerpublications'=>'handleSyncAllReviewerPublications',
    'getscientificprofile'=>'handleGetScientificProfile','syncscientificworks'=>'handleSyncScientificWorks',
    'addscientificwork'=>'handleAddScientificWork','deletescientificwork'=>'handleDeleteScientificWork',
    'bulkimportscientificworks'=>'handleBulkImportScientificWorks','cleanupscientificdata'=>'handleCleanupScientificData',
    // v12.54.37: Open-source publications aggregator (ORCID + CrossRef + Semantic Scholar + OpenAlex + DBLP + Scholar)
    'fetchopenpublications'=>'handleFetchOpenPublications','syncallopenpublications'=>'handleSyncAllOpenPublications',
    // ── EPIC-D Research intelligence (T24/T25/T26/T150) ──
    'vedawrite'=>'handleVedaWrite',
    'vedacite'=>'handleVedaCite',
    'vedabibteximport'=>'handleVedaBibtexImport',
    'vedametrics'=>'handleVedaMetrics',
    'vedacoauthornetwork'=>'handleVedaCoauthorNetwork',
    'getdoccomments'=>'handleGetDocComments','adddoccomment'=>'handleAddDocComment','getreviewcomments'=>'handleGetReviewComments','addreviewcomment'=>'handleAddReviewComment',
    'googleauthemail'=>'handleGoogleAuthEmail',
    'getdocversions'=>'handleGetDocVersions',
    // ── EPIC-C Platform/API surface (T16/T17/T19/T20) ──
    'dispatchwebhook'=>'handleDispatchWebhook',
    'getwebhookdeliveries'=>'handleGetWebhookDeliveries',
    'creatapikey'=>'handleCreateApiKey',
    'listapikeys'=>'handleListApiKeys',
    'revokeapikey'=>'handleRevokeApiKey',
    'rotateapikey'=>'handleRotateApiKey',
    // ── EPIC-D User management (T21 profile, T22 password reset, T23 session history) ──
    'get_session_history'=>'handleGetSessionHistory',
    'request_password_reset'=>'handleRequestPasswordReset',
    'reset_password'=>'handleResetPassword',
    'admin_set_password'=>'handleAdminSetPassword',
    // ── T71: Login Analytics ──
    'recordloginattempt'=>'handleRecordLoginAttempt',
    'getloginanalytics'=>'handleGetLoginAnalytics',
    // ── T75: Account Lockout ──
    'checkaccountlockout'=>'handleCheckAccountLockout',
    'lockaccount'=>'handleLockAccount',
    'unlockaccount'=>'handleUnlockAccount',
    // ── T73/T74: MFA (Multi-Factor Authentication) ──
    'setupmfa'=>'handleSetupMfa',
    'verifymfasetup'=>'handleVerifyMfaSetup',
    'disablemfa'=>'handleDisableMfa',
    // ── EPIC-B Data export & bulk ops (T7/T8/T15) ──
    'exportsubmissionscsv'=>'handleExportSubmissionsCsv',
    'bulkdeletedrafts'=>'handleBulkDeleteDrafts',
    'startexportzip'=>'handleStartExportZip',
    'getexportprogress'=>'handleGetExportProgress',
    'downloadexportfile'=>'handleDownloadExportFile',
    // ══════════════════════════════════════════════════════════════════════
    // v12.50.0-batch-import: batch competitor/participant CSV import (T18)
    // ══════════════════════════════════════════════════════════════════════
    'batchimportcompetitors'=>'handleBatchImportCompetitors',
    'batchimportparticipants'=>'handleBatchImportCompetitors',
    'startbatchimport'=>'handleStartBatchImport',
    'getbatchimportprogress'=>'handleGetBatchImportProgress',
    'validateimportfile'=>'handleValidateImportFile',
    'mapimportfields'=>'handleMapImportFields',
    // T58: Excel import support
    'importexcelfile'=>'handleImportExcelFile',
    // T49: Email notification templates
    'getemailtemplates'=>'handleGetEmailTemplates',
    'saveemailtemplate'=>'handleSaveEmailTemplate',
    'deleteemailtemplate'=>'handleDeleteEmailTemplate',
    // T52: Notification preferences
    'getuserprefs'=>'handleGetUserPreferences',
    'saveuserprefs'=>'handleSaveUserPreferences',
    // T71: Login analytics
    'recordloginattempt'=>'handleRecordLoginAttempt',
    'getloginanalytics'=>'handleGetLoginAnalytics',
    // T72: Session management
    'getsessionlist'=>'handleGetSessionList',
    'revokesession'=>'handleRevokeSession',
    // T73: MFA setup
    'setupmfa'=>'handleSetupMfa',
    'verifymfasetup'=>'handleVerifyMfaSetup',
    'disablemfa'=>'handleDisableMfa',
    // T75: Account lockout
    'checkaccountlockout'=>'handleCheckAccountLockout',
    'lockaccount'=>'handleLockAccount',
    'unlockaccount'=>'handleUnlockAccount',
    // T129: Admin cleanup
    'adminclnupolddocs'=>'handleAdminCleanupOldDocs',
    'adminclnupdupelib'=>'handleAdminCleanupDupeLib',
    'adminclnuptempfiles'=>'handleAdminCleanupTempFiles',
    // T139: Webhook registration
    'registerwebhook'=>'handleRegisterWebhook',
    'listwebhooks'=>'handleListWebhooks',
    'deletewebhook'=>'handleDeleteWebhook',
    // T140: GraphQL
    'graphql'=>'handleGraphql',
    // T145: CSP violation reporting
    'cspreport'=>'handleCspReport',
    // T149: Health check endpoint
    'health'=>'handleHealth',
    // T119: Export Integration (external system push)
    'listintegrationendpoints'=>'handleListIntegrationEndpoints',
    'saveintegrationendpoint'=>'handleSaveIntegrationEndpoint',
    'deleteintegrationendpoint'=>'handleDeleteIntegrationEndpoint',
    'pushtoexternal'=>'handlePushToExternal',
    'listexportlog'=>'handleListExportLog',
    // T120: Calendar Integration
    'listcalendarevents'=>'handleListCalendarEvents',
    'createcalendarevent'=>'handleCreateCalendarEvent',
    'updatecalendarevent'=>'handleUpdateCalendarEvent',
    'deletecalendarevent'=>'handleDeleteCalendarEvent',
    'synccalendarfromprojects'=>'handleSyncCalendarFromProjects',
    // T78: Rollback mechanism
    'rollback'=>'handleRollback',
];
