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
  let products = [], categoryFilter = "", selectedImage = "", fileMeta = null, readVersion = 0, uploadPending = false, storageReadable = true;
  const states = {draft:"Rascunho",preview:"Pronto para prévia",archived:"Arquivado"};
  const node = (tag, cls, text) => { const el=document.createElement(tag); if(cls) el.className=cls; if(text !== undefined) el.textContent=text; return el; };
  const imagePreview = document.getElementById("adminImagePreview");
  function showImage(src) {
    imagePreview.replaceChildren(); imagePreview.hidden=!src;
    if(!src) return;
    const img=new Image();img.alt="Prévia da imagem do produto";img.src=src;
    img.onerror=()=>imagePreview.replaceChildren(node("p","","Imagem não encontrada. Confira o caminho."));imagePreview.append(img);
  }
  const safeDataImage = (s) => typeof s === "string" && s.length <= 1500000 && /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(s);

  const safeImage = (s) => safeDataImage(s) ? s :
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
    if (p.stock !== "" && p.stock != null && (!Number.isSafeInteger(Number(p.stock)) || Number(p.stock)<0)) throw Error("Stock invalid");
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
      status: Object.hasOwn(states,p.status) ? p.status : "draft",
      featured: p.featured === true || p.featured === "on",
      stock: p.stock === "" || p.stock == null ? null : Number(p.stock),
      productFile: typeof p.productFile === "string" ? p.productFile.trim().slice(0,300) : "",
      fileMeta: p.fileMeta && typeof p.fileMeta.name === "string" ? {name:p.fileMeta.name.slice(0,200),size:Math.max(0,Number(p.fileMeta.size)||0)} : null,
    };
  }
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "[]");
    if (Array.isArray(stored)) products = stored.map(normalize);
  } catch {
    storageReadable = false;
    status.textContent =
      "Não foi possível ler os rascunhos salvos. Você pode importar uma cópia.";
  }
  const money = (n) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  function save(next, recovered = false) {
    if (!storageReadable && !recovered) {status.textContent="Os dados salvos não puderam ser lidos. Exporte a cópia original antes de importar uma lista válida.";return false;}
    try {
      localStorage.setItem(key, JSON.stringify(next));
      products = next; storageReadable = true;
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
    selectedImage="";fileMeta=null;uploadPending=false;readVersion++;showImage("");
    document.getElementById("productFileInfo").textContent="";
    document.getElementById("productFormTitle").textContent="ADICIONAR PRODUTO.";
    document.getElementById("cancelProductEdit").hidden = true;
  }
  document.getElementById("cancelProductEdit").onclick = reset;
  function render() {
    list.replaceChildren();
    const shop = document.getElementById("mtShopDrafts");
    shop.replaceChildren();
    const cards=new Map();
    const visible=products.filter(p=>p.status!=="archived");
    const filtered=visible.filter(p=>!categoryFilter||({Uniformes:"Packs", "Acessórios":"Variados"}[p.category] || p.category)===categoryFilter).sort((a,b)=>Number(b.featured)-Number(a.featured));
    document.getElementById("shopNoResults").hidden = !visible.length || filtered.length > 0;
    document.getElementById("shopProductCount").textContent = visible.length ? `${filtered.length} ${filtered.length===1?"produto na prévia local":"produtos na prévia local"}` : "Coleção em preparação · novidades em breve";
    document.getElementById("adminProductCount").textContent=products.length;
    document.getElementById("adminFeaturedCount").textContent=products.filter(p=>p.featured).length;
    shop.setAttribute("aria-busy","false");document.getElementById("shopLoading").hidden=true;
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
      const media=node("div","product-media");
      if(p.featured) media.append(node("span","product-badge","Destaque"));
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
        media.append(img);
      } else {
        const empty = document.createElement("div");
        empty.className = "product-no-image";
        empty.textContent = "Produto sem imagem";
        media.append(empty);
      }
      const tag = document.createElement("small");
      tag.textContent = `${({Uniformes:"Packs", "Acessórios":"Variados"}[p.category] || p.category)} · ${p.kind === "custom" ? "Encomenda" : "Produto pronto"}`;
      const name = document.createElement("h4");
      name.textContent = p.name;
      const price = document.createElement("strong");
      price.textContent = money(p.price);
      const desc = document.createElement("p");
      desc.textContent = p.description;
      const note = document.createElement("small");
      note.textContent = `${p.stock===0 ? "Sem estoque" : availability[p.availability]} · prévia local`;
      const body=node("div","product-body");
      const purchase = document.createElement("button");
      purchase.textContent = p.stock===0 || p.availability==="unavailable" ? "Indisponível" : "Em breve";
      purchase.disabled = true;
      body.append(tag, name, price, desc, note, purchase);card.append(media,body);
      cards.set(p.id,card);
      const row = document.createElement("article");
      row.className = "mt-draft";
      const title = document.createElement("strong");
      title.textContent = p.name;
      const value = document.createElement("span");
      value.textContent = money(p.price);
      const info = document.createElement("p");
      info.textContent = `${p.category} · ${states[p.status]} · ${availability[p.availability]}${p.featured?" · Destaque":""}${p.stock!==null?` · Estoque: ${p.stock}`:""} — ${p.description}`;
      const reference=node("small","product-file-reference",p.fileMeta ? `Arquivo: ${p.fileMeta.name} (${Math.ceil(p.fileMeta.size/1024)} KB) · referência local` : p.productFile ? `Arquivo: ${p.productFile}` : "Arquivo ainda não informado");
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
          "status",
          "productFile",
          "stock",
        ])
          form.elements[field].value = p[field] ?? "";
        selectedImage=safeDataImage(p.image) ? p.image : "";if(selectedImage)form.elements.image.value="";
        form.elements.featured.checked=p.featured;fileMeta=p.fileMeta;readVersion++;uploadPending=false;
        document.getElementById("productImageUpload").value="";document.getElementById("productFileUpload").value="";
        document.getElementById("productFileInfo").textContent=fileMeta?.name||"";
        showImage(p.image);document.getElementById("productFormTitle").textContent="EDITAR PRODUTO.";
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
      row.append(title, value, info, reference, edit, remove);
      list.append(row);
    });
    filtered.forEach(p=>shop.append(cards.get(p.id)));
    if (!visible.length) {
      shop.setAttribute("aria-label", "Vitrine de produtos em preparação");
      for (let i=0; i<6; i++) {
        const slot=node("article","mt-shop-draft shop-slot");
        slot.setAttribute("aria-hidden","true");
        const media=node("div","product-media");
        const body=node("div","product-body");
        for (const part of ["category","name","price"]) body.append(node("span",`slot-line slot-line--${part}`));
        const action=node("button","slot-action"); action.disabled=true; action.tabIndex=-1;
        body.append(action); slot.append(media,body); shop.append(slot);
      }
    } else shop.removeAttribute("aria-label");
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if(uploadPending){status.textContent="Aguarde a leitura da imagem antes de salvar.";return;}
    try {
      const raw = Object.fromEntries(new FormData(form)),
        item = normalize(
          {
            ...raw,
            image:selectedImage || raw.image.trim(),
            fileMeta,
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
        "Confira nome, descrição, preço positivo e estoque inteiro maior ou igual a zero.";
    }
  });
  document.getElementById("mtExportProducts").onclick = () => {
    const url = URL.createObjectURL(
        new Blob([storageReadable ? JSON.stringify(products, null, 2) : localStorage.getItem(key) || "[]"], {
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
          (products.length || !storageReadable) &&
          !confirm("Substituir os rascunhos locais pelo arquivo importado?")
        )
          return;
        if (save(next, true)) reset();
      } catch {
        status.textContent =
          "Arquivo inválido. Importe uma lista de produtos com nome, descrição e preço positivo; os rascunhos atuais foram mantidos.";
      } finally {
        e.target.value = "";
      }
    });
  document.getElementById("shopCategoryFilters").addEventListener("click",e=>{
    const button=e.target.closest("[data-shop-category]");if(!button)return;
    categoryFilter=button.dataset.shopCategory;
    document.querySelectorAll("[data-shop-category]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));render();
  });
  form.elements.image.addEventListener("input",()=>{selectedImage="";readVersion++;uploadPending=false;showImage(safeImage(form.elements.image.value.trim()));});
  document.getElementById("productImageUpload").addEventListener("change",async e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>1000000){status.textContent="Escolha PNG, JPG ou WebP até 1 MB.";e.target.value="";return;}
    const version=++readVersion;uploadPending=true;
    try {
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
      await new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=reject;img.src=data;});
      if(version!==readVersion)return;
      selectedImage=data;form.elements.image.value="";showImage(data);status.textContent="Imagem pronta para salvar localmente.";
    } catch {if(version===readVersion)status.textContent="Não foi possível ler a imagem. A imagem anterior foi preservada.";}
    finally {if(version===readVersion)uploadPending=false;}
  });
  document.getElementById("clearProductImage").addEventListener("click",()=>{
    selectedImage="";readVersion++;uploadPending=false;form.elements.image.value="";document.getElementById("productImageUpload").value="";showImage("");
  });
  form.elements.productFile.addEventListener("input",()=>{fileMeta=null;document.getElementById("productFileInfo").textContent="";});
  document.getElementById("productFileUpload").addEventListener("change",e=>{
    const file=e.target.files?.[0];if(!file)return;fileMeta={name:file.name,size:file.size};form.elements.productFile.value=file.name;
    document.getElementById("productFileInfo").textContent=`${file.name} · somente referência`;
  });
  requestAnimationFrame(render);
})();
