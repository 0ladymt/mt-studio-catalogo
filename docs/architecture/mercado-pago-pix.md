# Mercado Pago Pix — integração do site

## Escopo

O Mercado Pago é o provedor exclusivo de pagamento do site e o Pix é o único meio aceito no MVP. A implementação permanece desabilitada por padrão e não realiza cobranças sem configuração privada explícita no BFF.

O código do bot do Discord não está presente neste workspace. Portanto, esta integração não altera nem presume o contrato, a aplicação ou o webhook usados pelo bot.

## Isolamento

- Pedidos do site usam `external_reference` no formato `mt-site:<order_uuid>`.
- A cobrança envia `metadata.channel = mt_studio_site`.
- Cada operação de criação usa uma chave UUID de idempotência estável.
- Recomenda-se uma aplicação do Mercado Pago e um segredo de webhook próprios para o site, mesmo quando a conta recebedora for a mesma do bot.
- Eventos desconhecidos ou referências fora do namespace do site não confirmam pedidos.

## Fluxo confiável

1. O cliente autenticado cria um pedido pendente.
2. O BFF obtém total, moeda e versão exclusivamente do PostgreSQL.
3. O BFF cria a cobrança Pix com credencial privada e chave de idempotência.
4. O navegador recebe apenas QR Code, código Pix, vencimento e estado sanitizado.
5. O webhook é validado com HMAC e, antes de qualquer transição, o BFF consulta novamente `/v1/payments/:id`.
6. PostgreSQL valida referência, valor e moeda; aplica transição monotônica e auditoria na mesma transação.
7. Somente `approved` confirmado pelo provedor marca o pedido como pago. Criar pedido ou cobrança não concede download.

Notificações duplicadas são deduplicadas por evento e pagamento. Notificações atrasadas não regridem estados `approved`, `refunded` ou `charged_back`.

## Configuração privada futura

Configurar somente no ambiente do servidor:

- `PAYMENT_PROVIDER=mercado_pago`
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`
- `MERCADO_PAGO_NOTIFICATION_URL=https://<dominio>/api/webhooks/mercado-pago`
- `MERCADO_PAGO_API_URL=https://api.mercadopago.com`
- `PIX_EXPIRATION_MINUTES`

Nenhuma dessas credenciais deve ser enviada ao frontend, registrada em logs ou versionada. Em desenvolvimento e testes, usar `PAYMENT_PROVIDER=mock` somente no processo controlado; o padrão é `disabled`.

## Configuração manual no Mercado Pago

1. Criar ou selecionar uma aplicação destinada ao site, sem alterar a aplicação do bot.
2. Configurar uma URL HTTPS pública para `/api/webhooks/mercado-pago` e assinar eventos de pagamentos.
3. Guardar o segredo de assinatura e o access token exclusivamente no backend.
4. Validar primeiro com credenciais e usuários de teste.
5. Confirmar na conta as tarifas de Pix, prazo de disponibilização, limites e regras de reembolso vigentes antes de ativar produção.

Referências oficiais: documentação Checkout API Pix e documentação de Webhooks do Mercado Pago.
