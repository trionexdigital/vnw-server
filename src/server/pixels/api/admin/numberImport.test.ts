import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { NumberImport, readNumberRows, validateImportRow, signAnalysis, verifyAnalysis } from './numberImport';
import { describeAdminActivity } from '../notifications/adminActivity';
import { Admin } from './admin';

const secret = 'test-only-master-key';
const row = (number = '9876543210') => ({ number, mrp: '4999', serviceable_pin_codes: ['400001'], row: 1 });

test('backend parses comma/newline bulk numbers and validates canonical Indian numbers', () => {
  const records = readNumberRows({ numbers: '+91 98765 43210, 8123456789\n7123456789', mrp: 1000, serviceable_pin_codes: ['400001'] });
  assert.equal(records.length, 3);
  assert.equal(validateImportRow(records[0]).values.number, '9876543210');
  assert.equal(validateImportRow({ ...row(), number: '5123456789' }).reasons.length, 1);
  assert.equal(validateImportRow({ ...row(), number: '987654321x' }).reasons.length, 1);
});

test('backend rejects malformed price, status, visibility, stock and impossible dates', () => {
  const result = validateImportRow({ ...row(), mrp: '1.123', status: 'UNKNOWN', stock: -1, visibility_type: 'MAYBE', rtp_status: 'NON_RTP', rtp_available_date: '2030-02-31' });
  assert.equal(result.reasons.length, 5);
  assert.equal(validateImportRow({ ...row(), rtp_status: 'NON_RTP', rtp_available_date: '2030-02-28' }).reasons.length, 0);
});

test('CSV and XLSX use the same supported headers and reject formulas and unknown columns', () => {
  const csv = readNumberRows({}, { name: 'numbers.csv', data: Buffer.from('number,mrp,serviceable_pin_codes\n9876543210,4999,400001\n8123456789,999,400001') });
  assert.equal(csv.length, 2);
  assert.equal(validateImportRow(csv[0]).reasons.length, 0);
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([['number', 'mrp'], ['9876543210', 4999]]);
  sheet.B2.f = '1000+3999';
  XLSX.utils.book_append_sheet(book, sheet, 'Numbers');
  const xlsx = readNumberRows({}, { name: 'numbers.xlsx', data: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) });
  assert.match(validateImportRow(xlsx[0]).reasons.join(), /formulas/);
  assert.throws(() => readNumberRows({}, { name: 'bad.csv', data: Buffer.from('number,mrp,unknown\n9876543210,999,x') }), /unsupported/);
  assert.throws(() => readNumberRows({}, { name: 'bad.xlsx', data: Buffer.from('invalid') }), /valid XLSX/);
});

test('analysis rejects every repeated occurrence and numbers already present in the database', async () => {
  const service = new NumberImport();
  (service as any).dao = { executeQuery: async (sql: string) => ({ status: 1, rows: sql.includes('FROM env') ? [{ value: secret }] : [{ number_value: '8123456789' }] }) };
  const result: any = await service.analyze({ user_id: 1, numbers: '9876543210,+91 9876543210,8123456789,7123456789,123', mrp: 1000, serviceable_pin_codes: ['400001'] });
  assert.equal(result.status, 1);
  assert.equal(result.data.ready, 1);
  assert.equal(result.data.rejected, 4);
  assert.match(result.data.rows[0].reasons.join(), /Duplicate/);
  assert.match(result.data.rows[1].reasons.join(), /Duplicate/);
  assert.match(result.data.rows[2].reasons.join(), /already exists/);
  assert.equal(verifyAnalysis(result.data.analysis_token, 1, secret)[0].values.number, '7123456789');
});

test('analysis tickets reject tampering and imports by a different administrator', () => {
  const token = signAnalysis(1, [validateImportRow(row())], secret);
  assert.equal(verifyAnalysis(token, 1, secret).length, 1);
  assert.throws(() => verifyAnalysis(token, 2, secret), /expired/);
  assert.throws(() => verifyAnalysis('A' + token.slice(1), 1, secret), /invalid/);
});

test('commit rejects a concurrent duplicate while atomically importing the remaining accepted row', async () => {
  const service = new NumberImport();
  let committed = false; let released = false;
  const insertValues: any[][] = [];
  const connection = { beginTransaction: async () => {}, commit: async () => { committed = true; }, rollback: async () => {}, release: () => { released = true; }, query: async (sql: string, values: any[]) => {
    if (sql.startsWith('SELECT value')) return [[{ value: '50' }]];
    if (sql.startsWith('INSERT INTO vip_numbers')) {
      if (values[0] === '9876543210') throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      insertValues.push(values); return [{ insertId: 42 }];
    }
    return [{ affectedRows: 1 }];
  } };
  (service as any).dao = { executeQuery: async () => ({ status: 1, rows: [{ value: secret }] }), getConnection: async () => connection };
  const token = signAnalysis(1, [validateImportRow(row()), validateImportRow({ ...row('8123456789'), row: 2 })], secret);
  const result: any = await service.commit({ user_id: 1, analysis_token: token });
  assert.equal(result.status, 1); assert.equal(result.data.imported, 1); assert.equal(result.data.rejected, 1);
  assert.equal(insertValues[0][6], 2499.5);
  assert.ok(committed && released);
});

test('export fetches all filtered numbers in bounded server pages; template is an empty XLSX with instructions', async () => {
  const service = new NumberImport(); const pages: number[] = [];
  const result = await service.export({ status: 'AVAILABLE' }, async (input) => {
    pages.push(input.page); assert.equal(input.limit, 1000); assert.equal(input.status, 'AVAILABLE');
    return { status: 1, data: { total: 1001, items: input.page === 1 ? Array.from({ length: 1000 }, () => ({ number_value: '9876543210', mrp: 999 })) : [{ number_value: '8123456789', mrp: 1000 }] } };
  });
  assert.deepEqual(pages, [1, 2]);
  const book = XLSX.read(Buffer.from(result.content_base64, 'base64'), { type: 'buffer' });
  assert.equal(XLSX.utils.sheet_to_json(book.Sheets.Numbers).length, 1001);
  const template = XLSX.read(Buffer.from(service.template().content_base64, 'base64'), { type: 'buffer' });
  assert.equal(XLSX.utils.sheet_to_json(template.Sheets.Numbers).length, 0);
  assert.ok(template.Sheets.Instructions);
});

test('only successful mutations create staff notifications, without broadcasting analysis or zero-row imports', () => {
  assert.equal(describeAdminActivity('/numbers/analyze', {}, { status: 1 }), null);
  assert.equal(describeAdminActivity('/numbers/save', {}, { status: -33 }), null);
  assert.equal(describeAdminActivity('/numbers/import/commit', {}, { status: 1, data: { imported: 0 } }), null);
  assert.match(describeAdminActivity('/trusted-clients/logo/upload', { name: 'Example' }, { status: 1 })!.title, /uploaded/);
  assert.match(describeAdminActivity('/numbers/import/commit', {}, { status: 1, data: { imported: 2 } })!.message, /2 numbers/);
});

test('single-number save validates in the backend even when browser analysis is bypassed', async () => {
  const admin = new Admin(); let saved = false;
  (admin as any).numbers = { create: async () => { saved = true; return { status: 1 }; }, update: async () => { saved = true; return { status: 1 }; } };
  const invalid = await admin.numberSave({ display_number: '123', mrp: 1000, user_id: 1 });
  assert.equal(invalid.status, -33); assert.equal(saved, false);
  const invalidDate = await admin.numberSave({ display_number: '9876543210', mrp: 1000, rtp_status: 'NON_RTP', rtp_available_date: '2030-02-31', user_id: 1 });
  assert.equal(invalidDate.status, -33); assert.equal(saved, false);
  const edited = await admin.numberSave({ number_id: 3, display_number: '9876543210', mrp: 1000, stock: 0, status: 'SOLD', user_id: 1 });
  assert.equal(edited.status, 1); assert.equal(saved, true);
});
