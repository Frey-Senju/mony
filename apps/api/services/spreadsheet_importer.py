"""
Intelligent 2026 Financial Spreadsheet Importer (EPIC-007 Story 7.3).

Parses multi-tab personal finance workbooks (Google Sheets via public export URL
or uploaded .xlsx file) with dynamic header detection per monthly tab:
  - Handles layout variations across months (e.g., January without checkbox vs November with ✅)
  - Extracts Incomes ('Entradas | Valor') separately from summary/budget formulas
  - Extracts Expenses with:
      * Description, Amount, Category
      * Purchase Date (Excel serial number -> ISO date)
      * Statement Month (YYYY-MM derived from tab name + reference year)
      * Installments ('8 de 10', '25 de 77', '3/6') -> installment_number & installment_total
      * Infinite recurrences ('∞') -> is_recurring=True
      * Payment method & account/card label ('Cartão Bradesco', 'Cartão XP', 'Sofisa', 'Boleto', 'PIX')
      * Reconciled status ('✅' == 1)

Zero external dependencies: pure Python stdlib (zipfile + xml.etree.ElementTree).
"""

from __future__ import annotations

from datetime import date, timedelta
import io
import re
from typing import Any, Optional
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

PT_MONTH_MAP: dict[str, int] = {
    "janeiro": 1,
    "jan": 1,
    "fevereiro": 2,
    "fev": 2,
    "marco": 3,
    "março": 3,
    "mar": 3,
    "abril": 4,
    "abr": 4,
    "maio": 5,
    "mai": 5,
    "junho": 6,
    "jun": 6,
    "julho": 7,
    "jul": 7,
    "agosto": 8,
    "ago": 8,
    "setembro": 9,
    "set": 9,
    "outubro": 10,
    "out": 10,
    "novembro": 11,
    "nov": 11,
    "dezembro": 12,
    "dez": 12,
}

EXCEL_EPOCH = date(1899, 12, 30)
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def _norm(s: str) -> str:
    nfkd = unicodedata.normalize("NFKD", (s or "").strip().lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _col_to_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha()).upper()
    idx = 0
    for ch in letters:
        idx = idx * 26 + (ord(ch) - 64)
    return idx


def _parse_number(raw: Any) -> Optional[float]:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    s = s.replace("R$", "").replace(" ", "")
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        v = float(s)
        return round(v, 2) if v > 0 else None
    except ValueError:
        return None


def _parse_excel_date(raw: Any, fallback: date) -> date:
    if raw is None:
        return fallback
    s = str(raw).strip()
    if not s:
        return fallback
    # ISO date YYYY-MM-DD
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        try:
            return date.fromisoformat(s[:10])
        except ValueError:
            pass
    # Brazilian DD/MM/YYYY
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{2,4})$", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        try:
            return date(y, mo, d)
        except ValueError:
            pass
    # Excel serial date (e.g. 45420.0)
    try:
        serial = int(float(s))
        if 30000 <= serial <= 65000:
            return EXCEL_EPOCH + timedelta(days=serial)
    except ValueError:
        pass
    return fallback


def _parse_installments(raw: Any) -> tuple[Optional[int], Optional[int], bool]:
    """Return (installment_number, installment_total, is_recurring)."""
    s = str(raw or "").strip()
    if not s:
        return None, None, False
    if "∞" in s or _norm(s) in ("infinito", "recorrente", "fixo", "fixa", "mensal"):
        return None, None, True
    m = re.search(r"(\d{1,2})\s*(?:de|/)\s*(\d{1,3})", s, re.IGNORECASE)
    if m:
        num = int(m.group(1))
        tot = int(m.group(2))
        if num >= 1 and tot >= num:
            return num, tot, False
    return None, None, False


def _infer_payment_method(raw_payment: str) -> str:
    low = _norm(raw_payment)
    if not low:
        return "other"
    if "pix" in low:
        return "pix"
    if "boleto" in low:
        return "boleto"
    if "debito" in low:
        return "debit_card"
    if "cartao" in low or "credito" in low or "xp" in low or "bradesco" in low or "nubank" in low or "inter" in low or "itau" in low or "sofisa" in low or "santander" in low:
        return "credit_card"
    if "dinheiro" in low:
        return "cash"
    if "transfer" in low or "ted" in low or "doc" in low:
        return "bank_transfer"
    return "other"


def extract_google_sheet_id(url: str) -> Optional[str]:
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9_-]{15,})", url or "")
    return m.group(1) if m else None


def download_google_sheet_xlsx(url: str, timeout: int = 25) -> bytes:
    sheet_id = extract_google_sheet_id(url)
    if not sheet_id:
        raise ValueError("URL inválida do Google Sheets. Copie o link completo da planilha (docs.google.com/spreadsheets/d/...).")
    export_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=xlsx"
    req = urllib.request.Request(export_url, headers={"User-Agent": "MonyImporter/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
    except Exception as exc:  # noqa: BLE001
        raise ValueError(
            f"Não foi possível baixar a planilha do Google Sheets ({exc}). "
            "Verifique se ela está compartilhada como 'Qualquer pessoa com o link pode ver' ou faça upload do arquivo .xlsx."
        ) from exc
    if len(data) < 200 or not data.startswith(b"PK"):
        raise ValueError(
            "A planilha do Google Sheets parece estar privada. Compartilhe como 'Qualquer pessoa com o link' ou baixe em Arquivo → Fazer download → Excel (.xlsx) e envie aqui."
        )
    return data


def _read_xlsx_sheets(xlsx_bytes: bytes) -> list[tuple[str, dict[int, dict[int, str]]]]:
    """
    Return [(sheet_name, {row_num: {col_idx: str_value}}), ...] for all sheets.
    """
    zf = zipfile.ZipFile(io.BytesIO(xlsx_bytes))
    sst: list[str] = []
    if "xl/sharedStrings.xml" in zf.namelist():
        sst_root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
        for si in sst_root.findall("m:si", NS):
            sst.append("".join(t.text or "" for t in si.findall(".//m:t", NS)))

    # Map rId -> target path
    rels_map: dict[str, str] = {}
    if "xl/_rels/workbook.xml.rels" in zf.namelist():
        rels_root = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        for rel in rels_root:
            rid = rel.attrib.get("Id")
            target = rel.attrib.get("Target", "")
            if rid and target:
                clean = target.lstrip("/")
                if not clean.startswith("xl/"):
                    clean = f"xl/{clean}"
                rels_map[rid] = clean

    wb_root = ET.fromstring(zf.read("xl/workbook.xml"))
    out: list[tuple[str, dict[int, dict[int, str]]]] = []
    for idx, sheet_el in enumerate(wb_root.findall(".//m:sheet", NS), start=1):
        name = sheet_el.attrib.get("name", f"Sheet{idx}")
        rid = None
        for k, v in sheet_el.attrib.items():
            if k.endswith("}id") or k == "r:id":
                rid = v
                break
        path = rels_map.get(rid or "", f"xl/worksheets/sheet{idx}.xml")
        if path not in zf.namelist():
            continue

        grid: dict[int, dict[int, str]] = {}
        s_root = ET.fromstring(zf.read(path))
        for r_el in s_root.findall(".//m:sheetData/m:row", NS):
            r_num = int(r_el.attrib.get("r", "0") or 0)
            if r_num <= 0:
                continue
            row_cells: dict[int, str] = {}
            for c_el in r_el.findall("m:c", NS):
                ref = c_el.attrib.get("r", "")
                c_idx = _col_to_index(ref)
                t = c_el.attrib.get("t", "")
                val = ""
                if t == "inlineStr":
                    val = "".join(x.text or "" for x in c_el.findall(".//m:t", NS))
                else:
                    v_el = c_el.find("m:v", NS)
                    if v_el is not None and v_el.text is not None:
                        if t == "s":
                            si_idx = int(v_el.text)
                            val = sst[si_idx] if 0 <= si_idx < len(sst) else ""
                        else:
                            val = v_el.text
                if val.strip():
                    row_cells[c_idx] = val.strip()
            if row_cells:
                grid[r_num] = row_cells
        out.append((name, grid))
    return out


def parse_2026_spreadsheet(
    xlsx_bytes: bytes,
    *,
    year: int = 2026,
    selected_months: Optional[list[int]] = None,
) -> dict[str, Any]:
    """
    Parse a multi-month personal finance workbook (e.g. Economias e Organizações 2026).
    Returns structured summary, available months, detected categories/accounts, and items.
    """
    sheets = _read_xlsx_sheets(xlsx_bytes)
    available_months: list[dict[str, Any]] = []
    all_items: list[dict[str, Any]] = []
    categories_found: set[str] = set()
    accounts_found: set[str] = set()

    for sheet_name, grid in sheets:
        month_num = PT_MONTH_MAP.get(_norm(sheet_name))
        if month_num is None:
            continue
        stmt_ym = f"{year:04d}-{month_num:02d}"
        month_default_date = date(year, month_num, 1)
        available_months.append({"month": month_num, "name": sheet_name, "statement_month": stmt_ym})

        if selected_months and month_num not in selected_months:
            continue

        # 1. Locate Expense header row dynamically (looks for 'Descrição' + 'Valor')
        exp_header_row: Optional[int] = None
        col_desc = col_val = col_cat = col_date = col_parc = col_pay = col_check = None

        for r_num in sorted(grid.keys())[:15]:
            cells = grid[r_num]
            norm_cells = {c: _norm(v) for c, v in cells.items()}
            desc_c = next((c for c, v in norm_cells.items() if "descricao" in v), None)
            if desc_c is None:
                continue
            val_c = next((c for c, v in norm_cells.items() if c > desc_c and v == "valor"), None)
            if val_c is None:
                continue
            exp_header_row = r_num
            col_desc = desc_c
            col_val = val_c
            col_cat = next((c for c, v in norm_cells.items() if c > desc_c and "categor" in v), None)
            col_date = next((c for c, v in norm_cells.items() if c > desc_c and "data" in v), None)
            col_parc = next((c for c, v in norm_cells.items() if c > desc_c and "parcel" in v), None)
            col_pay = next((c for c, v in norm_cells.items() if c > desc_c and ("pagament" in v or "cartao" in v or "conta" in v)), None)
            col_check = next((c for c, v in cells.items() if c < desc_c and ("✅" in v or _norm(v) in ("pago", "ok", "status"))), None)
            break

        # 2. Extract Expenses
        if exp_header_row and col_desc and col_val:
            for r_num in sorted(grid.keys()):
                if r_num <= exp_header_row:
                    continue
                cells = grid[r_num]
                desc = (cells.get(col_desc) or "").strip()
                amt = _parse_number(cells.get(col_val))
                if not desc or amt is None:
                    continue
                if _norm(desc) in ("total", "subtotal", "gastos totais", "soma"):
                    continue

                raw_cat = (cells.get(col_cat) or "").strip() if col_cat else ""
                if not raw_cat:
                    raw_cat = "Outros"
                categories_found.add(raw_cat)

                raw_pay = (cells.get(col_pay) or "").strip() if col_pay else ""
                if raw_pay:
                    accounts_found.add(raw_pay)
                pm = _infer_payment_method(raw_pay)

                purchase_date = _parse_excel_date(cells.get(col_date) if col_date else None, month_default_date)
                inst_num, inst_tot, is_rec = _parse_installments(cells.get(col_parc) if col_parc else None)

                is_reconciled = True
                if col_check and col_check in cells:
                    chk = _norm(cells[col_check])
                    is_reconciled = chk in ("1", "true", "sim", "ok", "x", "pago")

                all_items.append({
                    "description": desc[:255],
                    "merchant_name": desc[:120],
                    "type": "expense",
                    "amount": amt,
                    "category_name": raw_cat[:100],
                    "payment_method": pm,
                    "payment_account_label": raw_pay[:100] if raw_pay else None,
                    "transaction_date": purchase_date.isoformat(),
                    "original_purchase_date": purchase_date.isoformat(),
                    "statement_month": stmt_ym,
                    "installment_number": inst_num,
                    "installment_total": inst_tot,
                    "is_recurring": is_rec,
                    "is_reconciled": is_reconciled,
                    "sheet_name": sheet_name,
                })

        # 3. Locate & Extract Incomes block ('Entradas' | 'Valor' on the left columns)
        inc_header_row: Optional[int] = None
        inc_col_desc = inc_col_val = None
        for r_num in sorted(grid.keys())[:25]:
            cells = grid[r_num]
            for c, v in cells.items():
                if col_desc and c >= col_desc:
                    continue
                if _norm(v) in ("entradas", "receitas", "entrada"):
                    # Look for 'Valor' in c+1 or c+2
                    vc = next((cc for cc in (c + 1, c + 2) if _norm(cells.get(cc, "")) == "valor"), c + 1)
                    inc_header_row = r_num
                    inc_col_desc = c
                    inc_col_val = vc
                    break
            if inc_header_row:
                break

        if inc_header_row and inc_col_desc and inc_col_val:
            for r_num in sorted(grid.keys()):
                if r_num <= inc_header_row:
                    continue
                cells = grid[r_num]
                # Stop when we reach summary/total or next section ('Objetivos do Salário', month name total)
                left_label = _norm(cells.get(inc_col_desc - 1, "")) + " " + _norm(cells.get(inc_col_desc, ""))
                if any(stop in left_label for stop in ("objetivos do salario", "gasto maximo", "gasto max", "total entradas", "resumo")):
                    break
                inc_desc = (cells.get(inc_col_desc) or "").strip()
                inc_val = _parse_number(cells.get(inc_col_val))
                if not inc_desc:
                    continue
                # Stop at month-name subtotal row (e.g. 'Janeiro | 5147.23' or 'Dezembro | 6136.26')
                if _norm(inc_desc) in PT_MONTH_MAP:
                    break
                if inc_val is None:
                    continue

                all_items.append({
                    "description": inc_desc[:255],
                    "merchant_name": inc_desc[:120],
                    "type": "income",
                    "amount": inc_val,
                    "category_name": "Trabalho" if "pagament" in _norm(inc_desc) or "salario" in _norm(inc_desc) or "ferias" in _norm(inc_desc) else "Entradas",
                    "payment_method": "bank_transfer",
                    "payment_account_label": None,
                    "transaction_date": month_default_date.isoformat(),
                    "original_purchase_date": month_default_date.isoformat(),
                    "statement_month": stmt_ym,
                    "installment_number": None,
                    "installment_total": None,
                    "is_recurring": "pagament" in _norm(inc_desc) or "salario" in _norm(inc_desc),
                    "is_reconciled": True,
                    "sheet_name": sheet_name,
                })

    income_items = [i for i in all_items if i["type"] == "income"]
    expense_items = [i for i in all_items if i["type"] == "expense"]
    recurring_items = [i for i in expense_items if i["is_recurring"]]
    installment_items = [i for i in expense_items if i["installment_total"] and i["installment_total"] > 1]

    return {
        "year": year,
        "available_months": available_months,
        "detected_categories": sorted(categories_found),
        "detected_payment_accounts": sorted(accounts_found),
        "counts": {
            "total": len(all_items),
            "incomes": len(income_items),
            "expenses": len(expense_items),
            "recurrences": len(recurring_items),
            "installments": len(installment_items),
        },
        "totals": {
            "income": round(sum(i["amount"] for i in income_items), 2),
            "expenses": round(sum(i["amount"] for i in expense_items), 2),
        },
        "items": all_items,
    }
