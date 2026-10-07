/* Cronos */
/* 2026-09-22 v3｜年度參數、資料品質與設定載入 */
'use strict';

const TEMP_CONFIG_LOCAL_KEY='tax_temp_config_override_v1';

// ===== GitHub 參數化版本：正式參數由 tax-config.json 載入 =====
const DEFAULT_TAX_CONFIG = {
    pageTitle: "115年度創業稅負決策試算",
    pageSubtitle: "輸入您的所得與營業條件，快速比較商號與公司兩種組織型態的稅負差異。",
    pageNotice: "本頁為試算工具；扶養、長照、學前子女等資格仍應依實際申報條件判斷。若資格不符，試算結果可能與實際申報不同。",
    showHeaderSection: true,
    taxYear: 115,
    siteVersion: "2026.10.07_v21",
    basicLivingExpense: 213000,
    exemption: 101000,
    seniorExemption: 151500,
    standardDeductionSingle: 136000,
    standardDeductionMarried: 272000,
    salarySpecialDeduction: 227000,
    disabilitySpecialDeduction: 227000,
    savingsInvestmentDeduction: 270000,
    educationTuitionDeduction: 25000,
    preschoolFirstChildDeduction: 150000,
    preschoolAdditionalChildDeduction: 225000,
    longTermCareDeduction: 180000,
    houseRentDeduction: 180000,
    dividendCreditRate: 0.085,
    dividendCreditCap: 80000,
    dividendSeparateRate: 0.28,
    legalReserveRate: 0.10,
    businessTaxExemptThreshold: 120000,
    businessTaxTransitionThreshold: 200000,
    businessTaxTransitionRate: 0.50,
    businessTaxRate: 0.20,
    brackets: [
        { limit: 610000, rate: 0.05, diff: 0 },
        { limit: 1380000, rate: 0.12, diff: 42700 },
        { limit: 2770000, rate: 0.20, diff: 153100 },
        { limit: 5190000, rate: 0.30, diff: 430100 },
        { limit: null, rate: 0.40, diff: 949100 }
    ],
    customParameters: [],
    layoutSettings: {
        leftColumnPercent: 37,
        basicTitle: '一、輸入試算條件',
        resultTitle: '二、比較試算結果',
        versionNoteText: '2026.10.07_v21：後端登入防暴力破解（失敗鎖定、密碼雜湊）、登入紀錄改由後端寫入、發布前設定驗證與版次衝突檢查、前端發布版混淆。 v20：新增未成年子女免稅額加計 50%、納入基本生活費差額、股利抵減退稅處理；列印／PDF 改依內容量自動放大並維持單頁；退稅以「可退稅 ○○ 元」顯示；移除前台頂部功能標籤；列印／PDF 改為實際量測內容高度，自動放大到填滿一頁；「70歲以上」與「未成年子女」可在後台分別設定是否納入計算、是否於前台顯示；「未成年子女人數」欄位移入「已啟用免稅額／特別扣除額」區塊並刪除「其中：」字樣；列印／PDF 時隱藏「立即計算比較」按鈕；後台新增「未成年子女免稅額（含加計）」金額欄位。',
        sections: {
            inputCard:{webVisible:true,printVisible:true},
            resultCard:{webVisible:true,printVisible:true},
            summary:{webVisible:true,printVisible:true,order:1},
            details:{webVisible:true,printVisible:true,order:2},
            basicLiving:{webVisible:true,printVisible:true,order:3},
            taxNotes:{webVisible:true,printVisible:true},
            versionNotes:{webVisible:true,printVisible:false}
        }
    },
    dataQuality: {
        coreIncomeTax: {status: "official", taxYear: 115},
        basicLivingExpense: {
            status: "provisional", taxYear: 115, valueSourceYear: 114, value: 213000,
            note: "115年度每人基本生活所需費用尚待財政部公告；目前暫以114年度213,000元作比較顯示。"
        },
        autoMonitor: {enabled: true, candidatePath: "data/annual-candidate.json", policy: "detect-compare-confirm"}
    }
};
let TAX_CONFIG = structuredClone(DEFAULT_TAX_CONFIG);
let TAX_115 = TAX_CONFIG;
let BASIC_LIVING_EXPENSE_COMPARE = TAX_CONFIG.basicLivingExpense;

function normalizeTaxConfig(raw) {
    const cfg = {...DEFAULT_TAX_CONFIG, ...(raw || {})};
    cfg.brackets = (raw?.brackets || DEFAULT_TAX_CONFIG.brackets).map(b => ({
        limit: b.limit === null || b.limit === '' ? Infinity : Number(b.limit),
        rate: Number(b.rate), diff: Number(b.diff || 0)
    }));
    const rawLayout=raw?.layoutSettings || {};
    const defaultLayout=DEFAULT_TAX_CONFIG.layoutSettings;
    cfg.layoutSettings={...defaultLayout,...rawLayout,sections:{...defaultLayout.sections,...(rawLayout.sections||{})}};
    Object.keys(defaultLayout.sections).forEach(k=>{
        cfg.layoutSettings.sections[k]={...defaultLayout.sections[k],...(rawLayout.sections?.[k]||{})};
    });
    return cfg;
}

function applyDynamicTaxNotes(){
    const topTitleSection=document.getElementById('top-title-section');
    if(topTitleSection) topTitleSection.style.display=(TAX_CONFIG.showHeaderSection===false) ? 'none' : '';
    const noticeText=document.getElementById('page-notice-text');
    if(noticeText) noticeText.textContent=TAX_CONFIG.pageNotice || DEFAULT_TAX_CONFIG.pageNotice;
    const noticeBox=document.getElementById('page-notice');
    if(noticeBox) noticeBox.style.display=(TAX_CONFIG.pageNotice || '').trim() ? '' : 'none';
    const y = Number(TAX_CONFIG.taxYear || 115);
    const adYear = y + 1911;
    const filingYear = y + 1;
    const singleBase = Number(TAX_CONFIG.exemption || 0) + Number(TAX_CONFIG.standardDeductionSingle || 0);
    const main = document.getElementById('tax-note-main');
    const deduction = document.getElementById('tax-note-deduction');
    const reserve = document.getElementById('tax-note-reserve');
    const basis = document.getElementById('tax-note-basis');

    if(main) main.innerHTML =
        `<strong>${y} 年度計稅基準備註：</strong>本工具以 ${y} 年度（${adYear}）綜合所得稅參數試算：` +
        `每人免稅額 ${fmtMoney(TAX_CONFIG.exemption)} 元；標準扣除額單身 ${fmtMoney(TAX_CONFIG.standardDeductionSingle)} 元、夫妻 ${fmtMoney(TAX_CONFIG.standardDeductionMarried)} 元；` +
        `${deductionEnabled('salarySpecialDeduction')?'薪資所得特別扣除額已依後台設定啟用；':'薪資所得特別扣除額目前未啟用；'}綜所稅級距為 ${buildBracketText(TAX_CONFIG.brackets)}。` +
        `股利所得採「合併計稅」與「分開計稅 ${fmtPct(TAX_CONFIG.dividendSeparateRate)}」二方案試算，` +
        `合併計稅之股利可抵減稅額按 ${fmtPct(TAX_CONFIG.dividendCreditRate)}、每戶上限 ${fmtMoney(TAX_CONFIG.dividendCreditCap)} 元，系統自動選擇稅負較低方案。`;

    if(deduction) deduction.innerHTML =
        `<strong>免稅額＋標準扣除額：</strong>單身且無扶養時為 ${fmtMoney(TAX_CONFIG.exemption)}＋${fmtMoney(TAX_CONFIG.standardDeductionSingle)}＝${fmtMoney(singleBase)} 元；` +
        `已婚或有扶養者依人數及婚姻狀態調整。其他已啟用項目會另行加計扣除。`;

    if(reserve) reserve.innerHTML =
        `<strong>法定盈餘公積假設：</strong>本工具暫以本期稅後盈餘 ${fmtPct(TAX_CONFIG.legalReserveRate)} 提列法定盈餘公積。` +
        `若公司既有法定盈餘公積已達實收資本額，或實際盈餘分派條件不同，應依公司法及股東會決議另行調整。`;

    if(basis) basis.textContent =
        `${y} 年度本工具採用基準：每人免稅額 ${fmtMoney(TAX_CONFIG.exemption)} 元、標準扣除額單身 ${fmtMoney(TAX_CONFIG.standardDeductionSingle)} 元／夫妻 ${fmtMoney(TAX_CONFIG.standardDeductionMarried)} 元。` +
        `薪資所得特別扣除額${deductionEnabled('salarySpecialDeduction')?'已啟用':'目前未啟用（薪資族稅額可能偏高）'}；未成年子女免稅額加計 50% 與基本生活費差額已納入計算；${y} 年度資料於 ${filingYear} 年 5 月申報 ${y} 年度所得時適用。`;
}

function applyDataQualityStatus(){
    const box=document.getElementById('data-quality-banner');
    const text=document.getElementById('data-quality-text');
    const source=document.getElementById('data-quality-source');
    if(!box || !text) return;
    const q=TAX_CONFIG.dataQuality || {};
    const living=q.basicLivingExpense || {};
    const y=Number(TAX_CONFIG.taxYear || 115);
    const provisional=String(living.status||'').toLowerCase()!=='official';
    if(!provisional){
        box.hidden=true;
        return;
    }
    const srcYear=Number(living.valueSourceYear || (y-1));
    const value=Number(TAX_CONFIG.basicLivingExpense||living.value||0).toLocaleString('zh-TW');
    text.textContent=`${y}年度「每人基本生活費」尚未標示為正式年度值；目前暫以${srcYear}年度 ${value} 元作比較。系統會監控財政部公告，但不會未經管理員確認就改動正式計算參數。`;
    if(source){
        const u=String(living.sourceUrl||'').trim();
        source.hidden=!u;
        source.href=u||'#';
        source.textContent=u?'查看目前暫用值的官方來源':'';
    }
    box.hidden=false;
}

function applyLayoutSettings(){
    const defaults=DEFAULT_TAX_CONFIG.layoutSettings;
    const ls=TAX_CONFIG.layoutSettings || defaults;
    const sections={...defaults.sections,...(ls.sections||{})};
    const left=Math.min(45,Math.max(30,Number(ls.leftColumnPercent)||37));
    const right=100-left;
    const grid=document.getElementById('main-layout-grid');
    if(grid){
        grid.style.setProperty('--layout-left-col',`${left}fr`);
        grid.style.setProperty('--layout-right-col',`${right}fr`);
    }
    const basicTitle=document.getElementById('basic-data-title');
    if(basicTitle) basicTitle.textContent=ls.basicTitle || defaults.basicTitle;
    const resultTitle=document.getElementById('tax-result-title');
    if(resultTitle) resultTitle.textContent=ls.resultTitle || defaults.resultTitle;

    const map={
        inputCard:document.getElementById('print-basic-card'),
        resultCard:document.getElementById('print-result-card'),
        summary:document.getElementById('result-overview'),
        details:document.getElementById('result-details'),
        basicLiving:document.getElementById('basic-living-explanation'),
        taxNotes:document.getElementById('tax-notes-block'),
        versionNotes:document.getElementById('version-notes-block')
    };
    Object.entries(map).forEach(([key,el])=>{
        if(!el) return;
        const st=sections[key] || {};
        el.dataset.layoutWebVisible=st.webVisible===false?'false':'true';
        el.dataset.layoutPrintVisible=st.printVisible===false?'false':'true';
    });

    const resultCard=map.resultCard;
    if(resultCard){
        ['summary','details','basicLiving']
          .sort((a,b)=>(Number(sections[a]?.order)||99)-(Number(sections[b]?.order)||99))
          .forEach(key=>{if(map[key] && map[key].parentElement===resultCard) resultCard.appendChild(map[key]);});
    }
    const vv=document.getElementById('version-notes-version');
    if(vv) vv.textContent=TAX_CONFIG.siteVersion || '2026.10.07_v21';
    const vt=document.getElementById('version-notes-text');
    if(vt) vt.textContent=ls.versionNoteText || defaults.versionNoteText;
}

function applyTaxConfig(raw) {
    TAX_CONFIG = normalizeTaxConfig(raw);
    TAX_115 = TAX_CONFIG;
    BASIC_LIVING_EXPENSE_COMPARE = Number(TAX_CONFIG.basicLivingExpense || 0);
    const badge = document.querySelector('header .rounded-md.bg-emerald-100');
    if (badge) badge.textContent = TAX_CONFIG.siteVersion || '2026.10.07_v21';
    const y = Number(TAX_CONFIG.taxYear || 115);
    const adYear = y + 1911;
    document.title = `${TAX_CONFIG.pageTitle || '115年度創業稅負決策試算'}｜${y}年所得最佳化`;
    const incomeTitle=document.getElementById('personal-income-year-title');
    if(incomeTitle) incomeTitle.textContent=`${y} 年度個人所得資料`;
    const livingNote=document.getElementById('basic-living-year-note');
    if(livingNote){ const st=TAX_CONFIG.dataQuality?.basicLivingExpense?.status==='official'?'正式值':'暫用值／待公告確認'; livingNote.textContent=`${y} 年度每人基本生活費比較基準：${Number(TAX_CONFIG.basicLivingExpense||0).toLocaleString('en-US')} 元（${st}）。`; }
    const note = document.querySelector('p.text-sm.text-slate-500.text-center');
    if (note) note.textContent = `以 ${TAX_CONFIG.taxYear || 115} 年度稅率、免稅額及扣除額基礎計算`;
    document.querySelectorAll('[id^=res-basic-living-]').forEach(el => { if (el) el.textContent = Number(TAX_CONFIG.basicLivingExpense||0).toLocaleString('en-US') + ' 元'; });
    renderOptionalDeductionFields();
    updatePersonalTaxStandardNote();
    applyDynamicTaxNotes();
    applyDataQualityStatus();
    applyLayoutSettings();
}

function getBrowserTemporaryTaxConfig() {
    try {
        const raw=localStorage.getItem(TEMP_CONFIG_LOCAL_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        console.warn('目前瀏覽器暫時設定讀取失敗，改用正式參數：', err);
        return null;
    }
}

// 網站版本與版本說明屬於「網站本身」的資訊，不是稅務參數：
// 即使瀏覽器留有後台暫存設定，也一律以正式檔（或內建預設）的版本與版本說明為準，避免顯示舊版本。
function overlaySiteVersionInfo(temporary, source) {
    if (!temporary || !source) return temporary;
    const merged = Object.assign({}, temporary);
    if (source.siteVersion) merged.siteVersion = source.siteVersion;
    const srcNote = source.layoutSettings && source.layoutSettings.versionNoteText;
    if (srcNote) {
        merged.layoutSettings = Object.assign({}, temporary.layoutSettings || {}, { versionNoteText: srcNote });
    }
    return merged;
}

async function loadTaxConfig() {
    try {
        const res = await fetch('./tax-config.json?ts=' + Date.now(), {cache:'no-store'});
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const official=await res.json();
        const temporary=getBrowserTemporaryTaxConfig();
        applyTaxConfig(temporary ? overlaySiteVersionInfo(temporary, official) : official);
    } catch (err) {
        console.warn('tax-config.json 載入失敗，使用目前瀏覽器暫時設定或內建預設參數：', err);
        const temporary=getBrowserTemporaryTaxConfig();
        applyTaxConfig(temporary ? overlaySiteVersionInfo(temporary, DEFAULT_TAX_CONFIG) : DEFAULT_TAX_CONFIG);
    }
}
