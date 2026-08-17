import * as crypto from 'crypto';
import { MySqlClient } from '../../../gen_db/database';
import { MasterModel } from '../../../models/MasterModel';
import { decorateNumberCategories } from '../categories/categoryClassifier';

let RazorpayLib: any = null;
try { RazorpayLib = require('razorpay'); } catch { /* configured at runtime */ }

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 8;

const isRealImage = (mime: string, buffer: Buffer) => {
  if (mime === 'image/png') return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg') return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/webp') return buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
};

const imageDimensions = (mime: string, buffer: Buffer): { width: number; height: number } | null => {
  try {
    if (mime === 'image/png' && buffer.length >= 24) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    if (mime === 'image/jpeg') {
      const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
      let offset = 2;
      while (offset + 8 < buffer.length) {
        if (buffer[offset] !== 0xff) { offset++; continue; }
        const marker = buffer[offset + 1];
        if (sof.has(marker)) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
        const segmentLength = buffer.readUInt16BE(offset + 2);
        if (segmentLength < 2) break;
        offset += 2 + segmentLength;
      }
    }
    if (mime === 'image/webp' && buffer.length >= 30) {
      const kind = buffer.toString('ascii', 12, 16);
      if (kind === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
      if (kind === 'VP8 ' && buffer.length >= 30) return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
      if (kind === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
        const bits = buffer.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
  } catch { /* malformed image metadata */ }
  return null;
};

const slugify = (value: unknown) => String(value || '').trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 170);

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 20);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 20) : [];
  } catch { return String(value || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 20); }
};

const parseSpecifications = (value: unknown): Array<{ label: string; value: string }> => {
  let entries: any[] = [];
  if (Array.isArray(value)) entries = value;
  else {
    try { entries = JSON.parse(String(value || '[]')); }
    catch { entries = String(value || '').split('\n').map((line) => { const [label, ...rest] = line.split(':'); return { label, value: rest.join(':') }; }); }
  }
  return entries.map((entry) => ({ label: String(entry?.label || '').trim(), value: String(entry?.value || '').trim() }))
    .filter((entry) => entry.label && entry.value).slice(0, 40);
};

const PRODUCT_COLUMNS = `p.accessory_id,p.slug,p.name,p.brand,p.model,p.sku,p.category,p.mrp,p.offer_price,
  p.discount_pct,p.stock,p.reserved_stock,(p.stock-p.reserved_stock) AS available_stock,
  p.short_description,p.description,p.highlights,p.specifications,p.warranty,p.status,p.created_at,p.updated_at,
  (SELECT image_id FROM accessory_images ai WHERE ai.accessory_id=p.accessory_id ORDER BY ai.is_primary DESC,ai.sort_order ASC,ai.image_id ASC LIMIT 1) AS primary_image_id,
  (SELECT COUNT(*) FROM accessory_images ai WHERE ai.accessory_id=p.accessory_id) AS image_count`;

const NUMBER_COLUMNS = `n.number_id,n.number_value,n.display_number,n.seller_id,n.seller_type,n.title_label,n.badge,
  n.mrp,n.offer_price,n.discount_pct,n.numerology_sum,n.operator,n.description,n.stock,n.status,
  n.rtp_status,n.rtp_available_at,n.is_featured,n.views,n.created_at`;

export class Accessories {
  private dao = new MySqlClient('pixels');
  private master = new MasterModel();
  private response() { return this.master.getResponseModel(); }

  private normalizeProduct(row: any) {
    return {
      ...row,
      mrp: Number(row.mrp), offer_price: Number(row.offer_price), discount_pct: Number(row.discount_pct),
      stock: Number(row.stock), reserved_stock: Number(row.reserved_stock), available_stock: Math.max(0, Number(row.available_stock)),
      image_count: Number(row.image_count), highlights: parseStringArray(row.highlights), specifications: parseSpecifications(row.specifications),
    };
  }

  async list(payload: any = {}, admin = false) {
    const res = this.response();
    try {
      const where: string[] = admin ? [] : ["p.status='ACTIVE'", '(p.stock-p.reserved_stock)>0'];
      const params: any[] = [];
      if (payload.status && admin && String(payload.status).toUpperCase() !== 'ALL') { where.push('p.status=?'); params.push(String(payload.status).toUpperCase()); }
      if (payload.q) { const q = `%${String(payload.q).trim()}%`; where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.model LIKE ? OR p.sku LIKE ?)'); params.push(q, q, q, q); }
      if (payload.brand) { where.push('p.brand=?'); params.push(String(payload.brand)); }
      if (payload.category) { where.push('p.category=?'); params.push(String(payload.category)); }
      if (payload.price_min !== undefined && payload.price_min !== '') { where.push('p.offer_price>=?'); params.push(Math.max(0, Number(payload.price_min))); }
      if (payload.price_max !== undefined && payload.price_max !== '') { where.push('p.offer_price<=?'); params.push(Math.max(0, Number(payload.price_max))); }
      const page = Math.max(1, Number(payload.page) || 1);
      const limit = Math.min(60, Math.max(1, Number(payload.limit) || 12));
      const order = payload.sort === 'price_asc' ? 'p.offer_price ASC' : payload.sort === 'price_desc' ? 'p.offer_price DESC' : 'p.created_at DESC';
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const count: any = await this.dao.executeQuery(`SELECT COUNT(*) AS total FROM accessory_products p ${whereSql}`, params);
      const rows: any = await this.dao.executeQuery(`SELECT ${PRODUCT_COLUMNS} FROM accessory_products p ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
      const facets: any = await this.dao.executeQuery("SELECT DISTINCT brand,category FROM accessory_products WHERE status='ACTIVE' ORDER BY brand,category", []);
      res.status = 1; res.info = 'OK';
      res.data = { items: (rows.rows || []).map((row: any) => this.normalizeProduct(row)), total: Number(count.rows?.[0]?.total) || 0, page, limit, facets: facets.rows || [] };
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async detail(payload: any, admin = false) {
    const res = this.response();
    try {
      const id = Number(payload.accessory_id) || 0;
      const slug = String(payload.slug || '').trim();
      if (!id && !slug) throw new Error('Accessory not found.');
      const q: any = await this.dao.executeQuery(
        `SELECT ${PRODUCT_COLUMNS} FROM accessory_products p WHERE ${id ? 'p.accessory_id=?' : 'p.slug=?'} ${admin ? '' : "AND p.status='ACTIVE'"} LIMIT 1`, [id || slug]);
      if (!q.rows?.[0]) throw new Error('Accessory not found.');
      const images: any = await this.dao.executeQuery('SELECT image_id,accessory_id,original_name,mime_type,byte_size,alt_text,sort_order,is_primary FROM accessory_images WHERE accessory_id=? ORDER BY is_primary DESC,sort_order,image_id', [q.rows[0].accessory_id]);
      res.status = 1; res.info = 'OK'; res.data = { ...this.normalizeProduct(q.rows[0]), images: images.rows || [] };
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async save(payload: any) {
    const res = this.response();
    try {
      const id = Number(payload.accessory_id) || 0;
      const name = String(payload.name || '').trim().slice(0, 180);
      const brand = String(payload.brand || '').trim().slice(0, 96);
      const sku = String(payload.sku || '').trim().toUpperCase().slice(0, 64);
      if (!name || !brand || !sku) throw new Error('Name, brand, and SKU are required.');
      const mrp = Math.max(0, Number(payload.mrp) || 0);
      const offer = Math.max(0, Number(payload.offer_price) || 0);
      if (offer > mrp && mrp > 0) throw new Error('Offer price cannot exceed MRP.');
      const stock = Math.max(0, Math.floor(Number(payload.stock) || 0));
      const status = String(payload.status || 'DRAFT').toUpperCase();
      if (!['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(status)) throw new Error('Invalid accessory status.');
      let slug = slugify(payload.slug || name);
      if (!slug) throw new Error('A valid product slug is required.');
      const duplicate: any = await this.dao.executeQuery('SELECT accessory_id FROM accessory_products WHERE (slug=? OR sku=?) AND accessory_id<>? LIMIT 1', [slug, sku, id]);
      if (duplicate.rows?.[0]) throw new Error('This slug or SKU is already in use.');
      const values = [slug, name, brand, String(payload.model || '').trim().slice(0, 96) || null, sku,
        String(payload.category || '').trim().slice(0, 96) || null, mrp, offer,
        mrp > 0 ? Math.max(0, Math.round(((mrp - offer) / mrp) * 100)) : 0, stock,
        String(payload.short_description || '').trim().slice(0, 320) || null,
        String(payload.description || '').trim() || null,
        JSON.stringify(parseStringArray(payload.highlights)), JSON.stringify(parseSpecifications(payload.specifications)),
        String(payload.warranty || '').trim().slice(0, 255) || null, status];
      if (id) {
        const current: any = await this.dao.executeQuery('SELECT reserved_stock FROM accessory_products WHERE accessory_id=?', [id]);
        if (!current.rows?.[0]) throw new Error('Accessory not found.');
        if (stock < Number(current.rows[0].reserved_stock)) throw new Error('Stock cannot be lower than currently reserved stock.');
        await this.dao.executeQuery(`UPDATE accessory_products SET slug=?,name=?,brand=?,model=?,sku=?,category=?,mrp=?,offer_price=?,discount_pct=?,stock=?,short_description=?,description=?,highlights=?,specifications=?,warranty=?,status=? WHERE accessory_id=?`, [...values, id]);
        res.data = { accessory_id: id };
      } else {
        const q: any = await this.dao.executeQuery(`INSERT INTO accessory_products (slug,name,brand,model,sku,category,mrp,offer_price,discount_pct,stock,short_description,description,highlights,specifications,warranty,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, values);
        res.data = { accessory_id: Number(q.insertId) };
      }
      res.status = 1; res.info = 'Accessory saved.';
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async archive(payload: any) {
    const res = this.response();
    try {
      const id = Number(payload.accessory_id);
      await this.dao.executeQuery("UPDATE accessory_products SET status='ARCHIVED' WHERE accessory_id=?", [id]);
      await this.dao.executeQuery('UPDATE homepage_accessories SET is_active=0 WHERE accessory_id=?', [id]);
      res.status = 1; res.info = 'Accessory archived.';
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async upload(payload: any, fileInput: any) {
    const res = this.response();
    let connection: any;
    try {
      const id = Number(payload.accessory_id);
      if (!id) throw new Error('Save the accessory before uploading images.');
      const files = (Array.isArray(fileInput) ? fileInput : fileInput ? [fileInput] : []).filter(Boolean);
      if (!files.length) throw new Error('Choose at least one product image.');
      if (files.length > MAX_IMAGES) throw new Error(`Choose at most ${MAX_IMAGES} images at a time.`);

      const prepared = files.map((file: any) => {
        if (!Buffer.isBuffer(file.data)) throw new Error('One or more uploaded images could not be read.');
        const mime = String(file.mimetype || '').toLowerCase();
        if (!IMAGE_MIMES.includes(mime) || !isRealImage(mime, file.data)) throw new Error('Only genuine PNG, JPEG, and WebP images are accepted.');
        const dimensions = imageDimensions(mime, file.data);
        if (!dimensions?.width || !dimensions?.height) throw new Error('The image dimensions could not be verified. Please crop the image again.');
        if (dimensions.width !== dimensions.height) throw new Error('Product images must use the fixed 1:1 square crop.');
        const size = Number(file.size) || file.data.length;
        if (size > MAX_IMAGE_BYTES) throw new Error('Each image must be 8 MB or smaller.');
        return {
          name: String(file.name || 'product-image').slice(0, 180), mime, size, data: file.data,
          sha: crypto.createHash('sha256').update(file.data).digest('hex'),
        };
      });

      connection = await this.dao.getConnection();
      await connection.beginTransaction();
      const [products]: any = await connection.query('SELECT accessory_id FROM accessory_products WHERE accessory_id=? FOR UPDATE', [id]);
      if (!products?.[0]) throw new Error('Accessory not found.');
      const [stored]: any = await connection.query('SELECT image_id,content_sha256,sort_order,is_primary FROM accessory_images WHERE accessory_id=? FOR UPDATE', [id]);
      const existingByHash = new Map((stored || []).map((row: any) => [String(row.content_sha256), Number(row.image_id)]));
      const unique = new Map<string, typeof prepared[number]>();
      for (const image of prepared) if (!existingByHash.has(image.sha) && !unique.has(image.sha)) unique.set(image.sha, image);
      if ((stored || []).length + unique.size > MAX_IMAGES) throw new Error(`An accessory can contain at most ${MAX_IMAGES} images.`);

      let nextOrder = Math.max(-1, ...(stored || []).map((row: any) => Number(row.sort_order))) + 1;
      let hasPrimary = (stored || []).some((row: any) => Number(row.is_primary));
      let uploaded = 0;
      for (const image of unique.values()) {
        const [result]: any = await connection.query('INSERT INTO accessory_images (accessory_id,original_name,mime_type,byte_size,content_sha256,content,alt_text,sort_order,is_primary) VALUES (?,?,?,?,?,?,?,?,?)',
          [id, image.name, image.mime, image.size, image.sha, image.data, String(payload.alt_text || '').slice(0, 180) || null, nextOrder++, hasPrimary ? 0 : 1]);
        const imageId = Number(result.insertId);
        existingByHash.set(image.sha, imageId);
        if (!hasPrimary) hasPrimary = true;
        uploaded++;
      }
      await connection.commit();
      res.status = 1;
      res.info = uploaded === 1 ? 'Image uploaded.' : `${uploaded} images uploaded.`;
      res.data = {
        image_id: existingByHash.get(prepared[0].sha),
        image_ids: prepared.map((image) => existingByHash.get(image.sha)),
        uploaded,
        duplicates: prepared.length - uploaded,
      };
    } catch (error) { try { await connection?.rollback(); } catch {} res.status = -33; res.info = 'catch : ' + error; }
    finally { connection?.release(); }
    return res;
  }

  async image(imageId: number) {
    const q: any = await this.dao.executeQuery('SELECT image_id,mime_type,byte_size,content_sha256,content FROM accessory_images WHERE image_id=?', [imageId]);
    return q.rows?.[0] || null;
  }

  async imageDelete(payload: any) {
    const res = this.response();
    try {
      const q: any = await this.dao.executeQuery('SELECT accessory_id,is_primary FROM accessory_images WHERE image_id=?', [Number(payload.image_id)]);
      const row = q.rows?.[0];
      if (!row) throw new Error('Image not found.');
      await this.dao.executeQuery('DELETE FROM accessory_images WHERE image_id=?', [Number(payload.image_id)]);
      if (Number(row.is_primary)) await this.dao.executeQuery('UPDATE accessory_images SET is_primary=1 WHERE accessory_id=? ORDER BY sort_order,image_id LIMIT 1', [row.accessory_id]);
      res.status = 1; res.info = 'Image removed.';
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async imageOrder(payload: any) {
    const res = this.response();
    let connection: any;
    try {
      const id = Number(payload.accessory_id);
      const ids = Array.isArray(payload.image_ids) ? payload.image_ids.map(Number) : [];
      connection = await this.dao.getConnection(); await connection.beginTransaction();
      const [rows]: any = await connection.query('SELECT image_id FROM accessory_images WHERE accessory_id=? FOR UPDATE', [id]);
      const actual = (rows || []).map((row: any) => Number(row.image_id)).sort();
      if (actual.join(',') !== [...ids].sort((a, b) => a - b).join(',')) throw new Error('Image ordering is stale.');
      for (let i = 0; i < ids.length; i++) await connection.query('UPDATE accessory_images SET sort_order=?,is_primary=? WHERE image_id=? AND accessory_id=?', [i, ids[i] === Number(payload.primary_image_id) ? 1 : 0, ids[i], id]);
      await connection.commit(); res.status = 1; res.info = 'Images reordered.';
    } catch (error) { try { await connection?.rollback(); } catch {} res.status = -33; res.info = 'catch : ' + error; }
    finally { connection?.release(); }
    return res;
  }

  async homeAccessories(admin = false) {
    const res = this.response();
    try {
      const q: any = await this.dao.executeQuery(`SELECT ${PRODUCT_COLUMNS},h.homepage_accessory_id,h.sort_order,h.is_active AS homepage_active
        FROM homepage_accessories h INNER JOIN accessory_products p ON p.accessory_id=h.accessory_id
        ${admin ? '' : "WHERE h.is_active=1 AND p.status='ACTIVE' AND (p.stock-p.reserved_stock)>0"}
        ORDER BY h.sort_order,h.homepage_accessory_id`, []);
      const products = (q.rows || []).map((row: any) => ({ ...this.normalizeProduct(row), homepage_active: Boolean(Number(row.homepage_active)) }));
      const ids = products.map((row: any) => Number(row.accessory_id));
      let imageRows: any[] = [];
      if (ids.length) {
        const imagesQuery: any = await this.dao.executeQuery(
          `SELECT image_id,accessory_id,original_name,mime_type,byte_size,alt_text,sort_order,is_primary FROM accessory_images WHERE accessory_id IN (${ids.map(() => '?').join(',')}) ORDER BY accessory_id,is_primary DESC,sort_order,image_id`, ids);
        imageRows = Array.isArray(imagesQuery.rows) ? imagesQuery.rows : [];
      }
      const imagesByProduct = new Map<number, any[]>();
      for (const image of imageRows) {
        const accessoryId = Number(image.accessory_id);
        const images = imagesByProduct.get(accessoryId) || [];
        images.push({ ...image, image_id: Number(image.image_id), accessory_id: accessoryId, sort_order: Number(image.sort_order), is_primary: Boolean(Number(image.is_primary)) });
        imagesByProduct.set(accessoryId, images);
      }
      res.status = 1; res.info = 'OK'; res.data = products.map((product: any) => ({ ...product, images: imagesByProduct.get(Number(product.accessory_id)) || [] }));
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async homeAccessorySave(payload: any) { return this.homeSave('homepage_accessories', 'homepage_accessory_id', 'accessory_id', payload); }
  async homeAccessoryRemove(payload: any) { return this.homeRemove('homepage_accessories', 'homepage_accessory_id', payload.homepage_accessory_id); }
  async homeAccessoryReorder(payload: any) { return this.reorder('homepage_accessories', 'homepage_accessory_id', payload.homepage_accessory_ids); }

  async homePremium(admin = false) {
    const res = this.response();
    try {
      const q: any = await this.dao.executeQuery(`SELECT ${NUMBER_COLUMNS},h.homepage_premium_id,h.sort_order,h.is_active AS homepage_active
        FROM homepage_premium_numbers h INNER JOIN vip_numbers n ON n.number_id=h.number_id
        ${admin ? '' : "WHERE h.is_active=1 AND n.status='AVAILABLE' AND n.stock>0"}
        ORDER BY h.sort_order,h.homepage_premium_id`, []);
      res.status = 1; res.info = 'OK'; res.data = (q.rows || []).map((row: any) => ({ ...decorateNumberCategories(row), is_premium: Boolean(Number(row.is_featured)), homepage_active: Boolean(Number(row.homepage_active)) }));
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async homePremiumSave(payload: any) { return this.homeSave('homepage_premium_numbers', 'homepage_premium_id', 'number_id', payload); }
  async homePremiumRemove(payload: any) { return this.homeRemove('homepage_premium_numbers', 'homepage_premium_id', payload.homepage_premium_id); }
  async homePremiumReorder(payload: any) { return this.reorder('homepage_premium_numbers', 'homepage_premium_id', payload.homepage_premium_ids); }

  private async homeSave(table: string, idCol: string, itemCol: string, payload: any) {
    const res = this.response();
    try {
      const rowId = Number(payload[idCol]) || 0; const itemId = Number(payload[itemCol]);
      if (!itemId) throw new Error('Choose a catalog item.');
      if (rowId) await this.dao.executeQuery(`UPDATE ${table} SET ${itemCol}=?,is_active=? WHERE ${idCol}=?`, [itemId, payload.is_active === false ? 0 : 1, rowId]);
      else {
        const q: any = await this.dao.executeQuery(`INSERT INTO ${table} (${itemCol},sort_order,is_active) SELECT ?,COALESCE(MAX(sort_order),-1)+1,? FROM ${table}`, [itemId, payload.is_active === false ? 0 : 1]);
        payload[idCol] = Number(q.insertId);
      }
      res.status = 1; res.info = 'Homepage selection saved.'; res.data = { [idCol]: Number(payload[idCol] || rowId) };
    } catch (error) { res.status = -33; res.info = /duplicate/i.test(String(error)) ? 'This item is already selected for the homepage.' : 'catch : ' + error; }
    return res;
  }

  private async homeRemove(table: string, idCol: string, id: unknown) {
    const res = this.response();
    try { await this.dao.executeQuery(`DELETE FROM ${table} WHERE ${idCol}=?`, [Number(id)]); res.status = 1; res.info = 'Homepage selection removed.'; }
    catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  private async reorder(table: string, idCol: string, rawIds: unknown) {
    const res = this.response(); let connection: any;
    try {
      const ids = Array.isArray(rawIds) ? rawIds.map(Number) : [];
      connection = await this.dao.getConnection(); await connection.beginTransaction();
      const [rows]: any = await connection.query(`SELECT ${idCol} FROM ${table} FOR UPDATE`);
      const actual = (rows || []).map((row: any) => Number(row[idCol])).sort();
      if (actual.join(',') !== [...ids].sort((a, b) => a - b).join(',')) throw new Error('Homepage ordering is stale.');
      for (let i = 0; i < ids.length; i++) await connection.query(`UPDATE ${table} SET sort_order=? WHERE ${idCol}=?`, [i, ids[i]]);
      await connection.commit(); res.status = 1; res.info = 'Homepage order updated.';
    } catch (error) { try { await connection?.rollback(); } catch {} res.status = -33; res.info = 'catch : ' + error; }
    finally { connection?.release(); }
    return res;
  }

  async updateFulfillment(payload: any) {
    const res = this.response();
    try {
      const id = Number(payload.accessory_order_item_id); const status = String(payload.fulfillment_status || '').toUpperCase();
      if (!['PENDING','PACKED','SHIPPED','DELIVERED','CANCELLED','REFUNDED','REPLACEMENT'].includes(status)) throw new Error('Invalid fulfilment status.');
      const q: any = await this.dao.executeQuery('SELECT order_id FROM accessory_order_items WHERE accessory_order_item_id=?', [id]);
      if (!q.rows?.[0]) throw new Error('Accessory order item not found.');
      await this.dao.executeQuery(`UPDATE accessory_order_items SET fulfillment_status=?,carrier=?,tracking_number=?,
        shipped_at=IF(?='SHIPPED',COALESCE(shipped_at,UTC_TIMESTAMP()),shipped_at),
        delivered_at=IF(?='DELIVERED',COALESCE(delivered_at,UTC_TIMESTAMP()),delivered_at)
        WHERE accessory_order_item_id=?`, [status,String(payload.carrier||'').trim().slice(0,96)||null,String(payload.tracking_number||'').trim().slice(0,128)||null,status,status,id]);
      const orderId = Number(q.rows[0].order_id);
      if (['PACKED','SHIPPED'].includes(status)) await this.dao.executeQuery("UPDATE orders SET status='PROCESSING' WHERE order_id=? AND status IN ('PAID','PROCESSING')", [orderId]);
      const remaining: any = await this.dao.executeQuery(`SELECT
        (SELECT COUNT(*) FROM accessory_order_items WHERE order_id=? AND fulfillment_status NOT IN ('DELIVERED','CANCELLED','REFUNDED','REPLACEMENT'))+
        (SELECT COUNT(*) FROM order_items WHERE order_id=? AND item_status NOT IN ('TRANSFERRED','CANCELLED')) AS remaining`, [orderId,orderId]);
      if (Number(remaining.rows?.[0]?.remaining) === 0) await this.dao.executeQuery("UPDATE orders SET status='COMPLETED' WHERE order_id=? AND payment_status='PAID'", [orderId]);
      res.status = 1; res.info = 'Fulfilment updated.';
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async requestReturn(payload: any) {
    const res = this.response();
    try {
      const itemId = Number(payload.accessory_order_item_id);
      const reason = String(payload.reason || '').toUpperCase();
      const resolution = String(payload.requested_resolution || '').toUpperCase();
      if (!['DAMAGED', 'DEFECTIVE', 'WRONG_ITEM'].includes(reason)) throw new Error('Choose a valid return reason.');
      if (!['REFUND', 'REPLACEMENT'].includes(resolution)) throw new Error('Choose refund or replacement.');
      const q: any = await this.dao.executeQuery(`SELECT aoi.*,o.user_id,o.payment_status FROM accessory_order_items aoi INNER JOIN orders o ON o.order_id=aoi.order_id WHERE aoi.accessory_order_item_id=? AND o.user_id=?`, [itemId, Number(payload.user_id)]);
      const item = q.rows?.[0];
      if (!item || item.payment_status !== 'PAID' || item.fulfillment_status !== 'DELIVERED') throw new Error('This item is not eligible for return.');
      const delivered = new Date(String(item.delivered_at).replace(' ', 'T') + 'Z');
      if (Number.isNaN(delivered.getTime()) || Date.now() > delivered.getTime() + 7 * 86400000) throw new Error('The seven-day issue return window has ended.');
      const open: any = await this.dao.executeQuery("SELECT return_request_id FROM accessory_return_requests WHERE accessory_order_item_id=? AND status IN ('PENDING','APPROVED','PROCESSING','FAILED') LIMIT 1", [itemId]);
      if (open.rows?.[0]) throw new Error('A return request is already open for this item.');
      const insert: any = await this.dao.executeQuery('INSERT INTO accessory_return_requests (accessory_order_item_id,user_id,reason,requested_resolution,customer_note,refund_amount) VALUES (?,?,?,?,?,?)',
        [itemId, Number(payload.user_id), reason, resolution, String(payload.customer_note || '').trim().slice(0, 1000) || null, item.line_total]);
      res.status = 1; res.info = 'Return request submitted for review.'; res.data = { return_request_id: Number(insert.insertId) };
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async returns(payload: any = {}, admin = false) {
    const res = this.response();
    try {
      const params: any[] = []; const where: string[] = [];
      if (!admin) { where.push('r.user_id=?'); params.push(Number(payload.user_id)); }
      if (payload.status) { where.push('r.status=?'); params.push(String(payload.status).toUpperCase()); }
      const q: any = await this.dao.executeQuery(`SELECT r.*,aoi.order_id,aoi.name,aoi.brand,aoi.model,aoi.sku,aoi.quantity,aoi.line_total,aoi.delivered_at,o.order_no,u.full_name
        FROM accessory_return_requests r INNER JOIN accessory_order_items aoi ON aoi.accessory_order_item_id=r.accessory_order_item_id
        INNER JOIN orders o ON o.order_id=aoi.order_id LEFT JOIN auth_user u ON u.user_id=r.user_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.requested_at DESC`, params);
      res.status = 1; res.info = 'OK'; res.data = q.rows || [];
    } catch (error) { res.status = -33; res.info = 'catch : ' + error; }
    return res;
  }

  async resolveReturn(payload: any) {
    const res = this.response(); let connection: any;
    try {
      const id = Number(payload.return_request_id); const approve = Boolean(payload.approve);
      connection = await this.dao.getConnection(); await connection.beginTransaction();
      const [rows]: any = await connection.query(`SELECT r.*,aoi.order_id,aoi.accessory_id,aoi.quantity,aoi.line_total,o.razorpay_payment_id
        FROM accessory_return_requests r INNER JOIN accessory_order_items aoi ON aoi.accessory_order_item_id=r.accessory_order_item_id
        INNER JOIN orders o ON o.order_id=aoi.order_id WHERE r.return_request_id=? FOR UPDATE`, [id]);
      const request = rows?.[0];
      if (!request || request.status !== 'PENDING') throw new Error('Return request is no longer pending.');
      const note = String(payload.admin_note || '').trim().slice(0, 1000) || null;
      if (!approve) {
        await connection.query("UPDATE accessory_return_requests SET status='REJECTED',admin_note=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP() WHERE return_request_id=?", [note, payload.user_id, id]);
        await connection.commit(); res.status = 1; res.info = 'Return request rejected.'; return res;
      }
      if (request.requested_resolution === 'REPLACEMENT') {
        const [updated]: any = await connection.query('UPDATE accessory_products SET stock=stock-? WHERE accessory_id=? AND (stock-reserved_stock)>=?', [request.quantity, request.accessory_id, request.quantity]);
        if (updated.affectedRows !== 1) throw new Error('Replacement stock is not available.');
        await connection.query("UPDATE accessory_return_requests SET status='REPLACEMENT_SENT',admin_note=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP(),processed_at=UTC_TIMESTAMP() WHERE return_request_id=?", [note, payload.user_id, id]);
        await connection.query("UPDATE accessory_order_items SET fulfillment_status='REPLACEMENT' WHERE accessory_order_item_id=?", [request.accessory_order_item_id]);
        await connection.commit(); res.status = 1; res.info = 'Replacement approved.'; return res;
      }
      if (!RazorpayLib || !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET || !request.razorpay_payment_id) throw new Error('Razorpay refund service is not configured.');
      await connection.query("UPDATE accessory_return_requests SET status='PROCESSING',admin_note=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP() WHERE return_request_id=?", [note, payload.user_id, id]);
      await connection.commit(); connection.release(); connection = null;
      const razorpay = new RazorpayLib({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
      const refund = await razorpay.payments.refund(request.razorpay_payment_id, { amount: Math.round(Number(request.line_total) * 100), notes: { return_request_id: String(id) } });
      await this.dao.executeQuery("UPDATE accessory_return_requests SET status=?,razorpay_refund_id=?,processed_at=IF(?='REFUNDED',UTC_TIMESTAMP(),processed_at) WHERE return_request_id=?",
        [refund.status === 'processed' ? 'REFUNDED' : 'PROCESSING', refund.id, refund.status === 'processed' ? 'REFUNDED' : 'PROCESSING', id]);
      if (refund.status === 'processed') {
        await this.dao.executeQuery("UPDATE accessory_order_items SET fulfillment_status='REFUNDED' WHERE accessory_order_item_id=?", [request.accessory_order_item_id]);
        await this.dao.executeQuery('UPDATE orders SET refunded_amount=LEAST(total,refunded_amount+?) WHERE order_id=?', [request.line_total, request.order_id]);
      }
      res.status = 1; res.info = refund.status === 'processed' ? 'Refund processed.' : 'Refund submitted.';
    } catch (error) { try { await connection?.rollback(); } catch {} res.status = -33; res.info = 'catch : ' + error; }
    finally { connection?.release(); }
    return res;
  }

  /** Idempotently completes asynchronous accessory partial-refund webhooks. */
  async handleRefundWebhook(event: string, refund: any): Promise<boolean> {
    const refundId = String(refund?.id || '').trim();
    if (!refundId) return false;
    let connection: any;
    try {
      connection = await this.dao.getConnection(); await connection.beginTransaction();
      const [rows]: any = await connection.query(`SELECT r.return_request_id,r.status,r.refund_amount,aoi.accessory_order_item_id,aoi.order_id
        FROM accessory_return_requests r INNER JOIN accessory_order_items aoi ON aoi.accessory_order_item_id=r.accessory_order_item_id
        WHERE r.razorpay_refund_id=? FOR UPDATE`, [refundId]);
      const request = rows?.[0];
      if (!request) { await connection.commit(); return false; }
      if (event === 'refund.failed') {
        if (!['REFUNDED','REPLACEMENT_SENT'].includes(request.status)) await connection.query("UPDATE accessory_return_requests SET status='FAILED',processed_at=UTC_TIMESTAMP() WHERE return_request_id=?", [request.return_request_id]);
      } else if (request.status !== 'REFUNDED') {
        await connection.query("UPDATE accessory_return_requests SET status='REFUNDED',processed_at=UTC_TIMESTAMP() WHERE return_request_id=?", [request.return_request_id]);
        await connection.query("UPDATE accessory_order_items SET fulfillment_status='REFUNDED' WHERE accessory_order_item_id=?", [request.accessory_order_item_id]);
        await connection.query('UPDATE orders SET refunded_amount=LEAST(total,refunded_amount+?) WHERE order_id=?', [request.refund_amount,request.order_id]);
      }
      await connection.commit(); return true;
    } catch (error) { try { await connection?.rollback(); } catch {} throw error; }
    finally { connection?.release(); }
  }
}
