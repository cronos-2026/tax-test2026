/* Cronos */
/* A4/PDF 橫式一頁優先，自動縮放並維持左資訊／右計算 */
'use strict';

(function(){
  const PRINT_CLASSES = [
    'print-fit-one-page',
    'print-density-normal',
    'print-density-compact',
    'print-density-tight',
    'print-force-basic-two-columns',
    'print-basic-extra-tight',
    'print-two-pages',
    'print-pdf-safe'
  ];

  function isVisible(el){
    if(!el) return false;
    if(el.hidden || el.classList.contains('hidden')) return false;
    return getComputedStyle(el).display !== 'none';
  }

  function countVisible(selector){
    return Array.from(document.querySelectorAll(selector)).filter(isVisible).length;
  }

  function getPrintComplexity(){
    const optionalControls = Array.from(
      document.querySelectorAll('#optional-deductions-section input, #optional-deductions-section select')
    ).filter(isVisible).length;

    const customRows = countVisible('.custom-field-row');
    const customBlocks = countVisible('.custom-layout-block');
    const images = Array.from(document.querySelectorAll('.custom-layout-image')).filter(isVisible).length;

    // 自訂欄位與圖片比一般輸入欄位更容易增加列印高度，因此權重較高。
    return {
      optionalControls,
      customRows,
      customBlocks,
      images,
      score: optionalControls + (customRows * 1.5) + (customBlocks * 2) + (images * 3)
    };
  }

  // 縮放比例依實測決定（A4 橫式、Chrome/Edge 實際輸出 PDF 逐級驗證仍為單頁，並保留約 0.1 的安全餘量）：
  //   無額外輸入欄位 → 實測上限 1.40；3 個 → 1.25；6 個 → 1.00；8 個 → 0.95。
  function choosePrintProfile(complexity){
    const s = complexity.score;
    if(s >= 14) return { density: 'tight',   zoom: 0.68 };
    if(s >= 7)  return { density: 'compact', zoom: 0.85 };
    if(s >= 4)  return { density: 'compact', zoom: 0.95 };
    if(s >= 2)  return { density: 'normal',  zoom: 1.15 };
    return { density: 'normal', zoom: 1.25 };
  }

  function cleanupPrintLayout(){
    PRINT_CLASSES.forEach(cls => document.body.classList.remove(cls));
    document.documentElement.style.removeProperty('--print-zoom');
  }

  // 以「列印版面模擬」量測實際內容高度，再算出能填滿一頁的最大縮放倍率。
  // 做法：暫時複製頁面樣式並啟用其中的 @media print 規則、把 html 寬度設成列印可用寬度除以縮放倍率，
  // 讀取內容高度後立即還原（同步執行，瀏覽器不會繪製中間狀態，畫面不會閃動）。
  const PRINT_PAGE_W_PX = 1096;          // A4 橫式 297mm − 左右邊界 7mm ≈ 290mm
  const PRINT_PAGE_H_PX = 767;           // A4 橫式 210mm − 上下邊界 7mm ≈ 203mm
  const PRINT_FILL_RATIO = 0.95;         // 預留 5% 安全餘量（不同瀏覽器/印表機換行與邊界略有差異）
  const PRINT_ZOOM_MIN = 0.6;
  const PRINT_ZOOM_MAX = 1.7;

  function measureFitZoom(){
    const root = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const clones = [];
    try{
      document.querySelectorAll('style').forEach(st => {
        if(st.dataset.printMeasure) return;
        const c = document.createElement('style');
        c.dataset.printMeasure = '1';
        c.textContent = st.textContent
          .replace(/@media\s+screen\b[^{]*\{/g, '@media not all {')
          .replace(/@media\s+print\b/g, '@media all');
        clones.push(c);
      });
      clones.forEach(c => document.head.appendChild(c));
      root.style.setProperty('--print-zoom', '1');

      const limit = PRINT_PAGE_H_PX * PRINT_FILL_RATIO;
      const heightAt = z => {
        root.style.setProperty('width', (PRINT_PAGE_W_PX / z) + 'px', 'important');
        return Math.max(body.getBoundingClientRect().height, body.scrollHeight) * z;
      };

      let lo = PRINT_ZOOM_MIN, hi = PRINT_ZOOM_MAX;
      if(heightAt(hi) <= limit) return hi;
      if(heightAt(lo) > limit) return lo;
      for(let i = 0; i < 9; i++){
        const mid = (lo + hi) / 2;
        if(heightAt(mid) <= limit) lo = mid; else hi = mid;
      }
      return Math.floor(lo * 100) / 100;
    }catch(err){
      console.warn('列印縮放量測失敗，改用預設比例：', err);
      return null;
    }finally{
      clones.forEach(c => c.remove());
      root.style.removeProperty('width');
      window.scrollTo(0, scrollY);
    }
  }

  function preparePrintLayout(){
    cleanupPrintLayout();

    const complexity = getPrintComplexity();
    const profile = choosePrintProfile(complexity);

    // 一頁優先：A4 橫式、基礎資料雙欄、結果表緊湊排版。
    document.body.classList.add('print-fit-one-page', 'print-pdf-safe', `print-density-${profile.density}`);

    const fitted = measureFitZoom();
    const zoom = fitted || profile.zoom;
    document.documentElement.style.setProperty('--print-zoom', String(zoom));

    // 供除錯或未來調整使用，不會顯示在頁面上。
    document.body.dataset.printDensity = profile.density;
    document.body.dataset.printZoom = String(zoom);
  }

  window.adaptiveSmartPrint = function(){
    preparePrintLayout();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  // 使用 Ctrl+P / 瀏覽器列印時也套用相同的一頁優先策略。
  window.addEventListener('beforeprint', preparePrintLayout);
  window.addEventListener('afterprint', () => {
    cleanupPrintLayout();
    delete document.body.dataset.printDensity;
    delete document.body.dataset.printZoom;
  });
})();
