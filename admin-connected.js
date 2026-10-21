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
  const categoryForm = document.getElementById("adminCategoryForm");
  const categoryStatus = document.getElementById("adminCategoryStatus");
  const newCategory = document.getElementById("adminNewCategory");
  const cancelCategory = document.getElementById("adminCancelCategory");
  const productForm = document.getElementById("adminProductForm");
  const productStatus = document.getElementById("adminProductStatus");
  const newProduct = document.getElementById("adminNewProduct");
  const cancelProduct = document.getElementById("adminCancelProduct");
  if (!state || !content || !summary || !categoriesNode || !productsNode || !detailNode || !categoryForm || !categoryStatus || !newCategory || !cancelCategory || !productForm || !productStatus || !newProduct || !cancelProduct) return;

  let run = 0;
  let categoriesCache = [];
  let productsCache = [];
  let canWriteCatalog = false;
  let activeAccess = null;
  let connectedCategoryTotal = 0;
  let connectedProductTotal = 0;
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
  async function request(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      credentials: "include",
      ...options,
      headers: { Accept: "application/json", ...(options.headers || {}) },
    });
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
  async function mutateCatalog(path, method, body) {
    const access = await authorize();
    if (!access.permissions.includes("catalog:write")) throw Object.assign(new Error("catalog-write-denied"), { status: 403 });
    const csrf = await request("/api/auth/csrf");
    if (!csrf?.csrfToken) throw Object.assign(new Error("csrf-unavailable"), { status: 503 });
    return request(path, {
      method,
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.csrfToken },
      body: JSON.stringify(body),
    });
  }
  function renderSummary(access, categoryTotal, productTotal) {
    summary.replaceChildren();
    for (const [value, caption] of [[productTotal, "Produtos no banco"], [categoryTotal, "Categorias"], [label(access.role), "Papel autorizado"]]) {
      const item = el("div"); item.append(el("strong", "", String(value)), el("span", "", caption)); summary.append(item);
    }
  }
  function categoryPayload(category) {
    return {
      name: category.name,
      slug: category.slug,
      description: category.description || null,
      sortOrder: Number(category.sortOrder),
      status: category.status,
    };
  }
  function renderCategories(items) {
    categoriesCache = items;
    categoriesNode.replaceChildren();
    if (!items.length) return categoriesNode.append(el("p", "mt-admin-read-empty", "Nenhuma categoria cadastrada no banco."));
    for (const category of items) {
      const row = el("div", "mt-admin-read-row");
      const copy = el("div", "mt-admin-read-copy");
      copy.append(el("strong", "", category.name), el("span", "", `${label(category.status)} · ${category.slug} · ordem ${category.sortOrder}`));
      row.append(copy);
      if (canWriteCatalog) {
        const actions = el("div", "mt-admin-read-actions");
        const edit = el("button", "", "Editar"); edit.type = "button";
        edit.addEventListener("click", () => openCategoryForm(category));
        const toggle = el("button", "", category.status === "active" ? "Desativar" : "Ativar"); toggle.type = "button";
        toggle.addEventListener("click", () => saveCategory(category, { ...categoryPayload(category), status: category.status === "active" ? "inactive" : "active" }, toggle));
        actions.append(edit, toggle); row.append(actions);
      }
      categoriesNode.append(row);
    }
  }
  function resetCategoryForm(message = "") {
    categoryForm.reset();
    categoryForm.elements.sortOrder.value = "0";
    delete categoryForm.dataset.categoryId;
    document.getElementById("adminCategoryFormTitle").textContent = "NOVA CATEGORIA.";
    categoryForm.hidden = true;
    categoryStatus.textContent = message;
    newCategory.focus({ preventScroll: true });
  }
  function openCategoryForm(category = null) {
    if (!canWriteCatalog) return;
    categoryForm.hidden = false;
    categoryStatus.textContent = "";
    if (category) {
      categoryForm.dataset.categoryId = category.id;
      document.getElementById("adminCategoryFormTitle").textContent = "EDITAR CATEGORIA.";
      for (const key of ["name", "slug", "sortOrder", "status", "description"]) categoryForm.elements[key].value = category[key] ?? "";
    } else {
      categoryForm.reset(); categoryForm.elements.sortOrder.value = "0"; delete categoryForm.dataset.categoryId;
      document.getElementById("adminCategoryFormTitle").textContent = "NOVA CATEGORIA.";
    }
    categoryForm.elements.name.focus({ preventScroll: true });
  }
  function categoryError(error) {
    if (error.status === 400) return "Confira nome, slug, ordem e descrição.";
    if (error.status === 409) return "Já existe uma categoria com esse slug.";
    if (error.status === 401 || error.status === 403) return "Sua sessão ou permissão não autoriza esta alteração.";
    return "Não foi possível salvar a categoria. Tente novamente quando o serviço estiver disponível.";
  }
  async function refreshCategories() {
    const categories = await request("/api/admin/categories?limit=100&offset=0");
    connectedCategoryTotal = categories.total || 0;
    renderCategories(categories.items || []);
    populateProductCategories(productForm.hidden ? "" : productForm.elements.categoryId.value);
    if (activeAccess) renderSummary(activeAccess, connectedCategoryTotal, connectedProductTotal);
    return categories;
  }
  async function saveCategory(current, input, trigger) {
    if (!canWriteCatalog) return;
    trigger.disabled = true;
    categoryStatus.textContent = "Salvando categoria…";
    try {
      const categoryId = current?.id || categoryForm.dataset.categoryId;
      await mutateCatalog(categoryId ? `/api/admin/categories/${encodeURIComponent(categoryId)}` : "/api/admin/categories", categoryId ? "PATCH" : "POST", input);
      await refreshCategories();
      resetCategoryForm(categoryId ? "Categoria atualizada com sucesso." : "Categoria criada com sucesso.");
    } catch (error) {
      categoryStatus.textContent = categoryError(error);
      if (error.status === 401 || error.status === 403) {
        canWriteCatalog = false; newCategory.hidden = true; categoryForm.hidden = true; renderCategories(categoriesCache);
      }
    } finally { trigger.disabled = false; }
  }
  function renderProducts(items) {
    productsCache = items;
    productsNode.replaceChildren();
    if (!items.length) return productsNode.append(el("p", "mt-admin-read-empty", "Nenhum produto cadastrado no banco."));
    for (const product of items) {
      const row = el("div", "mt-admin-product-row");
      const button = el("button", "mt-admin-product-read");
      button.type = "button";
      button.append(el("strong", "", product.name), el("span", "", `${label(product.status)} · ${product.featured ? "destaque · " : ""}${product.slug}`));
      button.addEventListener("click", () => loadDetail(product.id, button));
      row.append(button);
      if (canWriteCatalog && product.status === "draft") {
        const actions = el("div", "mt-admin-read-actions mt-admin-product-actions");
        const edit = el("button", "", "Editar"); edit.type = "button";
        edit.addEventListener("click", () => openProductForm(product));
        const archive = el("button", "", "Arquivar"); archive.type = "button";
        archive.addEventListener("click", () => confirmProductArchive(product, actions));
        actions.append(edit, archive); row.append(actions);
      }
      productsNode.append(row);
    }
  }
  function populateProductCategories(selectedId = "") {
    const select = productForm.elements.categoryId;
    select.replaceChildren();
    const active = categoriesCache.filter(category => category.status === "active");
    if (!active.length) {
      const option = new Option("Nenhuma categoria ativa disponível", ""); option.disabled = true; option.selected = true; select.add(option);
    } else {
      select.add(new Option("Selecione uma categoria", ""));
      active.forEach(category => select.add(new Option(category.name, category.id)));
    }
    if (selectedId && !active.some(category => category.id === selectedId)) {
      const existing = categoriesCache.find(category => category.id === selectedId);
      const option = new Option(`${existing?.name || "Categoria atual"} — inativa`, selectedId); option.disabled = true; select.add(option);
    }
    select.value = selectedId;
    newProduct.disabled = !active.length;
  }
  function resetProductForm(message = "") {
    productForm.reset();
    delete productForm.dataset.productId;
    document.getElementById("adminProductFormTitle").textContent = "NOVO PRODUTO EM RASCUNHO.";
    productForm.hidden = true;
    productStatus.textContent = message;
    newProduct.focus({ preventScroll: true });
  }
  function openProductForm(product = null) {
    if (!canWriteCatalog) return;
    productForm.hidden = false;
    productStatus.textContent = "";
    populateProductCategories(product?.categoryId || "");
    if (product) {
      productForm.dataset.productId = product.id;
      document.getElementById("adminProductFormTitle").textContent = "EDITAR PRODUTO EM RASCUNHO.";
      productForm.elements.name.value = product.name;
      productForm.elements.slug.value = product.slug;
      productForm.elements.description.value = product.description;
      productForm.elements.featured.checked = product.featured;
    } else {
      productForm.reset(); delete productForm.dataset.productId; populateProductCategories();
      document.getElementById("adminProductFormTitle").textContent = "NOVO PRODUTO EM RASCUNHO.";
    }
    productForm.elements.name.focus({ preventScroll: true });
  }
  function productError(error) {
    if (error.status === 400) return "Confira nome, slug, categoria, descrição e destaque.";
    if (error.status === 409 && error.body?.error === "admin_state_conflict") return "Use uma categoria ativa. Somente produtos em rascunho podem ser alterados.";
    if (error.status === 409) return "Já existe um produto com esse slug.";
    if (error.status === 404) return "O produto não foi encontrado. Atualize o painel.";
    if (error.status === 401 || error.status === 403) return "Sua sessão ou permissão não autoriza esta alteração.";
    return "Não foi possível salvar o produto. Tente novamente quando o serviço estiver disponível.";
  }
  async function refreshProducts() {
    const products = await request("/api/admin/products?limit=100&offset=0");
    connectedProductTotal = products.total || 0;
    renderProducts(products.items || []);
    if (activeAccess) renderSummary(activeAccess, connectedCategoryTotal, connectedProductTotal);
    return products;
  }
  async function saveProduct(input, trigger) {
    if (!canWriteCatalog) return;
    trigger.disabled = true;
    productStatus.textContent = "Salvando produto…";
    try {
      const productId = productForm.dataset.productId;
      await mutateCatalog(productId ? `/api/admin/products/${encodeURIComponent(productId)}` : "/api/admin/products", productId ? "PATCH" : "POST", input);
      await refreshProducts();
      detailNode.replaceChildren(el("h4", "", "Detalhes do produto"), el("p", "", "Selecione um produto para consultar os dados relacionados."));
      resetProductForm(productId ? "Produto atualizado com sucesso." : "Produto criado como rascunho." );
    } catch (error) {
      productStatus.textContent = productError(error);
      if (error.status === 401 || error.status === 403) {
        canWriteCatalog = false; newCategory.hidden = true; newProduct.hidden = true; categoryForm.hidden = true; productForm.hidden = true;
        renderCategories(categoriesCache); renderProducts(productsCache);
      }
    } finally { trigger.disabled = false; }
  }
  function confirmProductArchive(product, actions) {
    actions.replaceChildren();
    const confirm = el("button", "mt-admin-danger", "Confirmar arquivamento"); confirm.type = "button";
    const cancel = el("button", "", "Cancelar"); cancel.type = "button";
    confirm.addEventListener("click", async () => {
      confirm.disabled = true; cancel.disabled = true; productStatus.textContent = "Arquivando rascunho…";
      try {
        await mutateCatalog(`/api/admin/products/${encodeURIComponent(product.id)}/archive`, "POST", {});
        await refreshProducts();
        detailNode.replaceChildren(el("h4", "", "Detalhes do produto"), el("p", "", "O produto foi arquivado e permanece preservado no histórico comercial."));
        productStatus.textContent = "Produto arquivado com sucesso.";
      } catch (error) {
        productStatus.textContent = productError(error);
        if (error.status === 401 || error.status === 403) { canWriteCatalog = false; newCategory.hidden = true; newProduct.hidden = true; categoryForm.hidden = true; productForm.hidden = true; renderCategories(categoriesCache); }
        renderProducts(productsCache);
      }
    });
    cancel.addEventListener("click", () => { renderProducts(productsCache); productStatus.textContent = "Arquivamento cancelado. Nenhum dado foi alterado."; });
    actions.append(confirm, cancel);
    confirm.focus({ preventScroll: true });
    productStatus.textContent = `Confirme o arquivamento de ${product.name}.`;
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
      activeAccess = access;
      canWriteCatalog = access.permissions.includes("catalog:write");
      newCategory.hidden = !canWriteCatalog;
      newProduct.hidden = !canWriteCatalog;
      if (!canWriteCatalog) { categoryForm.hidden = true; productForm.hidden = true; }
      const [categories, products] = await Promise.all([
        request("/api/admin/categories?limit=100&offset=0"),
        request("/api/admin/products?limit=100&offset=0"),
      ]);
      connectedCategoryTotal = categories.total || 0;
      connectedProductTotal = products.total || 0;
      if (current !== run) return;
      renderSummary(access, categories.total || 0, products.total || 0);
      renderCategories(categories.items || []);
      populateProductCategories();
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
  newCategory.addEventListener("click", () => openCategoryForm());
  cancelCategory.addEventListener("click", () => resetCategoryForm("Edição cancelada. Nenhum dado foi alterado."));
  newProduct.addEventListener("click", () => openProductForm());
  cancelProduct.addEventListener("click", () => resetProductForm("Edição cancelada. Nenhum dado foi alterado."));
  categoryForm.addEventListener("submit", event => {
    event.preventDefault();
    categoryForm.elements.slug.value = String(categoryForm.elements.slug.value || "").normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().trim().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").replace(/-{2,}/gu, "-");
    if (!categoryForm.reportValidity()) return;
    const values = new FormData(categoryForm);
    const input = {
      name: String(values.get("name") || "").normalize("NFKC").trim().replace(/\s+/gu, " "),
      slug: String(values.get("slug") || "").normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().trim().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").replace(/-{2,}/gu, "-"),
      sortOrder: Number(values.get("sortOrder")),
      status: String(values.get("status")),
      description: String(values.get("description") || "").normalize("NFKC").trim().replace(/\s+/gu, " ") || null,
    };
    saveCategory(null, input, categoryForm.querySelector('button[type="submit"]'));
  });
  productForm.addEventListener("submit", event => {
    event.preventDefault();
    productForm.elements.slug.value = String(productForm.elements.slug.value || "").normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().trim().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").replace(/-{2,}/gu, "-");
    if (!productForm.reportValidity()) return;
    const values = new FormData(productForm);
    saveProduct({
      categoryId: String(values.get("categoryId") || ""),
      name: String(values.get("name") || "").normalize("NFKC").trim().replace(/\s+/gu, " "),
      slug: String(values.get("slug") || ""),
      description: String(values.get("description") || "").normalize("NFKC").replace(/\r\n?/gu, "\n").trim(),
      featured: values.get("featured") === "on",
    }, productForm.querySelector('button[type="submit"]'));
  });
  if (location.hash === "#admin") loadPanel();
})();
