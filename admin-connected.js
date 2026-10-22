/* Connected administrative catalog. Authorization remains server-side. */
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
  const money = cents => {
    const value = BigInt(cents);
    const absolute = value < 0n ? -value : value;
    return `${value < 0n ? "−" : ""}R$ ${(absolute / 100n).toLocaleString("pt-BR")},${String(absolute % 100n).padStart(2, "0")}`;
  };
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
  const toLocalDateTime = value => {
    if (!value) return "";
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };
  const toIsoDateTime = value => value ? new Date(value).toISOString() : null;
  function parseBrlCents(value) {
    const normalized = String(value || "").trim().replace(/^R\$\s*/iu, "").replace(/\s/gu, "");
    if (!/^\d{1,10}(?:,\d{1,2})?$/u.test(normalized)) return null;
    const [units, fraction = ""] = normalized.split(",");
    const cents = BigInt(units) * 100n + BigInt(fraction.padEnd(2, "0"));
    return cents > 0n && cents <= 999999999999n ? Number(cents) : null;
  }
  function detailStatus(message = "", kind = "") {
    const node = document.getElementById("adminCatalogDetailStatus");
    if (!node) return;
    node.textContent = message;
    node.dataset.state = kind;
  }
  function versionError(error) {
    if (error.status === 400) return "Confira o rótulo, a sequência e as datas da versão.";
    if (error.status === 409) return "A sequência já existe ou esta versão não permite a operação solicitada.";
    if (error.status === 401 || error.status === 403) return "Sua sessão ou permissão não autoriza esta alteração.";
    return "Não foi possível salvar a versão. Tente novamente quando o serviço estiver disponível.";
  }
  function priceError(error) {
    if (error.status === 400) return "Confira o valor em reais e o período de vigência do preço.";
    if (error.status === 409) return "O preço ou a versão não permite esta operação.";
    if (error.status === 401 || error.status === 403) return "Sua sessão ou permissão não autoriza esta alteração.";
    return "Não foi possível atualizar o preço. Tente novamente quando o serviço estiver disponível.";
  }
  function mediaError(error) {
    if (error.status === 400) return "Confira o caminho interno, o texto alternativo e a ordem da mídia.";
    if (error.status === 409) return "Esta mídia ou produto não permite a operação solicitada.";
    if (error.status === 401 || error.status === 403) return "Sua sessão ou permissão não autoriza esta alteração.";
    return "Não foi possível atualizar a mídia. Tente novamente quando o serviço estiver disponível.";
  }
  function fileError(error) {
    if (error.status === 400) return "Confira nome, tipo, tamanho, SHA-256 e ordem do arquivo.";
    if (error.status === 409) return "Esta versão ou arquivo não permite a operação solicitada.";
    if (error.status === 401 || error.status === 403) return "Sua sessão ou permissão não autoriza esta alteração.";
    return "Não foi possível atualizar o arquivo. Tente novamente quando o serviço estiver disponível.";
  }
  function versionPayload(form) {
    const values = new FormData(form);
    return {
      versionLabel: String(values.get("versionLabel") || "").normalize("NFKC").trim(),
      releaseSequence: Number(values.get("releaseSequence")),
      releaseNotes: String(values.get("releaseNotes") || "").normalize("NFKC").replace(/\r\n?/gu, "\n").trim() || null,
      availableFrom: toIsoDateTime(String(values.get("availableFrom") || "")),
      availableUntil: toIsoDateTime(String(values.get("availableUntil") || "")),
    };
  }
  function versionForm(product, version, productTrigger, onCancel) {
    const form = el("form", "mt-admin-detail-form");
    form.noValidate = true;
    form.innerHTML = `<h6>${version ? "EDITAR VERSÃO EM RASCUNHO." : "NOVA VERSÃO EM RASCUNHO."}</h6>
      <label>Rótulo<input name="versionLabel" required maxlength="40"></label>
      <label>Sequência<input name="releaseSequence" type="number" required min="1" max="2147483647" step="1"></label>
      <label class="admin-description">Notas da versão<textarea name="releaseNotes" maxlength="5000" rows="4"></textarea></label>
      <label>Disponível a partir de<input name="availableFrom" type="datetime-local"></label>
      <label>Disponível até<input name="availableUntil" type="datetime-local"></label>
      <div class="form-actions"><button class="mt-button" type="submit">Salvar versão</button><button type="button" data-cancel>Cancelar</button></div>`;
    if (version) {
      form.elements.versionLabel.value = version.versionLabel;
      form.elements.releaseSequence.value = String(version.releaseSequence);
      form.elements.releaseNotes.value = version.releaseNotes || "";
      form.elements.availableFrom.value = toLocalDateTime(version.availableFrom);
      form.elements.availableUntil.value = toLocalDateTime(version.availableUntil);
    }
    form.querySelector("[data-cancel]").addEventListener("click", onCancel);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true; detailStatus("Salvando versão…");
      try {
        const path = version ? `/api/admin/versions/${encodeURIComponent(version.id)}` : `/api/admin/products/${encodeURIComponent(product.id)}/versions`;
        await mutateCatalog(path, version ? "PATCH" : "POST", versionPayload(form));
        await loadDetail(product.id, productTrigger);
        detailStatus(version ? "Versão atualizada com sucesso." : "Versão criada como rascunho.", "success");
      } catch (error) { detailStatus(versionError(error), "error"); submit.disabled = false; }
    });
    return form;
  }
  function priceForm(product, version, productTrigger, onCancel) {
    const form = el("form", "mt-admin-detail-form mt-admin-price-form");
    form.noValidate = true;
    form.innerHTML = `<h6>NOVO PREÇO AGENDADO.</h6>
      <label>Valor em reais<input name="amount" required inputmode="decimal" placeholder="149,90" pattern="[0-9]{1,10}(?:,[0-9]{1,2})?"></label>
      <label>Vigente a partir de<input name="validFrom" type="datetime-local" required></label>
      <label>Vigente até<input name="validUntil" type="datetime-local"></label>
      <p class="mt-admin-form-note">O valor será convertido e enviado ao servidor como centavos inteiros.</p>
      <div class="form-actions"><button class="mt-button" type="submit">Cadastrar preço</button><button type="button" data-cancel>Cancelar</button></div>`;
    form.elements.validFrom.value = toLocalDateTime(new Date().toISOString());
    form.querySelector("[data-cancel]").addEventListener("click", onCancel);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const amountCents = parseBrlCents(form.elements.amount.value);
      if (!amountCents) { detailStatus("Informe um valor válido, como 149,90.", "error"); form.elements.amount.focus(); return; }
      if (!form.reportValidity()) return;
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true; detailStatus("Cadastrando preço…");
      try {
        await mutateCatalog(`/api/admin/versions/${encodeURIComponent(version.id)}/prices`, "POST", {
          amountCents,
          validFrom: toIsoDateTime(form.elements.validFrom.value),
          validUntil: toIsoDateTime(form.elements.validUntil.value),
        });
        await loadDetail(product.id, productTrigger);
        detailStatus("Preço cadastrado no histórico como agendado.", "success");
      } catch (error) { detailStatus(priceError(error), "error"); submit.disabled = false; }
    });
    return form;
  }
  function mediaForm(product, media, productTrigger, onCancel) {
    const form = el("form", "mt-admin-detail-form mt-admin-media-form");
    form.noValidate = true;
    form.innerHTML = `<h6>${media ? "EDITAR MÍDIA." : "REGISTRAR MÍDIA."}</h6>
      ${media ? "" : '<label class="admin-description">Caminho interno<input name="storageKey" required minlength="10" maxlength="500" autocomplete="off" placeholder="products/produto/media/capa.webp"></label>'}
      <label class="admin-description">Texto alternativo<input name="altText" required minlength="2" maxlength="240"></label>
      <label>Ordem<input name="sortOrder" type="number" required min="0" max="100000" step="1"></label>
      <p class="mt-admin-form-note">Somente metadados são registrados. Nenhuma imagem é enviada por este formulário.</p>
      <div class="form-actions"><button class="mt-button" type="submit">Salvar mídia</button><button type="button" data-cancel>Cancelar</button></div>`;
    if (media) {
      form.elements.altText.value = media.altText;
      form.elements.sortOrder.value = String(media.sortOrder);
    } else {
      form.elements.storageKey.placeholder = `products/${product.id}/media/capa.webp`;
      form.elements.sortOrder.value = "0";
    }
    form.querySelector("[data-cancel]").addEventListener("click", onCancel);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const values = new FormData(form);
      const input = {
        altText: String(values.get("altText") || "").normalize("NFKC").trim().replace(/\s+/gu, " "),
        sortOrder: Number(values.get("sortOrder")),
      };
      if (!media) input.storageKey = String(values.get("storageKey") || "").normalize("NFKC").trim();
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true; detailStatus("Salvando mídia…");
      try {
        await mutateCatalog(media ? `/api/admin/media/${encodeURIComponent(media.id)}` : `/api/admin/products/${encodeURIComponent(product.id)}/media`, media ? "PATCH" : "POST", input);
        await loadDetail(product.id, productTrigger);
        detailStatus(media ? "Mídia atualizada com sucesso." : "Metadados da mídia registrados sem upload.", "success");
      } catch (error) { detailStatus(mediaError(error), "error"); submit.disabled = false; }
    });
    return form;
  }
  function fileForm(product, version, file, productTrigger, onCancel) {
    const form = el("form", "mt-admin-detail-form mt-admin-file-form");
    form.noValidate = true;
    form.innerHTML = `<h6>${file ? "EDITAR METADADOS DO ARQUIVO." : "REGISTRAR ARQUIVO PRIVADO."}</h6>
      ${file ? "" : '<label class="admin-description">Chave privada de armazenamento<input name="storageKey" required minlength="10" maxlength="700" autocomplete="off" placeholder="products/produto/versions/1/files/pack.zip"></label>'}
      <label>Nome apresentado<input name="displayName" required minlength="2" maxlength="240"></label>
      <label>Tipo MIME<input name="mimeType" required minlength="3" maxlength="150" placeholder="application/zip"></label>
      <label>Tamanho em bytes<input name="sizeBytes" type="number" required min="1" max="9007199254740991" step="1"></label>
      <label class="admin-description">Checksum SHA-256<input name="checksumSha256" required minlength="64" maxlength="64" pattern="[0-9a-fA-F]{64}" autocomplete="off"></label>
      <label>Ordem<input name="sortOrder" type="number" required min="0" max="100000" step="1"></label>
      <p class="mt-admin-form-note">O registro começa como <strong>Somente metadados</strong>. Verificação e prontidão dependem do futuro armazenamento seguro.</p>
      <div class="form-actions"><button class="mt-button" type="submit">Salvar arquivo</button><button type="button" data-cancel>Cancelar</button></div>`;
    if (file) {
      for (const key of ["displayName", "mimeType", "sizeBytes", "checksumSha256", "sortOrder"]) form.elements[key].value = String(file[key]);
    } else {
      form.elements.storageKey.placeholder = `products/${product.id}/versions/${version.id}/files/pack.zip`;
      form.elements.sortOrder.value = "0";
    }
    form.querySelector("[data-cancel]").addEventListener("click", onCancel);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const values = new FormData(form);
      const input = {
        displayName: String(values.get("displayName") || "").normalize("NFKC").trim().replace(/\s+/gu, " "),
        mimeType: String(values.get("mimeType") || "").trim(),
        sizeBytes: Number(values.get("sizeBytes")),
        checksumSha256: String(values.get("checksumSha256") || "").trim().toLowerCase(),
        sortOrder: Number(values.get("sortOrder")),
      };
      if (!file) input.storageKey = String(values.get("storageKey") || "").normalize("NFKC").trim();
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true; detailStatus("Salvando metadados do arquivo…");
      try {
        await mutateCatalog(file ? `/api/admin/files/${encodeURIComponent(file.id)}` : `/api/admin/versions/${encodeURIComponent(version.id)}/files`, file ? "PATCH" : "POST", input);
        await loadDetail(product.id, productTrigger);
        detailStatus(file ? "Metadados do arquivo atualizados." : "Arquivo registrado como somente metadados; nenhum upload foi realizado.", "success");
      } catch (error) { detailStatus(fileError(error), "error"); submit.disabled = false; }
    });
    return form;
  }
  function renderMediaManager(product, items, productTrigger) {
    const manager = el("section", "mt-admin-detail-section mt-admin-media-manager");
    const heading = el("div", "mt-admin-detail-heading");
    heading.append(el("h5", "", "Mídias comerciais"));
    if (canWriteCatalog && product.status !== "archived") {
      const add = el("button", "", "Registrar mídia"); add.type = "button";
      add.addEventListener("click", () => {
        const old = manager.querySelector(".mt-admin-media-form"); if (old) old.remove();
        const form = mediaForm(product, null, productTrigger, () => { form.remove(); detailStatus("Cadastro de mídia cancelado."); add.focus(); });
        heading.after(form); form.elements.storageKey.focus();
      });
      heading.append(add);
    }
    manager.append(heading);
    if (!items.length) manager.append(el("p", "mt-admin-read-empty", "Nenhuma mídia cadastrada."));
    for (const media of items) {
      const row = el("article", "mt-admin-media-row");
      const copy = el("div", "mt-admin-read-copy");
      copy.append(el("strong", "", media.altText), el("span", "", `${media.mediaType === "cover" ? "Capa principal" : "Galeria"} · ${label(media.status)} · ordem ${media.sortOrder}`));
      row.append(copy);
      if (canWriteCatalog && media.status === "active") {
        const actions = el("div", "mt-admin-read-actions");
        const edit = el("button", "", "Editar mídia"); edit.type = "button";
        edit.addEventListener("click", () => {
          const old = row.querySelector(".mt-admin-media-form"); if (old) old.remove();
          const form = mediaForm(product, media, productTrigger, () => { form.remove(); detailStatus("Edição de mídia cancelada."); edit.focus(); });
          actions.after(form); form.elements.altText.focus();
        }); actions.append(edit);
        if (media.mediaType !== "cover") {
          const cover = el("button", "", "Definir como capa"); cover.type = "button";
          cover.addEventListener("click", () => confirmDetailAction(actions, "Confirmar capa", async () => {
            await mutateCatalog(`/api/admin/media/${encodeURIComponent(media.id)}/cover`, "POST", {});
            await loadDetail(product.id, productTrigger); detailStatus("Capa principal atualizada; a mídia anterior foi preservada.", "success");
          }, () => detailStatus("Seleção de capa cancelada."), mediaError)); actions.append(cover);
        }
        const deactivate = el("button", "", "Desativar mídia"); deactivate.type = "button";
        deactivate.addEventListener("click", () => confirmDetailAction(actions, "Confirmar desativação", async () => {
          await mutateCatalog(`/api/admin/media/${encodeURIComponent(media.id)}/deactivate`, "POST", {});
          await loadDetail(product.id, productTrigger); detailStatus("Mídia desativada sem exclusão do histórico.", "success");
        }, () => detailStatus("Desativação da mídia cancelada."), mediaError)); actions.append(deactivate);
        row.append(actions);
      }
      manager.append(row);
    }
    return manager;
  }
  function renderFileManager(product, entry, productTrigger, card) {
    const { version, files } = entry;
    const heading = el("div", "mt-admin-price-heading mt-admin-file-heading");
    heading.append(el("h6", "", "Arquivos privados"));
    const mutable = canWriteCatalog && version.status !== "retired" && !version.lockedAt;
    if (mutable) {
      const add = el("button", "", "Registrar arquivo"); add.type = "button";
      add.addEventListener("click", () => {
        const old = card.querySelector(".mt-admin-file-form"); if (old) old.remove();
        const form = fileForm(product, version, null, productTrigger, () => { form.remove(); detailStatus("Cadastro de arquivo cancelado."); add.focus(); });
        heading.after(form); form.elements.storageKey.focus();
      }); heading.append(add);
    }
    card.append(heading);
    if (!files.length) card.append(el("p", "mt-admin-read-empty", "Nenhum arquivo privado registrado para esta versão."));
    for (const file of files) {
      const row = el("div", "mt-admin-file-row");
      const copy = el("div", "mt-admin-read-copy");
      copy.append(el("strong", "", file.displayName), el("span", "", `${label(file.storageStatus)} · ${label(file.status)} · ${file.mimeType} · ${size(file.sizeBytes)} · ordem ${file.sortOrder}`), el("code", "mt-admin-checksum", `SHA-256 ${file.checksumSha256}`));
      row.append(copy);
      if (mutable && file.status !== "retired") {
        const actions = el("div", "mt-admin-read-actions");
        const edit = el("button", "", "Editar arquivo"); edit.type = "button";
        edit.addEventListener("click", () => {
          const old = row.querySelector(".mt-admin-file-form"); if (old) old.remove();
          const form = fileForm(product, version, file, productTrigger, () => { form.remove(); detailStatus("Edição de arquivo cancelada."); edit.focus(); });
          actions.after(form); form.elements.displayName.focus();
        }); actions.append(edit);
        const retire = el("button", "", "Retirar arquivo"); retire.type = "button";
        retire.addEventListener("click", () => confirmDetailAction(actions, "Confirmar retirada", async () => {
          await mutateCatalog(`/api/admin/files/${encodeURIComponent(file.id)}/retire`, "POST", {});
          await loadDetail(product.id, productTrigger); detailStatus("Arquivo retirado e metadados preservados no histórico.", "success");
        }, () => detailStatus("Retirada do arquivo cancelada."), fileError)); actions.append(retire);
        row.append(actions);
      }
      card.append(row);
    }
  }
  function renderReadiness(readiness) {
    const manager = el("section", `mt-admin-detail-section mt-admin-readiness${readiness.ready ? " is-ready" : ""}`);
    manager.append(el("h5", "", "Prontidão para publicação"));
    manager.append(el("strong", "mt-admin-readiness__state", readiness.ready ? "Pronto para publicação" : "Configuração incompleta"));
    if (readiness.ready) manager.append(el("p", "", "Todas as verificações atuais foram atendidas. Esta consulta não publica nem altera o produto."));
    else {
      const list = el("ul", "mt-admin-readiness__list");
      for (const item of readiness.blockers || []) list.append(el("li", "", blockers[item] || item));
      manager.append(list, el("p", "mt-admin-form-note", "Arquivos em estado somente metadados não contam como prontos para entrega."));
    }
    return manager;
  }
  function renderVersionManager(product, related, productTrigger) {
    const manager = el("section", "mt-admin-detail-section mt-admin-version-manager");
    const heading = el("div", "mt-admin-detail-heading");
    heading.append(el("h5", "", "Versões e preços"));
    if (canWriteCatalog && product.status !== "archived") {
      const add = el("button", "", "Nova versão"); add.type = "button";
      add.addEventListener("click", () => {
        const existing = manager.querySelector(".mt-admin-detail-form"); if (existing) existing.remove();
        const form = versionForm(product, null, productTrigger, () => { form.remove(); detailStatus("Criação de versão cancelada."); add.focus(); });
        heading.after(form); form.elements.versionLabel.focus();
      });
      heading.append(add);
    }
    manager.append(heading);
    if (!related.length) manager.append(el("p", "mt-admin-read-empty", "Nenhuma versão cadastrada."));
    for (const entry of related) {
      const version = entry.version;
      const card = el("article", "mt-admin-version-card");
      const title = el("div", "mt-admin-version-card__title");
      title.append(el("strong", "", `Versão ${version.versionLabel}`));
      const stateText = `${label(version.status)} · sequência ${version.releaseSequence}${version.lockedAt ? " · congelada" : ""}`;
      title.append(el("span", "", stateText)); card.append(title);
      if (version.releaseNotes) card.append(el("p", "", version.releaseNotes));
      const dates = [version.availableFrom ? `Início ${new Date(version.availableFrom).toLocaleString("pt-BR")}` : "Início não definido", version.availableUntil ? `Fim ${new Date(version.availableUntil).toLocaleString("pt-BR")}` : "Sem encerramento"].join(" · ");
      card.append(el("p", "mt-admin-version-dates", dates));
      const controls = el("div", "mt-admin-read-actions");
      if (canWriteCatalog && version.status === "draft" && !version.lockedAt) {
        const edit = el("button", "", "Editar versão"); edit.type = "button";
        edit.addEventListener("click", () => {
          const old = card.querySelector(".mt-admin-detail-form"); if (old) old.remove();
          const form = versionForm(product, version, productTrigger, () => { form.remove(); detailStatus("Edição de versão cancelada."); edit.focus(); });
          controls.after(form); form.elements.versionLabel.focus();
        }); controls.append(edit);
      }
      if (canWriteCatalog && version.status !== "retired" && !version.lockedAt && product.currentVersionId !== version.id) {
        const retire = el("button", "", "Retirar versão"); retire.type = "button";
        retire.addEventListener("click", () => confirmDetailAction(controls, "Confirmar retirada", async () => {
          await mutateCatalog(`/api/admin/versions/${encodeURIComponent(version.id)}/retire`, "POST", {});
          await loadDetail(product.id, productTrigger); detailStatus("Versão retirada e histórico preservado.", "success");
        }, () => detailStatus("Retirada da versão cancelada."), versionError)); controls.append(retire);
      }
      if (controls.children.length) card.append(controls);
      const priceHeading = el("div", "mt-admin-price-heading"); priceHeading.append(el("h6", "", "Histórico de preços"));
      if (canWriteCatalog && version.status !== "retired") {
        const addPrice = el("button", "", "Novo preço"); addPrice.type = "button";
        addPrice.addEventListener("click", () => {
          const old = card.querySelector(".mt-admin-price-form"); if (old) old.remove();
          const form = priceForm(product, version, productTrigger, () => { form.remove(); detailStatus("Cadastro de preço cancelado."); addPrice.focus(); });
          priceHeading.after(form); form.elements.amount.focus();
        }); priceHeading.append(addPrice);
      }
      card.append(priceHeading);
      if (!entry.prices.length) card.append(el("p", "mt-admin-read-empty", "Nenhum preço cadastrado."));
      for (const price of entry.prices) {
        const priceRow = el("div", "mt-admin-price-row");
        const copy = el("div", "mt-admin-read-copy");
        const frozen = price.lockedAt ? " · congelado" : "";
        copy.append(el("strong", "", money(price.amountCents)), el("span", "", `${label(price.status)}${frozen} · BRL · desde ${new Date(price.validFrom).toLocaleString("pt-BR")}`));
        priceRow.append(copy);
        if (canWriteCatalog) {
          const actions = el("div", "mt-admin-read-actions");
          if (price.status === "scheduled" && !price.lockedAt) {
            const activate = el("button", "", "Ativar"); activate.type = "button";
            activate.addEventListener("click", () => confirmDetailAction(actions, "Confirmar ativação", async () => {
              await mutateCatalog(`/api/admin/prices/${encodeURIComponent(price.id)}/activate`, "POST", {});
              await loadDetail(product.id, productTrigger); detailStatus("Preço ativado; o histórico anterior foi preservado.", "success");
            }, () => detailStatus("Ativação do preço cancelada."), priceError)); actions.append(activate);
          }
          if (price.status !== "retired") {
            const retire = el("button", "", "Retirar"); retire.type = "button";
            retire.addEventListener("click", () => confirmDetailAction(actions, "Confirmar retirada", async () => {
              await mutateCatalog(`/api/admin/prices/${encodeURIComponent(price.id)}/retire`, "POST", {});
              await loadDetail(product.id, productTrigger); detailStatus("Preço retirado e mantido no histórico.", "success");
            }, () => detailStatus("Retirada do preço cancelada."), priceError)); actions.append(retire);
          }
          if (actions.children.length) priceRow.append(actions);
        }
        card.append(priceRow);
      }
      renderFileManager(product, entry, productTrigger, card);
      manager.append(card);
    }
    manager.append(el("p", "mt-admin-detail-status", ""));
    manager.lastElementChild.id = "adminCatalogDetailStatus";
    manager.lastElementChild.setAttribute("role", "status");
    manager.lastElementChild.setAttribute("aria-live", "polite");
    return manager;
  }
  function confirmDetailAction(container, confirmation, action, cancelAction, errorMessage) {
    const original = [...container.childNodes];
    container.replaceChildren();
    const confirm = el("button", "mt-admin-danger", confirmation); confirm.type = "button";
    const cancel = el("button", "", "Cancelar"); cancel.type = "button";
    confirm.addEventListener("click", async () => {
      confirm.disabled = true; cancel.disabled = true; detailStatus("Salvando alteração…");
      try { await action(); } catch (error) { detailStatus(errorMessage(error), "error"); container.replaceChildren(...original); }
    });
    cancel.addEventListener("click", () => { container.replaceChildren(...original); cancelAction(); });
    container.append(confirm, cancel); confirm.focus();
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
      detailNode.append(renderReadiness(readiness));
      detailNode.append(renderMediaManager(product, mediaBody.items || [], trigger));
      detailNode.append(renderVersionManager(product, related, trigger));
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
