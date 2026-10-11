import axios from 'axios';
import { createHash } from 'crypto';
import { MySqlClient } from '../../../gen_db/database';
import { MasterModel } from '../../../models/MasterModel';

export const PUBLIC_LANGUAGES = ['en','hi','mr','hg','gu','bn','pa','ta','te','kn','ml','or'] as const;
const consonants: Record<string,string> = { 'क':'k','ख':'kh','ग':'g','घ':'gh','ङ':'ng','च':'ch','छ':'chh','ज':'j','झ':'jh','ञ':'ny','ट':'t','ठ':'th','ड':'d','ढ':'dh','ण':'n','त':'t','थ':'th','द':'d','ध':'dh','न':'n','प':'p','फ':'ph','ब':'b','भ':'bh','म':'m','य':'y','र':'r','ल':'l','व':'v','श':'sh','ष':'sh','स':'s','ह':'h','ड़':'r','ढ़':'rh' };
const vowels: Record<string,string> = { 'अ':'a','आ':'aa','इ':'i','ई':'ee','उ':'u','ऊ':'oo','ऋ':'ri','ए':'e','ऐ':'ai','ओ':'o','औ':'au','ा':'aa','ि':'i','ी':'ee','ु':'u','ू':'oo','ृ':'ri','े':'e','ै':'ai','ो':'o','ौ':'au','ं':'n','ँ':'n','ः':'h','़':'','्':'' };
/** Basic API has no romanization endpoint. Hinglish uses Hindi plus local phonetic romanization. */
export function romanizeHindi(text: string) {
  return text.normalize('NFC').replace(/[\u0900-\u097f]+/g, (word) => {
    let result = '';
    for (let i=0;i<word.length;i++) {
      const ch=word[i];
      if (consonants[ch]) { result+=consonants[ch]; if (!vowels.hasOwnProperty(word[i+1])) result+='ə'; }
      else result+=vowels[ch] ?? ({ '०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9','।':'.' } as Record<string,string>)[ch] ?? '';
    }
    return result.replace(/ə$/, result.length > 1 ? '' : 'a').replace(/ə/g,'a');
  });
}
const hinglish: Record<string,string> = { Home:'Home', Search:'Khojein', 'Sign In':'Sign In', Register:'Register', 'How It Works':'Kaise kaam karta hai', 'Family Pack':'Family Pack', 'Corporate Numbers':'Corporate Numbers', 'Buy Now':'Abhi khareedein', 'Add to Cart':'Cart mein jodein', Wishlist:'Wishlist', Cart:'Cart', Contact:'Sampark karein', 'Offer price':'Offer price', Total:'Total', 'Root sum':'Root sum' };
export function validateTranslationInput(payload: any) {
  if (!PUBLIC_LANGUAGES.includes(payload.language)) throw new Error('Choose a supported language.');
  if (!Array.isArray(payload.texts) || !payload.texts.length || payload.texts.length>40 || payload.texts.some((s:any)=>typeof s!=='string' || !s.trim() || s.length>3000) || payload.texts.reduce((sum:number,s:string)=>sum+s.length,0)>12000) throw new Error('Translation requests accept up to 40 public text fragments and 12,000 characters.');
  return { language:String(payload.language), texts:payload.texts as string[] };
}
const limits = new Map<string,{ start:number; requests:number; characters:number }>();
let daily = { date:'',characters:0 };
export function translationQuota(client: string, characters: number) {
  const now=Date.now(), day=new Date(now).toISOString().slice(0,10);
  if (daily.date!==day) daily={date:day,characters:0};
  let entry=limits.get(client);
  if (!entry || now-entry.start>60000) { entry={start:now,requests:0,characters:0}; limits.set(client,entry); }
  if ((characters===0 && entry.requests>=60) || entry.characters+characters>100000 || daily.characters+characters>Math.max(12000,Number(process.env.GOOGLE_TRANSLATE_DAILY_CHAR_LIMIT)||1000000)) throw new Error('Translation is busy. Please retry shortly.');
  if(characters===0) entry.requests++; entry.characters+=characters; daily.characters+=characters;
  if (limits.size>10000) for(const [key,value] of limits) if(now-value.start>60000) limits.delete(key);
}
const decode = (s:string) => s.replace(/&(#\d+|#x[\da-f]+|amp|lt|gt|quot|apos);/gi,(_,v:string)=>v[0]==='#' ? String.fromCodePoint(v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1))) : ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as Record<string,string>)[v.toLowerCase()]);
export class Translation {
  private dao=new MySqlClient('pixels');
  private master=new MasterModel();
  private request=axios.post;
  async translate(payload:any, client='anonymous') {
    const response=this.master.getResponseModel();
    try {
      const {language,texts}=validateTranslationInput(payload);
      translationQuota(client,0);
      if(language==='en') { response.status=1;response.data={translations:texts};return response; }
      const unique=[...new Set(texts)], hashes=unique.map(s=>createHash('sha256').update('v1|'+s).digest('hex'));
      const cached:any=await this.dao.executeQuery(`SELECT source_hash,translated_text FROM translation_cache WHERE language=? AND source_hash IN (${hashes.map(()=>'?').join(',')})`,[language,...hashes]);
      if(cached.status!==1) throw new Error('Translation is currently unavailable. Please try again later.');
      const translated=new Map<string,string>((cached.rows||[]).map((r:any)=>[r.source_hash,r.translated_text]));
      const missing=unique.filter((_,i)=>!translated.has(hashes[i]));
      if(missing.length) {
        const key=process.env.GOOGLE_TRANSLATE_API_KEY;
        if(!key) throw new Error('Translation is currently unavailable. Please try again later.');
        translationQuota(client,missing.reduce((sum,s)=>sum+s.length,0));
        // Keep telecom numbers, prices, brand names and readiness codes exact.
        const protectedText=missing.map(source=>{
          const values:string[]=[];
          const text=source.replace(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}|https?:\/\/[^\s]+|VIP Number World|\b(?:RTP|RTA|NON_RTP|UPC|MNP|VIP|MRP|Airtel|Jio|Vi|BSNL)\b|[₹$€]?\d[\d\s,.:%/+\-]*\d|\d/g, value=>{ const token=`__VNW${values.length}__`;values.push(value);return token; });
          return {text,values};
        });
        let result:any;
        try { result=await this.request('https://translation.googleapis.com/language/translate/v2',{q:protectedText.map(p=>p.text),source:'en',target:language==='hg'?'hi':language,format:'text'},{params:{key},timeout:15000,maxContentLength:200000}); }
        catch { throw new Error('Translation is currently unavailable. Please try again later.'); }
        const values=result.data?.data?.translations;
        if(!Array.isArray(values)||values.length!==missing.length) throw new Error('Translation is currently unavailable. Please try again later.');
        for(let i=0;i<missing.length;i++) {
          let value=decode(String(values[i].translatedText||''));
          if(!value.trim()) throw new Error('Translation is currently unavailable. Please try again later.');
          if(language==='hg') value=Object.prototype.hasOwnProperty.call(hinglish,missing[i]) ? hinglish[missing[i]] : romanizeHindi(value);
          for(let j=0;j<protectedText[i].values.length;j++) {
            const token=`__VNW${j}__`;
            if(!value.includes(token)) throw new Error('Translation is currently unavailable. Please try again later.');
            value=value.split(token).join(protectedText[i].values[j]);
          }
          const hash=hashes[unique.indexOf(missing[i])];translated.set(hash,value);
          const save:any=await this.dao.executeQuery('INSERT INTO translation_cache (source_hash,language,source_text,translated_text) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE translated_text=VALUES(translated_text)',[hash,language,missing[i],value]);
          if(save.status!==1) throw new Error('Translation is currently unavailable. Please try again later.');
        }
      }
      response.status=1;response.info='OK';response.data={translations:texts.map(s=>translated.get(hashes[unique.indexOf(s)]))};
    } catch(error:any) { response.status=-33;response.info=error.message; }
    return response;
  }
}
