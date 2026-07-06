# Gerador simples do catálogo MT Studio
# Uso: python gerar_catalogo.py "CAMINHO_DA_PASTA_PACK"
# A pasta esperada pode seguir: FEMININO/01 ---- BERD/MODELO 01/(png,obj,ydd,ytd)
import os, re, json, shutil, sys
from pathlib import Path

src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('PACK ROUPAS')
out = Path('MT_STUDIO_CATALOGO_GERADO')
if out.exists(): shutil.rmtree(out)
(out/'assets'/'previews').mkdir(parents=True)
(out/'assets'/'models').mkdir(parents=True)
(out/'assets'/'files').mkdir(parents=True)
items=[]
for model_dir in sorted([p for p in src.rglob('*') if p.is_dir() and p.name.upper().startswith('MODELO')]):
    rel=model_dir.relative_to(src); parts=rel.parts
    if len(parts)<3: continue
    genero=parts[0].upper()
    cat_raw=parts[1]
    m=re.search(r'([A-Za-z0-9]+)\s*$', cat_raw)
    categoria=(m.group(1) if m else cat_raw).upper()
    modelo=re.sub(r'\D+','',model_dir.name).zfill(2)
    files=list(model_dir.iterdir())
    png=next((f for f in files if f.suffix.lower()=='.png'),None)
    obj=next((f for f in files if f.suffix.lower()=='.obj'),None)
    ydd=next((f for f in files if f.suffix.lower()=='.ydd'),None)
    ytd=next((f for f in files if f.suffix.lower()=='.ytd'),None)
    slug=f"{genero.lower()}_{categoria.lower()}_{modelo}"
    def cp(f,sub,ext):
        if not f: return ''
        dest=out/'assets'/sub/f"{slug}{ext}"
        shutil.copy2(f,dest)
        return str(dest.relative_to(out)).replace('\\','/')
    items.append({'id':slug,'nome':f'MODELO {modelo}','genero':genero,'categoria':categoria,'preview':cp(png,'previews','.png'),'obj':cp(obj,'models','.obj'),'ydd_path':cp(ydd,'files','.ydd'),'ytd_path':cp(ytd,'files','.ytd'),'ydd': ydd.name if ydd else '', 'ytd': ytd.name if ytd else '', 'pasta_original': str(rel).replace('\\','/')})
(out/'catalogo.json').write_text(json.dumps(items,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'catalogo-data.js').write_text('window.CATALOGO_MT = '+json.dumps(items,ensure_ascii=False)+';',encoding='utf-8')
print(f'Catálogo gerado com {len(items)} itens em {out}')
