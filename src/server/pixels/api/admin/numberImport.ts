import { normalizeServiceablePins, saveServiceablePins } from '../numbers/serviceablePins';
import * as XLSX from 'xlsx';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { MySqlClient } from '../../../gen_db/database';
import { MasterModel } from '../../../models/MasterModel';
import { normalizeIndianNumber, syncNumberCategories } from '../categories/categoryClassifier';
import { istDateToUtc } from '../prebooks/prebooks';
import { discountedPrice, readGlobalDiscount } from '../numbers/globalPricing';

const MAX_ROWS = 5000;
const signingKey = randomBytes(32); // Isolated default for pure helper tests; API uses its shared master key.
const columns = ['number', 'mrp', 'title_label', 'badge', 'status', 'visibility_type', 'rtp_status', 'serviceable_pin_codes', 'rtp_available_date', 'description', 'stock'];
const statuses = ['AVAILABLE', 'RESERVED', 'SOLD', 'PENDING_APPROVAL', 'REJECTED', 'INACTIVE'];
const badges = ['NONE', 'HOT_PICK', 'PREMIUM', 'BEST_SELLER', 'HOT_DEAL', 'NEW_ARRIVAL', 'VALUE_PICK'];
export type ImportRow = { row: number; input: string; values?: any; reasons: string[]; number_id?: number };

export function readNumberRows(payload: any, file?: any): any[] {
  if (!file) {
    const input = String(payload.numbers ?? payload.display_number ?? '');
    if (input.length > 200000) throw new Error('Enter no more than 5,000 numbers at once.');
    const entries = input.split(/[,\r\n]+/).map((value) => value.trim()).filter(Boolean);
    if (!entries.length || entries.length > MAX_ROWS) throw new Error('Enter between 1 and 5,000 numbers.');
    return entries.map((number, index) => ({ ...payload.defaults, ...payload, number, row: index + 1 }));
  }
  if (Array.isArray(file) || !Buffer.isBuffer(file.data) || file.truncated || file.data.length > 10 * 1024 * 1024) throw new Error('Choose one CSV or XLSX file, up to 10 MB.');
  const extension = String(file.name || '').toLowerCase().split('.').pop() || '';
  if (!['csv', 'xlsx'].includes(extension)) throw new Error('Only CSV and XLSX files are supported.');
  if (extension === 'xlsx' && file.data.subarray(0, 2).toString() !== 'PK') throw new Error('This is not a valid XLSX workbook.');
  const book = XLSX.read(file.data, { type: 'buffer', sheetRows: MAX_ROWS + 2, dateNF: 'yyyy-mm-dd' });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) throw new Error('The workbook has no data sheet.');
  const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
  if (range.e.r - range.s.r > MAX_ROWS) throw new Error('Upload no more than 5,000 entries per file.');
  const grid = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false, defval: '', blankrows: true });
  const headers = (grid.shift() || []).map((value) => String(value).trim().toLowerCase().replace(/[\s-]+/g, '_'));
  if (!headers.includes('number') || !headers.includes('mrp')) throw new Error('The first row must include number and mrp. Download the template for the supported columns.');
  if (new Set(headers).size !== headers.length || headers.some((header) => !columns.includes(header))) throw new Error('Duplicate or unsupported column names. Use the supplied template.');
  return grid.map((cells, index) => {
    const record: any = { row: range.s.r + index + 2 };
    headers.forEach((header, column) => { record[header] = cells[column] ?? ''; });
    record.formula = headers.some((_header, column) => !!sheet[XLSX.utils.encode_cell({ r: range.s.r + index + 1, c: range.s.c + column })]?.f);
    return record;
  }).filter((record) => headers.some((header) => String(record[header]).trim()));
}

export function validateImportRow(record: any): ImportRow {
  const result: ImportRow = { row: record.row, input: String(record.number ?? ''), reasons: [] };
  const reasons = result.reasons;
  let number = '';
  try { number = normalizeIndianNumber(record.number); } catch (error: any) { reasons.push(error.message); }
  const mrp = Number(record.mrp);
  if (!Number.isFinite(mrp) || mrp <= 0 || mrp > 9999999999999999 || Math.abs(mrp * 100 - Math.round(mrp * 100)) > .001) reasons.push('MRP must be positive with no more than two decimal places.');
  const badge = String(record.badge || 'NONE').toUpperCase();
  const status = String(record.status || 'AVAILABLE').toUpperCase();
  const visibility = String(record.visibility_type || 'ONLINE').toUpperCase();
  const readiness = String(record.rtp_status || 'RTA').toUpperCase();
  if (!badges.includes(badge)) reasons.push('Unknown badge.');
  if (!statuses.includes(status)) reasons.push('Unknown catalog status.');
  if (!['ONLINE', 'OFFLINE'].includes(visibility)) reasons.push('Visibility must be ONLINE or OFFLINE.');
  if (!['RTP', 'RTA', 'NON_RTP'].includes(readiness)) reasons.push('Readiness must be RTP, RTA or NON_RTP.');
  let pins: string[] = [];
  try { pins = normalizeServiceablePins(record.serviceable_pin_codes, readiness === 'RTA' && (!record.number_id || record.serviceable_pin_codes !== undefined)); } catch (error: any) { reasons.push(error.message); }
  let availableAt: string | null = null;
  const availableDate = String(record.rtp_available_date || '').trim();
  if (readiness === 'NON_RTP') {
    try {
      availableAt = istDateToUtc(availableDate);
      const parsed = new Date(availableAt.replace(' ', 'T') + 'Z');
      const roundTrip = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed);
      if (roundTrip !== availableDate || parsed.getTime() <= Date.now()) throw new Error('NON_RTP requires a valid future date (YYYY-MM-DD).');
    } catch (error: any) { reasons.push(error.message); }
  }
  const stock = record.stock === '' || record.stock == null ? 1 : Number(record.stock);
  const minimumStock = record.number_id ? 0 : 1;
  if (!Number.isInteger(stock) || stock < minimumStock || stock > 1000000) reasons.push(`Stock must be an integer from ${minimumStock} to 1,000,000.`);
  const label = String(record.title_label || 'VIP Number').trim();
  const description = String(record.description || '').trim();
  if (!label || label.length > 64) reasons.push('Title must be 1 to 64 characters.');
  if (description.length > 10000) reasons.push('Description must be 10,000 characters or less.');
  if (record.formula) reasons.push('Use plain values instead of spreadsheet formulas.');
  if (number) result.values = { number, mrp, title_label: label, description, badge, status, visibility_type: visibility, rtp_status: readiness, rtp_available_date: availableDate, rtp_available_at: availableAt, stock, serviceable_pin_codes: pins };
  return result;
}

export function signAnalysis(userId: number, rows: ImportRow[], secret: string | Buffer = signingKey) {
  const body = Buffer.from(JSON.stringify({ user_id: userId, expires: Date.now() + 30 * 60 * 1000, rows })).toString('base64url');
  return `${body}.${createHmac('sha256', secret).update('number-import-v1:' + body).digest('base64url')}`;
}

export function verifyAnalysis(token: unknown, userId: number, secret: string | Buffer = signingKey): ImportRow[] {
  if (typeof token !== 'string' || token.length > 8 * 1024 * 1024) throw new Error('Validate the entries before importing.');
  const [body, signature, extra] = token.split('.');
  const expected = createHmac('sha256', secret).update('number-import-v1:' + (body || '')).digest();
  const supplied = Buffer.from(signature || '', 'base64url');
  if (extra || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error('Analysis is invalid. Validate the entries again.');
  const ticket = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (ticket.user_id !== userId || ticket.expires < Date.now() || !Array.isArray(ticket.rows) || !ticket.rows.length || ticket.rows.length > MAX_ROWS) throw new Error('Analysis expired. Validate the entries again.');
  return ticket.rows;
}

export class NumberImport {
  private dao = new MySqlClient('pixels');
  private master = new MasterModel();
  private async secret() {
    const query: any = await this.dao.executeQuery('SELECT value FROM env WHERE key_id=? LIMIT 1', ['MASTER_KEY']);
    const key = String(query.rows?.[0]?.value || '').trim();
    if (query.status !== 1 || !key) throw new Error('Import signing is unavailable. Please check API configuration.');
    return key;
  }

  async analyze(payload: any, file?: any) {
    const response = this.master.getResponseModel();
    try {
      const rows = readNumberRows(payload, file).map(validateImportRow);
      if (!rows.length) throw new Error('No entries found.');
      if (payload.number_id && rows.length !== 1) throw new Error('Edit one mobile number at a time. Use Add Numbers for bulk entries.');
      const counts = new Map<string, number>();
      rows.forEach((row) => { if (row.values) counts.set(row.values.number, (counts.get(row.values.number) || 0) + 1); });
      const numbers = [...counts.keys()];
      const existing = new Set<string>();
      for (let offset = 0; offset < numbers.length; offset += 500) {
        const part = numbers.slice(offset, offset + 500);
        const query: any = await this.dao.executeQuery(`SELECT number_value FROM vip_numbers WHERE number_value IN (${part.map(() => '?').join(',')}) AND number_id <> ?`, [...part, Number(payload.number_id) || 0]);
        if (query.status !== 1) throw new Error('Unable to check existing numbers. Please try again.');
        (query.rows || []).forEach((row: any) => existing.add(String(row.number_value)));
      }
      rows.forEach((row) => {
        if (row.values && counts.get(row.values.number)! > 1) row.reasons.push('Duplicate number in this upload. All occurrences are rejected.');
        if (row.values && existing.has(row.values.number)) row.reasons.push('Number already exists in the catalog.');
      });
      const accepted = rows.filter((row) => !row.reasons.length);
      response.status = 1; response.info = 'Analysis complete.';
      response.data = { total: rows.length, ready: accepted.length, rejected: rows.length - accepted.length, rows, analysis_token: accepted.length ? signAnalysis(Number(payload.user_id), accepted, await this.secret()) : null };
    } catch (error: any) { response.status = -33; response.info = error.message; }
    return response;
  }

  async commit(payload: any) {
    const response = this.master.getResponseModel();
    let connection: any;
    try {
      const accepted = verifyAnalysis(payload.analysis_token, Number(payload.user_id), await this.secret());
      // Validate again at write time, including dates; never trust browser decisions.
      const rows = accepted.map((row) => validateImportRow({ ...row.values, row: row.row }));
      connection = await this.dao.getConnection();
      await connection.beginTransaction();
      const discount = await readGlobalDiscount(connection);
      for (const row of rows) {
        if (row.reasons.length) continue;
        const value = row.values;
        try {
          const [insert]: any = await connection.query(`INSERT INTO vip_numbers (number_value,display_number,seller_id,seller_type,title_label,badge,mrp,offer_price,discount_pct,numerology_sum,description,stock,status,visibility_type,rtp_status,rtp_available_at) VALUES (?,?,?,'ADMIN',?,?,?,?,?,?,?,?,?,?,?,?)`,
            [value.number, value.number, payload.user_id, value.title_label, value.badge, value.mrp, discountedPrice(value.mrp, discount), discount, ([...value.number].reduce((sum, digit) => sum + Number(digit), 0) - 1) % 9 + 1, value.description || null, value.stock, value.status, value.visibility_type, value.rtp_status, value.rtp_available_at]);
          row.number_id = Number(insert.insertId);
        } catch (error: any) {
          if (error.code !== 'ER_DUP_ENTRY') throw error;
          row.reasons.push('Number already exists in the catalog.');
          continue;
        }
        await saveServiceablePins(connection, row.number_id!, value.rtp_status === 'RTA' ? value.serviceable_pin_codes : []);
        await syncNumberCategories(connection, row.number_id!, value.number);
      }
      await connection.commit();
      const imported = rows.filter((row) => row.number_id).length;
      response.status = 1; response.info = `${imported} numbers imported.`;
      response.data = { imported, rejected: rows.length - imported, rows };
    } catch (error: any) { await connection?.rollback(); response.status = -33; response.info = error.message; }
    finally { connection?.release(); }
    return response;
  }

  template() {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([columns]);
    sheet['!cols'] = columns.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(book, sheet, 'Numbers');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['Column', 'Instructions'], ['number', 'Required: valid Indian mobile number. Store as text; spaces and +91 are supported.'], ['mrp', 'Required: positive amount, maximum two decimal places. Offer price is calculated by site settings.'],
      ['title_label', 'Optional, up to 64 characters. Default VIP Number.'], ['badge', badges.join(' / ')], ['status', statuses.join(' / ')], ['visibility_type', 'ONLINE / OFFLINE (default ONLINE)'], ['rtp_status', 'RTP / RTA / NON_RTP (default RTA)'], ['serviceable_pin_codes', 'Required for RTA: six-digit PIN codes separated by semicolons, e.g. 400001;400002. Maximum 1,000.'], ['rtp_available_date', 'Future YYYY-MM-DD date required for NON_RTP.'], ['description', 'Optional, up to 10,000 characters.'], ['stock', 'Positive integer (default 1).'], ['Duplicates', 'Existing catalog numbers and all repeated occurrences in an upload are rejected.'], ['Limits', 'One CSV or XLSX file, maximum 5,000 rows and 10 MB. Plain values only, no formulas.'],
    ]), 'Instructions');
    return workbookDownload(book, 'number-import-template.xlsx');
  }

  async export(payload: any, list: (input: any) => Promise<any>) {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([columns]);
    let page = 1; let total = 0;
    do {
      const result = await list({ ...payload, page, limit: 1000 });
      if (result.status !== 1) throw new Error(result.info || 'Export failed.');
      const items = result.data.items || [];
      total = Number(result.data.total || 0);
      XLSX.utils.sheet_add_aoa(sheet, items.map((item: any) => columns.map((column) => column === 'serviceable_pin_codes' ? (item.serviceable_pin_codes || []).join(';') : column === 'number' ? String(item.number_value) : column === 'rtp_available_date' ? item.rtp_available_at ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(String(item.rtp_available_at).replace(' ', 'T') + 'Z')) : '' : item[column] ?? '')), { origin: -1 });
      if (!items.length) break;
      page++;
    } while ((page - 1) * 1000 < total);
    XLSX.utils.book_append_sheet(book, sheet, 'Numbers');
    return workbookDownload(book, 'vip-numbers.xlsx');
  }
}

function workbookDownload(book: XLSX.WorkBook, filename: string) {
  return { filename, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', content_base64: XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true }).toString('base64') };
}
