/* Cronos */
/* 2026-09-22 v2｜免稅額、扣除額欄位與資格檢核 */
'use strict';

const OPTIONAL_DEDUCTION_FRONT_META = {
  seniorExemption:{
    label:'70歲以上受扶養直系尊親屬人數', type:'count', suffix:'人',
    help:()=>`每人改按高齡免稅額 ${formatCurrency(TAX_CONFIG.seniorExemption)} 元計算；本欄僅填受扶養直系尊親屬。`
  },
  salarySpecialDeduction:{
    label:'薪資所得特別扣除額', type:'auto', suffix:'',
    help:()=>`依本人／配偶薪資自動計算，每人最高 ${formatCurrency(TAX_CONFIG.salarySpecialDeduction)} 元。`
  },
  disabilitySpecialDeduction:{
    label:'身心障礙特別扣除資格人數', type:'count', suffix:'人',
    help:()=>`每人 ${formatCurrency(TAX_CONFIG.disabilitySpecialDeduction)} 元；可與70歲以上、教育學費、幼兒學前及長照資格重疊。`
  },
  savingsInvestmentDeduction:{
    label:'儲蓄投資特別扣除額', type:'money', suffix:'元',
    help:()=>`請輸入實際符合資格金額；每戶最高 ${formatCurrency(TAX_CONFIG.savingsInvestmentDeduction)} 元。`
  },
  educationTuitionDeduction:{
    label:'教育學費特別扣除', type:'education', suffix:'',
    help:()=>`限申報扶養就讀大專以上院校子女；每人最高 ${formatCurrency(TAX_CONFIG.educationTuitionDeduction)} 元，不足上限者按實際學費。`
  },
  preschoolFirstChildDeduction:{
    label:'幼兒學前特別扣除符合資格子女人數', type:'count', suffix:'人',
    help:()=>`6歲以下符合資格子女總人數；第1名扣除 ${formatCurrency(TAX_CONFIG.preschoolFirstChildDeduction)} 元，第2名起每人扣除 ${formatCurrency(TAX_CONFIG.preschoolAdditionalChildDeduction)} 元。`
  },
  longTermCareDeduction:{
    label:'長期照顧特別扣除資格人數', type:'count', suffix:'人',
    help:()=>`每人 ${formatCurrency(TAX_CONFIG.longTermCareDeduction)} 元；可與身心障礙等資格重疊，但仍須另確認法定排除條件。`
  },
  houseRentDeduction:{
    label:'房屋租金支出特別扣除額', type:'money', suffix:'元',
    help:()=>`請輸入實際符合資格金額；每戶最高 ${formatCurrency(TAX_CONFIG.houseRentDeduction)} 元，仍須另確認法定適用及排除條件。`
  }
}
// ── 設定讀取：每個項目有兩個獨立開關 ───────────────────────────────
//   enabled：是否納入計算（關閉時該項目不計算，前台也沒有可填欄位）
//   visible：前台是否顯示欄位（預設顯示；隱藏只影響畫面，欄位內容仍照常參與計算）
function deductionSetting(key){
  return (TAX_CONFIG.deductionSettings && TAX_CONFIG.deductionSettings[key]) || {};
}
function deductionVisible(key){
  return deductionSetting(key).visible !== false;
}
// 未成年子女免稅額加計：預設啟用（原本即固定計算），可在後台關閉。
function minorExemptionEnabled(){
  return deductionSetting('minorChildExemption').enabled !== false;
}
// 加計比例：設定檔可指定；未指定時，115 年度起為 50%，之前為 0。
function minorExemptionBonusRate(){
  const r = TAX_CONFIG.minorChildExemptionBonusRate;
  if(r != null && Number.isFinite(Number(r))) return Number(r);
  return Number(TAX_CONFIG.taxYear) >= 115 ? 0.5 : 0;
}
// 前台是否顯示「未成年子女人數」：需納入計算、後台未隱藏，且該年度有加計規則。
// 每位未成年子女「加計」的免稅額：
//   後台填了「未成年子女免稅額（含加計）」金額（>0）→ 加計 = 該金額 − 一般免稅額；
//   未填或為 0 → 沿用「一般免稅額 × 加計比例」（115 年度起 50%，之前 0）。
function minorExemptionBonusPerPerson(){
  const base=Number(TAX_CONFIG.exemption)||0;
  const amt=Number(TAX_CONFIG.minorChildExemption);
  if(Number.isFinite(amt) && amt>0) return Math.max(0, Math.round(amt-base));
  return Math.round(base*minorExemptionBonusRate());
}
function minorExemptionBonusPercentText(){
  const base=Number(TAX_CONFIG.exemption)||0;
  if(base<=0) return '';
  const pct=minorExemptionBonusPerPerson()/base*100;
  return (Math.round(pct*10)/10)+'%';
}
function minorChildFieldShown(){
  return minorExemptionEnabled() && deductionVisible('minorChildExemption') && minorExemptionBonusPerPerson() > 0;
}
function applyMinorChildFieldVisibility(){
  const field = document.getElementById('minor-children-field');
  if(field) field.style.display = minorChildFieldShown() ? '' : 'none';
}

function deductionEnabled(key){
  if(key==='preschoolFirstChildDeduction'){
    return !!(
      TAX_CONFIG.deductionSettings &&
      (
        TAX_CONFIG.deductionSettings.preschoolFirstChildDeduction?.enabled ||
        TAX_CONFIG.deductionSettings.preschoolAdditionalChildDeduction?.enabled
      )
    );
  }
  return !!(TAX_CONFIG.deductionSettings && TAX_CONFIG.deductionSettings[key] && TAX_CONFIG.deductionSettings[key].enabled);
}
function renderOptionalDeductionFields(){
  const section=document.getElementById('optional-deductions-section');
  const box=document.getElementById('optional-deductions-fields');
  if(!section || !box) return;

  applyMinorChildFieldVisibility();

  const active=Object.entries(OPTIONAL_DEDUCTION_FRONT_META).filter(([k])=>deductionEnabled(k));
  const visibleActive=active.filter(([k])=>deductionVisible(k));
  section.classList.toggle('hidden', visibleActive.length===0 && !minorChildFieldShown());
  box.innerHTML='';

  if(visibleActive.length){
    const note=document.createElement('div');
    note.className='notice-important md:col-span-2 rounded-md px-3 py-2 text-sm';
    note.innerHTML='<strong>注意：</strong>人數條件分三類：① 70歲以上受扶養直系尊親屬、教育學費子女（大專以上）、未成年子女（含幼兒學前）屬不同身分群，三類合計不得超過扶養人數；② 幼兒學前只輸入符合資格子女總人數，1人按第1名扣除額，第2名起每人按較高金額計算；③ 身心障礙與長照可與其他資格重疊。教育學費另以實際學費金額計算。';
    box.appendChild(note);
  }

  function buildDeductionField(key,m){
    const wrap=document.createElement('div');
    wrap.className='flex flex-col gap-2.5';
    wrap.dataset.deductionKey=key;
    const id='deduction-'+key;
    // 後台設為「隱藏」：欄位仍在頁面上（數值照常參與計算），只是不顯示。
    if(!deductionVisible(key)) wrap.style.display='none';

    if(m.type==='auto'){
      wrap.innerHTML=`<label class="font-semibold text-slate-700">${m.label}</label>
        <div id="${id}" class="rounded-md border-2 border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">計算時自動依薪資所得帶入</div>
        <p class="text-xs text-slate-500">${m.help()}</p>`;
      return wrap;
    }

    if(m.type==='education'){
      wrap.className='education-deduction-group flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4';
      wrap.innerHTML=`
        <div class="font-semibold text-slate-800">${m.label}</div>
        <div class="flex flex-col gap-2">
          <label class="font-semibold text-slate-700" for="${id}">符合資格子女人數</label>
          <div class="relative">
            <input id="${id}" type="number" min="0" step="1" value="0"
              class="flex h-10 w-full rounded-md border-2 border-slate-300 bg-white px-3 py-1.5 text-base shadow-sm focus:outline-none focus:border-slate-500 pr-8">
            <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-slate-500">人</span>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <label class="font-semibold text-slate-700" for="deduction-educationTuitionAmount">實際可扣除教育學費</label>
          <div class="relative">
            <input id="deduction-educationTuitionAmount" type="text" inputmode="numeric" value="0"
              class="money-input flex h-10 w-full rounded-md border-2 border-slate-300 bg-white px-3 py-1.5 text-base shadow-sm focus:outline-none focus:border-slate-500 pr-8">
            <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-slate-500">元</span>
          </div>
        </div>
        <p class="text-xs text-slate-500">${m.help()}</p>`;
      return wrap;
    }

    const isMoney=m.type==='money';
    const maxAttr=m.type==='count01'?' max="1"':'';
    wrap.innerHTML=`<label class="font-semibold text-slate-700" for="${id}">${m.label}</label>
      <div class="relative">
        <input id="${id}" ${isMoney?'type="text" inputmode="numeric"':'type="number" min="0" step="1"'+maxAttr} value="0"
          class="${isMoney?'money-input ':''}flex h-10 w-full rounded-md border-2 border-slate-300 bg-white px-3 py-1.5 text-base shadow-sm focus:outline-none focus:border-slate-500 pr-8">
        <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-slate-500">${m.suffix}</span>
      </div>
      <p class="text-xs text-slate-500">${m.help()}</p>`;
    return wrap;
  }

  const activeMap=new Map(active);
  const groupedKeys=new Set([
    'educationTuitionDeduction',
    'preschoolFirstChildDeduction'
  ]);

  active.forEach(([key,m])=>{
    if(groupedKeys.has(key)) return;
    box.appendChild(buildDeductionField(key,m));
  });

  if(activeMap.has('educationTuitionDeduction')){
    box.appendChild(buildDeductionField('educationTuitionDeduction',activeMap.get('educationTuitionDeduction')));
  }

  if(activeMap.has('preschoolFirstChildDeduction')){
    const group=document.createElement('div');
    group.className='preschool-deduction-group flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4';
    group.innerHTML='<div class="font-semibold text-slate-800">幼兒學前特別扣除</div>';
    group.appendChild(buildDeductionField('preschoolFirstChildDeduction',activeMap.get('preschoolFirstChildDeduction')));
    box.appendChild(group);
  }

  bindMoneyInputs(box);
  updateDependentLimitedMax();

  const controlledKeys=[
    'seniorExemption',
    'disabilitySpecialDeduction',
    'educationTuitionDeduction',
    'preschoolFirstChildDeduction',
    'longTermCareDeduction'
  ];

  controlledKeys.forEach((key)=>{
    const el=document.getElementById('deduction-'+key);
    if(!el || el.tagName!=='INPUT') return;

    el.addEventListener('beforeinput',(ev)=>{
      if(el.dataset.limitLocked==='1' && ev.inputType && ev.inputType.startsWith('insert')){
        ev.preventDefault();
      }
    });
    el.addEventListener('keydown',(ev)=>{
      if(el.dataset.limitLocked==='1'){
        const allowedKeys=['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End'];
        if(!allowedKeys.includes(ev.key)) ev.preventDefault();
      }
    });
    el.addEventListener('input',()=>{
      updateDependentLimitedMax();
      validateDependentLimitedDeductions(false);
      updateEducationTuitionAmountMax();
    });
    el.addEventListener('change',()=>{
      updateDependentLimitedMax();
      validateDependentLimitedDeductions(false);
      updateEducationTuitionAmountMax();
    });
  });

  const eduAmount=document.getElementById('deduction-educationTuitionAmount');
  if(eduAmount){
    eduAmount.addEventListener('input',()=>setTimeout(updateEducationTuitionAmountMax,0));
    eduAmount.addEventListener('blur',updateEducationTuitionAmountMax);
  }
}

function readDynamicInput(key){
  const el=document.getElementById('deduction-'+key);
  if(!el) return 0;
  if(el.tagName==='INPUT'){
    return el.classList.contains('money-input')
      ? parseMoney(el.value)
      : Math.max(0, Number(el.value)||0);
  }
  return 0;
}

const DEPENDENT_LIMITED_DEDUCTIONS = [
  ['seniorExemption','70歲以上受扶養直系尊親屬'],
  ['disabilitySpecialDeduction','身心障礙特別扣除'],
  ['educationTuitionDeduction','教育學費特別扣除'],
  ['preschoolFirstChildDeduction','幼兒學前特別扣除子女'],
  ['longTermCareDeduction','長期照顧特別扣除']
];

function getExclusiveDependentCounts(){
  const read=(key)=>deductionEnabled(key) ? Math.max(0,Math.floor(Number(document.getElementById('deduction-'+key)?.value)||0)) : 0;
  const senior=read('seniorExemption');
  const education=read('educationTuitionDeduction');
  const preschool=read('preschoolFirstChildDeduction');
  const minorInput=minorExemptionEnabled()
    ? Math.max(0,Math.floor(Number(document.getElementById('minor-children')?.value)||0))
    : 0;
  // 幼兒學前子女必為未成年子女；只填學前人數時，視為至少同數量的未成年子女。
  const minor=Math.max(minorInput,preschool);
  // minorBonusCount：實際適用免稅額加計的人數（後台關閉「未成年子女免稅額加計」時為 0）。
  const minorBonusCount=minorExemptionEnabled() ? minor : 0;
  return { senior, education, preschool, minorInput, minor, minorBonusCount };
}

function updateEducationTuitionAmountMax(){
  const count=Math.max(0,Math.floor(Number(document.getElementById('deduction-educationTuitionDeduction')?.value)||0));
  const maxAmount=count*Math.max(0,Number(TAX_CONFIG.educationTuitionDeduction||0));
  const el=document.getElementById('deduction-educationTuitionAmount');
  if(!el) return;
  const current=Math.max(0,parseMoney(el.value));
  if(current>maxAmount) el.value=formatCurrency(maxAmount);
  el.dataset.maxAmount=String(maxAmount);
  el.title=count===0
    ? '請先輸入符合資格子女人數'
    : `依目前 ${count} 人，教育學費最高可扣除 ${formatCurrency(maxAmount)} 元；不足上限者以實際發生數為限`;
}

function updateDependentLimitedMax(){
  const dependents=Math.max(0,parseInt(document.getElementById('dependents')?.value)||0);
  const counts=getExclusiveDependentCounts();

  const exclusiveMap={
    seniorExemption: counts.education + counts.minor,
    educationTuitionDeduction: counts.senior + counts.minor,
    preschoolFirstChildDeduction: counts.senior + counts.education
  };

  // 未成年子女人數：不得超過扶養人數扣除「70歲以上尊親屬」與「大專以上教育學費子女」。
  const minorEl=document.getElementById('minor-children');
  if(minorEl){
    const minorAllowed=Math.max(0,dependents-counts.senior-counts.education);
    minorEl.max=String(minorAllowed);
    if(Math.max(0,Math.floor(Number(minorEl.value)||0))>minorAllowed) minorEl.value=String(minorAllowed);
  }

  DEPENDENT_LIMITED_DEDUCTIONS.forEach(([key])=>{
    const el=document.getElementById('deduction-'+key);
    if(!el || el.tagName!=='INPUT') return;

    let allowed=dependents;
    if(Object.prototype.hasOwnProperty.call(exclusiveMap,key)){
      allowed=Math.max(0,dependents-exclusiveMap[key]);
    }

    el.max=String(allowed);

    let current=Math.max(0,Math.floor(Number(el.value)||0));
    if(current>allowed){
      el.value=String(allowed);
      current=allowed;
    }

    const shouldLock=current>=allowed;
    el.dataset.limitLocked=shouldLock?'1':'0';

    if(shouldLock){
      el.classList.add('bg-slate-100','text-slate-500','cursor-not-allowed');
      el.setAttribute('aria-disabled','true');
      if(Object.prototype.hasOwnProperty.call(exclusiveMap,key)){
        el.title=`此資格屬扶養身分互斥群組；目前可輸入上限為 ${allowed} 人`;
      }else{
        el.title=dependents===0
          ? '目前扶養人數為 0，請先增加扶養人數'
          : `目前可輸入上限為 ${allowed} 人`;
      }
    }else{
      el.classList.remove('bg-slate-100','text-slate-500','cursor-not-allowed');
      el.removeAttribute('aria-disabled');
      el.title='';
    }
  });

  updateEducationTuitionAmountMax();
}

function validateDependentLimitedDeductions(showMessage=true){
  const dependents=Math.max(0,parseInt(document.getElementById('dependents')?.value)||0);

  // 身心障礙、長照等人數型資格本身仍不得超過扶養人數。
  for(const [key,label] of DEPENDENT_LIMITED_DEDUCTIONS){
    if(!deductionEnabled(key)) continue;
    const el=document.getElementById('deduction-'+key);
    if(!el || el.tagName!=='INPUT') continue;
    const count=Math.max(0,Math.floor(Number(el.value)||0));
    if(count>dependents){
      if(showMessage){
        alert(`「${label}」人數不得超過扶養人數。\n目前扶養人數：${dependents} 人；${label}：${count} 人。`);
        el.focus();
      }
      return false;
    }
  }

  // 互斥群組：直系尊親屬／大專以上子女／未成年子女（含6歲以下）不會是同一扶養人。
  const counts=getExclusiveDependentCounts();
  const exclusiveTotal=counts.senior+counts.education+counts.minor;

  if(exclusiveTotal>dependents){
    if(showMessage){
      alert(`扶養資格人數設定不符：\n「70歲以上受扶養直系尊親屬＋教育學費子女＋未成年子女」合計不得超過扶養人數。\n\n扶養人數：${dependents} 人\n70歲以上：${counts.senior} 人\n教育學費：${counts.education} 人\n未成年子女（含幼兒學前）：${counts.minor} 人`);
    }
    return false;
  }

  // 教育學費採實際發生額，但不得超過人數 × 每人上限。
  if(deductionEnabled('educationTuitionDeduction')){
    const count=counts.education;
    const maxAmount=count*Math.max(0,Number(TAX_CONFIG.educationTuitionDeduction||0));
    const amount=Math.max(0,parseMoney(document.getElementById('deduction-educationTuitionAmount')?.value||0));
    if(amount>maxAmount){
      if(showMessage){
        alert(`教育學費特別扣除額超過可扣除上限。\n目前符合資格子女：${count} 人\n最高可扣除：${formatCurrency(maxAmount)} 元`);
        document.getElementById('deduction-educationTuitionAmount')?.focus();
      }
      return false;
    }
  }

  return true;
}

// 特別扣除額依資格類型分組：扶養身分互斥群組不得超過扶養人數；身障與長照可重疊。
function calculateOptionalDeductions(isMarried, dependents, salarySelf, salarySpouse){
  const items=[];
  let total=0;
  // 計算基本生活費差額時須一併比較的特別扣除額（不含儲蓄投資、房屋租金）。
  let livingComparable=0;

  if(deductionEnabled('seniorExemption')){
    const count=Math.min(Math.max(0,Math.floor(readDynamicInput('seniorExemption'))),Math.max(0,dependents));
    const extraPer=Math.max(0,Number(TAX_CONFIG.seniorExemption||0)-Number(TAX_CONFIG.exemption||0));
    const amount=count*extraPer;
    if(amount>0) items.push(['70歲以上免稅額差額',amount]);
    total+=amount; livingComparable+=amount;
  }

  if(deductionEnabled('salarySpecialDeduction')){
    const cap=Math.max(0,Number(TAX_CONFIG.salarySpecialDeduction||0));
    const selfAmt=Math.min(Math.max(0,salarySelf),cap);
    const spouseAmt=isMarried?Math.min(Math.max(0,salarySpouse),cap):0;
    const amount=selfAmt+spouseAmt;
    const auto=document.getElementById('deduction-salarySpecialDeduction');
    if(auto) auto.textContent=`自動扣除 ${formatCurrency(amount)} 元（本人 ${formatCurrency(selfAmt)}${isMarried?'＋配偶 '+formatCurrency(spouseAmt):''}）`;
    if(amount>0) items.push(['薪資所得特別扣除額',amount]);
    total+=amount; livingComparable+=amount;
  }

  // 身心障礙、長照：定額 × 符合資格人數
  const countRules=[
    ['disabilitySpecialDeduction','身心障礙特別扣除額'],
    ['longTermCareDeduction','長期照顧特別扣除額']
  ];

  countRules.forEach(([key,label])=>{
    if(!deductionEnabled(key)) return;
    let count=Math.max(0,Math.floor(readDynamicInput(key)));
    count=Math.min(count,Math.max(0,dependents));
    const amount=count*Math.max(0,Number(TAX_CONFIG[key]||0));
    if(amount>0) items.push([label,amount]);
    total+=amount; livingComparable+=amount;
  });

  // 幼兒學前：單一總人數欄位。
  // 0人=0；1人=第1名扣除額；2人以上=第1名 + (總人數-1)×第2名以上每人扣除額。
  if(deductionEnabled('preschoolFirstChildDeduction')){
    const count=Math.min(
      Math.max(0,Math.floor(readDynamicInput('preschoolFirstChildDeduction'))),
      Math.max(0,dependents)
    );
    let amount=0;
    if(count>=1){
      amount=Math.max(0,Number(TAX_CONFIG.preschoolFirstChildDeduction||0))
        + Math.max(0,count-1)*Math.max(0,Number(TAX_CONFIG.preschoolAdditionalChildDeduction||0));
    }
    if(amount>0) items.push([`幼兒學前特別扣除（${count}人）`,amount]);
    total+=amount; livingComparable+=amount;
  }

  // 教育學費：每名子女有上限，但不足上限者採實際發生數。
  if(deductionEnabled('educationTuitionDeduction')){
    const count=Math.min(Math.max(0,Math.floor(readDynamicInput('educationTuitionDeduction'))),Math.max(0,dependents));
    const maxAmount=count*Math.max(0,Number(TAX_CONFIG.educationTuitionDeduction||0));
    const actual=Math.max(0,parseMoney(document.getElementById('deduction-educationTuitionAmount')?.value||0));
    const amount=Math.min(actual,maxAmount);
    if(amount>0) items.push(['教育學費特別扣除額',amount]);
    total+=amount; livingComparable+=amount;
  }

  const cappedMoneyRules=[
    ['savingsInvestmentDeduction','儲蓄投資特別扣除額'],
    ['houseRentDeduction','房屋租金支出特別扣除額']
  ];
  cappedMoneyRules.forEach(([key,label])=>{
    if(!deductionEnabled(key)) return;
    const amount=Math.min(readDynamicInput(key),Math.max(0,Number(TAX_CONFIG[key]||0)));
    if(amount>0) items.push([label,amount]);
    total+=amount;
  });

  return {total,items,livingComparable};
}

function updatePersonalTaxStandardNote(){
  const el=document.getElementById('personal-tax-standard-note');
  if(!el) return;
  const enabled=Object.keys(OPTIONAL_DEDUCTION_FRONT_META)
    .filter(deductionEnabled)
    .map(k=>OPTIONAL_DEDUCTION_FRONT_META[k].label);
  el.textContent=`${TAX_CONFIG.taxYear} 年度標準：每人免稅額 ${formatCurrency(TAX_CONFIG.exemption)} 元；單身／夫妻標準扣除額 ${formatCurrency(TAX_CONFIG.standardDeductionSingle)}／${formatCurrency(TAX_CONFIG.standardDeductionMarried)} 元。`+
    (enabled.length?` 已啟用：${enabled.join('、')}。`:' 目前未啟用其他特別扣除額。')+
    ` 股利所得可比較合併計稅或分開計稅 ${fmtPct(TAX_CONFIG.dividendSeparateRate)}。`;
}
