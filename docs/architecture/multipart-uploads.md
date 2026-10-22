# Upload multipart retomável

## Escopo da Comercial 3I-A

O núcleo multipart é executado somente com armazenamento simulado local. Ele
não ativa R2, Railway, publicação ou a promoção comercial do arquivo. Ao
concluir o multipart, o objeto existe apenas em `staging` e o `product_file`
continua em `metadata_only` até passar pelo verificador SHA-256 confiável já
aprovado.

## Parâmetros operacionais

- Parte padrão: 8 MiB (mínimo de 5 MiB, máximo de 128 MiB).
- Limite: 10.000 partes por sessão.
- URL PUT: até cinco minutos e nunca além da expiração da sessão.
- Concorrência recomendada para o futuro cliente web: três partes.
- O BFF não recebe os bytes do arquivo; ele emite autorizações por parte e
  consulta o armazenamento para confirmar o estado real.

O limite de três uploads simultâneos mantém o uso de memória e conexões
previsível em desktop e mobile. Ele será aplicado no cliente quando a interface
de upload for integrada ao painel; o núcleo desta etapa permanece independente
da interface.

## Estado confiável e retomada

O PostgreSQL registra a sessão, o operador, a expiração e cada parte confirmada.
O armazenamento é consultado novamente antes de registrar uma parte e antes de
concluir o multipart. Índices, tamanhos, ETags e progresso enviados pelo
navegador não são aceitos como prova.

No simulador, partes e metadados da sessão ficam em disco para permitir que um
novo processo reconstrua o estado. Partes confirmadas não podem ser substituídas
por outro ETag. A conclusão é idempotente e preserva o objeto de staging contra
sobrescrita. Cancelamentos removem somente partes da sessão, nunca objetos finais.

## Integridade comercial

A conclusão multipart não equivale a verificação comercial. O SHA-256 integral
é calculado posteriormente pelo verificador confiável por streaming. Somente
esse fluxo pode mover `metadata_only` para `verified`; `ready` continua fora do
escopo desta etapa.

## Pendências para R2 real

Antes da prova externa, o adaptador S3/R2 deverá implementar CreateMultipartUpload,
UploadPart assinado, ListParts, CompleteMultipartUpload e AbortMultipartUpload.
Também serão necessários testes reais de expiração, CORS, partes fora de ordem,
idempotência do Complete e limpeza de sessões abandonadas. Nenhuma dessas
operações é presumida como validada pelo simulador local.
