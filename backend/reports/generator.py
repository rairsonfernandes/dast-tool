"""
SENTINEL — Gerador de relatórios reais (PDF/CSV).

PDF: reportlab (Platypus) com tabelas, cores por severidade e metadata.
CSV: csv stdlib com quoting correto.

Os dados vêm da BD (Vulnerability/Scan), não são hardcoded.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Iterable, Sequence

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate,
    Paragraph, Spacer, Table, TableStyle, PageBreak,
)


# ============================================================
# HELPERS
# ============================================================
SEV_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}

SEV_COLORS = {
    "critical": colors.HexColor("#FF2E54"),
    "high":     colors.HexColor("#FF8800"),
    "medium":   colors.HexColor("#FFC107"),
    "low":      colors.HexColor("#00B0FF"),
    "info":     colors.HexColor("#9CA3AF"),
}


def _fmt_dt(dt) -> str:
    """Formata datetime para string legível."""
    if not dt:
        return "—"
    if isinstance(dt, datetime):
        return dt.strftime("%Y-%m-%d %H:%M")
    return str(dt)


def _sanitize(text: str) -> str:
    """
    Remove/substitui caracteres Unicode que o Helvetica (Latin-1)
    não consegue renderizar. Isto evita os caracteres corrompidos
    (...) no PDF.
    """
    if not text:
        return ""
    replacements = {
        "\u2018": "'", "\u2019": "'",          # aspas curvas simples
        "\u201c": '"', "\u201d": '"',          # aspas curvas duplas
        "\u2013": "-", "\u2014": "-",          # en dash / em dash
        "\u2026": "...",                        # ellipsis
        "\u2192": "->", "\u2190": "<-",        # setas
        "\u2022": "*",                          # bullet
        "\u00a0": " ",                          # non-breaking space
        "\u200b": "",                           # zero-width space
    }
    text = str(text)
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    # Remove qualquer caractere fora de Latin-1
    return "".join(c for c in text if ord(c) < 0x100)


def _header_footer(canvas, doc):
    """
    Desenha cabeçalho e rodapé em TODAS as páginas.
    O `onPage` do PageTemplate é chamado em cada página, incluindo a primeira.
    """
    canvas.saveState()
    width, height = A4

    # Cabeçalho
    canvas.setFont("Helvetica-Bold", 10)
    canvas.setFillColor(colors.HexColor("#00FF66"))
    canvas.drawString(20 * mm, height - 15 * mm, "SENTINEL — Relatório de Segurança")

    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.gray)
    canvas.drawRightString(
        width - 20 * mm, height - 15 * mm,
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    )

    # Linha separadora verde
    canvas.setStrokeColor(colors.HexColor("#00FF66"))
    canvas.setLineWidth(0.5)
    canvas.line(20 * mm, height - 17 * mm, width - 20 * mm, height - 17 * mm)

    # Rodapé
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.gray)
    canvas.drawCentredString(width / 2, 10 * mm, f"Página {doc.page}")

    canvas.restoreState()


# ============================================================
# CSV
# ============================================================
def generate_csv(vulnerabilities: Iterable, scan: object | None = None) -> bytes:
    """
    Gera CSV real com quoting. Devolve bytes UTF-8 com BOM
    (para o Excel abrir com acentos corretos).
    """
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_ALL)

    # Metadata
    writer.writerow(["# SENTINEL — Relatório de Vulnerabilidades"])
    writer.writerow(["# Gerado em", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")])
    if scan is not None:
        writer.writerow(["# Scan", getattr(scan, "id", "")])
        writer.writerow(["# Alvo", getattr(scan, "target_url", "") or getattr(scan, "url", "")])
        writer.writerow(["# Status", getattr(scan, "status", "")])
        writer.writerow(["# Score", getattr(scan, "score", "") or ""])
    writer.writerow([])

    # Header
    writer.writerow([
        "id", "severity", "title", "cwe", "cvss",
        "affected_url", "status", "discovered_at",
        "description", "remediation",
    ])

    for v in vulnerabilities:
        writer.writerow([
            getattr(v, "id", ""),
            (getattr(v, "severity", "") or "").upper(),
            _sanitize(getattr(v, "title", "") or ""),
            getattr(v, "cwe", "") or "",
            getattr(v, "cvss", "") if getattr(v, "cvss", None) is not None else "",
            getattr(v, "affected_url", "") or "",
            getattr(v, "status", "") or "",
            _fmt_dt(getattr(v, "discovered_at", None)),
            _sanitize((getattr(v, "description", "") or "").replace("\n", " ").strip()),
            _sanitize((getattr(v, "remediation", "") or "").replace("\n", " ").strip()),
        ])

    # UTF-8 BOM para Excel
    return b"\xef\xbb\xbf" + buf.getvalue().encode("utf-8")


# ============================================================
# PDF
# ============================================================
def generate_pdf(
    vulnerabilities: Sequence,
    scan: object | None = None,
    title: str = "Relatório de Vulnerabilidades",
) -> bytes:
    """
    Gera PDF real com reportlab. Devolve bytes.

    Estrutura:
      - Página 1: capa com metadata do scan + resumo por severidade
      - Página 2+: lista de vulnerabilidades ordenadas por severidade
      - Cabeçalho e rodapé em todas as páginas
    """
    buf = io.BytesIO()
    doc = BaseDocTemplate(
        buf, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=25 * mm, bottomMargin=20 * mm,
        title=_sanitize(title), author="SENTINEL",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")

    # `onPage` é chamado em TODAS as páginas (incluindo a primeira).
    # Não usar `onFirstPage` — não existe no reportlab 5.x.
    doc.addPageTemplates([
        PageTemplate(
            id="main",
            frames=[frame],
            onPage=_header_footer,
        )
    ])

    # Estilos
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle(
        "h1", parent=styles["Heading1"], fontSize=20,
        textColor=colors.HexColor("#00FF66"), spaceAfter=10,
    )
    h2 = ParagraphStyle(
        "h2", parent=styles["Heading2"], fontSize=13,
        textColor=colors.HexColor("#111827"), spaceBefore=12, spaceAfter=6,
    )
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9, leading=12)
    small = ParagraphStyle("small", parent=body, fontSize=8, textColor=colors.gray)

    story = []

    # ---------- CAPA ----------
    story.append(Paragraph(_sanitize(title), h1))
    story.append(Paragraph(
        f"SENTINEL — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        small,
    ))
    story.append(Spacer(1, 8 * mm))

    # Metadata do scan
    if scan is not None:
        target = getattr(scan, "target_url", None) or getattr(scan, "url", "—")
        story.append(Paragraph("Scan", h2))
        meta = [
            ["ID", _sanitize(str(getattr(scan, "id", "—")))],
            ["Alvo", _sanitize(str(target))],
            ["Status", _sanitize(str(getattr(scan, "status", "—")))],
            ["Score", str(getattr(scan, "score", "—") or "—")],
            ["Início", _fmt_dt(getattr(scan, "started_at", None))],
            ["Fim", _fmt_dt(getattr(scan, "completed_at", None))],
            ["Duração", f"{getattr(scan, 'duration_seconds', None) or '—'}s"],
        ]
        t = Table(meta, colWidths=[35 * mm, doc.width - 35 * mm])
        t.setStyle(TableStyle([
            ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 9),
            ("FONT", (1, 0), (1, -1), "Helvetica", 9),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#374151")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t)
        story.append(Spacer(1, 8 * mm))

    # Resumo por severidade
    counts: dict[str, int] = {}
    for v in vulnerabilities:
        sev = (getattr(v, "severity", "") or "info").lower()
        counts[sev] = counts.get(sev, 0) + 1

    story.append(Paragraph("Resumo por severidade", h2))
    summary_rows = [["Severidade", "Total"]]
    for sev in ("critical", "high", "medium", "low", "info"):
        if counts.get(sev, 0) > 0:
            summary_rows.append([sev.upper(), str(counts[sev])])
    summary_rows.append(["TOTAL", str(sum(counts.values()))])

    st = Table(summary_rows, colWidths=[60 * mm, doc.width - 60 * mm])
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONT", (0, 0), (-1, -1), "Helvetica-Bold", 9),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D1D5DB")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F3F4F6")),
    ]
    for i, row in enumerate(summary_rows[1:-1], start=1):
        sev = row[0].lower()
        style.append(("TEXTCOLOR", (0, i), (0, i), SEV_COLORS.get(sev, colors.black)))
    st.setStyle(TableStyle(style))
    story.append(st)

    # Nova página para a lista
    story.append(PageBreak())

    # ---------- LISTA DE VULNERABILIDADES ----------
    story.append(Paragraph("Vulnerabilidades", h2))
    if not vulnerabilities:
        story.append(Paragraph("Nenhuma vulnerabilidade registada.", body))
    else:
        ordered = sorted(
            vulnerabilities,
            key=lambda v: SEV_ORDER.get((getattr(v, "severity", "") or "info").lower(), 99),
        )
        for idx, v in enumerate(ordered, start=1):
            sev = (getattr(v, "severity", "") or "info").lower()
            color = SEV_COLORS.get(sev, colors.gray)
            title_v = _sanitize(getattr(v, "title", "") or "Sem título")

            # Cabeçalho do finding
            header = Table(
                [[f"#{idx} — {title_v}", sev.upper()]],
                colWidths=[doc.width - 30 * mm, 30 * mm],
            )
            header.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#F3F4F6")),
                ("BACKGROUND", (1, 0), (1, 0), color),
                ("TEXTCOLOR", (1, 0), (1, 0), colors.white),
                ("FONT", (0, 0), (-1, -1), "Helvetica-Bold", 9),
                ("ALIGN", (1, 0), (1, 0), "CENTER"),
                ("BOX", (0, 0), (-1, -1), 0.25, colors.HexColor("#D1D5DB")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D1D5DB")),
            ]))
            story.append(header)
            story.append(Spacer(1, 2 * mm))

            # Detalhes
            rows = []
            cwe = getattr(v, "cwe", None)
            cvss = getattr(v, "cvss", None)
            url = getattr(v, "affected_url", None)
            if cwe:
                rows.append(["CWE", _sanitize(str(cwe))])
            if cvss is not None:
                rows.append(["CVSS", f"{cvss:.1f}"])
            if url:
                rows.append(["Alvo", Paragraph(_sanitize(str(url)), body)])
            desc = getattr(v, "description", None)
            if desc:
                rows.append(["Descrição", Paragraph(_sanitize(str(desc)), body)])
            rem = getattr(v, "remediation", None)
            if rem:
                rows.append(["Remediação", Paragraph(_sanitize(str(rem)), body)])

            if rows:
                t = Table(rows, colWidths=[30 * mm, doc.width - 30 * mm])
                t.setStyle(TableStyle([
                    ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 8),
                    ("FONT", (1, 0), (1, -1), "Helvetica", 8),
                    ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#374151")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ("BOX", (0, 0), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
                ]))
                story.append(t)

            story.append(Spacer(1, 4 * mm))

    doc.build(story)
    return buf.getvalue()