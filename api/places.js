const FIELDS_SEARCH='places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.types,places.photos';
const FIELDS_AREA='places.id,places.displayName,places.formattedAddress,places.location,nextPageToken';
const FIELDS_DETAILS='id,displayName,formattedAddress,location,rating,userRatingCount,reviews,photos,websiteUri,googleMapsUri,regularOpeningHours.weekdayDescriptions,editorialSummary,primaryTypeDisplayName,types,nationalPhoneNumber';
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const KEY=process.env.GOOGLE_MAPS_API_KEY;
  if(!KEY){res.status(503).json({error:'not_configured'});return;}
  const ref=req.headers.referer||'';
  if(ref&&!(ref.startsWith('https://tokyo-planner')&&ref.includes('.vercel.app/'))){res.status(403).json({error:'forbidden'});return;}
  const {action,q,id,lat,lng,radius,south,west,north,east,pageToken}=req.query;
  try{
    if(action==='search'){
      if(!q||q.length>200){res.status(400).json({error:'bad_query'});return;}
      const body={textQuery:q,languageCode:'en',maxResultCount:10};
      if(lat&&lng)body.locationBias={circle:{center:{latitude:+lat,longitude:+lng},radius:Math.min(50000,+radius||50000)}};
      const r=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':KEY,'X-Goog-FieldMask':FIELDS_SEARCH},body:JSON.stringify(body)});
      res.status(r.status).json(await r.json());return;
    }
    if(action==='area'){
      const box=[+south,+west,+north,+east];
      if(!q||q.length>200||!box.every(Number.isFinite)||box[2]<=box[0]||box[3]<=box[1]||box[2]-box[0]>5||box[3]-box[1]>5){res.status(400).json({error:'bad_query'});return;}
      if(pageToken&&(typeof pageToken!=='string'||pageToken.length>2000)){res.status(400).json({error:'bad_query'});return;}
      const body={textQuery:q,languageCode:'en',pageSize:20,locationRestriction:{rectangle:{low:{latitude:box[0],longitude:box[1]},high:{latitude:box[2],longitude:box[3]}}}};
      if(pageToken)body.pageToken=pageToken;
      const r=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':KEY,'X-Goog-FieldMask':FIELDS_AREA},body:JSON.stringify(body)});
      res.status(r.status).json(await r.json());return;
    }
    if(action==='details'){
      if(!/^[A-Za-z0-9_-]{10,300}$/.test(id||'')){res.status(400).json({error:'bad_id'});return;}
      const r=await fetch(`https://places.googleapis.com/v1/places/${id}?languageCode=en`,{headers:{'X-Goog-Api-Key':KEY,'X-Goog-FieldMask':FIELDS_DETAILS}});
      res.status(r.status).json(await r.json());return;
    }
    res.status(400).json({error:'bad_action'});
  }catch(e){res.status(502).json({error:'upstream'});}
};
