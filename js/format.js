/* Cronos */
/* 2026-09-22 v2｜金額、百分比與輸入格式 */
'use strict';

function fmtMoney(v){
    return Number(v || 0).toLocaleString('en-US');
}
function fmtPct(v){
    return (Number(v || 0) * 100).toLocaleString('zh-TW', {maximumFractionDigits: 2}) + '%';
}
function buildBracketText(brackets){
    const rows = (brackets || []);
    let prev = 0;
    return rows.map((b, i) => {
        const rate = fmtPct(b.rate);
        if (!Number.isFinite(b.limit)) {
            return `${fmtMoney(prev + 1)} 元以上 ${rate}`;
        }
        const limit = Number(b.limit);
        const text = i === 0
            ? `${fmtMoney(limit)} 元以下 ${rate}`
            : `${fmtMoney(prev + 1)}～${fmtMoney(limit)} 元 ${rate}`;
        prev = limit;
        return text;
    }).join('、');
}

function parseMoney(value) {
    return Number(String(value).replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;
}

function formatCurrency(num) {
    return Math.round(Math.max(0, num)).toLocaleString('en-US');
}

// 稅額顯示：應納稅額照常顯示；負數代表退稅，以「可退稅 ○○ 元」表示，不顯示負號。
function formatTaxAmount(num) {
    const n = Math.round(Number(num) || 0);
    return n < 0
        ? '可退稅 ' + Math.abs(n).toLocaleString('en-US') + ' 元'
        : n.toLocaleString('en-US') + ' 元';
}

function formatInput(el) {
    const raw = parseMoney(el.value);
    el.value = raw ? raw.toLocaleString('en-US') : '0';
}

function bindMoneyInputs(root=document){
  root.querySelectorAll('.money-input').forEach(el=>{
    if(el.dataset.moneyBound==='1') return;
    el.dataset.moneyBound='1';
    el.addEventListener('focus',()=>{el.value=String(parseMoney(el.value)||'');setTimeout(()=>{try{el.select();}catch(e){}},0);});
    el.addEventListener('blur',()=>formatInput(el));
    el.addEventListener('input',()=>{el.value=el.value.replace(/[^\d]/g,'');});
    el.addEventListener('paste',()=>setTimeout(()=>{el.value=el.value.replace(/[^\d]/g,'');formatInput(el)},0));
    formatInput(el);
  });
}
