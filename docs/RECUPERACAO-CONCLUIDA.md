# Encerramento da etapa de recuperação — MT Studio

Branch exclusiva: `desenvolvimento-loja-mt`. Base de preservação: `71bdb499022ded2b92ea5a60af32fee71c083c31`. O commit `f1a07c6` permaneceu apenas como base técnica. Nenhum commit anterior foi reescrito. Etapa 1 não iniciada.

## Estado recuperado

- HTML, navegação e composição registrados na recuperação; Home, Loja, Catálogo, Sobre, Redes, Projetos e painel local preservados.
- Treze SVGs nativos de marca, script de construção, máscara de Rafa & Joy, fundos escuros e composição com grafismos.
- Abertura progressiva por deposição de pigmentos da borboleta vetorial, parede escura, assinatura, pular/repetir e movimento reduzido.
- Iluminação comum, normais suavizadas preservando arestas e geometria, ajuste da câmera pela esfera envolvente, carregamento do próximo trio antes da troca e alternativa em imagem sem WebGL.
- 360 miniaturas grafite recuperadas a partir dos OBJs originais. O último grupo terminou com 60 imagens pendentes e oito reparos em lotes anteriores.
- Rafa & Joy/Sobre preservados pelo HTML, CSS e máscara já commitados; não foi criado um novo desenho nesta retomada.
- Loja/painel, seis redes, projetos e Discord `https://discord.gg/MAPubH3vRw` preservados no estado recuperado. Não foi acrescentado carrossel extra ao catálogo.

## Fidelidade e aproximações

Os nove commits anteriores foram recuperados integralmente do remoto, sem reaplicar nem reescrever seus grupos. A implementação reconstruída antes deles foi reproduzida a partir dos comandos e decisões registrados, mas os arquivos temporários anteriores à manutenção não estão disponíveis para comparação byte a byte.

Os SVGs derivados do manual rasterizado, os percursos/pigmentos da abertura e a máscara de Rafa & Joy são reconstruções programáticas aproximadas das referências. As miniaturas foram regeneradas dos modelos originais com os parâmetros registrados; diferenças binárias de renderização entre ambientes podem existir. Não se afirma equivalência pixel a pixel com a versão temporária perdida, nem aprovação artística final.

Diferenças intencionais nesta conclusão: reparo de PNGs vazios/inválidos; gravação atômica e verificada no renderizador para impedir substituição por arquivo incompleto; recuperação do teste de normais/UVs; remoção de um cache Python que entrou acidentalmente no commit de 3D. Nenhuma melhoria visual nova foi aplicada.

## Verificação desta retomada

- `node scripts/check-site.mjs`: 360 modelos, sete projetos, sintaxe, páginas e caminhos válidos.
- `node scripts/check-studio.mjs`: 360 malhas, posições e UVs intactos, normais finitas e arestas rígidas preservadas.
- Leitura completa dos 360 PNGs: 512 × 512, fundo RGB (39,39,46), conteúdo não vazio.
- Inspeção visual da prancha com as 68 miniaturas concluídas/reparadas.
- Os 68 modelos regenerados também passaram pela projeção em cinco proporções e 24 rotações do renderizador. O relatório completo já preservado em `scripts/preview-validation.json` registra 360 modelos e máximo NDC 0,86154.
- Treze SVGs analisados como XML, sem imagens raster embutidas. `git diff --check` sem erros.

## Limitações preservadas

Esta retomada validou imagens e código; não realizou uma nova validação completa do site no navegador. A verificação integral de responsividade, animações e rotação WebGL permanece pendente. A verificação anterior registrada não certificou WebGL no navegador disponível.

O painel continua sendo um editor de rascunhos locais: não há backend, autenticação, catálogo compartilhado nem checkout ativo. Isso é o estado recuperado, não uma loja operacional de vendas.

A branch principal remota (`main`) foi apenas consultada e permaneceu em `e629d6267142045111d4ded5458b8712ece90e6e`. A cópia local antiga com alterações foi preservada separadamente, sem reset, clean ou restore.

## Commits de recuperação e arquivos

A lista abaixo contém os commits anteriores ao commit deste relatório. O commit de encerramento contém este relatório, `scripts/check-studio.mjs` e a remoção de `scripts/__pycache__/render-previews.cpython-312.pyc`; seu hash é fornecido na entrega e no histórico Git.

### `25bf5a756018c13d50b1ad9af711b6c42d449ffe`

Recupera vetores da marca e máscara de Rafa e Joy registrados na sessão — 14 arquivos.

- `assets/brand/brush.svg`
- `assets/brand/butterflies.svg`
- `assets/brand/crown.svg`
- `assets/brand/doodles.svg`
- `assets/brand/drips.svg`
- `assets/brand/edge-grunge.svg`
- `assets/brand/graffiti.svg`
- `assets/brand/heart.svg`
- `assets/brand/portrait-mask.svg`
- `assets/brand/signature.svg`
- `assets/brand/sticker.svg`
- `assets/brand/underline.svg`
- `assets/brand/wall-grain.svg`
- `scripts/build-brand-vectors.py`

### `d8a6837eedfd5adadf9df64f351e6c7eb72e3a09`

Recupera HTML, navegação e composição visual já preparados — 3 arquivos.

- `index.html`
- `site.js`
- `style.css`

### `de68ea9a697d33b3fe3bf638d1499e48b6672b04`

Recupera abertura progressiva da borboleta em parede escura — 1 arquivos.

- `intro.js`

### `e593c857dd9824bcfae90c3f02ed77c2b3c967d4`

Recupera iluminação 3D, normais e alternativa em imagem já implementadas — 4 arquivos.

- `app.js`
- `scripts/__pycache__/render-previews.cpython-312.pyc`
- `scripts/render-previews.py`
- `studio3d.js`

### `dfaa9de12fb8771c58f232c404a894155c0dc878`

Recupera miniaturas grafite do catálogo — lote 1 de 6 — 60 arquivos.

- `assets/previews/feminino_accs_01.png`
- `assets/previews/feminino_accs_02.png`
- `assets/previews/feminino_accs_03.png`
- `assets/previews/feminino_accs_04.png`
- `assets/previews/feminino_accs_05.png`
- `assets/previews/feminino_accs_06.png`
- `assets/previews/feminino_accs_07.png`
- `assets/previews/feminino_accs_08.png`
- `assets/previews/feminino_accs_09.png`
- `assets/previews/feminino_accs_10.png`
- `assets/previews/feminino_accs_11.png`
- `assets/previews/feminino_accs_12.png`
- `assets/previews/feminino_accs_13.png`
- `assets/previews/feminino_accs_14.png`
- `assets/previews/feminino_berd_01.png`
- `assets/previews/feminino_berd_02.png`
- `assets/previews/feminino_berd_03.png`
- `assets/previews/feminino_berd_04.png`
- `assets/previews/feminino_berd_05.png`
- `assets/previews/feminino_berd_06.png`
- `assets/previews/feminino_berd_07.png`
- `assets/previews/feminino_berd_08.png`
- `assets/previews/feminino_berd_09.png`
- `assets/previews/feminino_berd_10.png`
- `assets/previews/feminino_berd_11.png`
- `assets/previews/feminino_berd_12.png`
- `assets/previews/feminino_berd_13.png`
- `assets/previews/feminino_berd_14.png`
- `assets/previews/feminino_berd_15.png`
- `assets/previews/feminino_berd_16.png`
- `assets/previews/feminino_berd_17.png`
- `assets/previews/feminino_berd_18.png`
- `assets/previews/feminino_berd_19.png`
- `assets/previews/feminino_berd_20.png`
- `assets/previews/feminino_berd_21.png`
- `assets/previews/feminino_berd_22.png`
- `assets/previews/feminino_berd_23.png`
- `assets/previews/feminino_berd_24.png`
- `assets/previews/feminino_berd_25.png`
- `assets/previews/feminino_berd_26.png`
- `assets/previews/feminino_berd_27.png`
- `assets/previews/feminino_berd_28.png`
- `assets/previews/feminino_berd_29.png`
- `assets/previews/feminino_berd_30.png`
- `assets/previews/feminino_berd_31.png`
- `assets/previews/feminino_berd_32.png`
- `assets/previews/feminino_berd_33.png`
- `assets/previews/feminino_berd_34.png`
- `assets/previews/feminino_berd_35.png`
- `assets/previews/feminino_berd_36.png`
- `assets/previews/feminino_berd_37.png`
- `assets/previews/feminino_berd_38.png`
- `assets/previews/feminino_feet_01.png`
- `assets/previews/feminino_feet_02.png`
- `assets/previews/feminino_feet_03.png`
- `assets/previews/feminino_feet_04.png`
- `assets/previews/feminino_feet_05.png`
- `assets/previews/feminino_feet_06.png`
- `assets/previews/feminino_feet_07.png`
- `assets/previews/feminino_feet_08.png`

### `5b0419e5c2103e08569ee59d61a5d3b7a117bb5b`

Recupera miniaturas grafite do catálogo — lote 2 de 6 — 60 arquivos.

- `assets/previews/feminino_feet_09.png`
- `assets/previews/feminino_feet_10.png`
- `assets/previews/feminino_feet_11.png`
- `assets/previews/feminino_feet_12.png`
- `assets/previews/feminino_feet_13.png`
- `assets/previews/feminino_feet_14.png`
- `assets/previews/feminino_feet_15.png`
- `assets/previews/feminino_feet_16.png`
- `assets/previews/feminino_feet_17.png`
- `assets/previews/feminino_feet_18.png`
- `assets/previews/feminino_feet_19.png`
- `assets/previews/feminino_hand_01.png`
- `assets/previews/feminino_hand_02.png`
- `assets/previews/feminino_hand_03.png`
- `assets/previews/feminino_hand_04.png`
- `assets/previews/feminino_jbib_01.png`
- `assets/previews/feminino_jbib_02.png`
- `assets/previews/feminino_jbib_03.png`
- `assets/previews/feminino_jbib_04.png`
- `assets/previews/feminino_jbib_05.png`
- `assets/previews/feminino_jbib_06.png`
- `assets/previews/feminino_jbib_07.png`
- `assets/previews/feminino_jbib_08.png`
- `assets/previews/feminino_jbib_09.png`
- `assets/previews/feminino_jbib_10.png`
- `assets/previews/feminino_jbib_100.png`
- `assets/previews/feminino_jbib_101.png`
- `assets/previews/feminino_jbib_11.png`
- `assets/previews/feminino_jbib_12.png`
- `assets/previews/feminino_jbib_13.png`
- `assets/previews/feminino_jbib_14.png`
- `assets/previews/feminino_jbib_15.png`
- `assets/previews/feminino_jbib_16.png`
- `assets/previews/feminino_jbib_17.png`
- `assets/previews/feminino_jbib_18.png`
- `assets/previews/feminino_jbib_19.png`
- `assets/previews/feminino_jbib_20.png`
- `assets/previews/feminino_jbib_21.png`
- `assets/previews/feminino_jbib_22.png`
- `assets/previews/feminino_jbib_23.png`
- `assets/previews/feminino_jbib_24.png`
- `assets/previews/feminino_jbib_25.png`
- `assets/previews/feminino_jbib_26.png`
- `assets/previews/feminino_jbib_27.png`
- `assets/previews/feminino_jbib_28.png`
- `assets/previews/feminino_jbib_29.png`
- `assets/previews/feminino_jbib_30.png`
- `assets/previews/feminino_jbib_31.png`
- `assets/previews/feminino_jbib_32.png`
- `assets/previews/feminino_jbib_33.png`
- `assets/previews/feminino_jbib_34.png`
- `assets/previews/feminino_jbib_35.png`
- `assets/previews/feminino_jbib_36.png`
- `assets/previews/feminino_jbib_37.png`
- `assets/previews/feminino_jbib_38.png`
- `assets/previews/feminino_jbib_39.png`
- `assets/previews/feminino_jbib_40.png`
- `assets/previews/feminino_jbib_41.png`
- `assets/previews/feminino_jbib_42.png`
- `assets/previews/feminino_jbib_43.png`

### `3ef0e1faaf5e188d962b16082e56993fb145cd44`

Recupera miniaturas grafite do catálogo — lote 3 de 6 — 60 arquivos.

- `assets/previews/feminino_jbib_44.png`
- `assets/previews/feminino_jbib_45.png`
- `assets/previews/feminino_jbib_46.png`
- `assets/previews/feminino_jbib_47.png`
- `assets/previews/feminino_jbib_48.png`
- `assets/previews/feminino_jbib_49.png`
- `assets/previews/feminino_jbib_50.png`
- `assets/previews/feminino_jbib_51.png`
- `assets/previews/feminino_jbib_52.png`
- `assets/previews/feminino_jbib_53.png`
- `assets/previews/feminino_jbib_54.png`
- `assets/previews/feminino_jbib_55.png`
- `assets/previews/feminino_jbib_56.png`
- `assets/previews/feminino_jbib_57.png`
- `assets/previews/feminino_jbib_58.png`
- `assets/previews/feminino_jbib_59.png`
- `assets/previews/feminino_jbib_60.png`
- `assets/previews/feminino_jbib_61.png`
- `assets/previews/feminino_jbib_62.png`
- `assets/previews/feminino_jbib_63.png`
- `assets/previews/feminino_jbib_64.png`
- `assets/previews/feminino_jbib_65.png`
- `assets/previews/feminino_jbib_66.png`
- `assets/previews/feminino_jbib_67.png`
- `assets/previews/feminino_jbib_68.png`
- `assets/previews/feminino_jbib_69.png`
- `assets/previews/feminino_jbib_70.png`
- `assets/previews/feminino_jbib_71.png`
- `assets/previews/feminino_jbib_72.png`
- `assets/previews/feminino_jbib_73.png`
- `assets/previews/feminino_jbib_74.png`
- `assets/previews/feminino_jbib_75.png`
- `assets/previews/feminino_jbib_76.png`
- `assets/previews/feminino_jbib_77.png`
- `assets/previews/feminino_jbib_78.png`
- `assets/previews/feminino_jbib_79.png`
- `assets/previews/feminino_jbib_80.png`
- `assets/previews/feminino_jbib_81.png`
- `assets/previews/feminino_jbib_82.png`
- `assets/previews/feminino_jbib_83.png`
- `assets/previews/feminino_jbib_84.png`
- `assets/previews/feminino_jbib_85.png`
- `assets/previews/feminino_jbib_86.png`
- `assets/previews/feminino_jbib_87.png`
- `assets/previews/feminino_jbib_88.png`
- `assets/previews/feminino_jbib_89.png`
- `assets/previews/feminino_jbib_90.png`
- `assets/previews/feminino_jbib_91.png`
- `assets/previews/feminino_jbib_92.png`
- `assets/previews/feminino_jbib_93.png`
- `assets/previews/feminino_jbib_94.png`
- `assets/previews/feminino_jbib_95.png`
- `assets/previews/feminino_jbib_96.png`
- `assets/previews/feminino_jbib_97.png`
- `assets/previews/feminino_jbib_98.png`
- `assets/previews/feminino_jbib_99.png`
- `assets/previews/feminino_lowr_01.png`
- `assets/previews/feminino_lowr_02.png`
- `assets/previews/feminino_lowr_03.png`
- `assets/previews/feminino_lowr_04.png`

### `f3b2cbb63ef1d4f4c72e9630cd276ae398534826`

Recupera miniaturas grafite do catálogo — lote 4 de 6 — 60 arquivos.

- `assets/previews/feminino_lowr_05.png`
- `assets/previews/feminino_lowr_06.png`
- `assets/previews/feminino_lowr_07.png`
- `assets/previews/feminino_lowr_08.png`
- `assets/previews/feminino_lowr_09.png`
- `assets/previews/feminino_lowr_10.png`
- `assets/previews/feminino_lowr_11.png`
- `assets/previews/feminino_lowr_12.png`
- `assets/previews/feminino_lowr_13.png`
- `assets/previews/feminino_lowr_14.png`
- `assets/previews/feminino_lowr_15.png`
- `assets/previews/feminino_lowr_16.png`
- `assets/previews/feminino_lowr_17.png`
- `assets/previews/feminino_lowr_18.png`
- `assets/previews/feminino_lowr_19.png`
- `assets/previews/feminino_lowr_20.png`
- `assets/previews/feminino_lowr_21.png`
- `assets/previews/feminino_lowr_22.png`
- `assets/previews/feminino_lowr_23.png`
- `assets/previews/feminino_lowr_24.png`
- `assets/previews/feminino_lowr_25.png`
- `assets/previews/feminino_lowr_26.png`
- `assets/previews/feminino_lowr_27.png`
- `assets/previews/feminino_lowr_28.png`
- `assets/previews/feminino_lowr_29.png`
- `assets/previews/feminino_lowr_30.png`
- `assets/previews/feminino_lowr_31.png`
- `assets/previews/feminino_lowr_32.png`
- `assets/previews/feminino_lowr_33.png`
- `assets/previews/feminino_lowr_34.png`
- `assets/previews/feminino_lowr_35.png`
- `assets/previews/feminino_lowr_36.png`
- `assets/previews/feminino_lowr_37.png`
- `assets/previews/feminino_lowr_38.png`
- `assets/previews/feminino_lowr_39.png`
- `assets/previews/feminino_lowr_40.png`
- `assets/previews/feminino_lowr_41.png`
- `assets/previews/feminino_lowr_42.png`
- `assets/previews/feminino_lowr_43.png`
- `assets/previews/feminino_lowr_44.png`
- `assets/previews/feminino_lowr_45.png`
- `assets/previews/feminino_lowr_46.png`
- `assets/previews/feminino_lowr_47.png`
- `assets/previews/feminino_lowr_48.png`
- `assets/previews/feminino_lowr_49.png`
- `assets/previews/feminino_lowr_50.png`
- `assets/previews/feminino_lowr_51.png`
- `assets/previews/feminino_task_01.png`
- `assets/previews/feminino_task_02.png`
- `assets/previews/feminino_task_03.png`
- `assets/previews/feminino_task_04.png`
- `assets/previews/feminino_teef_01.png`
- `assets/previews/feminino_teef_02.png`
- `assets/previews/feminino_teef_03.png`
- `assets/previews/feminino_teef_04.png`
- `assets/previews/feminino_teef_05.png`
- `assets/previews/feminino_teef_06.png`
- `assets/previews/feminino_teef_07.png`
- `assets/previews/feminino_teef_08.png`
- `assets/previews/feminino_teef_09.png`

### `03fbcac562e7e860e678812407dfe4cca6e6de90`

Recupera miniaturas grafite do catálogo — lote 5 de 6 — 60 arquivos.

- `assets/previews/feminino_teef_10.png`
- `assets/previews/feminino_teef_11.png`
- `assets/previews/feminino_teef_12.png`
- `assets/previews/masculino_accs_01.png`
- `assets/previews/masculino_accs_02.png`
- `assets/previews/masculino_accs_03.png`
- `assets/previews/masculino_accs_04.png`
- `assets/previews/masculino_accs_05.png`
- `assets/previews/masculino_accs_06.png`
- `assets/previews/masculino_accs_07.png`
- `assets/previews/masculino_accs_08.png`
- `assets/previews/masculino_accs_09.png`
- `assets/previews/masculino_accs_10.png`
- `assets/previews/masculino_berd_01.png`
- `assets/previews/masculino_berd_02.png`
- `assets/previews/masculino_berd_03.png`
- `assets/previews/masculino_berd_04.png`
- `assets/previews/masculino_berd_05.png`
- `assets/previews/masculino_berd_06.png`
- `assets/previews/masculino_berd_07.png`
- `assets/previews/masculino_berd_08.png`
- `assets/previews/masculino_berd_09.png`
- `assets/previews/masculino_berd_10.png`
- `assets/previews/masculino_berd_11.png`
- `assets/previews/masculino_berd_12.png`
- `assets/previews/masculino_berd_13.png`
- `assets/previews/masculino_berd_14.png`
- `assets/previews/masculino_berd_15.png`
- `assets/previews/masculino_berd_16.png`
- `assets/previews/masculino_berd_17.png`
- `assets/previews/masculino_berd_18.png`
- `assets/previews/masculino_berd_19.png`
- `assets/previews/masculino_berd_20.png`
- `assets/previews/masculino_berd_21.png`
- `assets/previews/masculino_feet_01.png`
- `assets/previews/masculino_feet_02.png`
- `assets/previews/masculino_feet_03.png`
- `assets/previews/masculino_feet_04.png`
- `assets/previews/masculino_feet_05.png`
- `assets/previews/masculino_feet_06.png`
- `assets/previews/masculino_feet_07.png`
- `assets/previews/masculino_feet_08.png`
- `assets/previews/masculino_feet_09.png`
- `assets/previews/masculino_feet_10.png`
- `assets/previews/masculino_feet_11.png`
- `assets/previews/masculino_hand_01.png`
- `assets/previews/masculino_hand_02.png`
- `assets/previews/masculino_hand_03.png`
- `assets/previews/masculino_jbib_01.png`
- `assets/previews/masculino_jbib_02.png`
- `assets/previews/masculino_jbib_03.png`
- `assets/previews/masculino_jbib_04.png`
- `assets/previews/masculino_jbib_05.png`
- `assets/previews/masculino_jbib_06.png`
- `assets/previews/masculino_jbib_07.png`
- `assets/previews/masculino_jbib_08.png`
- `assets/previews/masculino_jbib_09.png`
- `assets/previews/masculino_jbib_10.png`
- `assets/previews/masculino_jbib_11.png`
- `assets/previews/masculino_jbib_12.png`

### `137912b93364cb41482654c39272eca90ef4e839`

Conclui miniaturas grafite — lote 6 e reparo das prévias corrompidas — 69 arquivos.

- `assets/previews/feminino_jbib_01.png`
- `assets/previews/feminino_jbib_21.png`
- `assets/previews/feminino_jbib_59.png`
- `assets/previews/feminino_jbib_79.png`
- `assets/previews/feminino_jbib_97.png`
- `assets/previews/feminino_lowr_18.png`
- `assets/previews/masculino_accs_01.png`
- `assets/previews/masculino_berd_16.png`
- `assets/previews/masculino_jbib_13.png`
- `assets/previews/masculino_jbib_14.png`
- `assets/previews/masculino_jbib_15.png`
- `assets/previews/masculino_jbib_16.png`
- `assets/previews/masculino_jbib_17.png`
- `assets/previews/masculino_jbib_18.png`
- `assets/previews/masculino_jbib_19.png`
- `assets/previews/masculino_jbib_20.png`
- `assets/previews/masculino_jbib_21.png`
- `assets/previews/masculino_jbib_22.png`
- `assets/previews/masculino_jbib_23.png`
- `assets/previews/masculino_jbib_24.png`
- `assets/previews/masculino_jbib_25.png`
- `assets/previews/masculino_jbib_26.png`
- `assets/previews/masculino_jbib_27.png`
- `assets/previews/masculino_jbib_28.png`
- `assets/previews/masculino_jbib_29.png`
- `assets/previews/masculino_jbib_30.png`
- `assets/previews/masculino_jbib_31.png`
- `assets/previews/masculino_jbib_32.png`
- `assets/previews/masculino_jbib_33.png`
- `assets/previews/masculino_jbib_34.png`
- `assets/previews/masculino_jbib_35.png`
- `assets/previews/masculino_lowr_01.png`
- `assets/previews/masculino_lowr_02.png`
- `assets/previews/masculino_lowr_03.png`
- `assets/previews/masculino_lowr_04.png`
- `assets/previews/masculino_lowr_05.png`
- `assets/previews/masculino_lowr_06.png`
- `assets/previews/masculino_lowr_07.png`
- `assets/previews/masculino_lowr_08.png`
- `assets/previews/masculino_lowr_09.png`
- `assets/previews/masculino_lowr_10.png`
- `assets/previews/masculino_lowr_11.png`
- `assets/previews/masculino_lowr_12.png`
- `assets/previews/masculino_lowr_13.png`
- `assets/previews/masculino_lowr_14.png`
- `assets/previews/masculino_lowr_15.png`
- `assets/previews/masculino_lowr_16.png`
- `assets/previews/masculino_lowr_17.png`
- `assets/previews/masculino_lowr_18.png`
- `assets/previews/masculino_lowr_19.png`
- `assets/previews/masculino_lowr_20.png`
- `assets/previews/masculino_lowr_21.png`
- `assets/previews/masculino_lowr_22.png`
- `assets/previews/masculino_lowr_23.png`
- `assets/previews/masculino_lowr_24.png`
- `assets/previews/masculino_task_01.png`
- `assets/previews/masculino_task_02.png`
- `assets/previews/masculino_task_03.png`
- `assets/previews/masculino_task_04.png`
- `assets/previews/masculino_teef_01.png`
- `assets/previews/masculino_teef_02.png`
- `assets/previews/masculino_teef_03.png`
- `assets/previews/masculino_teef_04.png`
- `assets/previews/masculino_teef_05.png`
- `assets/previews/masculino_teef_06.png`
- `assets/previews/masculino_teef_07.png`
- `assets/previews/masculino_teef_08.png`
- `assets/previews/masculino_teef_09.png`
- `scripts/render-previews.py`

