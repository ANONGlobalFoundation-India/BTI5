/* ANON Internship Leaderboard settings.
   Grades, points and all batch content live in each batch's Google Sheet, not here.
   This file only lists the batches and a few site-wide names. */
var LB_CONFIG = {
  orgName: 'ANON Global Foundation',
  siteName: 'ANON Internship Leaderboard',

  // Each intern card gets a "Verify certificate" button when the sheet has their Certificate ID.
  credentialHubUrl: 'https://anonglobalfoundation-india.github.io/Certificate-Validator/',

  // The three teams. `name` must match the tab names in the Google Sheet exactly.
  teams: [
    { name: 'Team Connect', short: 'Connect', color: '#e2302c' },
    { name: 'Team Impact', short: 'Impact', color: '#2456c9' },
    { name: 'Team Expression', short: 'Expression', color: '#7c3aed' }
  ],

  // Batches shown in the switcher, newest first.
  //   sheet:    the Google Sheet's link (or just its ID). The page reads it live.
  //   file:     a saved copy in the data folder (used for finished batches).
  //   archived: true = a finished batch: shows the final grades only, no "suggested" grades.
  //   teams:    which of the teams above this batch has (leave it out to use all three).
  // When a batch ends you can keep it on `sheet` (it stays live) or ask for a saved copy.
  batches: [
    { id: 'bti5', label: 'BTI 5', sheet: '', teams: ['Team Connect', 'Team Expression'] },
    { id: 'bti4', label: 'BTI 4', file: 'data/bti4.json', archived: true },
    { id: 'bti3', label: 'BTI 3', file: 'data/bti3.json', archived: true }
  ],
  defaultBatch: 'bti5',

  // How often an open page re-reads a live sheet, in minutes.
  refreshMinutes: 5
};
