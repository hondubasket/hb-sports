/* Galería de fotos HB Sports: renderGaleria(fotos, base) devuelve HTML; abre visor al tocar */
(function(){
  const css=`.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.gal button{all:unset;cursor:zoom-in;display:block;border-radius:12px;overflow:hidden;aspect-ratio:3/2;background:#e9e7ef;position:relative}
.gal button:focus-visible{outline:3px solid #E8610A;outline-offset:2px}
.gal img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}
.gal button:hover img{transform:scale(1.04)}
.gal span{position:absolute;left:0;right:0;bottom:0;padding:18px 10px 8px;color:#fff;font:600 12.5px Inter,system-ui,sans-serif;background:linear-gradient(transparent,rgba(0,0,0,.65))}
.lb{position:fixed;inset:0;background:rgba(10,8,20,.92);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px}
.lb[hidden]{display:none}
.lb img{max-width:100%;max-height:82vh;border-radius:10px}
.lb figcaption{color:#eee;text-align:center;margin-top:10px;font:500 14px Inter,system-ui,sans-serif}
.lb .x,.lb .pv,.lb .nx{position:absolute;background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:99px;width:44px;height:44px;font-size:22px;cursor:pointer}
.lb .x{top:16px;right:16px}.lb .pv{left:12px;top:50%}.lb .nx{right:12px;top:50%}
@media (prefers-reduced-motion:reduce){.gal img{transition:none}}`;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let cur=[],i=0,box=null;
  function show(){const f=cur[i];box.querySelector('img').src=f.url;box.querySelector('img').alt=f.titulo||"";box.querySelector('figcaption').textContent=f.titulo||""}
  function open(list,n){cur=list;i=n;if(!box){box=document.createElement('div');box.className='lb';box.innerHTML='<button class="x" aria-label="Cerrar">×</button><button class="pv" aria-label="Anterior">‹</button><figure><img alt=""><figcaption></figcaption></figure><button class="nx" aria-label="Siguiente">›</button>';document.body.appendChild(box);
    box.addEventListener('click',e=>{if(e.target===box||e.target.classList.contains('x'))close();else if(e.target.classList.contains('pv')){i=(i-1+cur.length)%cur.length;show()}else if(e.target.classList.contains('nx')){i=(i+1)%cur.length;show()}});
    document.addEventListener('keydown',e=>{if(box.hidden)return;if(e.key==='Escape')close();if(e.key==='ArrowLeft'){i=(i-1+cur.length)%cur.length;show()}if(e.key==='ArrowRight'){i=(i+1)%cur.length;show()}})}
    box.hidden=false;show()}
  function close(){box.hidden=true}
  window.renderGaleria=function(fotos,base,el,limit){
    const list=fotos.map(f=>({...f,url:(base||"")+f.src}));const shown=limit?list.slice(0,limit):list;
    el.innerHTML=shown.length?`<div class="gal">${shown.map((f,n)=>`<button data-n="${n}" aria-label="Ver foto: ${esc(f.titulo||"")}"><img src="${esc(f.url)}" alt="${esc(f.titulo||"")}" loading="lazy">${f.titulo?`<span>${esc(f.titulo)}</span>`:""}</button>`).join("")}</div>`:"";
    el.querySelectorAll('.gal button').forEach(b=>b.addEventListener('click',()=>open(list,+b.dataset.n)));
    return shown.length;
  };
})();
