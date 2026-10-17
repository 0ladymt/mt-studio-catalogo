# Etapa 1 — grupo 1: abertura

Base: 0d00abb2665370bbf0fe82e18cea70f605f1e878, branch desenvolvimento-loja-mt. Somente intro.js foi alterado no código do site. Nenhum asset compartilhado, CSS ou outra seção foi modificado.

## Implementação

A borboleta não carrega PNG/SVG, não amostra pixels da referência e não revela uma imagem por máscara. São 47 gestos cúbicos de um bico de pintura, traçados manualmente a partir da composição assimétrica do mural fornecido. Cada trajetória deposita partículas persistentes num Canvas transparente, com pressão variável, bordas de spray, cobertura irregular, respingos localizados e camadas pretas, roxas e claras. O Canvas é composto sobre uma parede escura de textura procedural que ocupa a tela inteira, sem placa ou fundo próprio da borboleta.

Seis escorridos nascem em pontos de acúmulo de tinta e aumentam de comprimento com o tempo. Após aproximadamente 7,1 segundos de pintura, há 650 ms de pausa; só então a assinatura MT Studio existente aparece. A assinatura permanece por 1,5 s antes da transição já existente para a Home.

Preservados: Pular abertura, Escape, repetição pelo rodapé, isolamento/foco do diálogo, restauração do foco e da rolagem, preferência de movimento reduzido e interrupção quando essa preferência muda.

## Validação realizada

- node --check intro.js e node scripts/check-site.mjs passaram.
- scripts/check-intro.cjs executa o código real da intro com Canvas nativo e DOM/relógio simulados; depende de @napi-rs/canvas no ambiente de teste.
- Testados: progressão temporal, assinatura ausente durante pintura e pausa, assinatura posterior, fechamento, botão Pular, Escape, restauração de foco/inert/rolagem, reduced-motion inicial e alteração durante execução.
- Quadros inspecionados a 1,6 s, 7,6 s e conclusão em 1366×768 e 390×844: pintura progressiva, partículas e escorridos, sem retângulo ou fundo próprio ao redor da borboleta. O teste também gera quadros intermediários a 3,8 s e 7,104 s.
- Verificação do código: nenhum carregamento de graffiti.svg/png, amostragem de imagem ou máscara de revelação. drawImage apenas compõe o Canvas pintado durante a execução; o único SVG carregado pela intro é a assinatura da marca.
- git diff --check passou.

## Limitações e aproximações

As trajetórias são uma interpretação manual do mural, não uma reprodução exata da fotografia. O spray, a textura da parede e a gravidade dos escorridos são simulados; não há filmagem de tinta real. A qualidade artística final depende da revisão de Rafa.

Não foi possível validar em navegador nesta execução: o navegador remoto retornou ERR_BLOCKED_BY_CLIENT para a prévia local; downloads oficiais do Chromium não forneceram um arquivo instalável. Os testes de Canvas/DOM não certificam fluidez em dispositivos reais, composição CSS final ou transição da assinatura no navegador. Essa limitação é explicitada na entrega; nenhuma validação de navegador é alegada.

Nenhum outro grupo da Etapa 1 foi iniciado.
