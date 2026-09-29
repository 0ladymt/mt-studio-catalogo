/* Local product preparation only. Never stores customer, payment or delivery data. */
(() => {
  const key = "mt-studio-product-drafts-v1",
    form = document.getElementById("mtProductForm"),
    list = document.getElementById("mtDraftProducts"),
    status = document.getElementById("draftStatus");
  const availability = {
    coming: "Em breve",
    available: "Disponível após ativação",
    unavailable: "Indisponível",
  };
  const categories = ["Roupas", "Uniformes", "Acessórios", "Props"];
  let products = [];
  const safeImage = (s) =>
    typeof s === "string" &&
    /^assets\/[a-zA-Z0-9_\-/ .%\u00C0-\u024F]+\.(png|jpe?g|webp)$/i.test(s) &&
    !s.includes("..")
      ? s
      : "";
  function normalize(p, i) {
    if (
      !p ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      typeof p.description !== "string" ||
      !p.description.trim() ||
      !Number.isFinite(Number(p.price)) ||
      Number(p.price) <= 0
    )
      throw Error("Produto inválido");
    return {
      id: String(p.id || `mt-${Date.now()}-${i}`),
      name: p.name.trim().slice(0, 120),
      description: p.description.trim().slice(0, 1000),
      price: Math.round(Number(p.price) * 100) / 100,
      image: safeImage(p.image || ""),
      category: categories.includes(p.category) ? p.category : "Roupas",
      kind: p.kind === "custom" ? "custom" : "ready",
      availability: Object.hasOwn(availability, p.availability)
        ? p.availability
        : "coming",
      status: "draft",
    };
  }
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "[]");
    if (Array.isArray(stored)) products = stored.map(normalize);
  } catch {
    status.textContent =
      "Não foi possível ler os rascunhos salvos. Você pode importar uma cópia.";
  }
  const money = (n) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  function save(next) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      products = next;
      render();
      status.textContent = "Rascunhos salvos somente neste navegador.";
      return true;
    } catch {
      status.textContent =
        "O navegador bloqueou o armazenamento. Os dados anteriores foram preservados.";
      return false;
    }
  }
  function reset() {
    form.reset();
    delete form.dataset.edit;
    document.getElementById("cancelProductEdit").hidden = true;
  }
  document.getElementById("cancelProductEdit").onclick = reset;
  function render() {
    list.replaceChildren();
    const shop = document.getElementById("mtShopDrafts");
    shop.replaceChildren();
    document.getElementById("shopEmpty").hidden = products.length > 0;
    document.getElementById("localDraftNotice").hidden = !products.length;
    if (!products.length) {
      const empty = document.createElement("p");
      empty.textContent =
        "Nenhum rascunho cadastrado. Prepare o primeiro produto no formulário acima.";
      list.append(empty);
    }
    products.forEach((p) => {
      const card = document.createElement("article");
      card.className = "mt-shop-draft";
      if (p.image) {
        const img = new Image();
        img.src = p.image;
        img.alt = p.name;
        img.loading = "lazy";
        img.onerror = () => {
          const empty = document.createElement("div");
          empty.className = "product-no-image";
          empty.textContent = "Imagem não encontrada";
          img.replaceWith(empty);
        };
        card.append(img);
      } else {
        const empty = document.createElement("div");
        empty.className = "product-no-image";
        empty.textContent = "Produto sem imagem";
        card.append(empty);
      }
      const tag = document.createElement("small");
      tag.textContent = `${p.category} · ${p.kind === "custom" ? "Encomenda" : "Produto pronto"}`;
      const name = document.createElement("h4");
      name.textContent = p.name;
      const price = document.createElement("strong");
      price.textContent = money(p.price);
      const desc = document.createElement("p");
      desc.textContent = p.description;
      const note = document.createElement("small");
      note.textContent = `${availability[p.availability]} · rascunho local`;
      const purchase = document.createElement("button");
      purchase.textContent = "Compra ainda indisponível";
      purchase.disabled = true;
      card.append(tag, name, price, desc, note, purchase);
      shop.append(card);
      const row = document.createElement("article");
      row.className = "mt-draft";
      const title = document.createElement("strong");
      title.textContent = p.name;
      const value = document.createElement("span");
      value.textContent = money(p.price);
      const info = document.createElement("p");
      info.textContent = `${p.category} / ${availability[p.availability]} — ${p.description}`;
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Editar";
      edit.onclick = () => {
        for (const field of [
          "name",
          "price",
          "image",
          "description",
          "category",
          "kind",
          "availability",
        ])
          form.elements[field].value = p[field];
        form.dataset.edit = p.id;
        document.getElementById("cancelProductEdit").hidden = false;
        form.elements.name.focus();
      };
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Excluir";
      remove.onclick = () => {
        if (confirm(`Excluir o rascunho “${p.name}”?`)) {
          if (
            save(products.filter((x) => x.id !== p.id)) &&
            form.dataset.edit === p.id
          )
            reset();
        }
      };
      row.append(title, value, info, edit, remove);
      list.append(row);
    });
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const raw = Object.fromEntries(new FormData(form)),
        item = normalize(
          {
            ...raw,
            id:
              form.dataset.edit ||
              `mt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          },
          0,
        );
      if (raw.image && !item.image) {
        status.textContent =
          "Use um caminho de imagem dentro de assets/, sem links externos.";
        return;
      }
      const next = form.dataset.edit
        ? products.map((p) => (p.id === item.id ? item : p))
        : [...products, item];
      if (save(next)) reset();
    } catch {
      status.textContent =
        "Confira o nome, a descrição e o preço maior que zero.";
    }
  });
  document.getElementById("mtExportProducts").onclick = () => {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(products, null, 2)], {
          type: "application/json",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "mt-studio-produtos-rascunho.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  document
    .getElementById("mtImportProducts")
    .addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        if (file.size > 2_000_000) throw Error("too large");
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data) || data.length > 1000) throw Error("invalid");
        const next = data.map(normalize);
        if (new Set(next.map((p) => p.id)).size !== next.length)
          throw Error("duplicate");
        if (
          products.length &&
          !confirm("Substituir os rascunhos locais pelo arquivo importado?")
        )
          return;
        if (save(next)) reset();
      } catch {
        status.textContent =
          "Arquivo inválido. Importe uma lista de produtos com nome, descrição e preço positivo; os rascunhos atuais foram mantidos.";
      } finally {
        e.target.value = "";
      }
    });
  render();
})();
