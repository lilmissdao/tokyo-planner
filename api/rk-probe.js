// Temporary: inspect Rakuten Travel response shapes. Remove after.
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const ID=process.env.RAKUTEN_APP_ID,AK=process.env.RAKUTEN_ACCESS_KEY;
  if(!ID||!AK){res.status(503).end();return;}
  const red=s=>s.split(ID).join('[ID]').split(AK).join('[AK]');
  const base='https://openapi.rakuten.co.jp/engine/api/Travel/';
  const auth=`&applicationId=${ID}&accessKey=${AK}&format=json&formatVersion=2`;
  const H={headers:{Referer:'https://tokyo-planner-mu.vercel.app/',Origin:'https://tokyo-planner-mu.vercel.app'}};
  const which=req.query.t||'detail';
  const urls={
    simple:`SimpleHotelSearch/20260731?latitude=35.6676&longitude=139.7657&searchRadius=1&datumType=1&hits=1&responseType=large`,
    detail:`HotelDetailSearch/20260731?hotelNo=182801&responseType=large&datumType=1`,
    vacant:`VacantHotelSearch/20170426?latitude=35.6676&longitude=139.7657&searchRadius=1&datumType=1&hits=2&checkinDate=2026-11-10&checkoutDate=2026-11-12&adultNum=2&responseType=large`,
    vacantsq:`VacantHotelSearch/20170426?latitude=35.6676&longitude=139.7657&searchRadius=1&datumType=1&hits=3&checkinDate=2026-11-10&checkoutDate=2026-11-12&adultNum=2&squeezeCondition=${encodeURIComponent(req.query.sq||'daiyoku')}`,
  };
  const r=await fetch(base+urls[which]+auth,H);const t=await r.text();
  res.status(200).send(red(`${r.status}\n`+t).slice(0,+(req.query.n||9000)));
};
