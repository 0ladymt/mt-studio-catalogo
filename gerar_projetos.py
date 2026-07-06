from pathlib import Path
import json

EXTS = {".png", ".jpg", ".jpeg", ".webp"}

root = Path(__file__).resolve().parent
pasta = root / "assets" / "projetos"
saida = root / "projetos-data.js"

pasta.mkdir(parents=True, exist_ok=True)

imagens = sorted([p for p in pasta.iterdir() if p.suffix.lower() in EXTS])

projetos = []
for i, img in enumerate(imagens, start=1):
    nome = img.stem.replace("-", " ").replace("_", " ").strip().title()
    projetos.append({
        "titulo": nome or f"Projeto {i:02d}",
        "categoria": "Projeto MT Studio",
        "imagem": f"assets/projetos/{img.name}",
        "descricao": "Projeto produzido pela MT Studio."
    })

conteudo = "window.PROJETOS_MT = " + json.dumps(projetos, ensure_ascii=False, indent=2) + ";\n"
saida.write_text(conteudo, encoding="utf-8")

print(f"Projetos encontrados: {len(projetos)}")
print(f"Arquivo atualizado: {saida}")
