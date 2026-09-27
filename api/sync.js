/* one shared copy of the trip per sync code, so every phone and computer sees the same list.
   Saves only go through when nobody else saved in between (ETag check); otherwise the latest copy comes back to merge */
const {get,put,BlobPreconditionFailedError}=require('@vercel/blob');
const CODE=/^[a-z0-9]{12,40}$/;
const MAX=3e6;
async function read(path){
  const r=await get(path,{access:'private',useCache:false});
  if(!r||r.statusCode!==200)return null;
  return {etag:r.blob.etag,data:JSON.parse(await new Response(r.stream).text())};
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!process.env.BLOB_READ_WRITE_TOKEN){res.status(503).json({error:'not_configured'});return;}
  const ref=req.headers.referer||'';
  if(ref&&!(ref.startsWith('https://tokyo-planner')&&ref.includes('.vercel.app/'))){res.status(403).json({error:'forbidden'});return;}
  const code=String(req.query.trip||'').toLowerCase();
  if(!CODE.test(code)){res.status(400).json({error:'bad_code'});return;}
  const path=`trips/${code}.json`;
  try{
    if(req.method==='GET'){
      const cur=await read(path);
      if(!cur){res.status(404).json({error:'not_found'});return;}
      res.status(200).json(cur);return;
    }
    if(req.method!=='POST'){res.status(405).json({error:'method'});return;}
    let body=req.body;if(typeof body==='string')body=JSON.parse(body);
    const {data,etag,create}=body||{};
    if(!data||!Array.isArray(data.places)){res.status(400).json({error:'bad_data'});return;}
    const text=JSON.stringify(data);
    if(text.length>MAX){res.status(413).json({error:'too_big'});return;}
    if(!etag&&!create){res.status(400).json({error:'need_etag'});return;}
    if(create){const cur=await read(path);if(cur){res.status(409).json(cur);return;}}
    try{
      const r=await put(path,text,{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:true,...(etag?{ifMatch:etag}:{})});
      res.status(200).json({etag:r.etag});
    }catch(e){
      if(e instanceof BlobPreconditionFailedError){const cur=await read(path);res.status(409).json(cur||{});return;}
      throw e;
    }
  }catch(e){console.error('sync failed',e&&e.message);res.status(502).json({error:'failed'});}
};
