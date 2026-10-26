"""
API do simulador de escala: recebe as linhas da PEC (cargo, escala, quantidade) e devolve o
resultado de main.calcular em JSON, com os mesmos textos do relatório do terminal.

    uvicorn api:app --reload --port 8000
"""
import tempfile
from collections import Counter, defaultdict
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from pydantic import BaseModel, Field

from core.settings import settings
from main import (calcular, contrato, desc_turno, fmt_dias, fmt_hora, fmt_horas, fmt_min, frase_turno,
                  frases_horistas, horas_legais, horas_turno, intervalo, janela, ler_escala, ler_linhas, meta_semana,
                  montar_equipes, nome_turno, por_dia, sugerir, total_revezamento)

app = FastAPI(title="Simulador de escala")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class LinhaPEC(BaseModel):
    cargo: str
    escala: str = Field(description="como na PEC: 'ESCALA SEGUNDA - SEXTA (07:30 - 17:18)' ou 'ESCALA 6 X 1 (07:30 - 16:00)'")
    quantidade: int = Field(gt=0)


class Simulacao(BaseModel):
    linhas: list[LinhaPEC] = Field(min_length=1)


# ---------------------------------------------------------------------------
# SERIALIZAÇÃO
# ---------------------------------------------------------------------------
def _turno_json(segs):
    ini, fim = janela(segs)
    return {
        "entrada": fmt_hora(ini),
        "saida": fmt_hora(fim),
        "intervalo": fmt_horas(intervalo(segs) / 60),
        "horas": fmt_horas(horas_legais(segs)),
        "descricao": desc_turno(segs),
    }


def _cargo_json(e):
    dias = len(e["pessoas"][0])
    return {
        "cargo": e["cargo"],
        "escala": e["escala"],
        "quantidade": e["quantidade"],
        "dias": fmt_dias(e["dias"]),
        "antes": _turno_json(e["antes"]),
        "depois": _turno_json(e["depois"]),
        "semana_antes": fmt_horas(horas_legais(e["antes"]) * len(e["dias"])),
        "semana_depois": fmt_horas(horas_legais(e["depois"]) * dias),
        "corte_min": e["corte"],
        "enquadrou": e["enquadrou"],
        "meta": fmt_horas(meta_semana(dias)),
        "rodizio": [{"quantidade": qtd, "dias": fmt_dias(list(d))}
                    for d, qtd in Counter(map(tuple, e["pessoas"])).items()] if dias < len(e["dias"]) else [],
    }


def _horistas_json(pessoas):
    ordem = sorted(pessoas, key=lambda p: -len(p))
    return {
        "total": len(pessoas),
        "horas_semana": fmt_horas(sum(horas_turno(*t) for p in pessoas for t in p.values())),
        "frases": frases_horistas(pessoas),
        "pessoas": [{
            "contrato": contrato(p),
            "horas_semana": fmt_horas(sum(horas_turno(*t) for t in p.values())),
            "turnos": [{"dia": settings.NOMES[dia % 7], "entrada": fmt_hora(ini), "saida": fmt_hora(fim),
                        "horas": fmt_horas(horas_turno(ini, fim))} for dia, (ini, fim) in sorted(p.items())],
        } for p in ordem],
    }


def _revezamento_json(rev):
    """Equipes 5x2 por turno (com a grade semana x pessoa) e os horistas que cobrem o resto."""
    horas = sum(horas_turno(*t) for g in rev["turnos"] for p in g["pessoas"] for t in p["escala"].values())
    horas += sum(horas_turno(*t) for p in rev["horistas"] for t in p.values())
    return {
        "total": total_revezamento(rev),
        "horas_semana": fmt_horas(horas),
        "frases": [frase_turno(g) for g in rev["turnos"]] + frases_horistas(rev["horistas"]),
        "turnos": [{
            "titulo": f"Turno da {nome_turno(g['turno'][0])}",
            "entrada": fmt_hora(g["turno"][0]),
            "saida": fmt_hora(g["turno"][1]),
            "horas_semana": fmt_horas(horas_turno(*g["turno"]) * settings.DIAS_TRABALHO),
            "por_dia": por_dia(g),
            "demanda": g["falta"],
            "pessoas": [{"nome": chr(65 + i) if i < 26 else f"P{i + 1}", "folgas": p["folgas"],
                         "trabalha": [d in p["escala"] for d in range(7)]} for i, p in enumerate(g["pessoas"])],
        } for g in rev["turnos"]],
        "horistas": _horistas_json(rev["horistas"]),
    }


def _config_json():
    return {
        "limite_horas_semana": settings.LIMITE_HORAS_SEMANA,
        "escala": f"{settings.DIAS_TRABALHO}x{settings.FOLGAS_POR_SEMANA}",
        "intervalo_maximo": fmt_horas(settings.INTERVALO_MAXIMO / 60),
        "corte_maximo_min": settings.CORTE_MAXIMO,
        "dias": settings.NOMES,
    }


def _sugestoes_json(r):
    return {"revezamento": _revezamento_json(r["revezamento"]), "horista": _horistas_json(r["horista"])}


def resultado_json(r, sem_horario):
    return {
        "config": _config_json(),
        "total_pessoas": sum(e["quantidade"] for e in r["equipes"]) + sum(s[3] for s in sem_horario),
        "cargos": [_cargo_json(e) for e in r["equipes"]],
        "sem_horario": [{"cargo": c, "escala": esc, "quantidade": qtd} for _, c, esc, qtd in sem_horario],
        "rombo": {
            "blocos": [{"inicio": fmt_min(ini), "fim": fmt_min(fim), "duracao": fmt_horas((fim - ini) / 60),
                        "pessoas": qtd} for (ini, fim), qtd in sorted(Counter(r["blocos"]).items())],
            "por_dia": [{"dia": settings.NOMES[d], "horas": fmt_horas(h), "valor": round(h, 2)}
                        for d, h in r["horas_por_dia"].items()],
            "total_horas": fmt_horas(r["total_horas"]),
            "horas_demandadas": fmt_horas(r["horas_demandadas"]),
            "percentual": r["total_horas"] / r["horas_demandadas"] if r["horas_demandadas"] else 0,
            "colaboradores_equivalentes": round(r["total_horas"] / settings.LIMITE_HORAS_SEMANA, 1),
        },
        "sugestoes": _sugestoes_json(r) if r["blocos"] else None,
    }


# ---------------------------------------------------------------------------
# ROTAS
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"ok": True}


@app.post("/simular")
def simular(simulacao: Simulacao):
    equipes, sem_horario = montar_equipes([l.model_dump() for l in simulacao.linhas])
    return resultado_json(calcular(equipes), sem_horario)


@app.post("/dimensionar")
def dimensionar(simulacao: Simulacao):
    """
    Dimensiona a partir da demanda: cada linha diz quantos postos precisam estar ocupados nos dias e horário da
    escala (ex.: 5 postos, 'ESCALA SEGUNDA - DOMINGO (06:00 - 22:00)'). Devolve as mesmas sugestões do rombo.
    """
    blocos, postos, sem_horario = [], [], []
    for l in simulacao.linhas:
        escala = ler_escala(l.escala)
        if not escala:
            sem_horario.append({"cargo": l.cargo, "escala": l.escala, "quantidade": l.quantidade})
            continue
        dias, ini, fim = escala
        blocos += [(d * 1440 + ini, d * 1440 + fim) for d in dias for _ in range(l.quantidade)]
        postos.append({"cargo": l.cargo, "escala": l.escala, "quantidade": l.quantidade, "dias": fmt_dias(dias),
                       "entrada": fmt_hora(ini), "saida": fmt_hora(fim)})
    horas = sum(fim - ini for ini, fim in blocos) / 60
    return {
        "config": _config_json(),
        "postos": postos,
        "sem_horario": sem_horario,
        "horas_posto_semana": fmt_horas(horas),
        "colaboradores_equivalentes": round(horas / settings.LIMITE_HORAS_SEMANA, 1),
        "sugestoes": _sugestoes_json(sugerir(sorted(blocos))) if blocos else None,
    }


MODELO_COLUNAS = [  # (coluna, tipo, o que é, exemplo); a ordem é a do modelo
    ("QF_CARGO", "Texto", "Cargo. O código numérico do início é removido.", "14833188 - AUXILIAR DE LIMPEZA I - DIA"),
    ("Escala", "Texto", "Dias e horário: 'ESCALA SEGUNDA - SEXTA (07:30 - 17:18)' ou 'ESCALA 6 X 1 (07:30 - 16:00)'.",
     "ESCALA SEGUNDA - SEXTA (07:30 - 17:18)"),
    ("Quantidade", "Número inteiro", "Pessoas do cargo nessa escala.", "4"),
]
MODELO_EXEMPLOS = [
    ["200 - AUXILIAR DE LIMPEZA", "ESCALA SEGUNDA - SEXTA (07:30 - 17:18)", 4],
    ["201 - AUXILIAR DE LIMPEZA - 6X1", "ESCALA 6 X 1 (07:30 - 16:00)", 2],
    ["202 - LIDER DE LIMPEZA", "ESCALA SEGUNDA - SEXTA (08:00 - 17:48)", 1],
    ["203 - PORTEIRO", "ESCALA SEGUNDA - SABADO (22:00 - 06:00)", 2],
]


@app.get("/modelo")
def modelo():
    """xlsx modelo da PEC: aba PEC com o cabeçalho e linhas de exemplo, aba Instruções com o formato de cada coluna."""
    wb = Workbook()
    pec = wb.active
    pec.title = "PEC"
    pec.append([c[0] for c in MODELO_COLUNAS])
    for linha in MODELO_EXEMPLOS:
        pec.append(linha)

    inst = wb.create_sheet("Instruções")
    inst.append(["Coluna", "Tipo", "O que é", "Exemplo"])
    for coluna in MODELO_COLUNAS:
        inst.append(list(coluna))
    inst.append([])
    for texto in [
        "Cabeçalho na primeira linha da aba PEC; uma linha por cargo e escala. Outras colunas são ignoradas.",
        "Escala por dias: ESCALA <DIA> - <DIA> (HH:MM - HH:MM). Basta o início do dia (SEG, TER, QUA, QUI, SEX, SAB, DOM).",
        "Escala por ciclo: ESCALA N X M (HH:MM - HH:MM), com N + M = 7. Os N dias contam a partir de segunda.",
        "Saída menor que a entrada é turno que vira a noite, ex.: (22:00 - 06:00).",
        "Escalas fora desses formatos (12x36, vazia) somam pessoas, mas ficam fora do cálculo.",
    ]:
        inst.append([texto])

    cabecalho = Font(bold=True, color="FFFFFF")
    fundo = PatternFill("solid", fgColor="1F5EFF")
    for aba, larguras in ((pec, [40, 44, 12]), (inst, [14, 16, 70, 48])):
        for celula in aba[1]:
            celula.font, celula.fill = cabecalho, fundo
        for i, largura in enumerate(larguras):
            aba.column_dimensions[chr(65 + i)].width = largura
        aba.freeze_panes = "A2"

    buf = BytesIO()
    wb.save(buf)
    return Response(buf.getvalue(),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="modelo_pec.xlsx"'})


@app.post("/importar")
async def importar(arquivo: UploadFile):
    """Lê um xlsx no formato da PEC e devolve as linhas por CR, para preencher o formulário."""
    if not (arquivo.filename or "").lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Envie um arquivo .xlsx no formato da PEC.")
    with tempfile.TemporaryDirectory() as pasta:
        caminho = Path(pasta) / "pec.xlsx"
        caminho.write_bytes(await arquivo.read())
        try:
            por_cr = ler_linhas(caminho)
        except KeyError as coluna:
            raise HTTPException(400, f"Coluna {coluna} não encontrada. Necessárias: QF_CARGO, Escala, Quantidade.")
    return {"centros": [{"cr": cr, "linhas": [{k: l[k] for k in ("cargo", "escala", "quantidade")} for l in linhas]}
                         for cr, linhas in por_cr.items()]}
