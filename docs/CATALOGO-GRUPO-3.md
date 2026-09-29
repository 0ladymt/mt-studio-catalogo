# Etapa 1 — Grupo 3: catálogo e visualizador

Base exclusiva: `37cf7f64adf29da3261c11fb0c6c3f57fdcfb180`, branch `desenvolvimento-loja-mt`.

## Reconstrução e escopo

Os arquivos temporários da execução anterior foram perdidos na manutenção. O módulo do visualizador, os estilos restritos ao catálogo e os testes foram reconstituídos pelo registro técnico da conversa, com autorização da Rafa. O comportamento foi preservado; o código e os valores de composição CSS não podem ser considerados uma recuperação literal ou idêntica pixel a pixel da versão perdida.

Arquivos do grupo:

- `app.js`: nove linhas de integração. O novo visualizador é chamado apenas quando `page-catalogo` está ativa; os controles delegam apenas enquanto essa instância está aberta.
- `catalog-viewer.js`: visualizador isolado, carregamento cancelável, preparação e primeira renderização antes da troca, navegação pela lista filtrada, câmera por dimensões e limpeza ao fechar.
- `style.css`: apêndice com seletores exclusivamente `#page-catalogo` ou `#modal.catalog-viewer`; o CSS anterior permanece intacto.
- `scripts/check-catalog-framing.mjs`: verificação da margem em todas as geometrias reais.
- `scripts/check-catalog-viewer.mjs`: testes determinísticos da transição de estados, controles, teclado e filtros.
- `docs/CATALOGO-GRUPO-3.md`: este relatório.

Nenhuma alteração em HTML, intro, código da Home/carrossel, loja, painel, Sobre, Redes ou Projetos. Nenhuma alteração em dados, OBJ, miniaturas ou grafismos recuperados.

## Resultado implementado

Vitrine em grafite, três colunas no desktop e duas em telas menores, nomes mais destacados, gênero/categoria discretos, referências técnicas ainda acessíveis em `details`, botões com contraste roxo discreto. Filtros alinhados, busca em linha inteira no mobile. A pincelada `underline.svg` recuperada funciona como assinatura do título; nenhuma nova arte foi criada. A quebra do cabeçalho em tablet e a contenção de textos das estatísticas tratam o overflow de tablet registrado antes da perda dos arquivos.

As 360 miniaturas existentes em grafite foram mantidas sem regeneração. O visualizador também usa grafite. A câmera centraliza a caixa real do objeto e mede a distância máxima dos vértices ao centro. A esfera resultante contém a peça em qualquer rotação; a distância considera o menor campo de visão vertical/horizontal e margem de 12%. Não se usa uma distância fixa por unidade do arquivo. O zoom mais próximo é limitado ao enquadramento seguro e o pan é desativado para evitar cortes; é possível afastar até três vezes essa distância.

Durante a troca, a cena, o canvas, a peça e o título atuais permanecem. A próxima peça é buscada, parseada, preparada e compilada antes de atualizar a cena e executar a primeira renderização no mesmo turno de JavaScript. Só então o título muda e a peça anterior é liberada. Token e AbortController protegem contra cargas antigas e fechamento durante a carga. O timeout é de 20 segundos. Erros mantêm a peça atual e permitem repetir a navegação.

A primeira abertura mantém uma prévia decodificada até o 3D ficar pronto. Sem WebGL, a prévia estática é apresentada com aviso explícito e controles 3D desativados. O botão Fechar permanece disponível. Escape, foco de retorno e a contenção de Tab/Shift+Tab do site foram preservados. O status anuncia o carregamento por `aria-live`; seus atributos são restaurados ao fechar para não alterar o modal usado pela Home.

## Verificações concluídas nesta reconstrução

- `node scripts/check-catalog-framing.mjs`: PASSOU. Todos os 360 OBJ, seis proporções de viewport (0,35; 0,42; 0,7; 1; 1,8; 2,6). Todos os vértices dentro da esfera; a esfera projetada ocupa no máximo 0,891689 do semiquadro. Isso demonstra margem em qualquer yaw/pitch. Raios de 0,053495 a 0,789308. Verificada invariância de escala.
- Miniaturas via Pillow: PASSOU. 360 arquivos, 512 × 512, grafite RGB (39,39,46) nos quatro cantos, conteúdo existente e afastado de todas as bordas; margem mínima de 42 px.
- `node scripts/check-catalog-viewer.mjs`: PASSOU. Primeira renderização, carga lenta mantendo cena/canvas/título, troca após preparação, falha de arquivo mantendo peça, resposta antiga após nova carga, fechamento durante carga, Escape e retorno de foco. Câmera redimensionada em quatro formatos (1000 × 560, 688 × 500, 350 × 420 e 320 × 390). Cor, brilho e reset; fallback sem WebGL; falha de imagem inicial. Tab e Shift+Tab exercitam o manipulador compartilhado original.
- Filtros: PASSOU. Função original executada com todos os 360 registros, busca por nome, ID, categoria, YDD, YTD e pasta original; combinação gênero/categoria, exclusão por gênero e resultado vazio.
- `node scripts/check-site.mjs`: PASSOU. Sintaxe, páginas, caminhos e referências; 360 modelos e sete projetos.
- `node --check catalog-viewer.js`, `node --check scripts/check-catalog-viewer.mjs` e `git diff --check`: PASSARAM.
- Preservação: hashes dos arquivos materializados comparados à árvore do commit base. Só `app.js` e `style.css` diferem entre arquivos existentes. Removidas virtualmente as nove linhas de delegação, `app.js` é idêntico ao original. O CSS original é um prefixo byte a byte do atual; todos os seletores adicionais são restritos ao catálogo/modal. Dados e arquivos dos 360 modelos/miniaturas permanecem idênticos.

## Limitação real

Nesta execução o Chromium anterior foi removido pela manutenção. O Playwright existe, mas não há binário de navegador instalado; o acesso de rede do processo local falhou tanto pelo proxy indisponível quanto por resolução DNS, impedindo reinstalação. Portanto não foi possível repetir capturas, inspeção visual desktop/tablet/mobile, medição de overflow no DOM real ou rasterização WebGL no navegador.

O teste de estados usa adaptadores explícitos de DOM e renderer, com Three.js e geometrias reais. Ele confirma a lógica e a matemática, mas não mede fluidez, shader/GPU, layout CSS calculado, toque real ou leitores de tela. As regras responsivas foram revisadas e o redimensionamento da câmera testado; isso não substitui validação visual real. A execução anterior havia registrado WebGL no Chromium, mas não é usada como comprovação desta reconstrução.

O Grupo 3 é preservado no remoto com essa limitação documentada. Nenhum trabalho do Grupo 4 foi iniciado.
