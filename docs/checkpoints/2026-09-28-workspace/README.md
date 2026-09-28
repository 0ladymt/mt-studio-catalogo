# Checkpoint de preservação — 28/09/2026

Este checkpoint preserva o workspace que continuou acessível após a manutenção, sem substituir o código ativo por uma cópia mais antiga.

- Branch de destino: desenvolvimento-loja-mt.
- Referência remota anterior: f1a07c645247368fa40e4814e5eaab26dc6bc87c.
- Checkpoint local completo: 3c45db145adc467561900a42c4da785aab54ca80 (392 arquivos em relação ao HEAD local anterior 0208344).
- A árvore sobrevivente difere do remoto em apenas quatro arquivos. As cópias integrais desses quatro arquivos estão nesta pasta, nos mesmos caminhos relativos. Todos os outros arquivos são idênticos aos de f1a07c6.
- Para consultar o estado sobrevivente completo, use a árvore de f1a07c6 e estas quatro cópias. Não aplique essas cópias automaticamente ao site: app.js e a documentação antecedem correções já existentes no remoto.
- O código ativo do site não foi modificado neste checkpoint.
- A branch principal/main não foi alterada.

## Limitação identificada antes da Etapa 1

A manutenção removeu /workspace/mt-studio-reconstruido e /workspace/sites/mt-studio-revisao. A reconstrução mais recente ainda não havia sido commitada. O Site de revisão appgprj_6abaa113b9308191b46fdb5ad426e2a6 não tinha versões salvas, e a busca por arquivos da reconstrução na Library não encontrou os fontes.

A reconstrução removida incluía SVGs da identidade MT, máscara vetorial de Rafa & Joy, abertura progressiva em Canvas sobre parede escura, studio3d.js, suavização de normais preservando posições/UVs, 360 miniaturas em fundo grafite, categorias de entrada da loja e ajustes visuais globais. A validação já havia inspecionado desktop de Home, Sobre, Redes, Projetos, Catálogo, Loja e Painel; cadastro/edição local e filtros funcionaram. O navegador estava com WebGL desativado; rotação 3D e responsividade ainda não tinham validação completa. Isso não equivale a arquivos recuperados nem a aprovação final.

Os comandos de reconstrução permanecem registrados na conversa, mas seus arquivos resultantes não estão presentes no workspace. Não foi iniciada uma nova implementação da Etapa 1 sobre o estado antigo.
