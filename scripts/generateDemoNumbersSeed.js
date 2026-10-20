/* Deterministic SQLyog demo inventory generator. Run after npm run build. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { classifyNumber, CATEGORY_CATALOG, CATEGORY_CLASSIFIER_VERSION } = require('../dist/server/pixels/api/categories/categoryClassifier');

const output = path.resolve(__dirname, '../database/seeds/20260927_demo_numbers_4200_sqlyog.sql');
let state = 0x5eed2026;
function random() { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; }
function digit(nonzero = false) { return String((nonzero ? 1 : 0) + Math.floor(random() * (nonzero ? 9 : 10))); }
function phone() { return String(6 + Math.floor(random() * 4)) + Array.from({ length: 9 }, () => digit()).join(''); }
function embed(part, at) { const original = phone(); return original.slice(0, at) + part + original.slice(at + part.length); }
function pick(array) { return array[Math.floor(random() * array.length)]; }
function render(pattern) {
  const assigned = {};
  let value = '';
  for (const ch of pattern) {
    if (/\d/.test(ch)) value += ch;
    else if (ch === '?') value += digit();
    else {
      if (!(ch in assigned)) assigned[ch] = ch === 'P' ? String(6 + Math.floor(random() * 4)) : digit();
      value += assigned[ch];
    }
  }
  return value;
}

const candidates = new Map();
function add(value) {
  if (!/^[6-9]\d{9}$/.test(value) || candidates.has(value)) return;
  const classified = classifyNumber(value);
  candidates.set(value, classified);
}

// Fixed fragments cover the unusual literal families; permutations make realistic variety.
const fragments = [
  '000', '0000', '00000', '000000', '0000000', '00000001', '0000013', '00013',
  '000786', '00786', '0786', '786', '786786', '7869786', '78613', '78692',
  '13000', '01313', '1313', '131313', '108', '1008', '302', '307', '751',
  '720', '420', '855', '5911', '1986', '2024', '123456', '234567', '987654',
  '1212000', '1201200', '100200300', '1200034000', '12300', '1203400',
];
for (const part of fragments) {
  for (let start = 0; start + part.length <= 10; start++) {
    for (let repeat = 0; repeat < 12; repeat++) add(embed(part, start));
  }
}

const templates = [
  'PAAAAAAAAA', 'PAAAAAAAAB', 'PAAAAAAABC', 'PAAAAAABCD',
  'PAAAAABCDE', 'PAAAAABCDF', 'PAAAABCDEF', 'PAAAABCDEF',
  'PABABABABA', 'PABABABABC', 'PABABABBCD', 'PABABACABA',
  'PABCDABCDE', 'PABCDABCDQ', 'PABCDXABCD', 'PABCDABCDX',
  'PABCDXYABC', 'PABCABCABC', 'PABCABCXYZ', 'PABCXABCYZ',
  'PAAABBBCCC', 'PAAABBBXYZ', 'PAAAXBBBYZ', 'PAAABBBBBC',
  'PAABBCCDDE', 'PAABBCCDDX', 'PXAABBCCDD', 'PAABBAABBX',
  'PABABXYXYX', 'PXABABXYXY', 'PABABXXYXY', 'PXABABXYYX',
  'PABABXABAB', 'PABCDABCDX', 'PABCDXABCD',
  'PAB00CD00X', 'P00AB00CDX', 'PAB00CD00Y', 'P00A00B00X',
  'PA00B00C00', 'PAB000XY00', 'PABCD00000', 'P00000ABCD',
  'P0000ABABX', 'P000ABABXY', 'PABAB000XY', 'PAB000ABXY',
  'PAXAXAXAXA', 'P0A0A0A0A', 'P123456789', 'P987654321',
  'PABABAB000', 'P00000ABAB', 'PAA000ABAB', 'PAB000ABCD',
  'PAAABBBCCC', 'PABCABCABC', 'PABCDABCDX',
];
for (const pattern of templates) {
  if (pattern.length !== 10) continue;
  for (let i = 0; i < 135; i++) add(render(pattern));
}

// A few structured generators cover families whose rules are positional.
for (let i = 0; i < 1800; i++) {
  const p = String(6 + Math.floor(random() * 4));
  const a = digit(), b = digit(), c = digit(), d = digit(), e = digit();
  add(p + a + a + b + b + c + c + d + d + e);
  add(p + a + a + a + b + b + b + c + c + c);
  add(p + a + b + c + d + a + b + c + d + e);
  add(p + a + b + c + a + b + c + d + e + digit());
  add(p + a + b + a + b + c + d + c + d + e);
  add(p + a + a + a + a + b + b + b + b + c);
  add(p + a + b + a + b + a + b + c + d + e);
  add(p + a + b + '0000' + c + d + e);
  add(p + a + b + '00000' + c + d);
  add(p + a + b + c + '000000');
  add(p + a + b + c + d + e + a + b + c + d);
  add(p + a + b + c + d + e + d + c + b + a);
}
for (let i = 0; i < 3500; i++) add(phone());

const wanted = new Set(CATEGORY_CATALOG.flatMap(c => c.subcategories.map(s => `${c.id}:${s.id}`)));
const represented = new Set();
const selected = [];
const selectedValues = new Set();
function accept(value, classification) {
  selected.push({ value, classification });
  selectedValues.add(value);
  for (const c of classification.categories) for (const s of c.subcategories) represented.add(`${c.id}:${s.id}`);
}
// Greedy set cover first, then fill with a varied slice of the remaining candidates.
const entries = [...candidates.entries()];
while (selected.length < 300) {
  let best = null, gain = 0;
  for (const entry of entries) {
    if (selectedValues.has(entry[0])) continue;
    const newCount = entry[1].categories.reduce((total, c) => total + c.subcategories.filter(s => !represented.has(`${c.id}:${s.id}`)).length, 0);
    if (newCount > gain) { best = entry; gain = newCount; }
  }
  if (!best || gain === 0) break;
  accept(...best);
}
const remaining = entries.filter(([value]) => !selectedValues.has(value));
for (let i = remaining.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [remaining[i], remaining[j]] = [remaining[j], remaining[i]]; }
for (const entry of remaining) { if (selected.length >= 4200) break; accept(...entry); }
if (selected.length !== 4200) throw new Error(`Only ${selected.length} unique numbers generated`);
const missing = [...wanted].filter(key => !represented.has(key));

function sqlEscape(value) { return `'${String(value).replace(/'/g, "''")}'`; }
function emitRows(lines, table, columns, rows, chunkSize = 120) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    lines.push(`INSERT INTO ${table} (${columns}) VALUES\n${rows.slice(i, i + chunkSize).map(row => '(' + row.join(',') + ')').join(',\n')};\n`);
  }
}
const seedMarker = 'VNW DEMO SEED 2026-09-27';
const token = crypto.randomBytes(32).toString('base64url');
const lines = [
  '-- VIPNUMBERWORLD demo inventory for SQLyog Community. Execute the entire file in one session.',
  '-- REQUIRES: current schema plus 20260926_internal_category_taxonomy_sqlyog.sql and an ACTIVE ADMIN auth_user.',
  '-- TEST/STAGING DATA ONLY: generated 10-digit values are syntactically valid, not owned/verified and may be real subscriber numbers.',
  '-- Do not publish these listings as real saleable inventory. Set @vnw_demo_publish=1 below only in an isolated test store.',
  '-- NON_RTP means pre-book and gets a future RTP date; RTP means ready to port; RTA means ready to activate.',
  `-- ${selected.length} unique numbers; ${wanted.size - missing.length}/${wanted.size} category/subcategory assignments covered; classifier v${CATEGORY_CLASSIFIER_VERSION}.`,
  `-- Intentionally unmatchable taxonomy entries: ${missing.map(key => { const [id, sid] = key.split(':').map(Number); const c = CATEGORY_CATALOG.find(x => x.id === id); return `${c.name} / ${c.subcategories.find(s => s.id === sid).name}`; }).join(', ') || 'none'}.`,
  '-- Safe to rerun: existing number_value records are never overwritten. Seed-owned indexes are repaired on rerun.',
  '-- Run all statements together in one SQLyog connection; temporary tables disappear when that connection closes.',
  '',
  'SET @vnw_demo_publish := 0; -- 0 = INACTIVE safe preview; 1 = AVAILABLE in an isolated test store',
  `SET @vnw_demo_marker := ${sqlEscape(seedMarker)};`,
  `SET @vnw_demo_private_token := ${sqlEscape(token)};`,
  "SET @vnw_demo_admin_id := (SELECT user_id FROM auth_user WHERE role = 'ADMIN' AND status = 'ACTIVE' ORDER BY user_id LIMIT 1);",
  "SELECT IF(@vnw_demo_admin_id IS NULL, 'STOP: create/activate an ADMIN user before running the inserts', CONCAT('Using ADMIN user ', @vnw_demo_admin_id)) AS preflight;",
  '',
  'DROP TEMPORARY TABLE IF EXISTS `_vnw_demo_subcategories`;',
  'DROP TEMPORARY TABLE IF EXISTS `_vnw_demo_categories`;',
  'DROP TEMPORARY TABLE IF EXISTS `_vnw_demo_seed`;',
  'CREATE TEMPORARY TABLE `_vnw_demo_seed` (',
  '  `number_value` varchar(20) NOT NULL PRIMARY KEY, `mrp` decimal(18,2) NOT NULL,',
  '  `rtp_status` enum(\'RTP\',\'NON_RTP\',\'RTA\') NOT NULL, `rtp_days` int unsigned NOT NULL,',
  '  `visibility_type` enum(\'ONLINE\',\'OFFLINE\') NOT NULL, `badge` varchar(20) NOT NULL,',
  '  `numerology_sum` int NOT NULL, `is_featured` tinyint(1) NOT NULL',
  ') ENGINE=InnoDB;',
  'CREATE TEMPORARY TABLE `_vnw_demo_categories` (`number_value` varchar(20) NOT NULL, `category_slug` varchar(64) NOT NULL, PRIMARY KEY (`number_value`,`category_slug`)) ENGINE=InnoDB;',
  'CREATE TEMPORARY TABLE `_vnw_demo_subcategories` (`number_value` varchar(20) NOT NULL, `category_id` int unsigned NOT NULL, `subcategory_id` int unsigned NOT NULL, PRIMARY KEY (`number_value`,`category_id`,`subcategory_id`)) ENGINE=InnoDB;',
  '',
];
const prices = [499, 799, 999, 1499, 1999, 2499, 2999, 3999, 4999, 6999, 9999, 14999, 19999, 29999, 49999];
const badges = ['NONE', 'NONE', 'NONE', 'NEW_ARRIVAL', 'VALUE_PICK', 'HOT_PICK', 'PREMIUM', 'HOT_DEAL'];
emitRows(lines, '`_vnw_demo_seed`', '`number_value`,`mrp`,`rtp_status`,`rtp_days`,`visibility_type`,`badge`,`numerology_sum`,`is_featured`', selected.map(({ value }, i) => [
  sqlEscape(value), prices[i % prices.length], sqlEscape(['RTA', 'RTP', 'NON_RTP'][i % 3]), 15 + i % 76,
  sqlEscape(i % 10 === 0 ? 'OFFLINE' : 'ONLINE'), sqlEscape(badges[i % badges.length]),
  value.split('').reduce((sum, d) => sum + Number(d), 0), i % 17 === 0 ? 1 : 0,
]));
const categoryRows = [], subcategoryRows = [];
for (const { value, classification } of selected) for (const category of classification.categories) {
  categoryRows.push([sqlEscape(value), sqlEscape(category.slug)]);
  for (const sub of category.subcategories) subcategoryRows.push([sqlEscape(value), category.id, sub.id]);
}
emitRows(lines, '`_vnw_demo_categories`', '`number_value`,`category_slug`', categoryRows);
emitRows(lines, '`_vnw_demo_subcategories`', '`number_value`,`category_id`,`subcategory_id`', subcategoryRows);
lines.push(
  'START TRANSACTION;',
  'INSERT INTO `vip_numbers` (`number_value`,`display_number`,`seller_id`,`seller_type`,`title_label`,`badge`,`mrp`,`offer_price`,`discount_pct`,`numerology_sum`,`operator`,`description`,`stock`,`status`,`visibility_type`,`rtp_status`,`rtp_available_at`,`is_featured`,`base_price`,`additional_discount_pct`)',
  'SELECT s.number_value, CONCAT(LEFT(s.number_value,4),\' \',SUBSTRING(s.number_value,5,3),\' \',RIGHT(s.number_value,3)), @vnw_demo_admin_id, \'ADMIN\', \'VIP Number\', s.badge, ROUND(s.mrp * 1.25, 2),',
  '  ROUND(s.mrp * 1.25 * 0.95, 2), 5, s.numerology_sum, NULL, @vnw_demo_marker, 1,',
  "  IF(@vnw_demo_publish=1,'AVAILABLE','INACTIVE'), s.visibility_type, s.rtp_status,",
  "  IF(s.rtp_status='NON_RTP',DATE_ADD(UTC_TIMESTAMP(), INTERVAL s.rtp_days DAY),NULL), s.is_featured, s.mrp, 0",
  'FROM `_vnw_demo_seed` s LEFT JOIN `vip_numbers` existing ON existing.number_value=s.number_value WHERE existing.number_id IS NULL;',
  '',
  'INSERT INTO `vip_number_categories` (`number_id`,`category_slug`,`classifier_version`)',
  `SELECT n.number_id,c.category_slug,${CATEGORY_CLASSIFIER_VERSION} FROM \`_vnw_demo_categories\` c JOIN \`vip_numbers\` n ON n.number_value=c.number_value WHERE n.description=@vnw_demo_marker`,
  'ON DUPLICATE KEY UPDATE classifier_version=VALUES(classifier_version);',
  'INSERT INTO `vip_number_subcategories` (`number_id`,`category_id`,`subcategory_id`,`classifier_version`)',
  `SELECT n.number_id,c.category_id,c.subcategory_id,${CATEGORY_CLASSIFIER_VERSION} FROM \`_vnw_demo_subcategories\` c JOIN \`vip_numbers\` n ON n.number_value=c.number_value WHERE n.description=@vnw_demo_marker`,
  'ON DUPLICATE KEY UPDATE classifier_version=VALUES(classifier_version);',
  '',
  'INSERT INTO `number_private_links` (`name`,`token_hash`,`expires_at`,`created_by`)',
  "SELECT 'VNW Demo Offline Numbers',SHA2(@vnw_demo_private_token,256),NULL,@vnw_demo_admin_id",
  'WHERE NOT EXISTS (SELECT 1 FROM `number_private_links` WHERE token_hash=SHA2(@vnw_demo_private_token,256));',
  'INSERT IGNORE INTO `number_private_link_items` (`private_link_id`,`number_id`)',
  'SELECT pl.private_link_id,n.number_id FROM `number_private_links` pl',
  'JOIN `vip_numbers` n ON n.visibility_type=\'OFFLINE\' AND n.description=@vnw_demo_marker',
  'JOIN `_vnw_demo_seed` s ON s.number_value=n.number_value AND s.visibility_type=\'OFFLINE\'',
  'WHERE pl.token_hash=SHA2(@vnw_demo_private_token,256);',
  'COMMIT;',
  '',
  "SELECT COUNT(*) AS seeded_numbers, SUM(rtp_status='RTA') AS rta, SUM(rtp_status='RTP') AS ready_to_port, SUM(rtp_status='NON_RTP') AS prebook, SUM(visibility_type='OFFLINE') AS offline FROM vip_numbers WHERE description=@vnw_demo_marker;",
  'SELECT COUNT(DISTINCT vc.category_slug) AS covered_categories FROM vip_number_categories vc JOIN vip_numbers n ON n.number_id=vc.number_id WHERE n.description=@vnw_demo_marker AND vc.classifier_version=4;',
  'SELECT COUNT(DISTINCT CONCAT(vs.category_id,\':\',vs.subcategory_id)) AS covered_category_subcategory_pairs FROM vip_number_subcategories vs JOIN vip_numbers n ON n.number_id=vs.number_id WHERE n.description=@vnw_demo_marker AND vs.classifier_version=4;',
  "SELECT CONCAT('/private/',@vnw_demo_private_token) AS demo_offline_collection_path;",
  'DROP TEMPORARY TABLE IF EXISTS `_vnw_demo_subcategories`;',
  'DROP TEMPORARY TABLE IF EXISTS `_vnw_demo_categories`;',
  'DROP TEMPORARY TABLE IF EXISTS `_vnw_demo_seed`;',
  '',
);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, lines.join('\n'), 'utf8');
console.log(JSON.stringify({ output, numbers: selected.length, categories: CATEGORY_CATALOG.length, assignmentsCovered: wanted.size - missing.length, assignmentsTotal: wanted.size, missing, categoryRows: categoryRows.length, subcategoryRows: subcategoryRows.length, bytes: fs.statSync(output).size }, null, 2));
