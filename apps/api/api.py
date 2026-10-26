"""
API do simulador de escala: recebe as linhas da PEC (equipe, cargo, escala, quantidade) e devolve o
resultado de main.calcular em JSON, com os mesmos textos do relatório do terminal.

    uvicorn api:app --reload --port 8000
"""
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from core.settings import settings
from main import (calcular, contrato, desc_turno, fmt_dias, fmt_hora, fmt_horas, fmt_min, frase_grupo,
                  horas_legais, horas_turno, intervalo, janela, ler_linhas, meta_semana, montar_equipes, turno)

app = FastAPI(title="Simulador de escala")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class LinhaPEC(BaseModel):
    equipe: str = "Equipe"
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
        "equipe": e["equipe"],
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


def _contratacoes_json(pessoas, horista=False):
    grupos = defaultdict(list)
    ordem = sorted(pessoas, key=lambda p: -len(p))
    for p in ordem:
        grupos[contrato(p, horista), tuple(sorted(d % 7 for d in p))].append(p)
    return {
        "total": len(pessoas),
        "horas_semana": fmt_horas(sum(horas_turno(*t) for p in pessoas for t in p.values())),
        "frases": [frase_grupo(tipo, grupo) for (tipo, _), grupo in grupos.items()],
        "pessoas": [{
            "contrato": contrato(p, horista),
            "horas_semana": fmt_horas(sum(horas_turno(*t) for t in p.values())),
            "turnos": [{"dia": settings.NOMES[dia % 7], "entrada": fmt_hora(ini), "saida": fmt_hora(fim),
                        "horas": fmt_horas(horas_turno(ini, fim))} for dia, (ini, fim) in sorted(p.items())],
        } for p in ordem],
    }


def resultado_json(r, sem_horario):
    total = Counter()
    for e in r["equipes"]:
        total[e["equipe"]] += e["quantidade"]
    for equipe, _, _, qtd in sem_horario:
        total[equipe] += qtd

    return {
        "config": {
            "limite_horas_semana": settings.LIMITE_HORAS_SEMANA,
            "escala": f"{settings.DIAS_TRABALHO}x{settings.FOLGAS_POR_SEMANA}",
            "intervalo_maximo": fmt_horas(settings.INTERVALO_MAXIMO / 60),
            "corte_maximo_min": settings.CORTE_MAXIMO,
        },
        "total_pessoas": sum(total.values()),
        "por_equipe": [{"equipe": eq, "quantidade": qtd} for eq, qtd in total.items()],
        "cargos": [_cargo_json(e) for e in r["equipes"]],
        "sem_horario": [{"equipe": eq, "cargo": c, "escala": esc, "quantidade": qtd} for eq, c, esc, qtd in sem_horario],
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
        "sugestoes": None if not r["blocos"] else {
            "revezamento": _contratacoes_json(r["revezamento"]),
            "horista": _contratacoes_json(r["horista"], horista=True),
        },
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
            raise HTTPException(400, f"Coluna {coluna} não encontrada. Esperado: SL_CR, SL_DESC, QF_CARGO, Escala, Quantidade.")
    return {"centros": [{"cr": cr, "linhas": linhas} for cr, linhas in por_cr.items()]}
