#!/usr/bin/env python3
"""Check official MOF RSS for annual tax updates.

Safety policy: this script NEVER edits tax-config.json. It writes only
`data/annual-candidate.json`, which the admin page presents for human review.
"""
from __future__ import annotations

import io
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "tax-config.json"
OUT_PATH = ROOT / "data" / "annual-candidate.json"
RSS_URL = "https://www.mof.gov.tw/Rss/384fb3077bb349ea973e7fc6f13b6974"
UA = "Mozilla/5.0 (compatible; TaxAnnualMonitor/1.0; +https://github.com/cronos-2026/tax-planning)"
TIMEOUT = 30
CORE_FIELDS = [
    "exemption", "seniorExemption", "standardDeductionSingle",
    "standardDeductionMarried", "salarySpecialDeduction",
    "disabilitySpecialDeduction", "brackets"
]


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def safe_official_url(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    return host == "mof.gov.tw" or host.endswith(".mof.gov.tw") or host == "gazette.nat.gov.tw"


def get(url: str) -> requests.Response:
    if not safe_official_url(url):
        raise ValueError(f"Blocked non-official URL: {url}")
    r = requests.get(url, headers={"User-Agent": UA}, timeout=TIMEOUT)
    r.raise_for_status()
    return r


def compact_text(s: str) -> str:
    s = s.replace("\u3000", " ").replace("，", ",")
    s = re.sub(r"[\t\r]+", " ", s)
    s = re.sub(r" +", " ", s)
    return s


def page_text_and_pdfs(url: str) -> tuple[str, list[str]]:
    r = get(url)
    r.encoding = r.apparent_encoding or r.encoding
    soup = BeautifulSoup(r.text, "html.parser")
    text = compact_text(soup.get_text("\n", strip=True))
    pdfs = []
    for a in soup.find_all("a", href=True):
        href = urljoin(url, a["href"])
        label = a.get_text(" ", strip=True)
        if ".pdf" in href.lower() and safe_official_url(href):
            pdfs.append((0 if ("速算" in label or "一覽表" in label) else 1, href))
    return text, [u for _, u in sorted(set(pdfs))]


def pdf_text(url: str) -> str:
    try:
        r = get(url)
        reader = PdfReader(io.BytesIO(r.content))
        return compact_text("\n".join((p.extract_text() or "") for p in reader.pages))
    except Exception as e:
        print(f"PDF parse skipped: {url}: {e}", file=sys.stderr)
        return ""


def parse_rss() -> list[dict]:
    r = get(RSS_URL)
    soup = BeautifulSoup(r.content, "xml")
    out = []
    for item in soup.find_all("item"):
        title = item.title.get_text(" ", strip=True) if item.title else ""
        link = item.link.get_text(" ", strip=True) if item.link else ""
        date = item.pubDate.get_text(" ", strip=True) if item.pubDate else ""
        desc = item.description.get_text(" ", strip=True) if item.description else ""
        if link and safe_official_url(link):
            out.append({"title": title, "link": link, "pubDate": date, "description": desc})
    return out


def wan_to_yuan(x: str) -> int:
    return int(round(float(x.replace(",", "")) * 10000))


def yuan_num(x: str) -> int:
    return int(re.sub(r"[^0-9]", "", x))


def find_wan(text: str, patterns: list[str]) -> int | None:
    for pat in patterns:
        m = re.search(pat, text, flags=re.S)
        if m:
            return wan_to_yuan(m.group(1))
    return None


def find_yuan(text: str, patterns: list[str]) -> int | None:
    for pat in patterns:
        m = re.search(pat, text, flags=re.S)
        if m:
            return yuan_num(m.group(1))
    return None


def parse_basic_living(text: str) -> dict:
    value = find_wan(text, [
        r"每人基本生活(?:所需)?(?:之)?費(?:用)?(?:金額)?[^。\n]{0,120}?(?:調高為|提高為|調整為|調高至|提高至|為)\s*(?:新臺幣)?\s*([0-9]+(?:\.[0-9]+)?)\s*萬",
        r"基本生活(?:所需)?(?:之)?費(?:用)?(?:金額)?[^。\n]{0,120}?([0-9]+(?:\.[0-9]+)?)\s*萬元"
    ])
    if value is None:
        value = find_yuan(text, [r"每人基本生活(?:所需)?(?:之)?費(?:用)?(?:金額)?[^。\n]{0,120}?([0-9,，]+)\s*元"])
    return {"basicLivingExpense": value} if value else {}


def parse_core(text: str) -> tuple[dict, dict]:
    found, notes = {}, {}
    v = find_wan(text, [
        r"(?:每人)?免稅額[^。\n]{0,100}?(?:調高至|提高至|調整為|為)\s*([0-9]+(?:\.[0-9]+)?)\s*萬元"
    ]) or find_yuan(text, [r"免稅額[^。\n]{0,120}?每人全年(?:新臺幣)?\s*([0-9,，]+)\s*元"])
    if v: found["exemption"] = v; notes["exemption"] = "官方公告文字"

    v = find_wan(text, [
        r"70歲以上[^。\n]{0,160}?免稅額[^。\n]{0,80}?(?:調高至|提高至|為)\s*([0-9]+(?:\.[0-9]+)?)\s*萬元",
        r"年滿70歲[^。\n]{0,160}?每人全年\s*([0-9]+(?:\.[0-9]+)?)\s*萬元"
    ]) or find_yuan(text, [r"年滿70歲[^。\n]{0,200}?每人全年\s*([0-9,，]+)\s*元"])
    if v: found["seniorExemption"] = v; notes["seniorExemption"] = "官方公告文字"

    v = find_wan(text, [
        r"標準扣除額[^。\n]{0,100}?(?:單身者|納稅義務人個人)?[^。\n]{0,50}?(?:調高至|提高至|為|扣除)\s*([0-9]+(?:\.[0-9]+)?)\s*萬元"
    ]) or find_yuan(text, [r"標準扣除額[^。\n]{0,120}?個人扣除\s*([0-9,，]+)\s*元"])
    if v: found["standardDeductionSingle"] = v; notes["standardDeductionSingle"] = "官方公告文字"

    v = find_wan(text, [
        r"有配偶者[^。\n]{0,120}?(?:標準扣除額)?[^。\n]{0,80}?(?:調高至|提高至|為|扣除)\s*([0-9]+(?:\.[0-9]+)?)\s*萬元",
        r"標準扣除額[^。\n]{0,160}?有配偶者[^。\n]{0,80}?(?:為|扣除)\s*([0-9]+(?:\.[0-9]+)?)\s*萬元"
    ]) or find_yuan(text, [r"有配偶者扣除\s*([0-9,，]+)\s*元"])
    if not v and found.get("standardDeductionSingle") and re.search(r"有配偶者(?:加倍)?扣除|有配偶者加倍", text):
        v = found["standardDeductionSingle"] * 2
        notes["standardDeductionMarried"] = "依官方『有配偶者加倍扣除』文字推導"
    if v:
        found["standardDeductionMarried"] = v
        notes.setdefault("standardDeductionMarried", "官方公告文字")

    both = find_wan(text, [r"薪資所得及身心障礙特別扣除額[^。\n]{0,140}?(?:調高至|提高至|為)\s*([0-9]+(?:\.[0-9]+)?)\s*萬元"])
    if both:
        found["salarySpecialDeduction"] = both
        found["disabilitySpecialDeduction"] = both
        notes["salarySpecialDeduction"] = notes["disabilitySpecialDeduction"] = "官方公告文字"
    else:
        s = find_wan(text, [r"薪資所得特別扣除額[^。\n]{0,120}?(?:調高至|提高至|為|以)\s*([0-9]+(?:\.[0-9]+)?)\s*萬元"])
        d = find_wan(text, [r"身心障礙特別扣除額[^。\n]{0,120}?(?:調高至|提高至|為|以)\s*([0-9]+(?:\.[0-9]+)?)\s*萬元"])
        if s: found["salarySpecialDeduction"] = s; notes["salarySpecialDeduction"] = "官方公告文字"
        if d: found["disabilitySpecialDeduction"] = d; notes["disabilitySpecialDeduction"] = "官方公告文字"

    brackets = parse_brackets(text)
    if brackets:
        found["brackets"] = brackets
        notes["brackets"] = "官方公告附件／速算公式文字"
    return found, notes


def parse_brackets(text: str) -> list[dict] | None:
    # Prefer explicit quick-formula lines: rate + progressive difference.
    rates = [5, 12, 20, 30, 40]
    diffs = {}
    for rate in rates:
        pats = [
            rf"(?:×|乘以|x)\s*{rate}\s*%\s*(?:－|-|減)\s*([0-9,]+)",
            rf"{rate}\s*%[^\n。]{{0,50}}?累進差額[^0-9]{{0,12}}([0-9,]+)"
        ]
        for pat in pats:
            m = re.search(pat, text, flags=re.I)
            if m:
                diffs[rate] = yuan_num(m.group(1)); break
    # Find four upper bounds from lines containing the rates. Keep only plausible 6+ digit amounts.
    limits = []
    for m in re.finditer(r"([0-9]{1,3}(?:,[0-9]{3})+)\s*元?[^\n。]{0,50}?(5|12|20|30|40)\s*%", text):
        val, rate = yuan_num(m.group(1)), int(m.group(2))
        if rate in (5,12,20,30) and val >= 100000:
            limits.append((rate,val))
    by_rate = {}
    for rate,val in limits:
        by_rate[rate] = max(by_rate.get(rate,0), val)
    if not all(r in by_rate for r in (5,12,20,30)):
        return None
    # Compute diffs when absent from statutory progressive rates.
    lims = [by_rate[5], by_rate[12], by_rate[20], by_rate[30]]
    if not (lims[0] < lims[1] < lims[2] < lims[3]):
        return None
    calc_diffs = [0]
    tax_prev = lims[0]*0.05
    calc_diffs.append(round(lims[0]*0.12-tax_prev))
    tax_prev += (lims[1]-lims[0])*0.12
    calc_diffs.append(round(lims[1]*0.20-tax_prev))
    tax_prev += (lims[2]-lims[1])*0.20
    calc_diffs.append(round(lims[2]*0.30-tax_prev))
    tax_prev += (lims[3]-lims[2])*0.30
    calc_diffs.append(round(lims[3]*0.40-tax_prev))
    out=[]
    for i,rate in enumerate(rates):
        diff = diffs.get(rate, calc_diffs[i])
        out.append({"limit": lims[i] if i<4 else None, "rate": rate/100, "diff": diff})
    return out


def select_item(items: list[dict], year: int, kind: str) -> dict | None:
    candidates=[]
    for item in items:
        t=item["title"]
        score=0
        if f"{year}年度" in t: score += 10
        if kind=="basic":
            if "基本生活" in t: score += 8
            if "公告" in t: score += 2
        else:
            if "綜合所得稅" in t: score += 5
            if "免稅額" in t: score += 4
            if "課稅級距" in t: score += 4
            if "公告" in t: score += 2
        if score >= 15:
            candidates.append((score,item))
    return max(candidates,key=lambda x:x[0])[1] if candidates else None


def build_check(items: list[dict], target_year: int, kind: str) -> dict:
    item=select_item(items,target_year,kind)
    check_id = "active-basic-living" if kind=="basic" else "next-year-core"
    title_default = f"{target_year}年度每人基本生活所需費用" if kind=="basic" else f"{target_year}年度綜合所得稅年度參數"
    missing = ["basicLivingExpense"] if kind=="basic" else list(CORE_FIELDS)
    if not item:
        return {
            "id":check_id,"kind":"basicLivingExpense" if kind=="basic" else "coreIncomeTax",
            "targetYear":target_year,"status":"not_announced","confidence":"high",
            "title":title_default,"sourceUrl":"","sourcePublishDate":"","values":{},
            "notes":{},"missingFields":missing,
            "message":"尚未在財政部官方 RSS 找到相符年度正式公告。"
        }
    try:
        text,pdfs=page_text_and_pdfs(item["link"])
        for u in pdfs[:3]:
            text += "\n" + pdf_text(u)
        if kind=="basic":
            values=parse_basic_living(text); notes={k:"官方公告文字" for k in values}
        else:
            values,notes=parse_core(text)
        missing=[k for k in missing if k not in values]
        status="candidate_found" if values and not missing else ("candidate_found_incomplete" if values else "source_found_unparsed")
        return {
            "id":check_id,"kind":"basicLivingExpense" if kind=="basic" else "coreIncomeTax",
            "targetYear":target_year,"status":status,
            "confidence":"high" if values else "medium",
            "title":item["title"] or title_default,"sourceUrl":item["link"],
            "sourcePublishDate":item.get("pubDate", ""),"values":values,"notes":notes,
            "missingFields":missing,
            "message":f"已找到官方來源；辨識 {len(values)} 組參數，仍缺 {len(missing)} 組。" if missing else "已找到官方來源並完成可辨識參數擷取；仍須管理員確認後才可套用。"
        }
    except Exception as e:
        return {
            "id":check_id,"kind":"basicLivingExpense" if kind=="basic" else "coreIncomeTax",
            "targetYear":target_year,"status":"source_found_fetch_error","confidence":"low",
            "title":item["title"] or title_default,"sourceUrl":item["link"],
            "sourcePublishDate":item.get("pubDate", ""),"values":{},"notes":{},"missingFields":missing,
            "message":f"已找到官方來源，但擷取失敗：{type(e).__name__}: {e}"
        }


def main() -> int:
    cfg=json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    active=int(cfg.get("taxYear",115))
    previous={}
    if OUT_PATH.exists():
        try: previous=json.loads(OUT_PATH.read_text(encoding="utf-8"))
        except Exception: pass
    try:
        items=parse_rss()
        checks=[build_check(items,active,"basic"), build_check(items,active+1,"core")]
        monitor_error=""
    except Exception as e:
        # Preserve last candidate values if the official site is temporarily unavailable.
        checks=previous.get("checks",[])
        monitor_error=f"RSS check failed; kept previous candidate data: {type(e).__name__}: {e}"
        if not checks:
            checks=[]
    out={
        "schemaVersion":1,"generatedAt":now_iso(),"activeTaxYear":active,
        "monitorPolicy":"detect-compare-confirm","officialFeed":RSS_URL,
        "monitorError":monitor_error,"checks":checks
    }
    OUT_PATH.parent.mkdir(parents=True,exist_ok=True)
    OUT_PATH.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"generatedAt":out["generatedAt"],"checks":[{"id":c.get("id"),"status":c.get("status"),"values":list((c.get("values") or {}).keys())} for c in checks]},ensure_ascii=False,indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
