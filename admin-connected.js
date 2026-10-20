/* Read-only administrative catalog. Authorization remains server-side. */
(() => {
  const apiBase = ["127.0.0.1", "localhost"].includes(location.hostname)
    ? `${location.protocol}//${location.hostname}:8787`
    : "";
  const state = document.getElementById("adminAccessState");
  const content = document.getElementById("adminAuthorizedContent");
  const summary = document.getElementById("adminConnectedSummary");
  const categoriesNode = document.getElementById("adminDatabaseCategories");
  const productsNode = document.getElementById("adminDatabaseProducts");
  const detailNode = document.getElementById("adminDatabaseDetail");
  if (!state || !content || !summary || !categoriesNode || !productsNode || !detailNode) return;

  let run = 0;
  const labels = {
    draft: "Rascunho", published: "Publicado", unpublished: "Despublicado", archived: "Arquivado",
    active: "Ativo", inactive: "Inativo", retired: "Retirado", scheduled: "Agendado",
    metadata_only: "Somente metadados", verified: "Verificado", ready: "Pronto", failed: "Falhou",
  };
  const blockers = {
    category_inactive: "Categoria inativa", current_version_missing: "Versão atual não definida",
    eligible_version_missing: "Versão elegível ausente", active_brl_price_missing: "Preço BRL vigente ausente",
    active_cover_missing: "Capa ativa ausente", verified_ready_file_missing: "Arquivo verificado e pronto ausente",
  };
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const label = value => labels[value] || value || "—";
  const money = cents => Number(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const size = bytes => Number(bytes).toLocaleString("pt-BR") + " bytes";
  const setState = (kind, title, message) => {
    state.dataset.state = kind;
    state.replaceChildren(el("strong", "", title), el("p", "", message));
    state.hidden = false;
    content.hidden = true;
  };
  async function request(path) {
    const response = await fetch(`${apiBase}${path}`, { credentials: "include", headers: { Accept: "application/json" } });
    let body = null;
    try { body = await response.json(); } catch { /* Deliberately hide response internals. */ }
    if (!response.ok) throw Object.assign(new Error("admin-request-failed"), { status: response.status, body });
    return body;
  }
  async function authorize() {
    const access = await request("/api/admin/access");
    if (!access?.authorized || !Array.isArray(access.permissions) || !access.permissions.includes("catalog:read")) {
      throw Object.assign(new Error("catalog-read-denied"), { status: 403 });
    }
    return access;
  }
  function renderSummary(access, categoryTotal, productTotal) {
    summary.replaceChildren();
    for (const [value, caption] of [[productTotal, "Produtos no banco"], [categoryTotal, "Categorias"], [label(access.role), "Papel autorizado"]]) {
      const item = el("div"); item.append(el("strong", "", String(value)), el("span", "", caption)); summary.append(item);
    }
  }
  function renderCategories(items) {
    categoriesNode.replaceChildren();
    if (!items.length) return categoriesNode.append(el("p", "mt-admin-read-empty", "Nenhuma categoria cadastrada no banco."));
    for (const category of items) {
      const row = el("div", "mt-admin-read-row");
      row.append(el("strong", "", category.name), el("span", "", `${label(category.status)} · ${category.slug}`));
      categoriesNode.append(row);
    }
  }
  function renderProducts(items) {
    productsNode.replaceChildren();
    if (!items.length) return productsNode.append(el("p", "mt-admin-read-empty", "Nenhum produto cadastrado no banco."));
    for (const product of items) {
      const button = el("button", "mt-admin-product-read");
      button.type = "button";
      button.append(el("strong", "", product.name), el("span", "", `${label(product.status)} · ${product.slug}`));
      button.addEventListener("click", () => loadDetail(product.id, button));
      productsNode.append(button);
    }
  }
  function section(title, rows, empty) {
    const block = el("section", "mt-admin-detail-section");
    block.append(el("h5", "", title));
    if (!rows.length) block.append(el("p", "", empty));
    else rows.forEach(row => block.append(row));
    return block;
  }
  function dataRow(primary, secondary) {
    const row = el("div", "mt-admin-read-row");
    row.append(el("strong", "", primary), el("span", "", secondary));
    return row;
  }
  async function loadDetail(productId, trigger) {
    const current = ++run;
    detailNode.setAttribute("aria-busy", "true");
    detailNode.replaceChildren(el("h4", "", "Detalhes do produto"), el("p", "", "Atualizando autorização e carregando dados…"));
    try {
      await authorize();
      const [productBody, versionsBody, mediaBody, readinessBody] = await Promise.all([
        request(`/api/admin/products/${encodeURIComponent(productId)}`),
        request(`/api/admin/products/${encodeURIComponent(productId)}/versions?limit=100&offset=0`),
        request(`/api/admin/products/${encodeURIComponent(productId)}/media?limit=100&offset=0`),
        request(`/api/admin/products/${encodeURIComponent(productId)}/readiness`),
      ]);
      if (current !== run) return;
      const versions = versionsBody.items || [];
      const related = await Promise.all(versions.map(async version => ({
        version,
        prices: (await request(`/api/admin/versions/${encodeURIComponent(version.id)}/prices?limit=100&offset=0`)).items || [],
        files: (await request(`/api/admin/versions/${encodeURIComponent(version.id)}/files?limit=100&offset=0`)).items || [],
      })));
      if (current !== run) return;
      const product = productBody.product;
      const readiness = readinessBody.readiness;
      detailNode.replaceChildren();
      detailNode.append(el("h4", "", product.name), el("p", "", product.description), dataRow("Estado", label(product.status)), dataRow("Slug", product.slug));
      const readinessRows = readiness.ready
        ? [dataRow("Pronto para publicação", "Todas as verificações atuais foram atendidas")]
        : (readiness.blockers || []).map(item => dataRow("Pendente", blockers[item] || item));
      detailNode.append(section("Prontidão", readinessRows, "Prontidão indisponível."));
      detailNode.append(section("Mídias", (mediaBody.items || []).map(item => dataRow(item.altText || "Mídia", `${item.mediaType === "cover" ? "Capa" : "Galeria"} · ${label(item.status)}`)), "Nenhuma mídia cadastrada."));
      const versionRows = [];
      for (const entry of related) {
        versionRows.push(dataRow(`Versão ${entry.version.versionLabel}`, `${label(entry.version.status)} · sequência ${entry.version.releaseSequence}`));
        entry.prices.forEach(item => versionRows.push(dataRow(money(item.amountCents), `Preço ${label(item.status)} · BRL`)));
        entry.files.forEach(item => versionRows.push(dataRow(item.displayName, `${size(item.sizeBytes)} · ${label(item.storageStatus)} · ${label(item.status)}`)));
      }
      detailNode.append(section("Versões, preços e arquivos", versionRows, "Nenhuma versão cadastrada."));
      trigger.focus({ preventScroll: true });
    } catch (error) {
      if (current !== run) return;
      if (error.status === 401 || error.status === 403) setState("denied", "Acesso administrativo indisponível", "Sua sessão ou permissão não autoriza mais esta consulta.");
      else detailNode.replaceChildren(el("h4", "", "Não foi possível carregar os detalhes"), el("p", "", "Tente novamente quando o serviço administrativo estiver disponível."));
    } finally { if (current === run) detailNode.removeAttribute("aria-busy"); }
  }
  async function loadPanel() {
    const current = ++run;
    setState("loading", "Verificando acesso administrativo…", "Aguarde enquanto confirmamos sua sessão e permissões.");
    try {
      const access = await authorize();
      const [categories, products] = await Promise.all([
        request("/api/admin/categories?limit=100&offset=0"),
        request("/api/admin/products?limit=100&offset=0"),
      ]);
      if (current !== run) return;
      renderSummary(access, categories.total || 0, products.total || 0);
      renderCategories(categories.items || []);
      renderProducts(products.items || []);
      detailNode.replaceChildren(el("h4", "", "Detalhes do produto"), el("p", "", products.items?.length ? "Selecione um produto para consultar os dados relacionados." : "O catálogo comercial ainda está vazio."));
      state.hidden = true;
      content.hidden = false;
    } catch (error) {
      if (current !== run) return;
      if (error.status === 401) setState("denied", "Entre para acessar o painel", "É necessária uma sessão autenticada com permissão administrativa.");
      else if (error.status === 403) setState("denied", "Acesso não autorizado", "Esta conta não possui permissão de leitura do catálogo comercial.");
      else setState("error", "Serviço administrativo indisponível", "Não foi possível confirmar o acesso agora. Nenhum dado local foi alterado.");
    }
  }
  window.addEventListener("mt:page", event => {
    if (event.detail === "admin") loadPanel();
    else { run += 1; }
  });
  if (location.hash === "#admin") loadPanel();
})();
