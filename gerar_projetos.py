from pathlib import Path
import json
import re

EXTS = {".png", ".jpg", ".jpeg", ".webp"}

root = Path(__file__).resolve().parent
pasta = root / "assets" / "projetos"
saida = root / "projetos-data.js"

pasta.mkdir(parents=True, exist_ok=True)

def titulo_bonito(nome: str) -> str:
    nome = re.sub(r"^\d+\s*[-_ ]*", "", nome)
    nome = nome.replace("-", " ").replace("_", " ").strip()
    return nome.title() if nome else "Projeto MT Studio"

projetos = []

# MODO IDEAL:
# assets/projetos/NOME DO PROJETO/foto1.png, foto2.png...
subpastas = sorted([p for p in pasta.iterdir() if p.is_dir()], key=lambda p: p.name.lower())

for sub in subpastas:
    imagens = sorted([p for p in sub.iterdir() if p.suffix.lower() in EXTS], key=lambda p: p.name.lower())
    if not imagens:
        continue

    projetos.append({
        "titulo": titulo_bonito(sub.name),
        "categoria": "Projeto MT Studio",
        "capa": f"assets/projetos/{sub.name}/{imagens[0].name}",
        "fotos": [f"assets/projetos/{sub.name}/{img.name}" for img in imagens],
        "descricao": "projeto produzido pela MT Studio."
    })

# Se tiver imagens soltas em assets/projetos, agrupa tudo em um único projeto.
soltas = sorted([p for p in pasta.iterdir() if p.is_file() and p.suffix.lower() in EXTS], key=lambda p: p.name.lower())

if soltas:
    projetos.append({
        "titulo": "Galeria MT Studio",
        "categoria": "Projetos",
        "capa": f"assets/projetos/{soltas[0].name}",
        "fotos": [f"assets/projetos/{img.name}" for img in soltas],
        "descricao": "projeto produzido pela MT Studio."
    })

conteudo = "window.PROJETOS_MT = " + json.dumps(projetos, ensure_ascii=False, indent=2) + ";\n"
saida.write_text(conteudo, encoding="utf-8")

print(f"Projetos encontrados: {len(projetos)}")
print(f"Arquivo atualizado: {saida}")
print("")
print("Dica: para ficar organizado, crie uma pasta para cada projeto dentro de assets/projetos.")
print("Exemplo: assets/projetos/Projeto Kings/01.png, 02.png, 03.png")
