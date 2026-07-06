# MT Studio Catálogo Site V3

## Arquivos para substituir

Substitua na pasta do catálogo:

```txt
index.html
style.css
app.js
projetos-data.js
gerar_projetos.py
```

## Correções feitas

- Ícone do botão Discord agora é SVG do Discord.
- Links atualizados:
  - Discord: https://discord.gg/eUtDc9KStc
  - Instagram: https://www.instagram.com/mt_studiocriativo/
  - TikTok: https://www.tiktok.com/@mt_studiocriativo?_r=1&_t=ZS-95TIQCHu8N5
- WhatsApp removido.
- Página Sobre refeita em estilo mais profissional.
- Página Redes refeita no estilo de cartões centralizados.
- Visualizador 3D ajustado para evitar tela branca.
- Caminhos de OBJ/PNG são normalizados para navegador.
- Projetos agora usam `projetos-data.js`.

## Como funciona a aba Projetos

Como o site é estático, ele não consegue listar automaticamente uma pasta sozinho no navegador.

O fluxo correto é:

1. Coloque as fotos em:

```txt
assets/projetos/
```

2. Na pasta principal do catálogo, rode:

```bash
python gerar_projetos.py
```

3. Ele vai gerar/atualizar:

```txt
projetos-data.js
```

4. Faça Commit + Push.

## Importante

Se a tela 3D continuar branca, abra o DevTools do navegador com F12 e veja se aparece erro 404 no arquivo `.obj`.
