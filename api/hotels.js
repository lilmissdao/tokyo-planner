const BASE='https://openapi.rakuten.co.jp/engine/api/Travel/';
const SITE='https://tokyo-planner-mu.vercel.app';
const cache=new Map();
const cached=(k,ms,fn)=>{const c=cache.get(k);if(c&&Date.now()-c.t<ms)return c.p;const p=fn();cache.set(k,{t:Date.now(),p});p.catch(()=>cache.delete(k));return p;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rk(path,params){
  const q=new URLSearchParams({...params,applicationId:process.env.RAKUTEN_APP_ID,accessKey:process.env.RAKUTEN_ACCESS_KEY,format:'json',formatVersion:'2'});
  if(process.env.RAKUTEN_AFFILIATE_ID)q.set('affiliateId',process.env.RAKUTEN_AFFILIATE_ID);
  const r=await fetch(BASE+path+'?'+q,{headers:{Referer:SITE+'/',Origin:SITE}});
  if(r.status===404)return null;
  if(r.status===429){const e=new Error('busy');e.status=429;throw e;}
  if(!r.ok){const e=new Error('rakuten '+r.status);e.status=502;throw e;}
  return r.json();
}
const part=(h,k)=>(h.find(x=>x[k])||{})[k]||{};
/* USD per JPY, refreshed twice a day */
const fx=()=>cached('fx',12*3600e3,async()=>{const r=await fetch('https://open.er-api.com/v6/latest/USD');const j=await r.json();if(!j.rates?.JPY)throw 0;return {jpy:j.rates.JPY,date:j.time_last_update_utc};});
const isDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!process.env.RAKUTEN_APP_ID||!process.env.RAKUTEN_ACCESS_KEY){res.status(503).json({error:'not_configured'});return;}
  const ref=req.headers.referer||'';
  if(ref&&!(ref.startsWith('https://tokyo-planner')&&ref.includes('.vercel.app/'))){res.status(403).json({error:'forbidden'});return;}
  const {action,lat,lng,no,checkin,checkout,adults}=req.query;
  try{
    if(action==='match'){
      /* Rakuten hotels within 400 m of a point, nearest first */
      const la=+lat,ln=+lng;
      if(!Number.isFinite(la)||!Number.isFinite(ln)){res.status(400).json({error:'bad_query'});return;}
      const j=await cached(`m:${la.toFixed(4)},${ln.toFixed(4)}`,24*3600e3,()=>rk('SimpleHotelSearch/20260731',{latitude:la,longitude:ln,searchRadius:'0.4',datumType:'1',hits:'10'}));
      const t=Math.PI/180,dist=(a,b,c,d)=>{const x=(d-b)*t*Math.cos((a+c)/2*t),y=(c-a)*t;return Math.sqrt(x*x+y*y)*6371000;};
      const hotels=(j?.hotels||[]).map(h=>part(h,'hotelBasicInfo')).map(b=>({no:b.hotelNo,name:b.hotelName,m:Math.round(dist(la,ln,b.latitude,b.longitude))})).sort((a,b)=>a.m-b.m).slice(0,5);
      res.status(200).json({hotels});return;
    }
    if(action==='info'){
      if(!/^\d{1,9}$/.test(no||'')){res.status(400).json({error:'bad_query'});return;}
      const d=await cached('d:'+no,24*3600e3,()=>rk('HotelDetailSearch/20260731',{hotelNo:no,responseType:'large',datumType:'1'}));
      if(!d?.hotels?.length){res.status(404).json({error:'not_found'});return;}
      const h=d.hotels[0],b=part(h,'hotelBasicInfo'),f=part(h,'hotelFacilitiesInfo');
      const fac=(f.hotelFacilities||[]).map(x=>x.item||'').join(' '),bath=(f.aboutBath||[]).map(x=>x.bathType||'').join(' ');
      const meals=(f.aboutMealPlace||[]).map(x=>x.breakfastPlace||'').filter(x=>x&&!/なし|無し/.test(x));
      const out={no:b.hotelNo,name:b.hotelName,url:b.hotelInformationUrl,planUrl:b.planListUrl,image:b.hotelThumbnailUrl,review:b.reviewAverage,reviews:b.reviewCount,
        amen:{bath:/大浴場|温泉|露天/.test(fac+' '+bath),breakfast:meals.length>0,gym:/フィットネス|ジム|トレーニング/.test(fac)}};
      if(isDate(checkin)&&isDate(checkout)&&checkout>checkin){
        const n=Math.min(Math.max(parseInt(adults,10)||2,1),6);
        if(!cache.has(`v:${no}:${checkin}:${checkout}:${n}`))await sleep(1100);
        const v=await cached(`v:${no}:${checkin}:${checkout}:${n}`,30*60e3,()=>rk('VacantHotelSearch/20170426',{hotelNo:no,checkinDate:checkin,checkoutDate:checkout,adultNum:String(n),searchPattern:'1',hits:'30',responseType:'large'}));
        const plans=[];
        for(const hh of v?.hotels||[])for(const p of hh)for(const e of p.roomInfo||[]){
          if(e.roomBasicInfo)plans.push({bf:!!e.roomBasicInfo.withBreakfastFlag,gym:/フィットネス|ジム/.test(e.roomBasicInfo.planContents||'')});
          if(e.dailyCharge&&plans.length)plans[plans.length-1].yen=e.dailyCharge.total;
        }
        const ys=plans.map(p=>p.yen).filter(Boolean),bf=plans.filter(p=>p.bf&&p.yen).map(p=>p.yen);
        out.price=ys.length?{min:Math.min(...ys),max:Math.max(...ys),bfMin:bf.length?Math.min(...bf):null,plans:ys.length,guests:n}:{soldOut:true};
        if(plans.some(p=>p.bf))out.amen.breakfast=true;
        if(plans.some(p=>p.gym))out.amen.gym=true;
      }
      try{out.fx=await fx();}catch(e){out.fx=null;}
      res.status(200).json(out);return;
    }
    res.status(400).json({error:'bad_action'});
  }catch(e){res.status(e.status||502).json({error:e.status===429?'busy':'upstream'});}
};
