# Adaptador multipart S3/R2

## Contrato

`R2S3Storage` implementa o mesmo contrato independente de provedor usado pelo
simulador local: iniciar, assinar uma parte, listar, concluir e abortar. Todas as
operações usam exclusivamente a chave de staging. O identificador do provedor é
mantido no PostgreSQL e só aparece no URL assinado que precisa chegar ao cliente.

O adaptador usa `CreateMultipartUpload`, `UploadPart`, `ListParts`,
`CompleteMultipartUpload` e `AbortMultipartUpload` do SDK S3 v3. `ListParts` é
paginado até o fim e normalizado por número da parte.

## Substituição de partes

O R2 substitui uma parte quando `UploadPart` é repetido com o mesmo número. Uma
URL assinada também é um bearer token e continua utilizável até expirar. Portanto:

1. o BFF emite URLs curtas e específicas para uma sessão e uma parte;
2. depois da primeira confirmação autoritativa, o BFF não emite outra URL para
   aquela parte;
3. tamanho e ETag vêm de `ListParts`, nunca do navegador;
4. o PostgreSQL congela a primeira confirmação e rejeita outro ETag;
5. antes de concluir, o BFF compara integralmente as partes do banco com o
   resultado atual de `ListParts`;
6. se uma URL antiga substituir uma parte já confirmada, a divergência bloqueia
   a conclusão. A sessão deve ser abortada e reiniciada porque o R2 informa que a
   parte anterior pode ter sido perdida;
7. a lista enviada a `CompleteMultipartUpload` é construída pelo backend.

Esse mecanismo não torna o URL literalmente de uso único — o S3/R2 não oferece
essa garantia para `UploadPart`. Ele transforma qualquer reutilização posterior
em uma divergência detectável e impede promoção comercial.

## Conclusão e recuperação

A conclusão cria apenas o objeto de staging. `NoSuchUpload` não é aceito pelo
adaptador como prova de sucesso, pois também pode significar cancelamento. Se a
resposta se perder, o BFF recupera a operação somente quando o PostgreSQL possui
todas as partes congeladas e uma leitura integral do staging confirma tamanho e
SHA-256 esperados. O PostgreSQL continua responsável pela idempotência comercial.
Cancelamento repetido trata `NoSuchUpload` como sucesso.

O objeto completo ainda precisa passar pela leitura integral e SHA-256 do
verificador confiável. ETag multipart e checksums compostos não substituem o
SHA-256 comercial de objeto completo. A chave final permanece protegida pelo
fluxo posterior com `If-None-Match: *`.

## Limitações oficiais consideradas

- 5 MiB a 5 GiB por parte, exceto a última; até 10.000 partes.
- todas as partes, exceto a última, devem ter o mesmo tamanho;
- `UploadPart` repetido substitui a parte anterior;
- `ListParts` usa paginação por marcador;
- URLs assinadas são credenciais temporárias e funcionam apenas no domínio da
  API S3 do R2.

Fontes oficiais:

- https://developers.cloudflare.com/r2/objects/upload-objects/
- https://developers.cloudflare.com/r2/api/s3/api/
- https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- https://developers.cloudflare.com/r2/platform/limits/

## Próxima prova controlada

A prova real deverá usar bucket temporário privado, arquivo fictício pequeno e
credencial limitada. Deve validar CORS, expiração, paginação quando simulável,
substituição deliberada de parte, reconciliação, conclusão, cancelamento e
limpeza. `STORAGE_PROVIDER` permanece `disabled` até autorização explícita.
