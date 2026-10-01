import { MySqlClient } from '../../../gen_db/database';
import { MasterModel } from '../../../models/MasterModel';
import { normalizeIndianNumber, syncNumberCategories } from '../categories/categoryClassifier';
import { discountedPrice, readGlobalDiscount } from '../numbers/globalPricing';
import { istDateToUtc } from '../prebooks/prebooks';

type DealerState = 'INVENTORY' | 'SOLD' | 'DELETED';

export class DealerPurchases {
    private dao = new MySqlClient('pixels');
    private masterModel = new MasterModel();
    private response() { return this.masterModel.getResponseModel(); }
    private fail(response: any, error: unknown) { response.status = -33; response.info = error instanceof Error ? error.message : String(error); return response; }

    async dealers() {
        const response = this.response();
        const q: any = await this.dao.executeQuery(
            `SELECT d.*,
                    COALESCE(SUM(CASE WHEN p.state<>'DELETED' THEN p.purchase_price ELSE 0 END),0) AS total_billed,
                    (SELECT COALESCE(SUM(dp.amount),0) FROM dealer_purchase_payments dp WHERE dp.external_dealer_id=d.external_dealer_id AND dp.status='POSTED') AS total_paid
             FROM external_dealers d LEFT JOIN dealer_purchase_numbers p ON p.external_dealer_id=d.external_dealer_id
             GROUP BY d.external_dealer_id ORDER BY d.name`, [],
        );
        if (q.status !== 1) return this.fail(response, q.info);
        response.status = 1; response.info = 'OK';
        response.data = (q.rows || []).map((row: any) => ({ ...row, amount_remaining: Number(row.total_billed) - Number(row.total_paid) }));
        return response;
    }

    async createDealer(payload: any) {
        const response = this.response();
        try {
            const name = String(payload.name || '').trim();
            if (name.length < 2 || name.length > 120) throw new Error('Dealer name must be 2 to 120 characters.');
            const existing: any = await this.dao.executeQuery(
                `SELECT external_dealer_id,name,is_active FROM external_dealers WHERE LOWER(name)=LOWER(?) LIMIT 1`,
                [name],
            );
            if (existing.status !== 1) throw new Error(existing.info);
            if (existing.rows?.[0]) {
                const dealer = existing.rows[0];
                if (!Number(dealer.is_active)) {
                    await this.dao.executeQuery(`UPDATE external_dealers SET is_active=1 WHERE external_dealer_id=?`, [dealer.external_dealer_id]);
                }
                response.status = 1;
                response.info = 'Existing dealer selected.';
                response.data = { external_dealer_id: Number(dealer.external_dealer_id), name: dealer.name, existing: true };
                return response;
            }
            const q: any = await this.dao.executeQuery(
                `INSERT INTO external_dealers (name,phone,email,notes,created_by) VALUES (?,?,?,?,?)`,
                [name, String(payload.phone || '').trim() || null, String(payload.email || '').trim() || null, String(payload.notes || '').trim() || null, Number(payload.user_id)],
            );
            if (q.status !== 1) {
                if (/duplicate/i.test(q.info)) {
                    const raced: any = await this.dao.executeQuery(
                        `SELECT external_dealer_id,name FROM external_dealers WHERE LOWER(name)=LOWER(?) LIMIT 1`, [name],
                    );
                    if (raced.rows?.[0]) {
                        response.status = 1; response.info = 'Existing dealer selected.';
                        response.data = { external_dealer_id: Number(raced.rows[0].external_dealer_id), name: raced.rows[0].name, existing: true };
                        return response;
                    }
                }
                throw new Error(q.info);
            }
            response.status = 1; response.info = 'Dealer added.'; response.data = { external_dealer_id: Number(q.insertId), name };
        } catch (error) { return this.fail(response, error); }
        return response;
    }

    async summary(payload: any) {
        const response = this.response();
        try {
            const supplierId = Number(payload.external_dealer_id) || 0;
            const params: any[] = []; const supplierWhere = supplierId ? ' WHERE external_dealer_id=?' : '';
            if (supplierId) params.push(supplierId);
            const billed: any = await this.dao.executeQuery(
                `SELECT COALESCE(SUM(CASE WHEN state<>'DELETED' THEN purchase_price ELSE 0 END),0) AS total_billed,
                        SUM(state='INVENTORY') AS inventory_count,SUM(state='SOLD') AS sold_count,SUM(state='DELETED') AS deleted_count
                 FROM dealer_purchase_numbers${supplierWhere}`, params,
            );
            const paid: any = await this.dao.executeQuery(
                `SELECT COALESCE(SUM(amount),0) AS total_paid FROM dealer_purchase_payments WHERE status='POSTED'${supplierId ? ' AND external_dealer_id=?' : ''}`,
                params,
            );
            if (billed.status !== 1 || paid.status !== 1) throw new Error(billed.info || paid.info);
            const b = billed.rows?.[0] || {}; const totalBilled = Number(b.total_billed || 0); const totalPaid = Number(paid.rows?.[0]?.total_paid || 0);
            response.status = 1; response.info = 'OK'; response.data = {
                total_billed: totalBilled, total_paid: totalPaid, amount_remaining: totalBilled - totalPaid,
                inventory_count: Number(b.inventory_count || 0), sold_count: Number(b.sold_count || 0), deleted_count: Number(b.deleted_count || 0),
            };
        } catch (error) { return this.fail(response, error); }
        return response;
    }

    async list(payload: any) {
        const response = this.response();
        try {
            const state = String(payload.state || 'INVENTORY').toUpperCase() as DealerState;
            if (!['INVENTORY','SOLD','DELETED'].includes(state)) throw new Error('Invalid dealer inventory state.');
            const where = ['dpn.state=?']; const params: any[] = [state];
            if (Number(payload.external_dealer_id)) { where.push('dpn.external_dealer_id=?'); params.push(Number(payload.external_dealer_id)); }
            if (String(payload.q || '').trim()) { where.push('(n.number_value LIKE ? OR n.display_number LIKE ?)'); const q = `%${String(payload.q).replace(/\s+/g,'')}%`; params.push(q,q); }
            const page = Math.max(1, Math.floor(Number(payload.page) || 1)); const limit = Math.min(1000, Math.max(1, Math.floor(Number(payload.limit) || 10))); const offset = (page - 1) * limit;
            const sortColumns: Record<string,string> = { number:'n.number_value', dealer:'d.name', purchase_price:'dpn.purchase_price', intended_sale_price:'dpn.intended_sale_price', sold_at:'dpn.sold_at', deleted_at:'dpn.deleted_at', created_at:'dpn.created_at' };
            const sort = sortColumns[String(payload.sort)] || 'dpn.created_at'; const direction = String(payload.direction).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
            const count: any = await this.dao.executeQuery(
                `SELECT COUNT(*) AS total FROM dealer_purchase_numbers dpn JOIN vip_numbers n ON n.number_id=dpn.number_id WHERE ${where.join(' AND ')}`, params,
            );
            const rows: any = await this.dao.executeQuery(
                `SELECT dpn.*,n.number_value,n.display_number,n.visibility_type,n.status AS number_status,n.rtp_status,d.name AS dealer_name,
                        (dpn.actual_sale_price-dpn.purchase_price) AS profit
                 FROM dealer_purchase_numbers dpn JOIN vip_numbers n ON n.number_id=dpn.number_id
                 JOIN external_dealers d ON d.external_dealer_id=dpn.external_dealer_id
                 WHERE ${where.join(' AND ')} ORDER BY ${sort} ${direction}, dpn.dealer_purchase_id DESC LIMIT ? OFFSET ?`, [...params,limit,offset],
            );
            if (count.status !== 1 || rows.status !== 1) throw new Error(count.info || rows.info);
            const total = Number(count.rows?.[0]?.total || 0);
            response.status = 1; response.info = 'OK'; response.data = { items: rows.rows || [], total, page, limit, pages: Math.ceil(total/limit) };
        } catch (error) { return this.fail(response, error); }
        return response;
    }

    private parseNumbers(value: unknown): string[] {
        const input = Array.isArray(value) ? value : String(value || '').split(/[\n,]+/);
        const numbers = input.map((part: any) => normalizeIndianNumber(String(part))).filter(Boolean);
        if (!numbers.length) throw new Error('Enter at least one mobile number.');
        if (new Set(numbers).size !== numbers.length) throw new Error('The batch contains duplicate mobile numbers.');
        return numbers;
    }

    async create(payload: any) {
        const response = this.response(); let connection: any;
        try {
            const numbers = this.parseNumbers(payload.numbers);
            const dealerId = Number(payload.external_dealer_id); if (!dealerId) throw new Error('Select a dealer.');
            const visibility = String(payload.visibility_type || 'ONLINE').toUpperCase(); if (!['ONLINE','OFFLINE'].includes(visibility)) throw new Error('Visibility must be Online or Offline.');
            const rtpStatus = String(payload.rtp_status || 'RTA').toUpperCase();
            if (!['RTP','NON_RTP','RTA'].includes(rtpStatus)) throw new Error('Status must be RTP, NON-RTP or RTA.');
            const rtpDate = rtpStatus === 'NON_RTP' ? String(payload.rtp_available_date || '').trim() : null;
            const rtpAvailableAt = rtpDate ? istDateToUtc(rtpDate) : null;
            if (rtpStatus === 'NON_RTP' && !rtpAvailableAt) throw new Error('NON-RTP numbers require a future ready-to-port date.');
            if (rtpAvailableAt && new Date(rtpAvailableAt.replace(' ', 'T') + 'Z') <= new Date()) throw new Error('NON-RTP ready-to-port date must be in the future.');
            const purchase = Number(payload.purchase_price); const intended = Number(payload.intended_sale_price);
            if (!Number.isFinite(purchase) || purchase < 0) throw new Error('Purchase price must be zero or greater.');
            if (!Number.isFinite(intended) || intended <= 0) throw new Error('Intended sale price must be greater than zero.');
            connection = await this.dao.getConnection(); await connection.beginTransaction();
            const globalDiscount = await readGlobalDiscount(connection);
            const catalogPrice = discountedPrice(intended, globalDiscount);
            const [dealers]: any = await connection.query('SELECT external_dealer_id FROM external_dealers WHERE external_dealer_id=? AND is_active=1 FOR UPDATE', [dealerId]);
            if (!dealers?.length) throw new Error('Dealer not found or inactive.');
            const [existing]: any = await connection.query(`SELECT number_value FROM vip_numbers WHERE number_value IN (${numbers.map(()=>'?').join(',')}) FOR UPDATE`, numbers);
            if (existing?.length) throw new Error(`Already listed: ${existing.map((n:any)=>n.number_value).join(', ')}`);
            const created: number[] = [];
            for (const number of numbers) {
                const [numberInsert]: any = await connection.query(
                    `INSERT INTO vip_numbers (number_value,display_number,seller_id,seller_type,title_label,mrp,offer_price,discount_pct,stock,status,visibility_type,rtp_status,rtp_available_at)
                     VALUES (?,?,?,'ADMIN','VIP Number',?,?,?,1,'AVAILABLE',?,?,?)`,
                    [number, number, Number(payload.user_id), intended, catalogPrice, globalDiscount, visibility, rtpStatus,
                     rtpAvailableAt],
                );
                const numberId = Number(numberInsert.insertId); await syncNumberCategories(connection, numberId, number);
                const [purchaseInsert]: any = await connection.query(
                    `INSERT INTO dealer_purchase_numbers (number_id,external_dealer_id,purchase_price,intended_sale_price,created_by) VALUES (?,?,?,?,?)`,
                    [numberId,dealerId,purchase,intended,Number(payload.user_id)],
                );
                const purchaseId = Number(purchaseInsert.insertId);
                await connection.query(`INSERT INTO dealer_purchase_events (dealer_purchase_id,external_dealer_id,event_type,details,created_by) VALUES (?,?,'CREATED',?,?)`,
                    [purchaseId,dealerId,JSON.stringify({ visibility_type: visibility, rtp_status: rtpStatus, purchase_price: purchase, intended_sale_price: intended }),Number(payload.user_id)]);
                created.push(purchaseId);
            }
            await connection.commit(); response.status=1; response.info=`${created.length} dealer number${created.length===1?'':'s'} added.`; response.data={ dealer_purchase_ids:created };
        } catch (error) { try { await connection?.rollback(); } catch {} return this.fail(response,error); }
        finally { connection?.release(); }
        return response;
    }

    private ids(payload: any): number[] {
        const ids = Array.from(new Set((payload.dealer_purchase_ids || [payload.dealer_purchase_id]).map(Number).filter((id:number)=>id>0))) as number[];
        if (!ids.length) throw new Error('Select at least one dealer number.'); return ids;
    }

    async markSold(payload: any) {
        const response=this.response(); let connection:any;
        try {
            const ids=this.ids(payload); const soldAt=String(payload.sold_at || new Date().toISOString().slice(0,19).replace('T',' '));
            connection=await this.dao.getConnection(); await connection.beginTransaction();
            const [rows]:any=await connection.query(`SELECT dpn.*,n.status,n.display_number FROM dealer_purchase_numbers dpn JOIN vip_numbers n ON n.number_id=dpn.number_id WHERE dpn.dealer_purchase_id IN (${ids.map(()=>'?').join(',')}) FOR UPDATE`,ids);
            if ((rows||[]).length!==ids.length) throw new Error('One or more dealer numbers were not found.');
            for (const row of rows) {
                if (row.state!=='INVENTORY' || row.status!=='AVAILABLE') throw new Error(`${row.display_number} is not available to mark sold.`);
                const price=payload.actual_sale_price===undefined||payload.actual_sale_price===''?Number(row.intended_sale_price):Number(payload.actual_sale_price);
                if (!Number.isFinite(price)||price<=0) throw new Error('Actual sale price must be greater than zero.');
                await connection.query(`UPDATE dealer_purchase_numbers SET state='SOLD',actual_sale_price=?,sold_at=?,sold_order_item_id=NULL WHERE dealer_purchase_id=?`,[price,soldAt,row.dealer_purchase_id]);
                await connection.query(`UPDATE vip_numbers SET status='SOLD',stock=0 WHERE number_id=?`,[row.number_id]);
                await connection.query(`INSERT INTO dealer_purchase_events (dealer_purchase_id,external_dealer_id,event_type,details,created_by) VALUES (?,?,'SOLD',?,?)`,[row.dealer_purchase_id,row.external_dealer_id,JSON.stringify({actual_sale_price:price,sold_at:soldAt}),Number(payload.user_id)]);
            }
            await connection.commit(); response.status=1; response.info=`${ids.length} number${ids.length===1?'':'s'} marked sold.`;
        } catch(error){try{await connection?.rollback();}catch{} return this.fail(response,error);} finally{connection?.release();}
        return response;
    }

    async reverseSold(payload:any){
        const response=this.response(); let connection:any;
        try{
            const ids=this.ids(payload); connection=await this.dao.getConnection(); await connection.beginTransaction();
            const [rows]:any=await connection.query(`SELECT dpn.*,n.display_number FROM dealer_purchase_numbers dpn JOIN vip_numbers n ON n.number_id=dpn.number_id WHERE dpn.dealer_purchase_id IN (${ids.map(()=>'?').join(',')}) FOR UPDATE`,ids);
            if((rows||[]).length!==ids.length) throw new Error('One or more dealer numbers were not found.');
            for(const row of rows){
                if(row.state!=='SOLD') throw new Error(`${row.display_number} is not in Dealer Sales.`);
                if(row.sold_order_item_id) throw new Error(`${row.display_number} was sold through a paid store order and cannot be reversed manually.`);
                await connection.query(`UPDATE dealer_purchase_numbers SET state='INVENTORY',actual_sale_price=NULL,sold_at=NULL WHERE dealer_purchase_id=?`,[row.dealer_purchase_id]);
                await connection.query(`UPDATE vip_numbers SET status='AVAILABLE',stock=1 WHERE number_id=?`,[row.number_id]);
                await connection.query(`INSERT INTO dealer_purchase_events (dealer_purchase_id,external_dealer_id,event_type,details,created_by) VALUES (?,?,'SALE_REVERSED',NULL,?)`,[row.dealer_purchase_id,row.external_dealer_id,Number(payload.user_id)]);
            }
            await connection.commit(); response.status=1; response.info='Sale reversed.';
        }catch(error){try{await connection?.rollback();}catch{} return this.fail(response,error);}finally{connection?.release();}
        return response;
    }

    async remove(payload:any){
        const response=this.response(); let connection:any;
        try{
            const ids=this.ids(payload); const reason=String(payload.reason||'').trim(); if(reason.length<5) throw new Error('Enter a valid deletion reason of at least 5 characters.');
            connection=await this.dao.getConnection(); await connection.beginTransaction();
            const [rows]:any=await connection.query(`SELECT dpn.*,n.display_number,n.status FROM dealer_purchase_numbers dpn JOIN vip_numbers n ON n.number_id=dpn.number_id WHERE dpn.dealer_purchase_id IN (${ids.map(()=>'?').join(',')}) FOR UPDATE`,ids);
            if((rows||[]).length!==ids.length) throw new Error('One or more dealer numbers were not found.');
            const suppliers=Array.from(new Set(rows.map((r:any)=>Number(r.external_dealer_id))));
            for(const supplierId of suppliers){
                const removed=rows.filter((r:any)=>Number(r.external_dealer_id)===supplierId&&r.state!=='DELETED').reduce((s:number,r:any)=>s+Number(r.purchase_price),0);
                const [totals]:any=await connection.query(`SELECT (SELECT COALESCE(SUM(purchase_price),0) FROM dealer_purchase_numbers WHERE external_dealer_id=? AND state<>'DELETED') AS billed,(SELECT COALESCE(SUM(amount),0) FROM dealer_purchase_payments WHERE external_dealer_id=? AND status='POSTED') AS paid`,[supplierId,supplierId]);
                if(Number(totals[0].billed)-removed<Number(totals[0].paid)) throw new Error('These deletions would make recorded payments exceed the revised billed total. Void a payment first.');
            }
            for(const row of rows){
                if(row.state==='DELETED') throw new Error(`${row.display_number} is already deleted.`);
                if(row.status==='RESERVED') throw new Error(`${row.display_number} is reserved and cannot be deleted.`);
                if(row.sold_order_item_id) throw new Error(`${row.display_number} belongs to a paid store order and cannot be deleted.`);
                await connection.query(`UPDATE dealer_purchase_numbers SET state_before_delete=state,state='DELETED',deleted_reason=?,deleted_at=UTC_TIMESTAMP(),deleted_by=? WHERE dealer_purchase_id=?`,[reason,Number(payload.user_id),row.dealer_purchase_id]);
                await connection.query(`UPDATE vip_numbers SET status='INACTIVE',stock=0 WHERE number_id=?`,[row.number_id]);
                await connection.query(`INSERT INTO dealer_purchase_events (dealer_purchase_id,external_dealer_id,event_type,details,created_by) VALUES (?,?,'DELETED',?,?)`,[row.dealer_purchase_id,row.external_dealer_id,JSON.stringify({reason}),Number(payload.user_id)]);
            }
            await connection.commit(); response.status=1; response.info='Dealer numbers deleted.';
        }catch(error){try{await connection?.rollback();}catch{} return this.fail(response,error);}finally{connection?.release();}
        return response;
    }

    async restore(payload:any){
        const response=this.response(); let connection:any;
        try{
            const ids=this.ids(payload); connection=await this.dao.getConnection(); await connection.beginTransaction();
            const [rows]:any=await connection.query(`SELECT * FROM dealer_purchase_numbers WHERE dealer_purchase_id IN (${ids.map(()=>'?').join(',')}) FOR UPDATE`,ids);
            if((rows||[]).length!==ids.length) throw new Error('One or more dealer numbers were not found.');
            for(const row of rows){
                if(row.state!=='DELETED') throw new Error('Only deleted records can be restored.');
                const restored=row.state_before_delete==='SOLD'?'SOLD':'INVENTORY';
                await connection.query(`UPDATE dealer_purchase_numbers SET state=?,deleted_reason=NULL,deleted_at=NULL,deleted_by=NULL,state_before_delete=NULL WHERE dealer_purchase_id=?`,[restored,row.dealer_purchase_id]);
                await connection.query(`UPDATE vip_numbers SET status=?,stock=? WHERE number_id=?`,[restored==='SOLD'?'SOLD':'AVAILABLE',restored==='SOLD'?0:1,row.number_id]);
                await connection.query(`INSERT INTO dealer_purchase_events (dealer_purchase_id,external_dealer_id,event_type,details,created_by) VALUES (?,?,'RESTORED',?,?)`,[row.dealer_purchase_id,row.external_dealer_id,JSON.stringify({state:restored}),Number(payload.user_id)]);
            }
            await connection.commit(); response.status=1; response.info='Dealer numbers restored.';
        }catch(error){try{await connection?.rollback();}catch{} return this.fail(response,error);}finally{connection?.release();}
        return response;
    }

    async payments(payload:any){
        const response=this.response(); const params:any[]=[]; let where='';
        if(Number(payload.external_dealer_id)){where='WHERE p.external_dealer_id=?';params.push(Number(payload.external_dealer_id));}
        const page=Math.max(1,Math.floor(Number(payload.page)||1));
        const limit=Math.min(1000,Math.max(1,Math.floor(Number(payload.limit)||20)));
        const offset=(page-1)*limit;
        const count:any=await this.dao.executeQuery(`SELECT COUNT(*) AS total FROM dealer_purchase_payments p JOIN external_dealers d ON d.external_dealer_id=p.external_dealer_id ${where}`,params);
        if(count.status!==1)return this.fail(response,count.info);
        const q:any=await this.dao.executeQuery(`SELECT p.*,d.name AS dealer_name FROM dealer_purchase_payments p JOIN external_dealers d ON d.external_dealer_id=p.external_dealer_id ${where} ORDER BY p.paid_at DESC,p.dealer_payment_id DESC LIMIT ? OFFSET ?`,[...params,limit,offset]);
        if(q.status!==1)return this.fail(response,q.info); response.status=1;response.info='OK';response.data={items:q.rows||[],total:Number(count.rows?.[0]?.total||0),page,limit};return response;
    }

    async recordPayment(payload:any){
        const response=this.response(); let connection:any;
        try{
            const dealerId=Number(payload.external_dealer_id); const amount=Number(payload.amount); if(!dealerId)throw new Error('Select a dealer.'); if(!Number.isFinite(amount)||amount<=0)throw new Error('Payment amount must be greater than zero.');
            const paidAt=String(payload.paid_at||new Date().toISOString().slice(0,19).replace('T',' ')); connection=await this.dao.getConnection();await connection.beginTransaction();
            const [totals]:any=await connection.query(`SELECT (SELECT COALESCE(SUM(purchase_price),0) FROM dealer_purchase_numbers WHERE external_dealer_id=? AND state<>'DELETED') AS billed,(SELECT COALESCE(SUM(amount),0) FROM dealer_purchase_payments WHERE external_dealer_id=? AND status='POSTED') AS paid`,[dealerId,dealerId]);
            if(!totals?.length)throw new Error('Dealer not found.'); const remaining=Number(totals[0].billed)-Number(totals[0].paid); if(amount>remaining)throw new Error(`Payment exceeds the remaining ₹${remaining.toFixed(2)}.`);
            const [insert]:any=await connection.query(`INSERT INTO dealer_purchase_payments (external_dealer_id,amount,payment_method,reference_no,notes,paid_at,created_by) VALUES (?,?,?,?,?,?,?)`,[dealerId,amount,String(payload.payment_method||'').trim()||null,String(payload.reference_no||'').trim()||null,String(payload.notes||'').trim()||null,paidAt,Number(payload.user_id)]);
            await connection.query(`INSERT INTO dealer_purchase_events (dealer_payment_id,external_dealer_id,event_type,details,created_by) VALUES (?,?,'PAYMENT_POSTED',?,?)`,[insert.insertId,dealerId,JSON.stringify({amount,paid_at:paidAt}),Number(payload.user_id)]);
            await connection.commit();response.status=1;response.info='Payment recorded.';response.data={dealer_payment_id:Number(insert.insertId)};
        }catch(error){try{await connection?.rollback();}catch{}return this.fail(response,error);}finally{connection?.release();}return response;
    }

    async voidPayment(payload:any){
        const response=this.response();let connection:any;
        try{
            const id=Number(payload.dealer_payment_id);const reason=String(payload.reason||'').trim();if(!id)throw new Error('dealer_payment_id is required.');if(reason.length<5)throw new Error('Enter a valid void reason of at least 5 characters.');
            connection=await this.dao.getConnection();await connection.beginTransaction();const [rows]:any=await connection.query(`SELECT * FROM dealer_purchase_payments WHERE dealer_payment_id=? FOR UPDATE`,[id]);const payment=rows?.[0];if(!payment||payment.status!=='POSTED')throw new Error('Posted payment not found.');
            await connection.query(`UPDATE dealer_purchase_payments SET status='VOIDED',void_reason=?,voided_at=UTC_TIMESTAMP(),voided_by=? WHERE dealer_payment_id=?`,[reason,Number(payload.user_id),id]);
            await connection.query(`INSERT INTO dealer_purchase_events (dealer_payment_id,external_dealer_id,event_type,details,created_by) VALUES (?,?,'PAYMENT_VOIDED',?,?)`,[id,payment.external_dealer_id,JSON.stringify({reason}),Number(payload.user_id)]);
            await connection.commit();response.status=1;response.info='Payment voided.';
        }catch(error){try{await connection?.rollback();}catch{}return this.fail(response,error);}finally{connection?.release();}return response;
    }
}
