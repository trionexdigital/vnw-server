import { createHash } from 'crypto';
import { MySqlClient } from '../../../gen_db/database';
import { MasterModel } from '../../../models/MasterModel';
import { decorateNumberCategories } from '../categories/categoryClassifier';
import { Prebooks } from '../prebooks/prebooks';

const PACK_TYPES = ['SERIES', 'MIXED', 'SIMILAR_START', 'SIMILAR_END', 'SIMILAR_BOTH'];
const CLIENT_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const NUMBER_COLUMNS = `n.number_id, n.number_value, n.display_number, n.title_label, n.badge,
  n.mrp, n.offer_price, n.discount_pct, n.numerology_sum, n.operator, n.stock, n.status,
  n.rtp_status, n.rtp_available_at, n.is_featured`;

type PackType = 'SERIES' | 'MIXED' | 'SIMILAR_START' | 'SIMILAR_END' | 'SIMILAR_BOTH';
type GeneratedPack = {
  pack_id: string;
  title: string;
  pack_type: PackType;
  description: string;
  sort_order: number;
  is_active: true;
  numbers: any[];
  size: number;
  total_price: number;
  is_available: true;
};

const activeFlag = (value: unknown) => (
  value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false' ? 0 : 1
);
const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

export class MarketplaceContent {
  private dao = new MySqlClient('pixels');
  private masterModel = new MasterModel();
  private prebooks = new Prebooks();

  private response() { return this.masterModel.getResponseModel(); }

  private canonicalNumber(item: any) {
    return String(item.number_value || item.display_number || '').replace(/\D/g, '');
  }

  private generatedPack(type: PackType, numbers: any[], index: number, match = ''): GeneratedPack {
    const labels: Record<PackType, string> = {
      SERIES: 'Numbers in Series',
      MIXED: 'All Mixed',
      SIMILAR_START: 'Similar Start',
      SIMILAR_END: 'Similar End',
      SIMILAR_BOTH: 'Similar Both Ends',
    };
    const descriptions: Record<PackType, string> = {
      SERIES: 'A live set of consecutive VIP numbers, ready to add together.',
      MIXED: 'A varied selection of currently available VIP numbers.',
      SIMILAR_START: `Every number begins with ${match}.`,
      SIMILAR_END: `Every number ends with ${match}.`,
      SIMILAR_BOTH: `Every number shares ${match}.`,
    };
    const ids = numbers.map((item) => Number(item.number_id)).join('-');
    return {
      pack_id: `AUTO-${type}-${ids}`,
      title: `${labels[type]}${match ? ` · ${match}` : ''} ${index + 1}`,
      pack_type: type,
      description: descriptions[type],
      sort_order: index,
      is_active: true,
      numbers,
      size: numbers.length,
      total_price: numbers.reduce((sum, item) => sum + Number(item.offer_price || 0), 0),
      is_available: true,
    };
  }

  private groupedPacks(rows: any[], type: PackType, size: number, limit: number) {
    const output: GeneratedPack[] = [];
    const used = new Set<number>();
    const append = (numbers: any[], match = '') => {
      if (output.length >= limit || numbers.length !== size) return;
      numbers.forEach((item) => used.add(Number(item.number_id)));
      output.push(this.generatedPack(type, numbers, output.length, match));
    };

    if (type === 'MIXED') {
      for (let cursor = 0; cursor + size <= rows.length && output.length < limit; cursor += size) {
        append(rows.slice(cursor, cursor + size));
      }
      return output;
    }

    if (type === 'SERIES') {
      const sorted = [...rows].sort((a, b) => {
        return Number(this.canonicalNumber(a)) - Number(this.canonicalNumber(b));
      });
      let run: any[] = [];
      const flush = () => {
        for (let cursor = 0; cursor + size <= run.length && output.length < limit; cursor += size) {
          append(run.slice(cursor, cursor + size));
        }
      };
      for (const item of sorted) {
        const previous = run[run.length - 1];
        if (!previous || Number(this.canonicalNumber(item)) === Number(this.canonicalNumber(previous)) + 1) run.push(item);
        else { flush(); run = [item]; }
      }
      flush();
      return output;
    }

    const levels = type === 'SIMILAR_BOTH'
      ? [[4, 4], [3, 3], [2, 2], [1, 1]]
      : [[7, 0], [6, 0], [5, 0], [4, 0], [3, 0], [2, 0]];
    for (const [firstLength, bothEndLength] of levels) {
      if (output.length >= limit) break;
      const buckets = new Map<string, any[]>();
      for (const item of rows) {
        if (used.has(Number(item.number_id))) continue;
        const digits = this.canonicalNumber(item);
        const key = type === 'SIMILAR_START'
          ? digits.slice(0, firstLength)
          : type === 'SIMILAR_END'
            ? digits.slice(-firstLength)
            : `${digits.slice(0, firstLength)}…${digits.slice(-bothEndLength)}`;
        buckets.set(key, [...(buckets.get(key) || []), item]);
      }
      for (const [key, bucket] of buckets) {
        const available = bucket.filter((item) => !used.has(Number(item.number_id)));
        for (let cursor = 0; cursor + size <= available.length && output.length < limit; cursor += size) {
          append(available.slice(cursor, cursor + size), key);
        }
      }
    }
    return output;
  }

  async packs(payload: any = {}, corporate = false) {
    const res = this.response();
    try {
      await this.prebooks.reconcile();
      const type = text(payload.pack_type || 'MIXED', 32).toUpperCase() as PackType;
      const size = Number(payload.size ?? (corporate ? 10 : 3));
      const limit = Math.min(24, Math.max(1, Number(payload.limit) || 12));
      if (!PACK_TYPES.includes(type)) throw new Error('Choose a valid matching type.');
      if (!Number.isInteger(size) || (corporate ? ![10, 20, 50, 75, 100, 150, 200].includes(size) : size < 2 || size > 10)) {
        throw new Error(corporate ? 'Choose a corporate pack of 10, 20, 50, 75, 100, 150 or 200 numbers.' : 'Pack size must be between 2 and 10.');
      }
      const category = text(payload.category_slug, 96);
      const categoryWhere = category ? ' AND EXISTS (SELECT 1 FROM vip_number_categories c WHERE c.number_id=n.number_id AND c.category_slug=?)' : '';
      const q: any = await this.dao.executeQuery(
        `SELECT ${NUMBER_COLUMNS}
         FROM vip_numbers n
         WHERE n.deleted_at IS NULL AND n.status = 'AVAILABLE' AND n.stock > 0 AND n.visibility_type='ONLINE' AND n.rtp_status IN ('RTP','RTA')${categoryWhere}
         ORDER BY n.is_featured DESC, n.views DESC, n.created_at DESC, n.number_id DESC`, category ? [category] : [],
      );
      if (q.status !== 1) throw new Error(q.info || 'Unable to load available numbers.');
      const rows = (q.rows || [])
        .filter((row: any) => this.canonicalNumber(row).length === 10)
        .map((row: any) => decorateNumberCategories({
          ...row,
          is_premium: Boolean(Number(row.is_featured)),
        }));
      res.status = 1;
      res.info = 'OK';
      res.data = this.groupedPacks(rows, type, size, limit);
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async operators() {
    const res = this.response();
    try {
      const q: any = await this.dao.executeQuery(
        `SELECT TRIM(operator) AS operator, COUNT(*) AS count
         FROM vip_numbers WHERE deleted_at IS NULL AND status='AVAILABLE' AND stock > 0 AND visibility_type='ONLINE' AND TRIM(operator) IN ('Airtel','Jio','Vi','BSNL')
         GROUP BY TRIM(operator) ORDER BY FIELD(operator,'Airtel','Jio','Vi','BSNL')`, [],
      );
      if (q.status !== 1) throw new Error(q.info || 'Unable to load operators.');
      res.status = 1; res.info = 'OK';
      res.data = (q.rows || []).map((row: any) => ({ operator: row.operator, count: Number(row.count) }));
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async clients(all = false) {
    const res = this.response();
    try {
      const q: any = await this.dao.executeQuery(
        `SELECT client_id, name, website_url, alt_text, logo_mime, logo_sha256, sort_order, is_active, created_at, updated_at,
                CASE WHEN logo_data IS NULL THEN 0 ELSE 1 END AS has_logo
         FROM trusted_clients ${all ? '' : 'WHERE is_active = 1'} ORDER BY sort_order ASC, client_id ASC`, [],
      );
      if (q.status !== 1) throw new Error(q.info || 'Unable to load trusted clients.');
      res.status = 1; res.info = 'OK';
      res.data = (q.rows || []).map((row: any) => ({
        ...row,
        client_id: Number(row.client_id), sort_order: Number(row.sort_order),
        is_active: Boolean(Number(row.is_active)), has_logo: Boolean(Number(row.has_logo)),
        logo_url: Number(row.has_logo) ? `/vipnumberworld/site/trusted-clients/${row.client_id}/logo` : null,
      }));
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async clientLogo(clientId: number) {
    const q: any = await this.dao.executeQuery(
      'SELECT logo_mime, logo_data, logo_sha256 FROM trusted_clients WHERE client_id = ? AND logo_data IS NOT NULL LIMIT 1',
      [clientId],
    );
    return q.status === 1 ? q.rows?.[0] || null : null;
  }

  async clientSave(payload: any) {
    const res = this.response();
    try {
      const clientId = Number(payload.client_id) || 0;
      const name = text(payload.name, 96);
      if (!name) throw new Error('Client name is required.');
      const website = text(payload.website_url, 512);
      if (website && !/^https?:\/\//i.test(website)) throw new Error('Website must use http:// or https://.');
      if (clientId) {
        const q: any = await this.dao.executeQuery(
          'UPDATE trusted_clients SET name=?, website_url=?, alt_text=?, is_active=? WHERE client_id=?',
          [name, website || null, text(payload.alt_text, 160) || `${name} logo`, activeFlag(payload.is_active), clientId],
        );
        if (q.status !== 1 || !q.affectedRows) throw new Error('Trusted client not found.');
        res.data = { client_id: clientId };
      } else {
        const q: any = await this.dao.executeQuery(
          `INSERT INTO trusted_clients (name, website_url, alt_text, sort_order, is_active)
           SELECT ?, ?, ?, COALESCE(MAX(sort_order), -1) + 1, ? FROM trusted_clients`,
          [name, website || null, text(payload.alt_text, 160) || `${name} logo`, activeFlag(payload.is_active)],
        );
        if (q.status !== 1 || !q.insertId) throw new Error(q.info || 'Unable to add trusted client.');
        res.data = { client_id: Number(q.insertId) };
      }
      res.status = 1; res.info = 'Trusted client saved.';
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async clientUpload(payload: any, file: any) {
    const res = this.response();
    try {
      const clientId = Number(payload.client_id) || 0;
      if (!clientId) throw new Error('client_id is required.');
      if (!file || Array.isArray(file) || !Buffer.isBuffer(file.data)) throw new Error('Choose one logo image.');
      if (!CLIENT_MIMES.includes(String(file.mimetype))) throw new Error('Logo must be PNG, JPEG, or WebP.');
      const bytes: Buffer = file.data;
      const isPng = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const isWebp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
      if (file.truncated || !(file.mimetype === 'image/png' && isPng || file.mimetype === 'image/jpeg' && isJpeg || file.mimetype === 'image/webp' && isWebp)) throw new Error('Choose a valid PNG, JPEG or WebP image.');
      if (file.data.length > 2 * 1024 * 1024) throw new Error('Logo must be 2 MB or smaller.');
      const sha = createHash('sha256').update(file.data).digest('hex');
      const q: any = await this.dao.executeQuery(
        'UPDATE trusted_clients SET logo_mime=?, logo_data=?, logo_sha256=? WHERE client_id=?',
        [file.mimetype, file.data, sha, clientId],
      );
      if (q.status !== 1 || !q.affectedRows) throw new Error('Trusted client not found.');
      res.status = 1; res.info = 'Client logo uploaded.'; res.data = { client_id: clientId, logo_sha256: sha };
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async clientDelete(payload: any) {
    return this.remove('trusted_clients', 'client_id', payload.client_id, 'Trusted client');
  }

  async clientReorder(payload: any) {
    return this.reorder('trusted_clients', 'client_id', payload.client_ids, 'Trusted clients');
  }

  async faqs(all = false) {
    const res = this.response();
    try {
      const q: any = await this.dao.executeQuery(
        `SELECT faq_id, category, question, answer, sort_order, is_active, created_at, updated_at
         FROM faqs ${all ? '' : 'WHERE is_active = 1'} ORDER BY sort_order ASC, faq_id ASC`, [],
      );
      if (q.status !== 1) throw new Error(q.info || 'Unable to load FAQs.');
      res.status = 1; res.info = 'OK';
      res.data = (q.rows || []).map((row: any) => ({ ...row, faq_id: Number(row.faq_id), sort_order: Number(row.sort_order), is_active: Boolean(Number(row.is_active)) }));
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async faqSave(payload: any) {
    const res = this.response();
    try {
      const faqId = Number(payload.faq_id) || 0;
      const category = text(payload.category, 64);
      const question = text(payload.question, 255);
      const answer = text(payload.answer, 4000);
      if (!category || !question || !answer) throw new Error('Category, question, and answer are required.');
      if (faqId) {
        const q: any = await this.dao.executeQuery(
          'UPDATE faqs SET category=?, question=?, answer=?, is_active=? WHERE faq_id=?',
          [category, question, answer, activeFlag(payload.is_active), faqId],
        );
        if (q.status !== 1 || !q.affectedRows) throw new Error('FAQ not found.');
        res.data = { faq_id: faqId };
      } else {
        const q: any = await this.dao.executeQuery(
          `INSERT INTO faqs (category, question, answer, sort_order, is_active)
           SELECT ?, ?, ?, COALESCE(MAX(sort_order), -1) + 1, ? FROM faqs`,
          [category, question, answer, activeFlag(payload.is_active)],
        );
        if (q.status !== 1 || !q.insertId) throw new Error(q.info || 'Unable to add FAQ.');
        res.data = { faq_id: Number(q.insertId) };
      }
      res.status = 1; res.info = 'FAQ saved.';
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async faqDelete(payload: any) { return this.remove('faqs', 'faq_id', payload.faq_id, 'FAQ'); }
  async faqReorder(payload: any) { return this.reorder('faqs', 'faq_id', payload.faq_ids, 'FAQs'); }

  private async remove(table: string, idColumn: string, rawId: unknown, label: string) {
    const res = this.response();
    try {
      const id = Number(rawId) || 0;
      if (!id) throw new Error(`${idColumn} is required.`);
      const q: any = await this.dao.executeQuery(`DELETE FROM ${table} WHERE ${idColumn} = ?`, [id]);
      if (q.status !== 1 || !q.affectedRows) throw new Error(`${label} not found.`);
      res.status = 1; res.info = `${label} removed.`; res.data = {};
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  private async reorder(table: string, idColumn: string, rawIds: unknown, label: string) {
    const res = this.response();
    const ids = Array.isArray(rawIds) ? rawIds.map(Number).filter((id: number) => id > 0) : [];
    const unique = Array.from(new Set<number>(ids));
    let connection: any;
    try {
      if (unique.length !== ids.length) throw new Error(`${label} ordering contains duplicates.`);
      connection = await this.dao.getConnection();
      await connection.beginTransaction();
      const [rows]: any = await connection.query(`SELECT ${idColumn} FROM ${table} FOR UPDATE`);
      const existing = (rows || []).map((row: any) => Number(row[idColumn]));
      if (existing.length !== unique.length || existing.some((id: number) => !unique.includes(id))) {
        throw new Error(`${label} ordering is stale. Refresh and try again.`);
      }
      for (let index = 0; index < unique.length; index += 1) {
        await connection.query(`UPDATE ${table} SET sort_order=? WHERE ${idColumn}=?`, [index, unique[index]]);
      }
      await connection.commit();
      res.status = 1; res.info = `${label} order updated.`; res.data = unique;
    } catch (error) {
      if (connection) { try { await connection.rollback(); } catch { /* best effort */ } }
      res.status = -33; res.info = 'catch : ' + error;
    } finally { if (connection) connection.release(); }
    return res;
  }
}
