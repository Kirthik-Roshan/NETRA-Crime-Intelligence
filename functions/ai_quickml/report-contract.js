'use strict';

// Shared by the Function and Web Client. Old PDFs must never silently bypass
// the template check just because conversion returned a binary successfully.
const REPORT_TEMPLATE_VERSION = 'netra-report-v4';
module.exports = { REPORT_TEMPLATE_VERSION };
