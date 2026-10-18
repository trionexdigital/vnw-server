import { createHash } from 'crypto';
import { MySqlClient } from '../../../gen_db/database';
import { MasterModel } from '../../../models/MasterModel';
import bundled from './languageCatalog.json';

export const PUBLIC_LANGUAGES = ['en','hi','mr','hg','gu','bn','pa','ta','te','kn','ml','or'] as const;
export const normalizeSource = (source: string) => source.replace(/\s+/g,' ').trim();
export const sourceHash = (source: string) => createHash('sha256').update(normalizeSource(source).toLowerCase()).digest('hex');
export const catalogVersion = (rows: any[]) => createHash('sha256').update(rows.map(r=>`${r.source_hash}:${r.revision}`).sort().join('|')).digest('hex');
const placeholders = (text: string) => (text.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g)||[]).sort().join('|');
export function validateEntry(entry: any) {
  if(!entry || typeof entry.source!=='string' || typeof entry.translation!=='string') throw new Error('Every entry needs source and translation text.');
  const source=normalizeSource(entry.source), translation=entry.translation.trim();
  if(!source || source.length>32000 || translation.length>32000) throw new Error('Source and translation must be at most 32,000 characters.');
  if(translation && placeholders(source)!==placeholders(translation)) throw new Error('Keep every {placeholder} unchanged, including repeated placeholders.');
  if(/<\/?(?:script|iframe|style)\b/i.test(translation)) throw new Error('Translations must be plain text.');
  return {source,translation,hash:sourceHash(source)};
}
export function languageCode(value: any, editing=false) {
  if(!PUBLIC_LANGUAGES.includes(value) || (editing && value==='en')) throw new Error(editing?'Choose one of the 11 translated languages. English is the source.':'Choose a supported language.');
  return String(value);
}

/** App-owned catalogs only. No HTTP clients, provider credentials or text generation. */
export class LanguageManagement {
  private dao=new MySqlClient('pixels');
  private master=new MasterModel();
  private async response(work:()=>Promise<any>) {
    const response=this.master.getResponseModel();
    try { response.data=await work();response.status=1;response.info='OK'; }
    catch(error:any) {response.status=-33;response.info=error.message;}
    return response;
  }
  private async query(sql:string,params:any[]=[]) {
    const result:any=await this.dao.executeQuery(sql,params);
    if(result.status!==1) throw new Error('Language database unavailable. Apply the custom language migration and retry.');
    return result.rows||[];
  }
  async catalog(payload:any) {
    return this.response(async()=>{
      const language=languageCode(payload.language);
      const translations:Record<string,string>=Object.create(null);
      if(language!=='en') for(const [source,values] of Object.entries(bundled)) translations[source]=(values as Record<string,string>)[language];
      const result:any=await this.dao.executeQuery('SELECT s.source_text,t.published_text FROM language_translations t JOIN language_sources s ON s.source_hash=t.source_hash WHERE t.language=? AND t.published_text IS NOT NULL',[language]);
      if(result.status===1) for(const row of result.rows||[]) translations[row.source_text]=row.published_text;
      return {language,translations,custom_catalog_available:result.status===1};
    });
  }
  async list(payload:any) {
    return this.response(async()=>{
      const language=languageCode(payload.language,true);
      const page=Math.max(1,Math.floor(Number(payload.page)||1)),limit=Math.min(100,Math.max(1,Math.floor(Number(payload.limit)||25)));
      const q=String(payload.q||'').trim().slice(0,200);
      const rows=await this.query('SELECT s.source_hash,s.source_text AS source,s.context,t.draft_text AS translation,t.published_text,t.revision,t.updated_at FROM language_sources s LEFT JOIN language_translations t ON t.source_hash=s.source_hash AND t.language=? ORDER BY s.source_text',[language]);
      const filtered=rows.filter((row:any)=>(!q||[row.source,row.translation,row.context].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()))) && (!payload.missing_only||!row.published_text));
      const summary={total:rows.length,published:rows.filter((r:any)=>r.published_text).length,missing:rows.filter((r:any)=>!r.published_text).length,drafts:rows.filter((r:any)=>r.translation!=null && r.translation!==(r.published_text||'')).length};
      return {language,items:filtered.slice((page-1)*limit,page*limit).map((r:any)=>({...r,translation:r.translation||'',revision:r.revision||0})),total:filtered.length,page,limit,summary,version:catalogVersion(rows.filter((r:any)=>r.revision))};
    });
  }
  async save(payload:any) {
    return this.response(async()=>{
      const language=languageCode(payload.language,true),entry=validateEntry(payload);
      if(!Number.isInteger(payload.revision)||payload.revision<0) throw new Error('Reload the entry before saving.');
      await this.saveEntries(language,[{...entry,revision:payload.revision}],payload.user_id);
      return {saved:1};
    });
  }
  private async saveEntries(language:string,entries:Array<ReturnType<typeof validateEntry>&{revision?:number}>,userId:number) {
    const conn=await this.dao.getConnection();
    try {
      await conn.beginTransaction();
      for(const entry of entries) {
        await conn.query('INSERT IGNORE INTO language_sources(source_hash,source_text,context) VALUES (?,?,?)',[entry.hash,entry.source,'Admin language editor']);
        const [rows]:any=await conn.query('SELECT revision FROM language_translations WHERE source_hash=? AND language=? FOR UPDATE',[entry.hash,language]);
        const revision=rows[0]?.revision||0;
        if(entry.revision!=null && entry.revision!==revision) throw new Error('This translation changed. Reload it before saving.');
        if(revision) await conn.query('UPDATE language_translations SET draft_text=?,revision=revision+1,updated_by=? WHERE source_hash=? AND language=?',[entry.translation,userId,entry.hash,language]);
        else await conn.query('INSERT INTO language_translations(source_hash,language,draft_text,updated_by) VALUES (?,?,?,?)',[entry.hash,language,entry.translation,userId]);
      }
      await conn.commit();
    } catch(error) {await conn.rollback();throw error;} finally {conn.release();}
  }
  async importDrafts(payload:any) {
    return this.response(async()=>{
      const language=languageCode(payload.language,true);
      if(!Array.isArray(payload.entries)||!payload.entries.length||payload.entries.length>5000) throw new Error('Import between 1 and 5,000 entries.');
      const entries=payload.entries.map(validateEntry);
      if(entries.reduce((n:number,e:any)=>n+e.source.length+e.translation.length,0)>2000000) throw new Error('Import text is limited to 2,000,000 characters.');
      if(new Set(entries.map((e:any)=>e.hash)).size!==entries.length) throw new Error('The import contains duplicate source text.');
      if(payload.confirm!==true) throw new Error('Confirm replacing the imported translation drafts.');
      await this.saveEntries(language,entries,payload.user_id);
      return {saved:entries.length};
    });
  }
  async exportDrafts(payload:any) {
    return this.response(async()=>{
      const language=languageCode(payload.language,true);
      const rows=await this.query('SELECT s.source_text AS source,COALESCE(t.draft_text,\'\') AS translation FROM language_sources s LEFT JOIN language_translations t ON s.source_hash=t.source_hash AND t.language=? ORDER BY s.source_text',[language]);
      return {format:'vnw-language-v1',language,entries:rows};
    });
  }
  async publish(payload:any) {
    return this.response(async()=>{
      const language=languageCode(payload.language,true);
      if(payload.confirm!==true||typeof payload.version!=='string') throw new Error('Confirm publishing the current drafts.');
      const conn=await this.dao.getConnection();
      try {
        await conn.beginTransaction();
        const [rows]:any=await conn.query('SELECT source_hash,revision,draft_text FROM language_translations WHERE language=? FOR UPDATE',[language]);
        if(catalogVersion(rows)!==payload.version) throw new Error('The catalog changed. Reload and review before publishing.');
        const [result]:any=await conn.query('UPDATE language_translations SET published_text=NULLIF(TRIM(draft_text),\'\'),revision=revision+1,updated_by=? WHERE language=?',[payload.user_id,language]);
        await conn.commit();return {published:result.affectedRows};
      } catch(error) {await conn.rollback();throw error;} finally {conn.release();}
    });
  }
  async syncContent() {
    return this.response(async()=>{
      // Only first-party editorial content: never collect visitor input or customer identity.
      const specs=[['faqs','question,answer','FAQ'],['banners','title,subtitle,cta_text','Banner'],['delivery_cities','description','Delivery city'],['deal_of_day_numbers','hero_label,hero_description','Lucky pick'],['numbers','title_label','Public number label']];
      let added=0;
      for(const [table,fields,context] of specs) {
        const rows=await this.query(table==='numbers'
          ? "SELECT DISTINCT title_label FROM numbers WHERE visibility_type='ONLINE' AND deleted_at IS NULL"
          : `SELECT ${fields} FROM ${table}`);
        for(const row of rows) for(const value of Object.values(row)) {
          if(typeof value!=='string'||!value.trim()) continue;
          const source=normalizeSource(value);
          const result:any=await this.dao.executeQuery('INSERT IGNORE INTO language_sources(source_hash,source_text,context) VALUES (?,?,?)',[sourceHash(source),source,context]);
          if(result.status!==1) throw new Error('Could not register editorial content.');
          added+=result.affectedRows||0;
        }
      }
      return {added};
    });
  }
}
