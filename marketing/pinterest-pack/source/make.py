import json, html
cards=json.load(open('cards.json'))
CSS='''
@font-face{font-family:Exposure;src:url(f/exposure.woff2) format("woff2");}
@font-face{font-family:Figtree;font-weight:400 800;src:url(f/figtree-latin.woff2) format("woff2");}
*{box-sizing:border-box;margin:0}
html,body{width:1000px;height:1500px;overflow:hidden}
body{font-family:Figtree,sans-serif;color:#0e1520;background:linear-gradient(180deg,#d9d5f0 0%,#e9e6f3 46%,#f7f5f3 100%);position:relative}
.sky{position:absolute;inset:0;background:radial-gradient(60% 30% at 18% 8%,rgba(255,255,255,.75),transparent 70%),radial-gradient(50% 24% at 88% 20%,rgba(255,255,255,.55),transparent 70%)}
.top{position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:14px;font-weight:700;font-size:34px;letter-spacing:-.01em}
.top img{width:52px;height:52px}
h1{position:absolute;left:72px;right:72px;top:168px;font-family:Exposure,serif;font-weight:500;font-size:84px;line-height:.98;letter-spacing:-.02em}
h1 em{font-style:italic}
p.sub{position:absolute;left:72px;right:120px;top:var(--subtop);font-size:31px;line-height:1.36;color:rgba(14,21,32,.72)}
.stage{position:absolute;left:0;right:0;bottom:118px;top:var(--stagetop);display:flex;align-items:center;justify-content:center;gap:22px}
.wide{width:900px;border-radius:22px;overflow:hidden;box-shadow:0 30px 80px rgba(14,21,32,.28),0 0 0 1px rgba(14,21,32,.08)}
.wide img{display:block;width:100%;height:100%;object-fit:cover;object-position:top left}
.phone{border-radius:56px;padding:12px;background:#0e1520;box-shadow:0 30px 80px rgba(14,21,32,.32)}
.phone img{display:block;border-radius:44px;width:100%}
.foot{position:absolute;left:72px;right:72px;bottom:46px;display:flex;justify-content:space-between;font-size:26px;font-weight:600;color:rgba(14,21,32,.75)}
'''
for c in cards:
    n=len(c['shots'])
    shots=''
    for s,kind in c['shots']:
        if kind=='wide':
            shots+=f'<div class="wide" style="height:var(--wideh)"><img src="img/{s}.png"></div>'
        else:
            w=480 if n==1 else 285
            shots+=f'<div class="phone" style="width:{w}px"><img src="img/{s}.png"></div>'
    doc=f'''<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body style="--subtop:var(--st,380px);--stagetop:var(--gt,560px)"><div class="sky"></div>
<div class="top"><img src="f/needt-icon.svg">Needt</div>
<h1>{html.escape(c['a'])}<br><em>{html.escape(c['b'])}</em></h1>
<p class="sub">{html.escape(c['sub'])}</p>
<div class="stage" id="stage">{shots}</div>
<div class="foot"><span>needt.app</span><span>Free to start</span></div>
<script>
const h=document.querySelector('h1'),p=document.querySelector('p.sub'),st=document.getElementById('stage');
document.fonts.ready.then(()=>{{p.style.top=(h.offsetTop+h.offsetHeight+30)+'px';st.style.top=(p.offsetTop+p.offsetHeight+50)+'px';
const avail=st.clientHeight;document.querySelectorAll('.wide').forEach(w=>{{const i=w.querySelector('img');const r=i.naturalHeight/i.naturalWidth;w.style.height=Math.min(avail,900*r)+'px'}});
document.querySelectorAll('.phone').forEach(ph=>{{const i=ph.querySelector('img');const r=i.naturalHeight/i.naturalWidth;const maxW=(avail-24)/r+24;if(ph.offsetWidth>maxW)ph.style.width=maxW+'px'}});
document.body.dataset.ready=1}});
</script></body></html>'''
    open(f"{c['id']}.html",'w').write(doc)
print('ok')
