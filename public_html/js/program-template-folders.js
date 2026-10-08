/**
 * program-template-folders.js — Funding-program → Google Drive template-folder map.
 *
 * Each UEV-ERP funding program (ФНИ / ПНИ / ДНП / НПФ) keeps its copyable
 * Google-Doc application templates in a dedicated Drive folder. Applicants open
 * the wizard's "Шаблони" section, pick their program, and copy any template into
 * their own Drive via GAS `copyTemplateForUser`.
 *
 * Folder IDs are the shared, view-capable folders the admin maintains. To add a
 * template, drop a Google Doc/ Sheet into the relevant folder — the UI lists it
 * automatically (via action=listFolderTemplates → GAS listFolderTemplates).
 *
 * NOTE: НПФ folder ID is filled from the deployment brief; update if it changes.
 */
window.__PROGRAM_TEMPLATE_FOLDERS__ = {
  'ФНИ': '1hj_COrKRQVpLKLp8fazYmXqFoZfBGlDA',
  'ПНИ': '1FIbgjCTsfpVKDE92AWZuX1f6wty0tyl4',
  'ДНП': '1Osx7-epb97eQgDT5XUzt7FZjcvBAQGLS',
  'НПФ': '13_oGAlHQdHAzo33OW9imEjcqtcUVbSb2' // from GAS _getTemplateFolderIds_
};

// Human-readable folder URLs (for the "Отвори папката" fallback link).
window.__PROGRAM_TEMPLATE_FOLDER_URLS__ = {
  'ФНИ': 'https://drive.google.com/drive/folders/1hj_COrKRQVpLKLp8fazYmXqFoZfBGlDA',
  'ПНИ': 'https://drive.google.com/drive/folders/1FIbgjCTsfpVKDE92AWZuX1f6wty0tyl4',
  'ДНП': 'https://drive.google.com/drive/folders/1Osx7-epb97eQgDT5XUzt7FZjcvBAQGLS',
  'НПФ': 'https://drive.google.com/drive/folders/13_oGAlHQdHAzo33OW9imEjcqtcUVbSb2' // from GAS _getTemplateFolderIds_
};
