/* the real track of a train/subway ride between two points, from Google's transit directions, so the map can trace it */
const cache=new Map();
const FIELDS='routes.legs.steps.travelMode,routes.legs.steps.polyline.encodedPolyline,routes.legs.steps.transitDetails.transitLine.color,routes.legs.steps.transitDetails.transitLine.nameShort,routes.legs.steps.transitDetails.transitLine.name';
const pt=s=>{const m=String(s||'').split(',').map(Number);return m.length===2&&m.every(Number.isFinite)&&Math.abs(m[0])<=90&&Math.abs(m[1])<=180?m:null;};
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const KEY=process.env.GOOGLE_MAPS_API_KEY;
  if(!KEY){res.status(503).json({error:'not_configured'});return;}
  const ref=req.headers.referer||'';
  if(ref&&!(ref.startsWith('https://tokyo-planner')&&ref.includes('.vercel.app/'))){res.status(403).json({error:'forbidden'});return;}
  const a=pt(req.query.a),b=pt(req.query.b);
  if(!a||!b){res.status(400).json({error:'bad_query'});return;}
  const k=a.map(x=>x.toFixed(4)).join(',')+';'+b.map(x=>x.toFixed(4)).join(',');
  const c=cache.get(k);if(c&&Date.now()-c.t<7*864e5){res.status(200).json(c.v);return;}
  try{
    const ll=([lat,lng])=>({location:{latLng:{latitude:lat,longitude:lng}}});
    const r=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':KEY,'X-Goog-FieldMask':FIELDS},
      body:JSON.stringify({origin:ll(a),destination:ll(b),travelMode:'TRANSIT',languageCode:'en',transitPreferences:{allowedTravelModes:['TRAIN','SUBWAY','RAIL','LIGHT_RAIL']}})});
    const j=await r.json();
    if(!r.ok){console.error('transit',r.status,JSON.stringify(j).slice(0,300));res.status(r.status===403?403:502).json({error:'upstream',status:r.status});return;}
    const steps=j.routes?.[0]?.legs?.flatMap(l=>l.steps||[])||[];
    const segs=steps.filter(s=>s.travelMode==='TRANSIT'&&s.polyline?.encodedPolyline).map(s=>({line:s.transitDetails?.transitLine?.nameShort||s.transitDetails?.transitLine?.name||'',color:s.transitDetails?.transitLine?.color||'',p:s.polyline.encodedPolyline}));
    const v={segs};cache.set(k,{t:Date.now(),v});
    res.status(200).json(v);
  }catch(e){res.status(502).json({error:'failed'});}
};
