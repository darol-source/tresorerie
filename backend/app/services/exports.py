import csv
import io
import re
from decimal import Decimal

from fastapi import Response
from openpyxl import Workbook
from openpyxl.styles import Font
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

Section = tuple[str, list[str], list[list]]  # (titre, entetes, lignes)

MEDIAS = {
    "pdf": "application/pdf",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "csv": "text/csv; charset=utf-8",
}


def _txt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, (Decimal, float)):
        return f"{v:,.2f}".replace(",", " ")
    return str(v)


def document_pdf(titre: str, sections: list[Section], sous_titre: str = "") -> bytes:
    tampon = io.BytesIO()
    doc = SimpleDocTemplate(tampon, pagesize=landscape(A4), title=titre,
                            leftMargin=24, rightMargin=24, topMargin=24, bottomMargin=24)
    styles = getSampleStyleSheet()
    petit = styles["BodyText"]
    petit.fontSize = 8
    petit.leading = 10
    elements = [Paragraph(titre, styles["Title"])]
    if sous_titre:
        elements.append(Paragraph(sous_titre, styles["Normal"]))
    for nom, entetes, lignes in sections:
        elements += [Spacer(1, 12), Paragraph(nom, styles["Heading3"])]
        data = [[Paragraph(f"<b>{h}</b>", petit) for h in entetes]]
        data += [[Paragraph(_txt(c).replace("&", "&amp;").replace("<", "&lt;"), petit) for c in ligne] for ligne in lignes]
        table = Table(data, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eef4")),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#b8c4cf")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        elements.append(table)
    doc.build(elements)
    return tampon.getvalue()


def document_xlsx(sections: list[Section]) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)
    for nom, entetes, lignes in sections:
        ws = wb.create_sheet(re.sub(r"[\[\]:*?/\\]", "-", nom)[:31] or "Feuille")
        ws.append(entetes)
        for cell in ws[1]:
            cell.font = Font(bold=True)
        for ligne in lignes:
            ws.append([float(c) if isinstance(c, Decimal) else c for c in ligne])
        for i, col in enumerate(ws.columns, start=1):
            largeur = max(len(_txt(c.value)) for c in col) + 2
            ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = min(largeur, 50)
    tampon = io.BytesIO()
    wb.save(tampon)
    return tampon.getvalue()


def document_csv(sections: list[Section]) -> bytes:
    tampon = io.StringIO()
    w = csv.writer(tampon, delimiter=";")
    nom, entetes, lignes = sections[0]
    w.writerow(entetes)
    for ligne in lignes:
        w.writerow([_txt(c) if isinstance(c, (Decimal, float)) else c for c in ligne])
    return ("\ufeff" + tampon.getvalue()).encode("utf-8")


def reponse(fmt: str, titre: str, sections: list[Section], nom_fichier: str, sous_titre: str = "") -> Response:
    if fmt == "pdf":
        contenu = document_pdf(titre, sections, sous_titre)
    elif fmt == "xlsx":
        contenu = document_xlsx(sections)
    else:
        contenu = document_csv(sections)
    return Response(contenu, media_type=MEDIAS[fmt],
                    headers={"Content-Disposition": f'attachment; filename="{nom_fichier}.{fmt}"'})
