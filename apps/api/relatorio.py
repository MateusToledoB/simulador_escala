"""
Base do relatório "Radar Escala 5x2": exportação de escalas e jornadas por CR (colunas ESCALA, HORAS SEMANAIS,
DIRETOR, CR, NEGÓCIO, GERENTE_REGIONAL, COLABORADORES, INCONSISTÊNCIAS, COLAB. SEM ESCALA), com o cabeçalho
em qualquer uma das primeiras linhas (a exportação traz os filtros aplicados antes dele).

O site recebe os dados já compactados (listas de nomes + linhas com índices) e calcula níveis e ações no navegador.
"""
import re
import unicodedata
from pathlib import Path

import pandas as pd

ARQUIVO = Path(__file__).resolve().parent / "storage" / "relatorio.xlsx"
OBRIGATORIAS = ("ESCALA", "HORAS SEMANAIS", "DIRETOR", "CR", "COLABORADORES")

# tipo de cada escala na nova regra: C = compatível com 5x2 (2 folgas, até 5 dias seguidos), F = fora,
# R = 12x36 (regime próprio, CLT art. 59-A), V = validar cadastro. Chave: nome normalizado (_chave).
TIPOS = [
    ("12 X 36", "R"), ("SOMENTE FOLGA", "V"),
    ("SAB. COMPENSADO", "C"), ("SABADO ALTERNADO", "F"), ("DOMINGO ALTERNADO", "F"),
    ("SEG A SAB", "F"), ("SEGUNDA A SABADO", "F"), ("CONFINAMENTO", "F"),
    ("6 X 1", "F"), ("6 X 2", "F"), ("6 X 3", "F"), ("5 X 1", "F"), ("4 X 1", "F"), ("DOMINGO A SEXTA", "F"),
    ("5 X 2", "C"), ("4 X 4", "C"), ("4 X 2", "C"), ("3 X 3", "C"), ("3 X 2 X 2", "C"), ("2 X 5", "C"),
    ("TERCA A SABADO", "C"), ("DOMINGO A QUINTA", "C"), ("QUARTA A DOMINGO", "C"), ("QUINTA A DOMINGO", "C"),
    ("SABADO, DOMINGO E FERIADO", "C"), ("SEGUNDA, QUARTA E SEXTA", "C"), ("TERCA E QUINTA", "C"),
]


def _chave(texto) -> str:
    t = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode().upper()
    t = re.sub(r"(\d)\s*X\s*(\d)", r"\1 X \2", t)
    return re.sub(r"\s+", " ", t).strip()


def tipo_escala(nome) -> str:
    if nome is None or (isinstance(nome, float) and pd.isna(nome)):
        return "V"
    chave = _chave(nome)
    return next((t for padrao, t in TIPOS if padrao in chave), "C")


def nome_escala(nome) -> str:
    """'ESCALA - SEGUNDA  A SABADO' -> 'Segunda a Sabado'; vazio -> 'Não informada'."""
    if nome is None or (isinstance(nome, float) and pd.isna(nome)):
        return "Não informada"
    t = re.sub(r"^ESCALA\s*-?\s*", "", str(nome).strip(), flags=re.I).strip(" .")
    t = re.sub(r"(\d)\s*X\s*(?=\d)", r"\1x", t, flags=re.I)
    t = re.sub(r"\(\s*", "(", re.sub(r"\s+", " ", t)).lower()
    for sem, com in ACENTOS.items():
        t = re.sub(rf"\b{sem}\b", com, t)
    return t[:1].upper() + t[1:] if t else "Não informada"


ACENTOS = {"sabado": "sábado", "sab": "sáb", "terca": "terça", "vr": "VR"}


def nome_pessoa(texto) -> str:
    """'JULIANO COSTA DA SILVA' -> 'Juliano Costa da Silva'."""
    return " ".join(p if p in ("da", "de", "do", "das", "dos", "e") else p.capitalize()
                    for p in str(texto).lower().split())


def _ler(caminho) -> pd.DataFrame:
    bruto = pd.read_excel(caminho, header=None, nrows=15)
    linha = next((i for i, r in bruto.iterrows() if {"ESCALA", "CR", "COLABORADORES"} <= {str(v).strip() for v in r}),
                 None)
    if linha is None:
        raise ValueError("Cabeçalho não encontrado. Necessárias: " + ", ".join(OBRIGATORIAS) + ".")
    df = pd.read_excel(caminho, header=linha)
    df.columns = [str(c).strip() for c in df.columns]
    faltam = [c for c in OBRIGATORIAS if c not in df.columns]
    if faltam:
        raise ValueError("Colunas não encontradas: " + ", ".join(faltam) + ".")
    return df


def _indice(valores):
    """Valores -> (lista de distintos, índice de cada valor)."""
    nomes, pos, idx = [], {}, []
    for v in valores:
        if v not in pos:
            pos[v] = len(nomes)
            nomes.append(v)
        idx.append(pos[v])
    return nomes, idx


def _texto(serie, padrao="N/I"):
    return [padrao if pd.isna(v) or not str(v).strip() else str(v).strip() for v in serie]


def compactar(caminho, fonte: str) -> dict:
    df = _ler(caminho)
    num = lambda c: pd.to_numeric(df[c], errors="coerce") if c in df.columns else pd.Series([0] * len(df))

    dirs, i_dir = _indice([nome_pessoa(v) for v in _texto(df["DIRETOR"])])
    escs_raw, i_esc = _indice([None if pd.isna(v) else str(v) for v in df["ESCALA"]])
    escs = [[nome_escala(e), tipo_escala(e)] for e in escs_raw]
    crs_raw, i_cr = _indice(_texto(df["CR"]))
    crs = []
    for cr in crs_raw:  # '36031 - SP - LOG - ELECTROLUX ...' -> código, UF, nome
        partes = [p.strip() for p in cr.split(" - ")]
        uf = partes[1] if len(partes) > 2 and re.fullmatch(r"[A-Z]{2}", partes[1]) else "N/I"
        crs.append([partes[0], uf, " - ".join(partes[2:] if uf != "N/I" else partes[1:]) or cr])
    negs, i_neg = _indice(_texto(df["NEGÓCIO"]) if "NEGÓCIO" in df.columns else ["N/I"] * len(df))
    gers, i_ger = _indice([nome_pessoa(v) for v in (_texto(df["GERENTE_REGIONAL"]) if "GERENTE_REGIONAL" in df.columns
                                               else ["N/I"] * len(df))])

    horas, colab, inc, sem = num("HORAS SEMANAIS"), num("COLABORADORES"), num("INCONSISTÊNCIAS"), num("COLAB. SEM ESCALA")
    linhas = [[i_dir[k], i_esc[k], i_cr[k], None if pd.isna(horas[k]) else round(float(horas[k]), 2),
               int(colab[k] or 0), int(0 if pd.isna(inc[k]) else inc[k]), int(0 if pd.isna(sem[k]) else sem[k]),
               i_neg[k], i_ger[k]]
              for k in range(len(df)) if not pd.isna(colab[k]) and colab[k] > 0]
    jornadas = df["JORNADA"].nunique() if "JORNADA" in df.columns else None
    return {"fonte": fonte, "dirs": dirs, "escs": escs, "crs": crs, "negs": negs, "gers": gers,
            "jornadas": jornadas, "rows": linhas}


_cache = {}


def carregar():
    """Dados da base salva em storage, ou None se ainda não foi enviada; refeito quando o arquivo muda."""
    if not ARQUIVO.exists():
        return None
    marca = ARQUIVO.stat().st_mtime
    if _cache.get("marca") != marca:
        fonte = (ARQUIVO.with_suffix(".nome").read_text(encoding="utf-8")
                 if ARQUIVO.with_suffix(".nome").exists() else ARQUIVO.name)
        _cache.update(marca=marca, dados=compactar(ARQUIVO, fonte))
    return _cache["dados"]


def _tabela():
    """Linhas da base salva (CR, função, jornada, escala, pessoas), ou None; refeita quando o arquivo muda."""
    if not ARQUIVO.exists():
        return None
    marca = ARQUIVO.stat().st_mtime
    if _cache.get("marca_tabela") != marca:
        df = _ler(ARQUIVO)
        funcao = next((c for c in df.columns if _chave(c).startswith("FUN")), None)
        colab = pd.to_numeric(df["COLABORADORES"], errors="coerce")
        tabela = pd.DataFrame({
            "cr": _texto(df["CR"]),
            "funcao": _texto(df[funcao], "Não informada") if funcao else ["Não informada"] * len(df),
            "jornada": [None if pd.isna(v) or str(v).strip() in ("", "N/I") else str(v).strip()
                        for v in (df["JORNADA"] if "JORNADA" in df.columns else [None] * len(df))],
            "escala": [None if pd.isna(v) else str(v).strip() for v in df["ESCALA"]],
            "pessoas": colab.fillna(0).astype(int),
        })
        _cache.update(marca_tabela=marca, tabela=tabela[tabela["pessoas"] > 0])
    return _cache["tabela"]


def centros():
    """CRs da base com o total de pessoas, do maior para o menor; None se a base não foi enviada."""
    t = _tabela()
    if t is None:
        return None
    soma = t.groupby("cr")["pessoas"].sum().sort_values(ascending=False)
    return [{"cr": cr, "pessoas": int(n)} for cr, n in soma.items()]


def linhas_do_cr(cr: str):
    """Linhas de um CR agrupadas por função, jornada e escala."""
    t = _tabela()
    if t is None:
        return None
    t = t[t["cr"] == cr].fillna({"jornada": "", "escala": ""})
    g = t.groupby(["funcao", "jornada", "escala"], as_index=False)["pessoas"].sum()
    return [{"funcao": r.funcao, "jornada": r.jornada or None, "escala": r.escala or None, "pessoas": int(r.pessoas)}
            for r in g.itertuples()]


def salvar(conteudo: bytes, nome: str):
    """Valida a base enviada e, se estiver certa, troca a salva em storage."""
    ARQUIVO.parent.mkdir(parents=True, exist_ok=True)
    temporario = ARQUIVO.with_suffix(".tmp.xlsx")
    temporario.write_bytes(conteudo)
    try:
        compactar(temporario, nome)
    except Exception:
        temporario.unlink(missing_ok=True)
        raise
    temporario.replace(ARQUIVO)
    ARQUIVO.with_suffix(".nome").write_text(nome, encoding="utf-8")
    return carregar()


def cockpit(caminho, nome: str, codigos) -> dict:
    """
    Exportação do Cockpit (csv ou xlsx): acha a coluna com mais códigos de CR conhecidos e devolve
    {nome, cols, map: {código: {coluna: valor}}}.
    """
    if nome.lower().endswith((".xlsx", ".xls")):
        df = pd.read_excel(caminho, dtype=str)
    else:
        df = pd.read_csv(caminho, dtype=str, sep=None, engine="python", encoding_errors="replace")
    df = df.fillna("")
    norm = lambda v: str(v).split(" - ")[0].strip().upper()
    codigos = {c.upper() for c in codigos}
    melhor = max(df.columns, key=lambda c: sum(norm(v) in codigos for v in df[c].head(1000)), default=None)
    if melhor is None or not any(norm(v) in codigos for v in df[melhor]):
        raise ValueError("Nenhuma coluna com códigos de CR reconhecidos (ex.: 36031 ou C97CY).")
    cols = [str(c) for c in df.columns if c != melhor]
    mapa = {}
    for _, r in df.iterrows():
        k = norm(r[melhor])
        if k in codigos and k not in mapa:
            mapa[k] = {str(c): str(r[c]) for c in df.columns if c != melhor}
    return {"nome": nome, "cols": cols, "map": mapa}
