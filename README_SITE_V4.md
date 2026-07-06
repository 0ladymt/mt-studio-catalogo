# MT Studio Catálogo Site V4

## Substitua na pasta do catálogo

```txt
index.html
style.css
app.js
projetos-data.js
gerar_projetos.py
```

## Mudanças principais

- Identidade visual ajustada para roxo, branco e preto.
- Tons rosa removidos.
- Página Sobre corrigida com os textos pedidos.
- Missão reescrita com mais relação com a MT Studio.
- Página Projetos agora é organizada por projeto.
- Clique no projeto abre galeria grande com miniaturas na lateral.

## Como organizar os projetos

O melhor jeito é criar uma pasta para cada projeto:

```txt
assets/projetos/
├── Projeto Kings/
│   ├── 01.png
│   ├── 02.png
│   └── 03.png
├── Projeto MDC/
│   ├── frente.png
│   └── costas.png
└── Projeto Black Forge/
    ├── 01.png
    └── 02.png
```

Depois rode:

```bash
python gerar_projetos.py
```

Ele vai criar o `projetos-data.js`.

## Se você deixar fotos soltas

Se as fotos ficarem soltas dentro de `assets/projetos`, o script vai agrupar tudo em um único projeto chamado:

```txt
Galeria MT Studio
```

Para ficar com nomes bonitos e organizado, use subpastas.
