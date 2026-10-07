/* Cronos */
/* 2026-09-22 v2｜多組儲存、載入、歸零與舊版相容 */
'use strict';

const STORAGE_KEY = 'tax_calculator_115_user_inputs_v3';
        const STORAGE_LIST_KEY = 'tax_calculator_115_saved_sets_v4';

        function collectUserData() {
            const fields = {};
            document.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
                if (el.disabled) return;
                fields[el.id] = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
            });
            return fields;
        }

        function applyUserData(fields) {
            // 舊版相容：若舊資料只有 business-share，將其帶入目前共用的持股比例欄位。
            if (fields && fields['company-ownership'] == null && fields['business-share'] != null) {
                fields = { ...fields, 'company-ownership': fields['business-share'] };
            }
            // 先套用會影響其他欄位啟用狀態的選項。
            if (fields && fields.marital !== undefined) document.getElementById('marital').value = fields.marital;
            if (fields && fields['business-type'] !== undefined) document.getElementById('business-type').value = fields['business-type'];
            if (fields && fields.dependents !== undefined) document.getElementById('dependents').value = fields.dependents;
            if (fields && fields['minor-children'] !== undefined) document.getElementById('minor-children').value = fields['minor-children'];
            updateSpouseSalaryState();
            updateBusinessShareState();
            updateDependentLimitedMax();
            Object.entries(fields || {}).forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (!el || el.disabled) return;
                if (el.type === 'checkbox' || el.type === 'radio') el.checked = Boolean(value);
                else el.value = value ?? '';
            });
            document.querySelectorAll('.money-input').forEach(formatInput);
            updateSpouseSalaryState();
            updateBusinessShareState();
            calculateTax();
        }

        function getSavedSets() {
            try {
                const arr = JSON.parse(localStorage.getItem(STORAGE_LIST_KEY) || '[]');
                return Array.isArray(arr) ? arr : [];
            } catch (e) { return []; }
        }

        function setSavedSets(arr) {
            localStorage.setItem(STORAGE_LIST_KEY, JSON.stringify(arr.slice(0, 50)));
        }

        function saveUserData(showStatus = true) {
            const defaultName = '試算資料 ' + new Date().toLocaleString('zh-TW', {
                year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'
            });
            const name = prompt('請輸入這組資料的名稱：', defaultName);
            if (name === null) return;
            const finalName = name.trim() || defaultName;
            const saved = getSavedSets();
            saved.unshift({ id: String(Date.now()), name: finalName, savedAt: new Date().toISOString(), fields: collectUserData() });
            setSavedSets(saved);

            // 同時保留最後一次資料，供相容舊版使用
            localStorage.setItem(STORAGE_KEY, JSON.stringify({version:4, savedAt:new Date().toISOString(), fields:collectUserData()}));
            const s=document.getElementById('save-status');
            if(s && showStatus){s.textContent=`已儲存「${finalName}」；目前共有 ${saved.length} 組資料`;setTimeout(()=>s.textContent='',3000);}
        }

        function openSavedData() {
            const saved = getSavedSets();
            if (!saved.length) {
                alert('目前沒有已儲存的多組資料。請先按「💾 儲存目前資料」。');
                return;
            }

            // 建立可點選的資料選擇視窗，而不是只開啟最後一組
            let overlay = document.getElementById('saved-data-modal');
            if (overlay) overlay.remove();
            overlay = document.createElement('div');
            overlay.id='saved-data-modal';
            overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
            const box=document.createElement('div');
            box.style.cssText='background:white;border-radius:14px;max-width:680px;width:100%;max-height:80vh;overflow:auto;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.25);';
            const title=document.createElement('h3');
            title.textContent='📂 選擇要開啟的已儲存資料';
            title.style.cssText='font-size:20px;font-weight:700;margin:0 0 14px;';
            box.appendChild(title);

            saved.forEach((item, index)=>{
                const row=document.createElement('div');
                row.style.cssText='display:flex;align-items:center;gap:10px;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin:8px 0;';
                const info=document.createElement('div'); info.style.cssText='flex:1;min-width:0;';
                const name=document.createElement('div'); name.textContent=`${index+1}. ${item.name}`; name.style.fontWeight='600';
                const time=document.createElement('div');
                const d=new Date(item.savedAt); time.textContent=!isNaN(d)?d.toLocaleString('zh-TW'):''; time.style.cssText='font-size:12px;color:#6b7280;margin-top:3px;';
                info.append(name,time); row.appendChild(info);
                const open=document.createElement('button'); open.textContent='開啟'; open.type='button';
                open.style.cssText='padding:7px 14px;border-radius:8px;border:1px solid #bae6fd;background:#f0f9ff;color:#0369a1;font-weight:600;cursor:pointer;';
                open.onclick=()=>{applyUserData(item.fields); overlay.remove(); const s=document.getElementById('save-status'); if(s){s.textContent=`已開啟「${item.name}」`;setTimeout(()=>s.textContent='',2500);}};
                row.appendChild(open);
                const del=document.createElement('button'); del.textContent='刪除'; del.type='button';
                del.style.cssText='padding:7px 12px;border-radius:8px;border:1px solid #fecaca;background:#fff1f2;color:#dc2626;cursor:pointer;';
                del.onclick=()=>{if(confirm(`確定刪除「${item.name}」嗎？`)){const now=getSavedSets();now.splice(index,1);setSavedSets(now);openSavedData();}};
                row.appendChild(del);
                box.appendChild(row);
            });

            const footer=document.createElement('div'); footer.style.cssText='display:flex;justify-content:flex-end;margin-top:16px;';
            const close=document.createElement('button'); close.textContent='關閉'; close.type='button';
            close.style.cssText='padding:8px 18px;border-radius:8px;border:1px solid #d1d5db;background:white;cursor:pointer;';
            close.onclick=()=>overlay.remove(); footer.appendChild(close); box.appendChild(footer);
            overlay.appendChild(box); document.body.appendChild(overlay);
        }


        function resetResults() {
            const defaults = {
                'res-income-so':'-', 'res-income-co':'-',
                'res-biz-tax-so':'無（併入個人綜合所得）', 'res-biz-tax-co':'-',
                'res-dividend-so':'-', 'res-dividend-co':'-',
                'res-deduction-so':'-', 'res-deduction-co':'-',
                'res-rate-so':'0%', 'res-rate-co':'0%',
                'res-pit-so':'0 元', 'res-pit-co':'0 元',
                'res-dividend-method-so':'無股利', 'res-dividend-method-co':'無股利',
                'res-dividend-compare-so':'尚未計算', 'res-dividend-compare-co':'尚未計算',
                'res-total-so':'0 元', 'res-total-co':'0 元'
            };
            Object.entries(defaults).forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value;
            });
        }

        function resetCurrentData() {
            ['salary-self','salary-spouse','dividend','revenue'].forEach(id=>{
                const el=document.getElementById(id);
                if(el) el.value='0';
            });
            document.querySelectorAll('#optional-deductions-fields input').forEach(el=>{
                if(el.type==='checkbox' || el.type==='radio') el.checked=false;
                else el.value='0';
            });

            const dep=document.getElementById('dependents'); if(dep) dep.value='0';
            const minorEl=document.getElementById('minor-children'); if(minorEl) minorEl.value='0';
            const margin=document.getElementById('margin'); if(margin) margin.value='0';
            const marital=document.getElementById('marital'); if(marital) marital.value='single';
            const businessType=document.getElementById('business-type'); if(businessType) businessType.value='sole';
            const companyOwnership=document.getElementById('company-ownership'); if(companyOwnership) companyOwnership.value='100';

            updateSpouseSalaryState();
            updateBusinessShareState();
            document.querySelectorAll('.money-input').forEach(formatInput);
            resetResults();

            const s=document.getElementById('save-status');
            if(s){
                s.textContent='目前輸入數字已歸零（已儲存資料不受影響）';
                setTimeout(()=>s.textContent='',2500);
            }
        }

        function clearUserData() {
            if (!confirm('確定要刪除全部已儲存資料嗎？\n目前畫面的輸入數字及試算結果會保留。')) return;
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(STORAGE_LIST_KEY);
            const status=document.getElementById('save-status');
            if(status){
                status.textContent='已清除全部儲存資料（目前畫面資料保留）';
                setTimeout(()=>status.textContent='',3000);
            }
        }


function resetSummaryResults(){
    const defaults={
        'summary-so-total':'0 元',
        'summary-co-total':'0 元',
        'summary-tax-diff':'0 元',
        'summary-lower':'尚未計算',
        'summary-so-pit':'綜所稅 0 元',
        'summary-co-pit':'綜所稅 0 元',
        'summary-co-business-tax':'公司營所稅 0 元；本人經濟歸屬 0 元',
        'summary-so-dividend':'股利方案：無股利',
        'summary-co-dividend':'股利方案：無股利'
    };
    Object.entries(defaults).forEach(([id,value])=>{
        const el=document.getElementById(id); if(el) el.textContent=value;
    });
}

const _resetResultsBase = resetResults;
resetResults = function(){
    _resetResultsBase();
    resetSummaryResults();
};
