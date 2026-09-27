// Temporary: find which Rakuten request format works with this account's keys. Remove after.
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const ID=process.env.RAKUTEN_APP_ID,AK=process.env.RAKUTEN_ACCESS_KEY;
  if(!ID||!AK){res.status(503).json({error:'not_configured',id:!!ID,ak:!!AK});return;}
  const red=s=>s.split(ID).join('[ID]').split(AK).join('[AK]');
  const q='format=json&formatVersion=2&latitude=35.6676&longitude=139.7657&searchRadius=1&datumType=1&hits=2';
  const hosts=['https://openapi.rakuten.co.jp/engine/api','https://app.rakuten.co.jp/services/api'];
  const vers=['20170426','20260731'];
  const auths={
    query:{qs:`&applicationId=${ID}&accessKey=${AK}`,h:{}},
    header:{qs:`&applicationId=${ID}`,h:{Authorization:`Bearer ${AK}`}},
  };
  const ref={Referer:'https://tokyo-planner-mu.vercel.app/',Origin:'https://tokyo-planner-mu.vercel.app'};
  const out=[];
  for(const h of hosts)for(const v of vers)for(const [an,a] of Object.entries(auths))for(const withRef of [true,false]){
    const url=`${h}/Travel/SimpleHotelSearch/${v}?${q}${a.qs}`;
    try{
      const r=await fetch(url,{headers:{...a.h,...(withRef?ref:{})}});
      const t=await r.text();
      out.push({host:h.split('/')[2],v,auth:an,ref:withRef,status:r.status,body:red(t).slice(0,260)});
    }catch(e){out.push({host:h.split('/')[2],v,auth:an,ref:withRef,err:String(e).slice(0,120)});}
    await new Promise(r=>setTimeout(r,1100));
  }
  res.status(200).json(out);
};
