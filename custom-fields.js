/* Cronos */
/* 2026-09-22 v2｜後台自訂版面與自訂計算欄位 */
'use strict';

function renderCustomFields(){
  const zones={
    topmost:document.getElementById('custom-fields-topmost'),
    fixed:document.getElementById('custom-fields-fixed'),
    basic:document.getElementById('custom-fields-basic'),
    tax:document.getElementById('custom-fields-tax')
  };

  Object.values(zones).forEach(zone=>{
    if(zone) zone.innerHTML='';
  });

  const items=Array.isArray(TAX_CONFIG.customFields) ? TAX_CONFIG.customFields : [];

  items
    .filter(item=>item && item.enabled!==false && zones[item.area])
    .forEach(item=>{
      const block=document.createElement('div');
      block.className='custom-layout-block';

      block.style.backgroundColor=item.backgroundColor || '#ffffff';
      block.style.color=item.textColor || '#0f172a';
      block.style.textAlign=item.textAlign || 'left';

      if(item.borderColor) block.style.borderColor=item.borderColor;
      if(item.borderRadius!==undefined && item.borderRadius!==''){
        block.style.borderRadius=`${Math.max(0,Number(item.borderRadius)||0)}px`;
      }
      if(item.padding!==undefined && item.padding!==''){
        block.style.padding=`${Math.max(0,Number(item.padding)||0)}px`;
      }

      const textWrap=document.createElement('div');
      textWrap.className='custom-layout-text';

      if((item.label||'').trim()){
        const label=document.createElement('div');
        label.className='custom-layout-label';
        label.textContent=item.label;
        textWrap.appendChild(label);
      }

      if((item.value||'').trim()){
        const value=document.createElement('div');
        value.className='custom-layout-value';
        value.textContent=item.value;
        textWrap.appendChild(value);
      }

      const imageUrl=(item.imageUrl||'').trim();
      const imagePosition=item.imagePosition || 'none';

      function makeImage(){
        if(!imageUrl) return null;
        const img=document.createElement('img');
        img.src=imageUrl;
        img.alt=item.imageAlt || item.label || '自定義圖片';
        img.className='custom-layout-image';
        const w=String(item.imageWidth||'').trim();
        if(w) img.style.width=/[%a-z]+$/i.test(w) ? w : `${w}px`;
        return img;
      }

      const img=makeImage();

      const bgImage=(item.backgroundImageUrl||'').trim();
      if(bgImage){
        block.style.backgroundImage=`url("${bgImage.replace(/"/g,'%22')}")`;
        block.style.backgroundSize=item.backgroundSize || 'cover';
        block.style.backgroundPosition=item.backgroundPosition || 'center';
        block.style.backgroundRepeat='no-repeat';
      }

      if(img && imagePosition==='background'){
        block.style.backgroundImage=`url("${imageUrl.replace(/"/g,'%22')}")`;
        block.style.backgroundSize=item.backgroundSize || 'cover';
        block.style.backgroundPosition=item.backgroundPosition || 'center';
        block.style.backgroundRepeat='no-repeat';
        block.appendChild(textWrap);
      }else if(img && imagePosition==='top'){
        block.classList.add('image-top');
        block.append(img,textWrap);
      }else if(img && imagePosition==='left'){
        block.classList.add('image-left');
        block.append(img,textWrap);
      }else if(img && imagePosition==='right'){
        block.classList.add('image-right');
        block.append(textWrap,img);
      }else{
        block.appendChild(textWrap);
      }

      zones[item.area].appendChild(block);
    });
}

/*
  自定義版面「預設不參與計算」。
  只有後台明確勾選 includeInCalculation=true 的項目才產生調整額。
*/
/*
  新增計算欄位：與「版面設計」完全分開。
  只有 customCalculationFields 會影響總稅負；
  customFields 永遠只負責畫面版面。
*/
function getCustomCalculationAdjustments(){
  const result={sole:0,company:0,rows:[]};
  const items=Array.isArray(TAX_CONFIG.customCalculationFields)
    ? TAX_CONFIG.customCalculationFields
    : [];

  items.forEach(item=>{
    if(!item || item.enabled===false) return;

    const amount=Math.max(0,Number(item.amount)||0);
    const signed=(item.operation==='subtract' ? -1 : 1)*amount;
    const target=item.target || 'both';

    if(target==='sole' || target==='both') result.sole+=signed;
    if(target==='company' || target==='both') result.company+=signed;

    result.rows.push({
      label:item.label || '新增計算欄位',
      amount,
      signed,
      target
    });
  });

  return result;
}

function renderCustomCalculationRows(calc){
  document.querySelectorAll('.custom-calc-row').forEach(el=>el.remove());

  const totalCell=document.getElementById('res-total-so');
  const totalRow=totalCell ? totalCell.closest('tr') : null;
  const tbody=totalRow ? totalRow.parentElement : null;
  if(!tbody || !calc || !calc.rows?.length) return;

  calc.rows.forEach(row=>{
    const tr=document.createElement('tr');
    tr.className='custom-calc-row';

    const c1=document.createElement('td');
    c1.className='p-3 text-base text-slate-600';
    c1.textContent=row.label;

    const c2=document.createElement('td');
    c2.className='p-3 text-right font-mono';

    const c3=document.createElement('td');
    c3.className='p-3 text-right font-mono';

    const txt=(row.signed<0?'－':'＋')+formatCurrency(row.amount)+' 元';
    c2.textContent=(row.target==='sole'||row.target==='both') ? txt : '不適用';
    c3.textContent=(row.target==='company'||row.target==='both') ? txt : '不適用';

    tr.append(c1,c2,c3);
    tbody.insertBefore(tr,totalRow);
  });
}
