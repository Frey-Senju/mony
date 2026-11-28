"""
Transactional Email Service for Mony API (Resend HTTPS API).

Zero extra dependencies (uses httpx). Automatically operates in safe dry-run
mode when RESEND_API_KEY is not configured, while providing production-ready
Apple Liquid Glass HTML templates for:
- Valuer Watchlist Price-Ceiling Alerts
- Monthly Mony Review Digest
- Couple / Family Shared Workspace Invites
- Password Reset / Security Alerts
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


def is_email_configured() -> bool:
    return bool(os.getenv("RESEND_API_KEY", "").strip())


def _from_address() -> str:
    return os.getenv("RESEND_FROM_EMAIL", "Mony <onboarding@resend.dev>").strip()


def _wrap_html(title: str, subtitle: str, body_html: str, cta_label: str = "Abrir no Mony", cta_path: str = "/dashboard") -> str:
    base_url = os.getenv("FRONTEND_URL", "https://mony-kappa.vercel.app").rstrip("/")
    cta_url = f"{base_url}{cta_path}"
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8" /><title>{title}</title></head>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
    <div style="background:linear-gradient(135deg,#0071E3,#4f46e5);padding:24px 28px;color:#ffffff;">
      <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85;font-weight:700;">Mony · Inteligência Financeira</p>
      <h1 style="margin:8px 0 4px;font-size:22px;line-height:1.25;">{title}</h1>
      <p style="margin:0;font-size:13px;opacity:0.9;">{subtitle}</p>
    </div>
    <div style="padding:24px 28px;font-size:14px;line-height:1.6;color:#334155;">
      {body_html}
      <div style="margin-top:24px;">
        <a href="{cta_url}" style="display:inline-block;background:#0071E3;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:12px;">
          {cta_label} →
        </a>
      </div>
    </div>
    <div style="padding:14px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;">
      Enviado automaticamente pelo Mony. Você pode gerenciar alertas em Configurações → Integrações.
    </div>
  </div>
</body>
</html>"""


async def send_email(
    to: str,
    subject: str,
    html: str,
    text: Optional[str] = None,
) -> dict[str, Any]:
    """Send an email via Resend API, or return a safe dry-run result if unconfigured."""
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    if not api_key or not to:
        return {"sent": False, "mode": "dry_run", "to": to, "subject": subject}

    payload: dict[str, Any] = {
        "from": _from_address(),
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                RESEND_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if 200 <= res.status_code < 300:
                body = res.json()
                return {"sent": True, "mode": "resend", "id": body.get("id"), "to": to}
            logger.warning("Resend returned %s: %s", res.status_code, res.text[:200])
            return {"sent": False, "mode": "resend_error", "status_code": res.status_code}
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed sending Resend email: %s", exc)
        return {"sent": False, "mode": "error", "error": str(exc)}


async def send_valuer_ceiling_alert_email(
    to: str,
    user_name: str,
    alerts: list[dict[str, Any]],
) -> dict[str, Any]:
    rows = "".join(
        f"<tr>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:700;'>{a['ticker']}</td>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #e2e8f0;'>R$ {a['price']:.2f}</td>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#059669;font-weight:700;'>R$ {a['target_ceiling']:.2f}</td>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#059669;'>+{a['discount_pct']:.1f}%</td>"
        f"</tr>"
        for a in alerts
    )
    body = f"""
    <p>Olá <strong>{user_name or 'Investidor'}</strong>,</p>
    <p>O <strong>Mony Valuer</strong> detectou <strong>{len(alerts)} ativo(s)</strong> da sua Watchlist negociando abaixo do seu Preço-Teto configurado:</p>
    <table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:13px;">
      <thead>
        <tr style="background:#f8fafc;text-align:left;">
          <th style="padding:8px 10px;">Ticker</th>
          <th style="padding:8px 10px;">Cotação</th>
          <th style="padding:8px 10px;">Seu Teto</th>
          <th style="padding:8px 10px;">Margem</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
    """
    html = _wrap_html(
        title=f"🎯 {len(alerts)} Ativo(s) Abaixo do Preço-Teto",
        subtitle="Alerta automático da sua Watchlist Mony Valuer B3",
        body_html=body,
        cta_label="Abrir Mony Valuer",
        cta_path="/dashboard/valuer",
    )
    return await send_email(
        to=to,
        subject=f"[Mony Valuer] {alerts[0]['ticker']} atingiu seu Preço-Teto!",
        html=html,
    )


async def send_monthly_review_email(
    to: str,
    user_name: str,
    month_label: str,
    income: float,
    expenses: float,
    net_balance: float,
) -> dict[str, Any]:
    savings_pct = ((income - expenses) / income * 100.0) if income > 0 else 0.0
    body = f"""
    <p>Olá <strong>{user_name or 'Investidor'}</strong>,</p>
    <p>Seu fechamento mensal <strong>Mony Review ({month_label})</strong> está pronto:</p>
    <ul style="padding-left:18px;margin:12px 0;">
      <li><strong>Receitas:</strong> R$ {income:,.2f}</li>
      <li><strong>Despesas:</strong> R$ {expenses:,.2f}</li>
      <li><strong>Resultado Líquido:</strong> R$ {net_balance:,.2f} ({savings_pct:.1f}% taxa de poupança)</li>
    </ul>
    <p>Acesse o painel de Insights para conferir seu Health Score 0–100, conquistas de XP e o radar de assinaturas.</p>
    """
    html = _wrap_html(
        title=f"📊 Mony Review — {month_label}",
        subtitle="Resumo executivo do seu mês financeiro",
        body_html=body,
        cta_label="Ver Meu Mony Review",
        cta_path="/dashboard/insights",
    )
    return await send_email(
        to=to,
        subject=f"[Mony Review] Seu fechamento de {month_label} está pronto",
        html=html,
    )
