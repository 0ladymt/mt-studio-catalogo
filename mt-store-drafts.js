/* MT Studio — painel de rascunhos, sem simular checkout/segurança. */
(()=>{
 const key='mt-studio-product-drafts-v1';
 const form=document.getElementById('mtProductForm'),list=document.getElementById('mtDraftProducts');
 if(!form||!list)return;
 let products=[];
 try{const stored=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(stored))products=stored;}catch(e){console.warn('Rascunhos inválidos',e)}
 const save=()=>{localStorage.setItem(key,JSON.stringify(products));render()};
 const money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 function render(){
   list.replaceChildren();
   const shop=document.getElementById('mtShopDrafts');
   if(shop){shop.replaceChildren();products.forEach(p=>{const card=document.createElement('article');card.className='mt-shop-draft';if(p.image && !/^(https?:|data:|\/\/)/i.test(p.image) && !p.image.includes('..')){const img=document.createElement('img');img.src=p.image;img.alt=p.name;img.loading='lazy';card.append(img)}const title=document.createElement('h4');title.textContent=p.name;const price=document.createElement('strong');price.textContent=money(p.price);const desc=document.createElement('p');desc.textContent=p.description;const note=document.createElement('small');note.textContent='Rascunho · compra indisponível';card.append(title,price,desc,note);shop.append(card)});}
   if(!products.length){const p=document.createElement('p');p.textContent='Nenhum produto em rascunho.';list.append(p);return;}
   products.forEach(p=>{
     const row=document.createElement('article');row.className='mt-draft';
     const title=document.createElement('strong');title.textContent=p.name;
     const price=document.createElement('span');price.textContent=money(p.price);
     const desc=document.createElement('p');desc.textContent=p.description;
     const edit=document.createElement('button');edit.type='button';edit.textContent='Editar';edit.onclick=()=>{
       form.elements.name.value=p.name;form.elements.price.value=p.price;
       form.elements.image.value=p.image;form.elements.description.value=p.description;
       form.dataset.edit=p.id;form.scrollIntoView({behavior:'smooth'});
     };
     const del=document.createElement('button');del.type='button';del.textContent='Excluir';del.onclick=()=>{products=products.filter(x=>x.id!==p.id);save()};
     row.append(title,price,desc,edit,del);list.append(row);
   });
 }
 form.addEventListener('submit',event=>{
   event.preventDefault();const data=new FormData(form);
   const name=String(data.get('name')||'').trim(),price=Number(data.get('price')),description=String(data.get('description')||'').trim(),image=String(data.get('image')||'').trim();
   if(!name||!description||!Number.isFinite(price)||price<=0)return;
   const id=form.dataset.edit||('mt-'+Date.now()+'-'+Math.random().toString(36).slice(2,7));
   const item={id,name,price,description,image,status:'draft'};
   products=form.dataset.edit?products.map(p=>p.id===id?item:p):[...products,item];
   delete form.dataset.edit;form.reset();save();
 });
 document.getElementById('mtExportProducts')?.addEventListener('click',()=>{
   const blob=new Blob([JSON.stringify(products,null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='mt-studio-produtos-rascunho.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 document.getElementById('mtImportProducts')?.addEventListener('change',async event=>{
   const file=event.target.files?.[0];if(!file)return;
   try{
     const data=JSON.parse(await file.text());
     if(!Array.isArray(data)||data.some(p=>!p||typeof p.name!=='string'||typeof p.description!=='string'||!Number.isFinite(Number(p.price))))throw Error('Formato inválido');
     products=data.map((p,i)=>({id:String(p.id||'import-'+i),name:p.name.slice(0,120),description:p.description.slice(0,1000),price:Number(p.price),image:String(p.image||''),status:'draft'}));
     save();
   }catch(error){alert('O arquivo não contém uma lista válida de produtos.');}
   event.target.value='';
 });
 render();
})();