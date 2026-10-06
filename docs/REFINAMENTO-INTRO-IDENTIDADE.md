# Refinamento — intro e composição visual global

Base: `4fd3e1d35ff0b79c87d264c2d3284a99427e9dee`, branch `desenvolvimento-loja-mt`. Estado local e remoto conferidos antes das alterações; workspace inicialmente limpo. Nenhum commit anterior revertido ou reescrito.

## Fontes e escopo

Manual original `Manual_da_Marca_MT_Studio_Criativo_2026(3).pdf`, oito páginas inspecionadas visualmente, com atenção à paleta/tipografia (p. 5) e grafismos (p. 6). Paleta mantida: preto #000000, branco #FFFFFF, roxo #A320FF, lilás #D88BFF e apoio grafite #1F1F24. Mantidas Bebas Neue/Montserrat e as marcas recuperadas. Referência original da borboleta grafitada revisada; não é carregada pela intro nem amostrada para gerar o desenho.

Esta execução trata apenas da materialidade da intro e de detalhes globais de identidade/composição. A estrutura da Home, textos, fotografias, ilustração Rafa & Joy, links, carrossel, catálogo, visualizador e demais funcionalidades permanecem. Não há revisão individual de Loja, Sobre, Redes, Projetos ou painel nesta etapa.

## Modificações

- `intro.js`: parede mais escura com granulação, relevo e pequenos poros procedurais; ajustes visuais em quatro trajetórias de spray para ampliar as asas; pigmentos derivados das cores do manual, pressão/cobertura variáveis, falhas espaciais, oscilação do bico, partículas elípticas, highlights interrompidos e respingos localizados. Acúmulos de tinta geram mais escorridos com espessura variável. A camada de pigmento ganhou margem transparente de 64 unidades para evitar corte do overspray, sem mudar a escala do desenho na tela. A borboleta continua construída por deposição temporal de tinta nativa em Canvas transparente, sem PNG/SVG pronto, máscaras ou imagem de referência carregada.
- `style.css`: apêndice pequeno que preserva todas as regras anteriores. Textura recuperada no fundo global, pincelada funcionando como entrada dos overlines, acabamento da borda do cabeçalho, tinta em transições já existentes da Home, coroa como assinatura, reforço discreto do grunge nas margens e do fundo da composição. Ajustes somente de opacidade na integração existente de Rafa & Joy. Sem novo grid, reordenação, cortes de imagens ou fundos roxos chapados. Tratamentos menores no mobile e foco do botão Pular. Elementos gráficos vêm exclusivamente de `assets/brand` já recuperados.
- `index.html`: somente versionamento dos URLs de `style.css` e `intro.js` para evitar carregar as versões anteriores por cache. Todo o HTML estrutural e os links permanecem idênticos.
- `scripts/check-intro.cjs`: acrescentados Canvas de tablet, verificação de quadros intermediários distintos e bordas transparentes do Canvas de pigmento; preservadas as verificações anteriores.
- Este relatório e três quadros de validação em `docs/refinamento-intro-identidade/`.

## Lógica preservada

Pintura de 7,1 s, pausa de 650 ms, assinatura MT Studio somente depois, permanência de 1,5 s e saída. Preservados Pular abertura, Escape, Tab/foco, inert, rolagem, repetição pelo rodapé, regra de primeira visita à Home e prefers-reduced-motion (inclusive mudança da preferência durante a animação). Esses trechos foram comparados com o commit base e permanecem iguais.

## Testes e inspeção

- `node scripts/check-intro.cjs`: PASSOU. Pintura progressiva, quadros temporalmente distintos, assinatura ausente durante pintura/pausa, assinatura posterior, encerramento, pular, Escape, foco/inert/rolagem, reduced-motion inicial e alteração durante execução. Canvas nativo inspecionado em desktop 1366 × 768, tablet 768 × 1024 e mobile 390 × 844. Canvas de pigmento com bordas transparentes: sem placa/fundo retangular próprio.
- Quadros nativos de desktop, tablet e mobile inspecionados: pintura completa dentro do enquadramento e contraste sobre parede escura. Capturas intermediárias a 1,6 s, 3,8 s e final confirmam construção progressiva. Os JPEGs deste relatório mostram somente a superfície Canvas; não incluem a assinatura/controles em HTML e não são screenshots de navegador.
- `node scripts/check-site.mjs`: PASSOU. Sintaxe, páginas, grafismos e caminhos; 360 modelos e sete projetos presentes.
- `node scripts/check-catalog-viewer.mjs`: PASSOU. Smoke test das transições seguras do visualizador, câmera, busca e filtros, sem alteração de seus arquivos.
- Comparação: HTML idêntico à base removendo apenas os dois parâmetros de versão; CSS antigo preservado como prefixo byte a byte; recursos da intro preservados; todos os URLs de grafismos adicionados resolvem para assets locais existentes. Nenhuma alteração em modelos, miniaturas ou dados.
- `git diff --check`: PASSOU. Revisadas as extensões dos pseudo-elementos: restritas aos containers e sem mudanças de largura dos layouts existentes. Isso é revisão de código, não medição de overflow em navegador.

## Limitações reais

O Chromium local foi removido pela manutenção e não pôde ser reinstalado: a rede de saída falhou por proxy indisponível. A prévia local foi iniciada, mas o navegador remoto retornou `net::ERR_BLOCKED_BY_CLIENT` para o endereço local. Por isso esta execução não certifica fluidez em navegador/dispositivo real, overflow calculado, composição final de HTML/CSS, comportamento de cache no browser ou interação por toque. Os testes de Canvas e estados não substituem essas verificações.

A tinta/parede são uma simulação procedural, com interpretação das trajetórias da referência. O resultado é uma proposta estilizada de graffiti, não uma filmagem nem reprodução literal/fotográfica do mural. A aprovação artística continua dependendo da revisão da Rafa.

## Quadros de validação nativa

- [Desktop — Canvas](refinamento-intro-identidade/desktop.jpg)
- [Tablet — Canvas](refinamento-intro-identidade/tablet.jpg)
- [Mobile — Canvas](refinamento-intro-identidade/mobile.jpg)

Nenhuma próxima grande área foi iniciada.
