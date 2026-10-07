/* Cronos */
/* 2026-09-22 v2｜稅額核心計算（個人所得稅、股利、營所稅） */
'use strict';

function calculateProgressiveTax(taxableIncome) {
            const taxable = Math.max(0, Math.floor(taxableIncome));
            if (taxable <= 0) return 0;
            const b = TAX_115.brackets.find(x => taxable <= x.limit);
            return Math.max(0, taxable * b.rate - b.diff);
        }

        function getHouseholdDeductions(isMarried, dependents, salarySelf=0, salarySpouse=0, minorChildren=0) {
            const dep = Math.max(0, dependents);
            const people = 1 + (isMarried ? 1 : 0) + dep;

            // 115 年度起：受扶養未成年子女免稅額加計 50%（101,000 → 151,500）。
            const minorCount = Math.min(Math.max(0, Math.floor(minorChildren) || 0), dep);
            const minorBonus = minorCount * minorExemptionBonusPerPerson();
            const exemption = people * TAX_115.exemption + minorBonus;

            const standard = isMarried
                ? TAX_115.standardDeductionMarried
                : TAX_115.standardDeductionSingle;
            const optional = calculateOptionalDeductions(isMarried, dependents, salarySelf, salarySpouse);

            // 基本生活費差額：全戶基本生活費總額，大於「免稅額＋標準扣除額＋薪資、身障、教育學費、
            // 幼兒學前、長照特別扣除額」的部分，得自所得總額減除（儲蓄投資、房租不列入比較）。
            const livingTotal = BASIC_LIVING_EXPENSE_COMPARE * people;
            const livingCompared = exemption + standard + optional.livingComparable;
            const livingDiff = Math.max(0, livingTotal - livingCompared);

            return {
                people, exemption, minorCount, minorBonus, standard, optional,
                livingTotal, livingCompared, livingDiff,
                total: exemption + standard + optional.total + livingDiff
            };
        }

        function getRate(taxableIncome) {
            const taxable = Math.max(0, taxableIncome);
            if (taxable <= 0) return '0%';
            return (TAX_115.brackets.find(x => taxable <= x.limit).rate * 100) + '%';
        }

        function getSalaryTaxableIncome(salary) {
            // 薪資全額列入所得；薪資所得特別扣除額於扣除額階段依後台設定處理。
            return Math.max(0, Number(salary) || 0);
        }

        function calculateDividendOptimization(baseIncome, dividend, deductions) {
            const base = Math.max(0, Number(baseIncome) || 0);
            const div = Math.max(0, Number(dividend) || 0);
            // 分開計稅時：股利不併入一般綜合所得，因此先計算股利以外所得淨額。
            const baseTaxable = Math.max(0, base - deductions.total);
            // 合併計稅時：免稅額、標準扣除額應對『base + 股利』整體扣除，
            // 不可先把 base 扣到 0 後才加股利，否則在無薪資／其他所得時會漏扣扣除額。
            const mergedTaxable = Math.max(0, base + div - deductions.total);

            // 方案 A：股利合併計稅
            // 股利併入綜合所得，股利及盈餘可抵減稅額為 8.5%，
            // 每一申報戶每年上限 80,000 元。
            const mergedGrossTax = calculateProgressiveTax(mergedTaxable);
            const dividendCredit = Math.min(
                div * TAX_115.dividendCreditRate,
                TAX_115.dividendCreditCap
            );
            // 可抵減稅額大於應納稅額時，超過部分得退稅，因此合併計稅稅額可為負數（代表退稅）。
            const mergedTax = mergedGrossTax - dividendCredit;

            // 方案 B：股利分開按 28% 計稅
            // 其他所得仍照原本累進稅率計算，股利另計 28%。
            const baseTax = calculateProgressiveTax(baseTaxable);
            const separateDividendTax = div * TAX_115.dividendSeparateRate;
            const separateTax = baseTax + separateDividendTax;

            const mergedBetter = mergedTax <= separateTax;
            return {
                baseTaxable,
                mergedTaxable,
                mergedTax,
                separateTax,
                dividendCredit,
                separateDividendTax,
                baseTax,
                bestTax: mergedBetter ? mergedTax : separateTax,
                method: div <= 0 ? '無股利' : (mergedBetter ? '合併計稅' : '分開計稅 28%'),
                saving: div <= 0 ? 0 : Math.abs(mergedTax - separateTax)
            };
        }

        function calculatePITFromInputs(isMarried, dependents, salarySelf, salarySpouse, dividend, minorChildren=0) {
            const deductions = getHouseholdDeductions(isMarried, dependents, salarySelf, salarySpouse, minorChildren);

            const selfSalaryTaxable = getSalaryTaxableIncome(salarySelf);
            const spouseSalaryTaxable = isMarried ? getSalaryTaxableIncome(salarySpouse) : 0;
            const salaryIncome = selfSalaryTaxable + spouseSalaryTaxable;

            const optimized = calculateDividendOptimization(
                salaryIncome,
                Math.max(0, dividend),
                deductions
            );

            const baseTaxable = Math.max(0, salaryIncome - deductions.total);

            return {
                deductions,
                selfSalaryTaxable,
                spouseSalaryTaxable,
                salaryIncome,
                baseTaxable,
                ...optimized
            };
        }


function calculateBusinessIncomeTax(P) {
    const taxable = Math.max(0, Math.floor(P));
    if (taxable <= TAX_CONFIG.businessTaxExemptThreshold) return 0;
    if (taxable <= TAX_CONFIG.businessTaxTransitionThreshold) {
        return (taxable - TAX_CONFIG.businessTaxExemptThreshold) * TAX_CONFIG.businessTaxTransitionRate;
    }
    return taxable * TAX_CONFIG.businessTaxRate;
}
