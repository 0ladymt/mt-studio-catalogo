# Etapa 1 — Grupo 2: Home

Base: cd23729aa3c4a889b25e97be5fa6ae5e4da1c4f4, branch desenvolvimento-loja-mt.

## Continuidade

A manutenção removeu a pasta temporária antes do commit do Grupo 2. O bloco de 184 linhas aplicado anteriormente foi recuperado do registro integral desta conversa, sem redesenhar a Home. A validação final corrigiu apenas dois problemas: transição abrupta no fundo do CTA e 6 px de overflow em 360 px causados pela pincelada inclinada atrás de Rafa & Joy.

## Escopo e composição

O único arquivo de produção alterado é style.css. O conteúdo anterior desse arquivo permanece intacto; todos os seletores acrescentados começam com #page-home, inclusive dentro dos media queries. Nenhum HTML, JavaScript, dado, modelo, asset aprovado, câmera ou função foi alterado. Intro e páginas completas preservadas. Footer compartilhado preservado.

- Fundo contínuo preto/grafite/roxo escuro, textura discreta dos SVGs recuperados e ritmo de espaçamentos comum.
- Hero preserva texto e fotografia Kings; proporção 4:3 sem recorte adicional, integração inferior e botões alinhados.
- Faixa roxa chapada substituída por linha editorial discreta com pincelada de transição.
- Escolha como começar: fotos completas em 16:9, leve integração inferior, conteúdo sem blocos opacos, bordas e hover discretos; mesmos destinos.
- Projetos: coroa real acima do título, destaque maior para Kings e imagens na proporção original; removido o drip avulso daquele bloco.
- Carrossel: apenas superfície/bordas e integração da seção; drip preso à linha de transição. Renderização e carregamento intactos.
- Rafa & Joy: ilustração e máscara recuperadas preservadas; largura limitada a 390 px no desktop e 310 px no mobile, pincelada contida e coração da marca.
- CTA com luz roxa sutil, pincelada na transição e borboleta como assinatura secundária, finalizando no preto do footer.

## Validação real em Chromium headless

Home carregada com código e assets reais do repositório. Fontes Bebas Neue e Montserrat servidas localmente no teste a partir dos pacotes @fontsource, correspondentes às famílias/pesos pedidos pelo site; não foi alterada a entrega das fontes no produto.

| Largura do viewport | Largura do documento | Imagens quebradas | Elementos Home fora da tela |
|---|---|---|---|
| 360 | 360 | 0 | 0 |
| 390 | 390 | 0 | 0 |
| 768 | 768 | 0 | 0 |
| 1366 | 1366 | 0 | 0 |
| 1920 | 1920 | 0 | 0 |

Inspeção visual de capturas desktop, tablet e celular: hero, escolha, projetos, catálogo, Rafa & Joy, CTA e footer. Fotografias preservam proporções; nenhuma nova tesoura/corte CSS sobre o conteúdo importante. A fotografia Kings já possui a cabeça fora do enquadramento original e foi preservada.

Interações em 1366 e 390 px: produtos prontos abre Loja; sob encomenda abre Catálogo; próximo trio troca os modelos; Ver modelo abre o diálogo e Escape fecha; projeto abre a galeria e Escape fecha; Conheça a MT abre Sobre; menu móvel retorna à Home; destino do CTA Discord preservado. Navegação superior também verificada entre as páginas existentes.

node scripts/check-site.mjs e git diff --check passaram. Verificação do CSS confirmou que o bloco anterior está intacto e todos os seletores novos são exclusivos da Home.

## Limites

O Chromium executou sem aceleração gráfica: o carrossel e o modal foram verificados com a alternativa em imagens já existente. Rotação WebGL e desempenho em aparelho físico não foram certificados neste grupo. A entrega externa do Google Fonts não foi testada; as mesmas fontes foram carregadas localmente para a inspeção. Não foram executados novos testes da intro nem revisões das outras páginas.

Capturas finais (redimensionadas/comprimidas para documentação, sem modificar a composição):

- [Desktop](home-grupo-2/desktop.jpg)
- [Mobile](home-grupo-2/mobile.jpg)

Grupo 3 não iniciado.
