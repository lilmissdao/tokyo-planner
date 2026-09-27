module.exports=async(req,res)=>{
  const KEY=process.env.GOOGLE_MAPS_API_KEY;
  if(!KEY){res.status(503).end();return;}
  const ref=req.headers.referer||'';
  if(ref&&!(ref.startsWith('https://tokyo-planner')&&ref.includes('.vercel.app/'))){res.status(403).end();return;}
  const {name,w}=req.query;
  if(!new RegExp('^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$').test(name||'')){res.status(400).end();return;}
  const width=Math.min(1600,Math.max(100,parseInt(w,10)||400));
  try{
    const r=await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=${width}&skipHttpRedirect=true&key=${KEY}`);
    const j=await r.json();
    if(!j.photoUri){res.status(404).end();return;}
    res.setHeader('Cache-Control','private, max-age=3000');
    res.writeHead(302,{Location:j.photoUri});res.end();
  }catch(e){res.status(502).end();}
};
