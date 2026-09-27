/* draws a few category icons from a name with Claude, in the app's line style (24×24, white strokes) */
const hits=new Map();
const SHAPES=/<(path|circle|rect|line|polyline|polygon|ellipse)\b([^<>]*?)\/?>/gi;
const ATTRS=/(?:^|\s)(d|cx|cy|r|rx|ry|x|y|x1|y1|x2|y2|width|height|points|fill|stroke|stroke-width)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
/* keep only plain shapes and geometry, so nothing but lines can reach the page */
function clean(svg){
  const out=[];let m;
  SHAPES.lastIndex=0;
  while((m=SHAPES.exec(svg))&&out.length<12){
    const at=[];let a;ATTRS.lastIndex=0;
    while((a=ATTRS.exec(m[2]))){
      const k=a[1].toLowerCase(),v=(a[2]??a[3]).trim();
      if(k==='fill'||k==='stroke'){if(/^(none|#fff|#ffffff|white)$/i.test(v))at.push(`${k}="${v}"`);continue;}
      if(k==='d'?/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]{1,1500}$/.test(v):/^[0-9.,\s-]{1,300}$/.test(v))at.push(`${k}="${v}"`);
    }
    if(at.length)out.push(`<${m[1].toLowerCase()} ${at.join(' ')}/>`);
  }
  return out.join('');
}
const PROMPT=name=>`Design 4 different simple icons for a map category called "${name}" in a Tokyo trip planner.
Style: a 24x24 viewBox line icon like Lucide or Feather. White strokes, stroke-width 2, round caps, no fill. Keep each to 1-5 shapes, bold and readable at 20px inside a colored circle. Keep shapes within 3..21 on both axes. Make the 4 ideas visibly different from each other.
Reply with only the 4 icons, one per line, each as <svg viewBox="0 0 24 24">...</svg> using only path, circle, rect, line, polyline, polygon or ellipse. No other text.`;
async function draw(name){
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({model:'claude-sonnet-5',max_tokens:4000,thinking:{type:'disabled'},messages:[{role:'user',content:PROMPT(name)}]})});
  if(!r.ok){const t=await r.text().catch(()=>'');throw new Error(`ai ${r.status} ${t.slice(0,200)}`);}
  const j=await r.json(),text=(j.content||[]).map(c=>c.text||'').join('').replace(/\\"/g,'"');
  /* one icon per <svg>; if the wrappers are missing, treat each line as one icon */
  let list=text.match(/<svg[\s\S]*?<\/svg>/gi)||[];
  if(!list.length)list=text.split(/\n/);
  const icons=list.map(clean).filter(Boolean).slice(0,4);
  if(!icons.length)throw new Error(`no_icons stop=${j.stop_reason} blocks=${(j.content||[]).map(c=>c.type).join(',')} `+JSON.stringify(text.slice(0,200)));
  return icons;
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!process.env.ANTHROPIC_API_KEY){res.status(503).json({error:'not_configured'});return;}
  const ref=req.headers.referer||'';
  if(ref&&!(ref.startsWith('https://tokyo-planner')&&ref.includes('.vercel.app/'))){console.error('icon: blocked referer',ref);res.status(403).json({error:'forbidden'});return;}
  const name=String(req.query.name||'').trim().slice(0,40);
  if(!name){res.status(400).json({error:'bad_query'});return;}
  const ip=String(req.headers['x-forwarded-for']||'').split(',')[0],now=Date.now();
  const h=(hits.get(ip)||[]).filter(t=>now-t<3600e3);
  if(h.length>=40){res.status(429).json({error:'busy'});return;}
  h.push(now);hits.set(ip,h);
  /* a second try covers a busy moment or an odd reply */
  for(let a=0;a<2;a++){
    try{res.status(200).json({icons:await draw(name)});return;}
    catch(e){console.error(`icon: try ${a+1} for "${name}" failed:`,e.message);}
  }
  res.status(502).json({error:'failed'});
};
