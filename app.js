/* Cronos */
/* 2026-09-22 v2｜頁面啟動與事件綁定 */
'use strict';

function applyPageText(){
  const t=document.getElementById('pageTitle');
  const s=document.getElementById('pageSubtitle');
  const pt=document.querySelector('#print-title-inline .print-title-main');
  const ps=document.getElementById('print-title-subtitle');
  const pn=document.getElementById('print-title-notice-text');
  const pnBox=document.getElementById('print-title-notice');

  const title=TAX_CONFIG.pageTitle || "115年度創業稅負決策試算";
  const subtitle=TAX_CONFIG.pageSubtitle || "輸入您的所得與營業條件，快速比較商號與公司兩種組織型態的稅負差異。";
  const notice=TAX_CONFIG.pageNotice || "";

  if(t) t.textContent=title;
  if(s) s.textContent=subtitle;
  if(pt) pt.textContent=title;
  if(ps) ps.textContent=subtitle;
  if(pn) pn.textContent=notice;
  if(pnBox) pnBox.style.display=notice ? '' : 'none';
}


function showStatus(message, ms=1800){
    const s=document.getElementById('save-status');
    if(!s) return;
    s.textContent=message;
    if(ms) setTimeout(()=>{ if(s.textContent===message) s.textContent=''; },ms);
}

function bindAppEvents(){
    document.getElementById('marital')?.addEventListener('change', updateSpouseSalaryState);
    document.getElementById('business-type')?.addEventListener('change', updateBusinessShareState);
    document.getElementById('dependents')?.addEventListener('input', updateDependentLimitedMax);
    document.getElementById('dependents')?.addEventListener('change', updateDependentLimitedMax);
    document.getElementById('minor-children')?.addEventListener('input', updateDependentLimitedMax);
    document.getElementById('minor-children')?.addEventListener('change', updateDependentLimitedMax);

    document.getElementById('save-data-btn')?.addEventListener('click', ()=>saveUserData(true));
    document.getElementById('load-data-btn')?.addEventListener('click', openSavedData);
    document.getElementById('reset-data-btn')?.addEventListener('click', resetCurrentData);
    document.getElementById('clear-data-btn')?.addEventListener('click', clearUserData);
    document.getElementById('print-btn')?.addEventListener('click', ()=>window.adaptiveSmartPrint?.());
    document.getElementById('calc-btn')?.addEventListener('click', ()=>{
        const result=calculateTax();
        if(result) showStatus('已完成計算');
    });
}

window.addEventListener('DOMContentLoaded', async ()=>{
    await loadTaxConfig();
    applyPageText();
    renderCustomFields();
    bindMoneyInputs(document);
    document.querySelectorAll('.money-input').forEach(formatInput);
    updateSpouseSalaryState();
    updateBusinessShareState();
    updateDependentLimitedMax();
    resetSummaryResults();
    bindAppEvents();
});
