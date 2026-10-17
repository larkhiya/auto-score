// Phrase banks and CV builders for the synthetic applicant generator. All people and companies
// are fictional. Weak "should fail" personas use vocabulary chosen to avoid each role's
// pre-filter keywords; generate-applicants.js lints that before writing the answer key.

function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = (arr) => arr[Math.floor(next() * arr.length)];
  const sample = (arr, n) => {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy.slice(0, n);
  };
  return { next, int, pick, sample, shuffle: (arr) => sample(arr, arr.length) };
}

const FIRST = ['Amara', 'Ben', 'Carmen', 'Dmitri', 'Elif', 'Farah', 'Gabriel', 'Hana', 'Ibrahim', 'Jada', 'Kenji', 'Leila', 'Mateo', 'Nia', 'Oskar',
  'Priya', 'Quinn', 'Rafael', 'Sana', 'Tomas', 'Uma', 'Victor', 'Wen', 'Ximena', 'Yusuf', 'Zoe', 'Aiden', 'Bianca', 'Chidi', 'Daria', 'Emeka',
  'Fiona', 'Goran', 'Hiro', 'Isla', 'Jonah', 'Kavya', 'Liam', 'Mei', 'Nikhil', 'Olga', 'Pablo', 'Rosa', 'Samir', 'Tara', 'Uriel', 'Vera', 'Wanjiru',
  'Yara', 'Zaid', 'Alex', 'Sam', 'Jordan', 'Riley', 'Morgan', 'Casey', 'Taylor', 'Robin', 'Jamie', 'Avery'];
const LAST = ['Adeyemi', 'Bergstrom', 'Castillo', 'Dubois', 'Eriksen', 'Fernandes', 'Garcia', 'Haddad', 'Ito', 'Jovanovic', 'Kowalski', 'Lindqvist',
  'Mensah', 'Nakamura', 'Okafor', 'Petrov', 'Quintero', 'Rahman', 'Silva', 'Tanaka', 'Usman', 'Varga', 'Wojcik', 'Xu', 'Yilmaz', 'Zhang', 'Abara',
  'Brennan', 'Chowdhury', 'Delgado', 'Esposito', 'Fischer', 'Grant', 'Hughes', 'Ivanova', 'Jensen', 'Kim', 'Lopez', 'Moreau', 'Novak', 'Osei',
  'Park', 'Reyes', 'Sato', 'Torres', 'Ueda', 'Vasquez', 'Walsh', 'Yamada', 'Zielinski'];
const CITIES = ['Riverton', 'Lakeview', 'Fairmont', 'Brookfield', 'Cedar Falls', 'Westport', 'Oakridge', 'Millbrook', 'Harborview', 'Pinecrest'];

const SUPPORT_ORGS = ['Northwind Subscriptions', 'Bluebell Telecom', 'Lumen Streaming', 'Cedar Health Billing', 'Orbit Software', 'Kestrel Travel', 'Juniper Bank Services', 'Brightbox Meals'];
const FRONTLINE_ORGS = ['Lakeside Electronics', 'Maple Street Grocers', 'Riverside Hotel', 'Sunrise Outfitters', 'Harbor Home Goods', 'Grand Plaza Hotel'];
const SALES_ORGS = ['Ledgerly', 'Brightpath CRM', 'Fieldnote Analytics', 'Stackwise', 'PayTrail', 'CloudKettle', 'Quartzline Freight Software', 'Tallyhawk HR'];

const SUPPORT_TOOLS = ['Zendesk', 'Freshdesk', 'Salesforce Service Cloud', 'Intercom', 'HubSpot Service Hub', 'ServiceNow', 'Gorgias'];
const SALES_TOOLS = ['Outreach', 'Salesloft', 'Apollo', 'HubSpot Sequences'];
const SALES_CRMS = ['Salesforce', 'HubSpot'];
const PRODUCTS_SUPPORT = ['SaaS billing product', 'home internet service', 'meal-kit subscription', 'online banking app', 'e-commerce marketplace', 'streaming service', 'travel booking platform'];
const PRODUCTS_SALES = ['B2B payroll platform', 'sales analytics tool', 'HR software suite', 'logistics SaaS product', 'cybersecurity product', 'accounting software'];
const BUYERS = ['finance managers', 'HR directors', 'IT managers', 'operations leaders', 'small-business founders'];

// Jobs with no customer-facing or sales vocabulary at all (used by "should fail" personas).
const UNRELATED_JOBS = [
  { title: 'Warehouse Picker', org: 'Greenfield Logistics', bullets: ['Picked and packed 150+ orders per shift with 99.5% accuracy.', 'Operated pallet jacks and kept stock counts up to date.'] },
  { title: 'Line Cook', org: 'Pinecone Kitchen', bullets: ['Prepared dishes on the grill station during busy dinner services.', 'Kept the kitchen clean and followed food safety rules.'] },
  { title: 'Lab Assistant', org: 'Crescent Labs', bullets: ['Prepared samples and recorded results in the lab notebook.', 'Cleaned and calibrated equipment every week.'] },
  { title: 'Graphic Designer', org: 'Atlas Print Studio', bullets: ['Designed posters, flyers and social media graphics.', 'Prepared print-ready files in Adobe InDesign.'] },
  { title: 'Delivery Driver', org: 'Metro Couriers', bullets: ['Delivered 80+ parcels a day on a fixed route.', 'Planned routes and kept the van maintained.'] },
  { title: 'Data Entry Clerk', org: 'Pioneer Records', bullets: ['Entered and checked 500+ records a day with high accuracy.', 'Scanned and filed paper documents.'] },
  { title: 'Groundskeeper', org: 'Oakridge Parks Department', bullets: ['Maintained lawns, paths and flower beds across three parks.', 'Repaired benches and fences.'] },
  { title: 'Assembly Technician', org: 'Vector Components', bullets: ['Assembled circuit boards following technical drawings.', 'Ran quality checks and logged defects.'] },
];

function csrStrongJob(r, years) {
  const tool = r.pick(SUPPORT_TOOLS);
  const a = r.int(8, 12);
  const bullets = r.sample([
    `Handled ${r.int(45, 90)} inbound calls, chats and emails per day for a ${r.pick(PRODUCTS_SUPPORT)}.`,
    `Kept CSAT at ${r.int(92, 98)}% over ${r.int(12, 30)} months, above the team target of 90%.`,
    `Cut average handle time from ${a} to ${a - r.int(2, 4)} minutes by building troubleshooting checklists.`,
    'De-escalated upset customers and resolved escalated tier-2 cases with the billing team.',
    `Wrote ${r.int(10, 40)} knowledge-base articles and response macros used by the whole support team.`,
    `Worked tickets in ${tool}, wrote clear case notes and built ${r.int(5, 15)} macros for common issues.`,
    `Maintained ${r.int(85, 95)}% first-contact resolution and a ${r.int(90, 99)}% average QA score.`,
    `Trained ${r.int(3, 12)} new agents on ticket workflow, tone and escalation rules.`,
    'Collected customer feedback and reported recurring bugs to the product team.',
  ], r.int(4, 6));
  return { title: r.pick(['Customer Support Specialist', 'Senior Customer Service Representative', 'Tier 2 Support Agent', 'Customer Care Team Lead', 'Contact Centre Agent']), org: r.pick(SUPPORT_ORGS), years, bullets };
}

// MEDIUM tier, calibrated against the csr anchors (L-005). The target is a total of about 55-70
// (MAYBE), so every medium CV carries moderate evidence on most criteria:
//   customer-facing 3 (sustained, channels named, NO daily volume: volume earns anchor 4)
//   problem solving 2 (handles complaints, no stated outcome) · written 2-3 (email or chat)
//   results 2 (a metric named WITHOUT a number: a number earns anchor 3) · tools 3 (one tool, how used)
//   product 1-2. Weighted: about 18.75 + 10 + 9.4 + 7.5 + 11.25 + 3.75 ≈ 61.
// Each setting has its own employers and duties, so the CV reads coherently.
const CSR_MEDIUM_SETTINGS = [
  { titles: ['Customer Service Representative', 'Call Centre Agent'], orgs: SUPPORT_ORGS, tools: ['Freshdesk', 'Zendesk', 'HubSpot Service Hub'], bullets: (r, tool) => [
    'Answered customer calls and live chats about orders, deliveries and returns.',
    `Replied to customer emails and logged every case in ${tool} so nothing was lost between shifts.`,
    'Handled complaints and refund requests, passing difficult cases to a supervisor.',
    'Went through my customer satisfaction results with my team lead each month.'] },
  { titles: ['Retail Associate', 'Cashier'], orgs: ['Lakeside Electronics', 'Maple Street Grocers', 'Sunrise Outfitters', 'Harbor Home Goods'], tools: ['Shopify', 'Lightspeed'], bullets: (r, tool) => [
    'Served shoppers at the register and the returns desk, mostly on busy weekend shifts.',
    'Handled complaints about prices and faulty items, calling a manager when needed.',
    `Answered customer emails for the online shop and looked up orders in ${tool}.`,
    "Helped the store prepare for its mystery-shopper visits on service standards."] },
  { titles: ['Front Desk Agent', 'Guest Services Associate (front desk)'], orgs: ['Riverside Hotel', 'Grand Plaza Hotel'], tools: ['Opera PMS', 'Cloudbeds'], bullets: (r, tool) => [
    `Checked in guests and answered phone and email booking requests in ${tool}.`,
    'Dealt with billing mistakes and noise complaints, escalating refunds to the manager.',
    'Wrote replies to online guest reviews on behalf of the front desk team.',
    'Guest review scores were shared with the team every month.'] },
];

function csrMediumJob(r, years) {
  const s = r.pick(CSR_MEDIUM_SETTINGS);
  return { title: r.pick(s.titles), org: r.pick(s.orgs), years, bullets: s.bullets(r, r.pick(s.tools)) };
}

function sdrStrongJob(r, years) {
  const bullets = r.sample([
    `Made ${r.int(60, 110)} cold calls a day and booked ${r.int(12, 25)} qualified meetings per month for ${r.int(2, 5)} account executives.`,
    `Reached ${r.int(105, 140)}% of quarterly meetings quota for ${r.int(3, 6)} consecutive quarters; ranked #${r.int(1, 3)} of ${r.int(10, 30)} reps.`,
    `Built multi-step outbound email sequences in ${r.pick(SALES_TOOLS)} with a ${r.int(8, 18)}% reply rate.`,
    `Researched target accounts in LinkedIn Sales Navigator and qualified leads using ${r.pick(['BANT', 'MEDDIC'])} before handover.`,
    `Handled objections on price, timing and incumbents, turning ${r.int(25, 45)}% of first calls into discovery meetings.`,
    `Generated $${r.int(400, 1500)}K in pipeline in one year selling a ${r.pick(PRODUCTS_SALES)} to ${r.pick(BUYERS)}.`,
    `Logged all activity in ${r.pick(SALES_CRMS)} and kept pipeline stages accurate for weekly forecasts.`,
    `Wrote call scripts and trained ${r.int(2, 6)} new SDRs on prospecting and objection handling.`,
  ], r.int(4, 6));
  return { title: r.pick(['Sales Development Representative', 'Senior SDR', 'Business Development Representative', 'Outbound SDR Team Lead']), org: r.pick(SALES_ORGS), years, bullets };
}

// MEDIUM tier, calibrated against the sdr anchors (L-005), target about 55-70 (MAYBE):
//   prospecting 3 (regular calls, volume stated) · quota 2-3 (numbers, short record) · research 1-2
//   objections 2 (mentioned, simple approach) · tools 2-3 (one CRM, how used) · B2B 2 (business buyers, little detail)
//   Weighted: about 18.75 + 12.5 + 5.6 + 7.5 + 9.4 + 5 ≈ 59.
function sdrMediumJob(r, years) {
  const months = r.int(8, 12);
  return {
    title: r.pick(['Inside Sales Representative', 'Telemarketing Agent', 'Junior Business Development Representative', 'Lead Generation Assistant', 'Outbound Call Agent']),
    org: r.pick(SALES_ORGS), years,
    bullets: [
      `Made about ${r.int(40, 55)} outbound calls a day to small businesses to book demos for ${r.int(2, 3)} account managers.`,
      `Booked about ${r.int(6, 10)} meetings a month and hit the monthly target in ${months - r.int(2, 4)} of ${months} months.`,
      `Logged calls, follow-ups and lead notes in ${r.pick(['HubSpot', 'Pipedrive'])} every day.`,
      'Used a simple script to answer common objections about price and contract length.',
      `Called mostly ${r.pick(['restaurant and retail owners', 'dental and clinic managers', 'gym and studio owners'])} in the local area.`,
    ],
  };
}

// Pure support background with no sales vocabulary (cross-applicant that should fail sdr).
function supportNoSalesJob(r, years) {
  const j = csrStrongJob(r, years);
  j.bullets = j.bullets.filter((b) => !/sales|pipeline|quota/i.test(b));
  return j;
}
// Pure prospecting background with no customer-facing vocabulary (should fail csr).
function salesNoSupportJob(r, years) {
  const j = sdrStrongJob(r, years);
  j.bullets = j.bullets.filter((b) => !/customer service|customer support|retail|cashier|front desk|hospitality|help ?desk|call cent|contact cent/i.test(b));
  return j;
}

function dateRange(endYear, years) {
  return `${endYear - years}–${endYear === 2026 ? 'present' : endYear}`;
}

// Assembles a plain-text CV. The header carries the name and email, like a real CV: redaction
// (Phase 5) must strip them before any LLM sees the text.
function buildCv({ name, email, phone, location, summary, jobs, skills, languages, education, extra = [] }) {
  let end = 2026;
  const exp = [];
  for (const j of jobs) {
    exp.push(`${j.title}, ${j.org} (${dateRange(end, j.years)})`, ...j.bullets.map((b) => `- ${b}`), '');
    end -= j.years;
  }
  return [
    name.toUpperCase(),
    [email, phone, location].filter(Boolean).join(' | '),
    '',
    'SUMMARY', summary, '',
    'EXPERIENCE', ...exp,
    'SKILLS', skills.join(', '), '',
    'LANGUAGES', languages.join(', '), '',
    'EDUCATION', education,
    ...extra,
  ].join('\n').trim() + '\n';
}

module.exports = {
  makeRng, FIRST, LAST, CITIES, UNRELATED_JOBS, SUPPORT_TOOLS, SALES_TOOLS, SALES_CRMS, SUPPORT_ORGS, SALES_ORGS, FRONTLINE_ORGS,
  csrStrongJob, csrMediumJob, sdrStrongJob, sdrMediumJob, supportNoSalesJob, salesNoSupportJob, buildCv,
};
