// Administrative Assistant personas (Phase 7). Calibrated against the anchors of the APPROVED profile
// config/jobs/admin.v1.json (L-005), not against what an admin CV usually looks like. Weights:
//   calendar_and_travel 20 · office_software 25 · financial_admin 20 · record_keeping 15 · office_coordination 20
// The approved keyword must-have only accepts six job titles (administrative assistant, administrator,
// office assistant, receptionist, office coordinator, admin assistant). Every "should pass" CV carries
// one of them in a job title; every "should fail on keywords" CV carries none, and the generator lints both.
// All people and organisations are fictional.
const { UNRELATED_JOBS } = require('./personas');

const ADMIN_ORGS = ['Copperleaf Accountants', 'Bramble & Finch Solicitors', 'Lantern Events Ltd', 'Westbrook Medical Centre', 'Kestrel Logistics Head Office',
  'Marlow Engineering Group', 'Sable Street Architects', 'Greyfriars Insurance Brokers'];

// Jobs with no office vocabulary at all. "Data Entry Clerk" is left out: its record-keeping bullets would
// lift a medium or weak CV above its calibrated band.
const NON_OFFICE_JOBS = UNRELATED_JOBS.filter((j) => j.title !== 'Data Entry Clerk');

// STRONG tier: anchor-4 evidence (named volumes, end-to-end ownership) on every criterion, so the total
// lands around 85-95 and a one-point drop on any criterion still stays above 75.
function strongBullets(r) {
  const sheet = r.pick(['Excel', 'Google Sheets']);
  return [
    `Managed the diaries of ${r.int(3, 6)} directors, resolved double-bookings and planned end-to-end travel itineraries (flights, hotels and transfers) for ${r.int(20, 60)} trips a year.`,
    `Built ${sheet} trackers with formulas, pivot tables and conditional formatting, and formatted board reports and PowerPoint decks for the leadership team.`,
    `Processed ${r.int(80, 250)} supplier invoices, purchase orders and expense claims a month end to end, matched them to orders and resolved billing discrepancies with suppliers.`,
    'Took minutes at weekly management meetings and chased every action point until it was closed.',
    'Set up a shared-drive filing system for contracts and supplier files and kept confidential staff records up to date.',
    `Ran the main phone line and shared inbox, handling ${r.int(60, 120)} calls and emails a day, ordered office supplies and managed building maintenance contractors.`,
  ];
}
function adminStrongJob(r, years) {
  return { title: r.pick(['Administrative Assistant', 'Senior Administrative Assistant', 'Office Administrator', 'Team Administrator', 'Office Coordinator']),
    org: r.pick(ADMIN_ORGS), years, bullets: r.shuffle(strongBullets(r)) };
}
function adminEarlierJob(r, years, titles = ['Receptionist', 'Office Assistant', 'Admin Assistant']) {
  return { title: r.pick(titles), org: r.pick(ADMIN_ORGS), years, bullets: r.sample([
    'Greeted visitors, booked meeting rooms and kept the visitor log accurate.',
    'Kept the petty cash and expenses spreadsheet balanced to the penny every month.',
    'Booked travel and hotels for visiting staff and sent them clear itineraries.',
    'Scanned and indexed paper archives into the document management system.',
    'Prepared letters, mail merges and meeting packs in Word.',
  ], r.int(2, 3)) };
}
// Same evidence as strong, under titles the approved keyword list does not contain.
function paJob(r, years) {
  return { title: r.pick(['Executive Assistant', 'Personal Assistant to the Managing Director']), org: r.pick(ADMIN_ORGS), years, bullets: r.shuffle(strongBullets(r)) };
}

// MEDIUM tier, target about 65 (MAYBE, 10 points from each threshold):
//   calendar 2 (room bookings, one calendar, no travel) · software 3 (a spreadsheet tracker + a monthly report)
//   financial 2 (enters invoices, someone else pays) · records 3 (files + minutes with action points, no system built)
//   coordination 3 (phone, inbox, supplies, repairs; no volumes)
//   Weighted: 10 + 18.75 + 10 + 11.25 + 15 = 65.
// Each setting has its own employers and duties, so the CV reads coherently.
const ADMIN_MEDIUM_SETTINGS = [
  { titles: ['Receptionist', 'Practice Receptionist'], orgs: ['Kingsmead Dental Practice', 'Westbrook Medical Centre'], bullets: [
    "Booked patient appointments and meeting rooms, and kept the practice manager's calendar up to date.",
    'Tracked supplier orders and stock levels in an Excel spreadsheet and prepared a monthly summary report in Word for the practice manager.',
    'Entered supplier invoices into the finance spreadsheet and passed them to the accountant for payment.',
    'Kept contract and supplier files up to date on the shared drive and in paper folders, and took minutes at the monthly staff meeting with a list of action points.',
    'Answered the main phone line and the shared inbox, directed enquiries to the right person, ordered office supplies and called the maintenance contractor about repairs.'] },
  { titles: ['Office Assistant', 'School Office Assistant'], orgs: ['Fernhill Primary School', 'Oakbank Secondary School'], bullets: [
    "Booked rooms for parent meetings and updated the head teacher's calendar when meetings moved.",
    'Kept attendance figures in a Google Sheets tracker with simple formulas and prepared the weekly newsletter and letters to parents in Word.',
    'Logged supplier invoices and passed them to the school business manager for payment.',
    "Kept supplier and contractor files up to date in the paper archive and on the shared drive, and took minutes at the governors' premises committee with a list of action points.",
    'Answered the school phone line and the office inbox, passed enquiries to the right teacher, ordered stationery and reported repairs to the caretaker.'] },
  { titles: ['Admin Assistant', 'Lettings Admin Assistant'], orgs: ['Harbourside Lettings', 'Northgate Housing Association'], bullets: [
    'Booked property viewings and meeting rooms and kept the shared team calendar up to date.',
    'Kept a spreadsheet of tenancy renewals in Excel and prepared a monthly lettings report in Word for the branch manager.',
    'Entered contractor invoices into the accounts spreadsheet for the finance team to pay.',
    'Kept tenancy agreements and supplier files up to date on the shared drive and in paper folders, and took minutes at the weekly team meeting with a list of action points.',
    'Answered the main phone line and the lettings inbox, directed enquiries to the right negotiator, ordered office supplies and arranged repairs with the maintenance contractor.'] },
];
function adminMediumJob(r, years) {
  const s = r.pick(ADMIN_MEDIUM_SETTINGS);
  return { title: r.pick(s.titles), org: r.pick(s.orgs), years, bullets: s.bullets.slice() };
}

// WEAK tier (keyword in the title, little else), target under 30: coordination 1-2, software 0-1
// (listed only), calendar 0-1, financial 0, records 0.
function adminWeakJob(r, years) {
  return r.pick([
    { title: 'Receptionist', org: r.pick(['Riverside Leisure Centre', 'Pulse Fitness Gym']), years, bullets: ['Greeted members at the front desk and answered the phone.', 'Kept the reception area tidy and the leaflets stocked.'] },
    { title: 'Salon Receptionist', org: r.pick(['Willow Hair Studio', 'Glow Beauty Rooms']), years, bullets: ['Welcomed clients and booked their next appointment in the salon diary.', 'Made drinks for waiting clients and tidied the waiting area.'] },
    { title: 'Weekend Receptionist', org: r.pick(['Harbor Home Goods', 'Pinecrest Garden Centre']), years, bullets: ['Answered the phone on Saturdays and passed on messages.', 'Helped customers find the right department.'] },
  ]);
}

// The earlier job of an executive/personal assistant, again without a title from the keyword list.
const paEarlierJob = (r, years) => adminEarlierJob(r, years, ['Team Secretary', 'Personal Assistant']);

module.exports = { ADMIN_ORGS, NON_OFFICE_JOBS, adminStrongJob, adminEarlierJob, paJob, paEarlierJob, adminMediumJob, adminWeakJob };
