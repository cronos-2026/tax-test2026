/* Cronos */
/* 2026-09-22 v2｜輸入收集、情境比較與結果呈現 */
'use strict';

function updateSpouseSalaryState() {
    const marital = document.getElementById('marital');
    const spouseSalary = document.getElementById('salary-spouse');
    const hint = document.getElementById('spouse-salary-hint');
    if (!marital || !spouseSalary) return;

    const married = marital.value === 'married';
    spouseSalary.disabled = !married;

    if (!married) {
        spouseSalary.value = '0';
        if (hint) hint.innerText = '單身時不計入配偶薪資所得；選擇「已婚」後即可輸入。';
    } else if (hint) {
        hint.innerText = '已婚：可輸入配偶薪資所得，系統會納入全戶綜所稅計算。';
    }
}

function updateBusinessShareState() {
    const type = document.getElementById('business-type');
    const hint = document.getElementById('ownership-hint');
    if (!type) return;
    if (hint) {
        hint.innerText = type.value === 'sole'
            ? '獨資商號固定按 100% 歸課；本欄僅作為公司持股比例。'
            : '合夥：本欄為合夥盈餘分配比例；公司比較時同時作為本人持股比例。';
    }
}

function collectCalculationInputs() {
    const companyOwnership = Math.min(100, Math.max(0,
        parseFloat(document.getElementById('company-ownership')?.value) || 0
    )) / 100;
    const businessType = document.getElementById('business-type')?.value || 'sole';

    return {
        revenue: parseMoney(document.getElementById('revenue')?.value || 0),
        margin: (parseFloat(document.getElementById('margin')?.value) || 0) / 100,
        businessType,
        companyOwnership,
        businessShare: businessType === 'sole' ? 1 : companyOwnership,
        isMarried: document.getElementById('marital')?.value === 'married',
        dependents: Math.max(0, parseInt(document.getElementById('dependents')?.value) || 0),
        salarySelf: parseMoney(document.getElementById('salary-self')?.value || 0),
        salarySpouse: parseMoney(document.getElementById('salary-spouse')?.value || 0),
        householdDividend: parseMoney(document.getElementById('dividend')?.value || 0),
        minorChildren: getExclusiveDependentCounts().minorBonusCount
    };
}

function buildTaxComparison(input) {
    const netIncome = input.revenue * input.margin;
    const householdMembers = 1 + (input.isMarried ? 1 : 0) + input.dependents;
    const basicLivingTotalCompare = BASIC_LIVING_EXPENSE_COMPARE * householdMembers;

    // 商號情境
    const soOwnerIncome = netIncome * input.businessShare;
    const soPIT = calculatePITFromInputs(
        input.isMarried, input.dependents,
        input.salarySelf, input.salarySpouse,
        input.householdDividend, input.minorChildren
    );
    const soFullBase = soPIT.salaryIncome + soOwnerIncome;
    const soOpt = calculateDividendOptimization(
        soFullBase, input.householdDividend, soPIT.deductions
    );
    const soPit = soOpt.bestTax;

    // 公司情境
    const coBizTax = calculateBusinessIncomeTax(netIncome);
    const retainedEarnings = Math.max(0, netIncome - coBizTax);
    const legalReserve = retainedEarnings * TAX_CONFIG.legalReserveRate;
    const distributableProfit = retainedEarnings - legalReserve;
    const ownerDividend = distributableProfit * input.companyOwnership;
    const coFullDividend = input.householdDividend + ownerDividend;
    const coPIT = calculatePITFromInputs(
        input.isMarried, input.dependents,
        input.salarySelf, input.salarySpouse,
        coFullDividend, input.minorChildren
    );
    const coOpt = calculateDividendOptimization(
        coPIT.salaryIncome, coFullDividend, coPIT.deductions
    );
    const coPit = coOpt.bestTax;
    const allocatedCompanyTax = coBizTax * input.companyOwnership;

    const customCalc = getCustomCalculationAdjustments();
    const soTotal = soPit + customCalc.sole;
    const coTotal = allocatedCompanyTax + coPit + customCalc.company;

    return {
        input,
        netIncome,
        householdMembers,
        basicLivingTotalCompare,
        so: {
            ownerIncome: soOwnerIncome,
            pitContext: soPIT,
            optimization: soOpt,
            pit: soPit,
            total: soTotal,
            dividendMethod: input.householdDividend > 0 ? soOpt.method : '無股利'
        },
        co: {
            businessTax: coBizTax,
            retainedEarnings,
            legalReserve,
            distributableProfit,
            ownerDividend,
            fullDividend: coFullDividend,
            pitContext: coPIT,
            optimization: coOpt,
            pit: coPit,
            allocatedCompanyTax,
            total: coTotal,
            dividendMethod: coFullDividend > 0 ? coOpt.method : '無股利'
        },
        customCalc
    };
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function setHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

function formatOwnership(pct) {
    return (pct * 100).toFixed(2).replace(/\.00$/, '') + '%';
}

function dividendCompareText(amount, opt) {
    if (amount <= 0) return '無股利，無需比較';
    return '合併計稅 ' + formatTaxAmount(opt.mergedTax) +
        '／分開計稅 ' + formatCurrency(opt.separateTax) + ' 元' +
        '（股利28% ' + formatCurrency(opt.separateDividendTax) + ' 元' +
        (opt.baseTax > 0 ? '＋其他所得稅 ' + formatCurrency(opt.baseTax) + ' 元' : '') + '）' +
        '，差額 ' + formatCurrency(opt.saving) + ' 元';
}

function renderSummaryCards(result) {
    const diff = Math.abs(result.so.total - result.co.total);
    let lowerText = '兩者試算相同';
    if (result.so.total < result.co.total) lowerText = '商號試算稅負較低';
    if (result.co.total < result.so.total) lowerText = '公司試算稅負較低';

    setText('summary-so-total', formatTaxAmount(result.so.total));
    setText('summary-co-total', formatTaxAmount(result.co.total));
    setText('summary-tax-diff', formatCurrency(diff) + ' 元');
    setText('summary-lower', lowerText);
    setText('summary-so-pit', '綜所稅 ' + formatTaxAmount(result.so.pit));
    setText('summary-co-pit', '綜所稅 ' + formatTaxAmount(result.co.pit));
    setText('summary-co-business-tax', '公司營所稅 ' + formatCurrency(result.co.businessTax) + ' 元；本人經濟歸屬 ' + formatCurrency(result.co.allocatedCompanyTax) + ' 元');
    setText('summary-so-dividend', '股利方案：' + result.so.dividendMethod);
    setText('summary-co-dividend', '股利方案：' + result.co.dividendMethod);
}

function renderTaxComparison(result) {
    const {input, netIncome, householdMembers, basicLivingTotalCompare, so, co, customCalc} = result;

    renderSummaryCards(result);

    setText('res-income-so',
        formatCurrency(so.ownerIncome) +
        '（核定所得 ' + formatCurrency(netIncome) +
        ' × 分配比例 ' + formatOwnership(input.businessShare) + '）'
    );
    setText('res-income-co', formatCurrency(netIncome));
    setText('res-biz-tax-so', '無（併入個人綜合所得）');
    setHtml('res-biz-tax-co',
        formatCurrency(co.businessTax) + ' 元' +
        '<span class="result-detail">公司依法負擔之全年營所稅；另按本人持股 ' +
        formatOwnership(input.companyOwnership) + ' 計算經濟歸屬 ' +
        formatCurrency(co.allocatedCompanyTax) + ' 元</span>'
    );

    setText('res-dividend-so',
        '商號本人營利所得 ' + formatCurrency(so.ownerIncome) +
        '（已直接併入綜所稅，不屬公司股利）'
    );
    setHtml('res-dividend-co',
        formatCurrency(co.fullDividend) +
        '<span class="result-detail">本人股利 ' + formatCurrency(co.ownerDividend) +
        '（稅後盈餘 ' + formatCurrency(co.retainedEarnings) +
        '－法定公積 ' + formatCurrency(co.legalReserve) +
        '；可分配 ' + formatCurrency(co.distributableProfit) +
        ' × 持股 ' + formatOwnership(input.companyOwnership) + '）</span>'
    );

    const d0 = so.pitContext.deductions;
    const extraItems = d0.optional.items.map(x => x[0] + ' ' + formatCurrency(x[1]) + ' 元');
    if (d0.livingDiff > 0) extraItems.push('基本生活費差額 ' + formatCurrency(d0.livingDiff) + ' 元');
    const exemptionNote = d0.minorBonus > 0
        ? '（含未成年子女 ' + d0.minorCount + ' 人加計 ' + (minorExemptionBonusPercentText() || '50%') + '：' + formatCurrency(d0.minorBonus) + ' 元）' : '';
    const deductionDetail = extraItems.length
        ? '<span class="result-detail">免稅額' + exemptionNote + '＋標準扣除額 ' +
          formatCurrency(d0.exemption + d0.standard) + ' 元；另加 ' + extraItems.join('、') + '</span>'
        : '<span class="result-detail">免稅額' + exemptionNote + '＋標準扣除額</span>';

    setHtml('res-deduction-so', formatCurrency(so.pitContext.deductions.total) + ' 元' + deductionDetail);
    setHtml('res-deduction-co', formatCurrency(co.pitContext.deductions.total) + ' 元' + deductionDetail);

    const livingText = (d) => formatCurrency(basicLivingTotalCompare) + ' 元（' + householdMembers + '人 × ' +
        formatCurrency(BASIC_LIVING_EXPENSE_COMPARE) + '）' +
        '<span class="result-detail">' + (d.livingDiff > 0
            ? '差額 ' + formatCurrency(d.livingDiff) + ' 元已自所得總額減除'
            : '差額 0 元（免稅額與扣除額已高於基本生活費）') + '</span>';
    setHtml('res-basic-living-so', livingText(so.pitContext.deductions));
    setHtml('res-basic-living-co', livingText(co.pitContext.deductions));

    setText('res-rate-so',
        input.householdDividend > 0 ? getRate(so.optimization.mergedTaxable) : getRate(so.optimization.baseTaxable)
    );
    setText('res-rate-co',
        co.fullDividend > 0 ? getRate(co.optimization.mergedTaxable) : getRate(co.optimization.baseTaxable)
    );

    setText('res-pit-so', (so.pit < 0 ? formatTaxAmount(so.pit) + '（股利抵減稅額大於應納稅額，超過部分可退稅；' + so.optimization.method + '）' : formatCurrency(so.pit) + '（' + so.optimization.method + '）'));
    setText('res-pit-co', (co.pit < 0 ? formatTaxAmount(co.pit) + '（股利抵減稅額大於應納稅額，超過部分可退稅；' + co.optimization.method + '）' : formatCurrency(co.pit) + '（' + co.optimization.method + '）'));
    setText('res-dividend-method-so', so.dividendMethod);
    setText('res-dividend-method-co', co.dividendMethod);
    setText('res-dividend-compare-so', dividendCompareText(input.householdDividend, so.optimization));
    setText('res-dividend-compare-co', dividendCompareText(co.fullDividend, co.optimization));

    renderCustomCalculationRows(customCalc);
    setText('res-total-so', formatTaxAmount(so.total));
    setHtml('res-total-co',
        formatTaxAmount(co.total) +
        '<span class="tax-total-detail">本人經濟歸屬公司稅負 ' + formatCurrency(co.allocatedCompanyTax) +
        ' 元（公司營所稅 ' + formatCurrency(co.businessTax) + ' × 持股 ' +
        formatOwnership(input.companyOwnership) + '）<br>' +
        (co.pit < 0
            ? '再扣除本人綜所稅退稅 ' + formatCurrency(-co.pit) + ' 元</span>'
            : '＋本人依法負擔綜所稅 ' + formatCurrency(co.pit) + ' 元</span>')
    );
}

function calculateTax() {
    if (!validateDependentLimitedDeductions(true)) return null;
    const result = buildTaxComparison(collectCalculationInputs());
    renderTaxComparison(result);
    return result;
}
