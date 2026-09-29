/* the real track of a train/subway ride between two stations, traced along OpenStreetMap's railway lines
   (Google doesn't give transit routes in Japan). Transfers happen at stations: every station links the tracks around it */
const cache=new Map();
const OVERPASS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
const pt=s=>{const m=String(s||'').split(',').map(Number);return m.length===2&&m.every(Number.isFinite)&&Math.abs(m[0])<=90&&Math.abs(m[1])<=180?m:null;};
const R=6371000,rad=Math.PI/180;
const dist=(a,b)=>{const x=(b[1]-a[1])*rad*Math.cos((a[0]+b[0])/2*rad),y=(b[0]-a[0])*rad;return Math.sqrt(x*x+y*y)*R;};
const TRANSFER=250,TRANSFER_COST=300;
/* shortest path along tracks from the station nearest a to the station nearest b */
function railPath(data,a,b){
  const pos=new Map(),adj=new Map(),stations=[];
  for(const e of data.elements||[])if(e.type==='node'){pos.set(e.id,[e.lat,e.lon]);if(e.tags&&/^(station|halt|stop)$/.test(e.tags.railway||''))stations.push(e.id);}
  const link=(u,v,w)=>{if(!adj.has(u))adj.set(u,[]);if(!adj.has(v))adj.set(v,[]);adj.get(u).push([v,w]);adj.get(v).push([u,w]);};
  const track=new Set();
  for(const e of data.elements||[])if(e.type==='way'&&e.nodes)for(let i=1;i<e.nodes.length;i++){const u=e.nodes[i-1],v=e.nodes[i];if(pos.has(u)&&pos.has(v)){link(u,v,dist(pos.get(u),pos.get(v)));track.add(u);track.add(v);}}
  if(!track.size)return null;
  /* each station joins the nearby track points of every line through it, so a route can change lines there */
  const tk=[...track];
  for(const s of stations){const sp=pos.get(s);const near=tk.filter(n=>dist(sp,pos.get(n))<=TRANSFER);
    const best=new Map();/* nearest point per ~50m cell keeps it small */
    for(const n of near){const d=dist(sp,pos.get(n)),c=Math.round(pos.get(n)[0]*2000)+':'+Math.round(pos.get(n)[1]*2000);if(!best.has(c)||best.get(c)[1]>d)best.set(c,[n,d]);}
    for(const [n,d] of best.values())link('s'+s,n,d+TRANSFER_COST/2);pos.set('s'+s,sp);}
  const nearest=p=>{let bn=null,bd=Infinity;for(const s of stations){if(!adj.has('s'+s))continue;const d=dist(p,pos.get(s));if(d<bd){bd=d;bn='s'+s;}}
    if(bd>400){for(const n of tk){const d=dist(p,pos.get(n));if(d<bd){bd=d;bn=n;}}}return bd<=800?bn:null;};
  const src=nearest(a),dst=nearest(b);if(!src||!dst||src===dst)return null;
  /* Dijkstra with a small binary heap */
  const D=new Map([[src,0]]),prev=new Map(),H=[[0,src]];
  const push=x=>{H.push(x);let i=H.length-1;while(i){const p=(i-1)>>1;if(H[p][0]<=H[i][0])break;[H[p],H[i]]=[H[i],H[p]];i=p;}};
  const pop=()=>{const t=H[0],l=H.pop();if(H.length){H[0]=l;let i=0;for(;;){const L=2*i+1,Rr=L+1;let m=i;if(L<H.length&&H[L][0]<H[m][0])m=L;if(Rr<H.length&&H[Rr][0]<H[m][0])m=Rr;if(m===i)break;[H[m],H[i]]=[H[i],H[m]];i=m;}}return t;};
  while(H.length){const [d,u]=pop();if(u===dst)break;if(d>D.get(u))continue;for(const [v,w] of adj.get(u)||[]){const nd=d+w;if(nd<(D.has(v)?D.get(v):Infinity)){D.set(v,nd);prev.set(v,u);push([nd,v]);}}}
  if(!D.has(dst))return null;
  const out=[];for(let u=dst;u!==undefined;u=prev.get(u))out.push(pos.get(u));out.reverse();
  /* a ride that wanders far more than the straight distance means the tracks didn't really connect */
  let len=0;for(let i=1;i<out.length;i++)len+=dist(out[i-1],out[i]);
  if(len>dist(a,b)*3+1500)return null;
  return simplify(out,6);
}
function simplify(p,tol){
  if(p.length<3)return p;const keep=new Uint8Array(p.length);keep[0]=keep[p.length-1]=1;const st=[[0,p.length-1]];
  while(st.length){const [i,j]=st.pop();let md=0,mi=-1;for(let k=i+1;k<j;k++){const d=segDist(p[k],p[i],p[j]);if(d>md){md=d;mi=k;}}if(md>tol){keep[mi]=1;st.push([i,mi],[mi,j]);}}
  return p.filter((_,i)=>keep[i]);
}
function segDist(p,a,b){const k=Math.cos(a[0]*rad)*R*rad,ax=a[1]*k,ay=a[0]*R*rad,bx=b[1]*k-ax,by=b[0]*R*rad-ay,px=p[1]*k-ax,py=p[0]*R*rad-ay;const l=bx*bx+by*by;const t=l?Math.max(0,Math.min(1,(px*bx+py*by)/l)):0;return Math.hypot(px-t*bx,py-t*by);}
async function overpass(q){
  let last;for(const u of OVERPASS){try{const r=await fetch(u,{signal:AbortSignal.timeout(28000),method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','user-agent':'tokyo-planner (vercel)'},body:'data='+encodeURIComponent(q)});if(r.ok)return await r.json();last=r.status;}catch(e){last=e.message;}}
  throw new Error('overpass '+last);
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const ref=req.headers.referer||'';
  if(ref&&!(ref.startsWith('https://tokyo-planner')&&ref.includes('.vercel.app/'))){res.status(403).json({error:'forbidden'});return;}
  const a=pt(req.query.a),b=pt(req.query.b);
  if(!a||!b||dist(a,b)>60000){res.status(400).json({error:'bad_query'});return;}
  const k=a.map(x=>x.toFixed(4)).join(',')+';'+b.map(x=>x.toFixed(4)).join(',');
  const c=cache.get(k);if(c){res.status(c.v?200:404).json(c.v||{error:'no_path'});return;}
  try{
    const pad=Math.max(0.006,Math.abs(a[0]-b[0])*0.3,Math.abs(a[1]-b[1])*0.3);
    const S=Math.min(a[0],b[0])-pad,N=Math.max(a[0],b[0])+pad,W=Math.min(a[1],b[1])-pad,E=Math.max(a[1],b[1])+pad,bb=`${S},${W},${N},${E}`;
    const q=`[out:json][timeout:25];(way["railway"~"^(subway|rail|light_rail|monorail|narrow_gauge)$"][!"service"](${bb}););out body;>;out skel qt;node["railway"~"^(station|halt|stop)$"](${bb});out;`;
    const path=railPath(await overpass(q),a,b);
    const v=path?{pts:path.map(([x,y])=>[+x.toFixed(5),+y.toFixed(5)])}:null;
    cache.set(k,{v});
    res.status(v?200:404).json(v||{error:'no_path'});
  }catch(e){console.error('rail',e.message);res.status(502).json({error:'failed'});}
};
module.exports.railPath=railPath;
