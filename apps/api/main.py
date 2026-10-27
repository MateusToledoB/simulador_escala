import re
import unicodedata
from collections import Counter, defaultdict

import pandas as pd

from core.settings import settings

# ---------------------------------------------------------------------------
# LEITURA DO EXCEL (PEC)
# ---------------------------------------------------------------------------
def _coluna(df, nome, obrigatoria=True):
    """Acha a coluna ignorando acentos (o export vem com caracteres corrompidos). Opcional ausente -> None."""
    ascii_ = lambda s: "".join(ch for ch in str(s) if ch.isascii()).lower()
    alvo = ascii_(nome)
    for c in df.columns:
        if ascii_(c) == alvo:
            return c
    if obrigatoria:
        raise KeyError(nome)
    return None


DIAS = {"SEG": 0, "TER": 1, "QUA": 2, "QUI": 3, "SEX": 4, "SAB": 5, "DOM": 6}
_DIA = r"\b(SEG|TER|QUA|QUI|SEX|SAB|DOM)\w*"
_HORARIO = r"\(\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*\)"
RE_FAIXA = re.compile(rf"{_DIA}(?:\s*(?:-|\bA\b)\s*{_DIA})?\s*{_HORARIO}")  # 'SEGUNDA - QUINTA (08:00 - 19:00)', 'SEXTA (...)'
RE_CICLO = re.compile(rf"\b(\d)\s*X\s*(\d)\b\s*{_HORARIO}")  # 'ESCALA 6 X 1 (07:30 - 16:00)'
RE_INTERVALO = re.compile(r"^(\d{1,2})\s*(?::|H)\s*(\d{0,2})\s*(?:MIN)?$")  # '1:00', '1h', '1h30', '0:45'


def _min(h, m) -> int:
    return int(h) * 60 + int(m or 0)


def ler_escala(texto):
    """
    Texto da escala -> {dia: (entrada, saída)} em minutos, na ordem dos dias, ou None se não houver horário.
      'ESCALA SEGUNDA - SEXTA (16:30 - 02:30)'                          -> Seg a Sex, 990 a 1590
      'ESCALA SEGUNDA - QUINTA (08:00 - 19:00) / SEXTA (08:00 - 18:00)' -> horário diferente por dia (dinâmica)
      'ESCALA 6 X 1 (07:30 - 16:00)' -> 6 dias trabalhados, contados como dias corridos a partir de segunda.
    A saída passa de 1440 quando o turno vira a noite; o turno pertence ao dia em que começa.
    """
    if not isinstance(texto, str):
        return None
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().upper()

    def horario(h):
        ini, fim = _min(h[0], h[1]), _min(h[2], h[3])
        return ini, fim + 1440 if fim <= ini else fim

    horarios = {}
    for m in RE_FAIXA.finditer(t):
        de, ate = DIAS[m.group(1)], DIAS[m.group(2) or m.group(1)]
        for i in range((ate - de) % 7 + 1):
            horarios[(de + i) % 7] = horario(m.groups()[2:])
    if not horarios and (m := RE_CICLO.search(t)) and int(m.group(1)) + int(m.group(2)) == 7:  # 6x1, 5x2
        horarios = {d: horario(m.groups()[2:]) for d in range(int(m.group(1)))}
    return horarios or None


def ler_intervalo(valor):
    """Intervalo informado -> minutos: 60, '60', '1:00', '1h', '1h30'. Vazio -> None (usa o mínimo da CLT)."""
    if valor is None or (isinstance(valor, float) and pd.isna(valor)) or str(valor).strip() == "":
        return None
    t = str(valor).strip().upper().replace(" ", "")
    try:
        return int(float(t.removesuffix("MIN")))
    except ValueError:
        pass
    if m := RE_INTERVALO.match(t):
        return int(m.group(1)) * 60 + int(m.group(2) or 0)
    raise ValueError(f"Intervalo inválido: {valor!r} (use minutos, ex. 60, ou 1:00)")


def carregar_centros(arquivo=settings.ARQUIVO, centros=settings.CENTROS_RESULTADO):
    """CRs a calcular: os de 'centros', ou todos os da PEC, na ordem em que aparecem."""
    return list(centros) if centros else list(ler_linhas(arquivo))


SEM_CR, SEM_EQUIPE = "Quadro", "Equipe"  # quando a PEC não tem SL_CR / SL_DESC


def ler_linhas(arquivo=settings.ARQUIVO):
    """
    Lê a PEC e devolve as linhas por CR: {cr: [{"equipe", "cargo", "escala", "quantidade"}]}, na ordem da planilha.
    Obrigatórias: QF_CARGO, Escala e Quantidade. Opcionais: Intervalo (minutos ou HH:MM; vazio = mínimo da CLT),
    SL_CR (agrupa por CR) e SL_DESC (equipe); sem elas, tudo fica num CR SEM_CR e numa equipe SEM_EQUIPE.
    Linhas sem cargo ou sem quantidade são ignoradas. Equipe e cargo saem sem o código numérico do início.
    """
    df = pd.read_excel(arquivo, dtype=str)
    c_cargo = _coluna(df, "QF_CARGO")
    c_escala = _coluna(df, "Escala")
    c_qtd = _coluna(df, "Quantidade")
    c_intervalo = _coluna(df, "Intervalo", obrigatoria=False)
    c_cr = _coluna(df, "SL_CR", obrigatoria=False)
    c_equipe = _coluna(df, "SL_DESC", obrigatoria=False)

    texto = lambda row, c: " ".join(str(row[c]).split()) if c and pd.notna(row[c]) else ""
    sem_codigo = lambda s: re.sub(r"^\d+\s*-\s*", "", s)

    por_cr = defaultdict(list)
    for _, row in df[df[c_cargo].notna() & df[c_qtd].notna()].iterrows():
        por_cr[texto(row, c_cr) or SEM_CR].append({
            "equipe": sem_codigo(texto(row, c_equipe)) or SEM_EQUIPE,
            "cargo": sem_codigo(texto(row, c_cargo)),
            "escala": row[c_escala],
            "quantidade": int(float(row[c_qtd])),
            "intervalo": ler_intervalo(row[c_intervalo]) if c_intervalo else None,
        })
    return dict(por_cr)


def montar_equipes(linhas):
    """
    Linhas {"equipe", "cargo", "escala", "quantidade", "intervalo"} (da PEC ou do site) ->
    ([{... "horarios": {dia: (ini, fim)}, "dias"}], [(equipe, cargo, escala, quantidade) sem horário]).
    Cada linha tem 'quantidade' pessoas do mesmo cargo na mesma escala, dentro de uma equipe.
    """
    equipes, sem_horario = [], []
    for linha in linhas:
        horarios = ler_escala(linha["escala"])
        if not horarios:
            sem_horario.append((linha.get("equipe", ""), linha["cargo"], linha["escala"], linha["quantidade"]))
            continue
        equipes.append({**linha, "intervalo": linha.get("intervalo"), "horarios": horarios, "dias": list(horarios)})
    return equipes, sem_horario


def carregar_equipes(arquivo=settings.ARQUIVO, centro=settings.CENTRO_RESULTADO):
    """Equipes de um CR da PEC (ver montar_equipes)."""
    return montar_equipes(ler_linhas(arquivo).get(centro, []))


# ---------------------------------------------------------------------------
# UTILITÁRIOS DE TEMPO
# ---------------------------------------------------------------------------
def fmt_min(m: int) -> str:
    """Minuto a partir de segunda 00h -> 'Qua 08:00'."""
    return f"{settings.NOMES[m // 1440 % 7]} {fmt_hora(m)}"


def fmt_horas(h: float) -> str:
    hh = int(h)
    mm = round((h - hh) * 60)
    if mm == 60:
        hh, mm = hh + 1, 0
    return f"{hh}h{mm:02d}" if mm else f"{hh}h"


def fmt_hora(m: int) -> str:
    return f"{m // 60 % 24:02d}:{m % 60:02d}"


def fmt_dias(dias) -> str:
    """[0, 1, 2, 3, 4] -> 'Seg a Sex'."""
    if len(dias) > 2 and all((b - a) % 7 == 1 for a, b in zip(dias, dias[1:])):
        return f"{settings.NOMES[dias[0]]} a {settings.NOMES[dias[-1]]}"
    return ", ".join(settings.NOMES[d] for d in dias)


def minutos_noturnos(ini: int, fim: int) -> int:
    """Minutos entre 22h e 5h."""
    total = 0
    for dia in range(ini // 1440 - 1, fim // 1440 + 1):
        noite = dia * 1440 + 22 * 60  # 22h do dia até 5h do seguinte
        total += max(0, min(fim, noite + 7 * 60) - max(ini, noite))
    return total


def horas_legais(segs) -> float:
    """Horas do turno (sem intervalo), aplicando hora noturna reduzida."""
    total = 0.0
    for ini, fim in segs:
        total += fim - ini
        if settings.HORA_NOTURNA_REDUZIDA:
            total += minutos_noturnos(ini, fim) * (60 / 52.5 - 1)
    return total / 60


def janela(segs):
    """Período em que a pessoa está no posto (entrada até saída, intervalo incluso)."""
    return segs[0][0], segs[-1][1]


def intervalo(segs) -> int:
    return segs[1][0] - segs[0][1] if len(segs) > 1 else 0


def desc_turno(segs) -> str:
    """'06:30-16:30 int 1h36  8h24'."""
    ini, fim = janela(segs)
    return f"{fmt_hora(ini)}-{fmt_hora(fim)} int {fmt_horas(intervalo(segs) / 60):<5} {fmt_horas(horas_legais(segs))}"


def turno(ini, fim, duracao=None):
    """
    Segmentos trabalhados de um turno 'ini'-'fim' com o intervalo no meio. Sem duração informada,
    usa a mínima da CLT art. 71 (1h acima de 6h, 15min acima de 4h).
    """
    if duracao is None:
        duracao = 60 if fim - ini > 360 else 15 if fim - ini > 240 else 0
    if not duracao:
        return [(ini, fim)]
    meio = ini + (fim - ini - duracao) // 2
    meio -= meio % settings.SLOT
    return [(ini, meio), (meio + duracao, fim)]


# ---------------------------------------------------------------------------
# COBERTURA
# ---------------------------------------------------------------------------
class Linha:
    """Linha do tempo de uma semana-tipo em slots, a partir de segunda 00h; circular (domingo emenda na segunda)."""

    def __init__(self):
        self.n = 7 * 1440 // settings.SLOT

    def slots(self, d: int, segs):
        ini, fim = janela(segs)
        off = d * 1440
        return [s % self.n for s in range((off + ini) // settings.SLOT, -(-(off + fim) // settings.SLOT))]


def cobertura(linha, equipes, chave):
    """Nº de pessoas por slot, com o turno de cada dia em equipe[chave][dia] e as pessoas por dia em equipe['dias_' + chave]."""
    cob = [0] * linha.n
    for e in equipes:
        for d, qtd in e["dias_" + chave].items():
            for s in linha.slots(d, e[chave][d]):
                cob[s] += qtd
    return cob


def blocos_de_falta(falta):
    """Agrupa slots faltantes em blocos contínuos (por 'camada' de pessoa faltante)."""
    blocos = []
    for camada in range(1, max(falta, default=0) + 1):
        i = 0
        while i < len(falta):
            if falta[i] >= camada:
                j = i
                while j < len(falta) and falta[j] >= camada:
                    j += 1
                blocos.append((i * settings.SLOT, j * settings.SLOT))
                i = j
            else:
                i += 1
    return sorted(blocos)


# ---------------------------------------------------------------------------
# MOTOR
# ---------------------------------------------------------------------------
def meta_semana(dias: int) -> float:
    """Horas a cumprir na semana: o limite semanal, proporcional se a escala tem menos dias."""
    return min(settings.LIMITE_HORAS_SEMANA, settings.LIMITE_HORAS_SEMANA / settings.DIAS_TRABALHO * dias)


def distribuir_folgas(dias, quantidade):
    """
    Escala com mais de DIAS_TRABALHO dias (6x1, Seg a Sáb, Seg a Dom...) passa a 5x2: cada pessoa ganha
    as folgas que faltam, em rodízio a partir do último dia, para não esvaziar sempre o mesmo dia.
    Devolve os dias trabalhados de cada pessoa.
    """
    extra = len(dias) - settings.DIAS_TRABALHO
    if extra <= 0:
        return [list(dias)] * quantidade
    ordem = dias[::-1]
    pessoas = []
    for p in range(quantidade):
        folgas = {ordem[(p * extra + k) % len(dias)] for k in range(extra)}
        pessoas.append([d for d in dias if d not in folgas])
    return pessoas


def horas_semana(segs, pessoas) -> float:
    """Horas na semana de quem mais trabalha: segs = {dia: turno}, pessoas = dias trabalhados de cada pessoa."""
    return max(sum(horas_legais(segs[d]) for d in dias) for dias in pessoas)


def ajustar(equipe):
    """
    Leva a equipe a LIMITE_HORAS_SEMANA horas em no máximo DIAS_TRABALHO dias, mantendo a entrada de cada dia.
    Escala com mais dias (6x1...) perdeu dias de trabalho: estende a saída, minuto a minuto, com o
    intervalo mínimo, até a semana chegar à meta. Nas demais, mantendo entrada e saída:
      1. aumenta o intervalo, minuto a minuto, até INTERVALO_MAXIMO (nunca abaixo do intervalo de hoje);
      2. se não bastar, retira 30 min do fim do turno (até CORTE_MAXIMO) e volta ao passo 1.
    Na escala dinâmica (horário diferente por dia), o mesmo ajuste vale para todos os dias, e a semana
    é a de quem mais trabalha. Fica com a primeira opção que não passa da meta, ou seja, a mais próxima dela.
    Retorna ({dia: segs}, corte em minutos (negativo = extensão), enquadrou?).
    """
    dias = min(len(equipe["dias"]), settings.DIAS_TRABALHO)
    meta = meta_semana(dias)
    horarios, pessoas = equipe["horarios"], equipe["pessoas"]
    minimo = {d: intervalo(s) for d, s in equipe["antes"].items()}
    if len(equipe["dias"]) > dias and horas_semana(equipe["antes"], pessoas) < meta:
        segs, extensao = equipe["antes"], 0
        for ext in range(0, 1440 - max(fim - ini for ini, fim in horarios.values())):
            proximo = {d: turno(ini, fim + ext, max(minimo[d], intervalo(turno(ini, fim + ext))))
                       for d, (ini, fim) in horarios.items()}
            if horas_semana(proximo, pessoas) > meta + 1e-9:
                break
            segs, extensao = proximo, ext
        return segs, -extensao, True
    menor = min(minimo.values())
    for corte in range(0, settings.CORTE_MAXIMO + 1, settings.SLOT):
        for duracao in range(menor, max(menor, settings.INTERVALO_MAXIMO) + 1):
            segs = {d: turno(ini, fim - corte, max(minimo[d], duracao)) for d, (ini, fim) in horarios.items()}
            if horas_semana(segs, pessoas) <= meta + 1e-9:
                return segs, corte, True
    return segs, corte, False


def faixas(e):
    """Dias agrupados pelo mesmo turno antes e depois: [(dias, segs antes, segs depois)] (um só na escala fixa)."""
    grupos = {}
    for d in e["dias"]:
        grupos.setdefault((tuple(e["antes"][d]), tuple(e["depois"][d])), []).append(d)
    return [(dias, list(antes), list(depois)) for (antes, depois), dias in grupos.items()]


def calcular(equipes):
    """
    Ajusta cada equipe e mede o rombo na semana-tipo: o que a equipe cobre hoje e deixa de cobrir
    com a nova escala (intervalo não conta, a equipe continua no posto da entrada à saída).
    """
    for e in equipes:
        e["antes"] = {d: turno(ini, fim, e.get("intervalo")) for d, (ini, fim) in e["horarios"].items()}
        e["pessoas"] = distribuir_folgas(e["dias"], e["quantidade"])
        e["depois"], e["corte"], e["enquadrou"] = ajustar(e)
        e["dias_antes"] = {d: e["quantidade"] for d in e["dias"]}
        e["dias_depois"] = Counter(d for dias in e["pessoas"] for d in dias)

    linha = Linha()
    demanda = cobertura(linha, equipes, "antes")
    cob = cobertura(linha, equipes, "depois")
    falta = [max(0, dem - c) for dem, c in zip(demanda, cob)]

    horas_por_dia = defaultdict(float)
    for i, f in enumerate(falta):
        if f:
            horas_por_dia[i * settings.SLOT // 1440] += f * settings.SLOT / 60

    blocos = blocos_de_falta(falta)
    return {
        "equipes": equipes,
        "blocos": blocos,
        "horas_por_dia": dict(sorted(horas_por_dia.items())),
        "total_horas": sum(falta) * settings.SLOT / 60,
        "horas_demandadas": sum(demanda) * settings.SLOT / 60,
        **sugerir(blocos),
    }


# ---------------------------------------------------------------------------
# SUGESTÕES DE CONTRATAÇÃO
# ---------------------------------------------------------------------------
def horas_turno(ini, fim) -> float:
    return horas_legais(turno(ini, fim))


def turnos_iguais(blocos, limite):
    """Blocos como turnos de no máximo 'limite' horas trabalhadas: o que passa é dividido em partes iguais (16h -> 2 x 8h)."""
    turnos = []
    for ini, fim in blocos:
        n = 1
        while True:
            passo = -(-(fim - ini) // (n * settings.SLOT)) * settings.SLOT
            if horas_turno(ini, ini + passo) <= limite + 1e-9:
                break
            n += 1
        cortes = [min(fim, ini + k * passo) for k in range(n)] + [fim]
        turnos += [(a, b) for a, b in zip(cortes, cortes[1:]) if b > a]
    return turnos


def turnos_do_rombo(blocos):
    """
    Blocos do rombo como turnos de horista: o que passa de JORNADA_MAXIMA_DIA + 2h trabalhadas (CLT art. 59) é cortado
    o mais tarde possível, de preferência num horário em que o rombo muda (início/fim de outro bloco),
    para que o pedaço seguinte emende com outros turnos.
    """
    limite = settings.JORNADA_MAXIMA_DIA + 2
    marcos = {m for b in blocos for m in b}
    turnos = []
    for ini, fim in blocos:
        while horas_turno(ini, fim) > limite + 1e-9:
            cabem = [m for m in range(ini + settings.SLOT, fim, settings.SLOT) if horas_turno(ini, m) <= limite + 1e-9]
            corte = max([m for m in cabem if m in marcos] or cabem)
            turnos.append((ini, corte))
            ini = corte
        turnos.append((ini, fim))
    return turnos


def revezar(turnos):
    """
    Revezamento 5x2 em escadinha. Turnos com o mesmo horário formam um turno da semana; em cada um, contrata pessoas
    que trabalham DIAS_TRABALHO dias nesse horário, com as FOLGAS_POR_SEMANA folgas em dias seguidos, postas onde
    ainda falta menos gente (empate: logo depois da folga da pessoa anterior, o que forma a escadinha).
    Só contrata enquanto a pessoa cobre o rombo em pelo menos DIAS_UTEIS_REVEZAMENTO dos dias que trabalha,
    e se o turno cabe em LIMITE_HORAS_SEMANA. Devolve ([{"turno": (ini, fim), "falta": [pessoas por dia],
    "pessoas": [{"folgas": [dias], "escala": {dia: (ini, fim)}}]}], turnos que sobram para horistas).
    """
    por_horario = defaultdict(lambda: [0] * 7)
    for ini, fim in turnos:
        por_horario[ini % 1440, fim - ini][ini // 1440 % 7] += 1

    grupos, sobra = [], []
    for (ini, dur), falta in sorted(por_horario.items()):
        demanda, pessoas, depois_de = list(falta), [], 0
        cabe = horas_turno(ini, ini + dur) * settings.DIAS_TRABALHO <= settings.LIMITE_HORAS_SEMANA + 1e-9
        while cabe and any(falta):
            opcoes = []
            for k in range(7):
                folgas = {(k + j) % 7 for j in range(settings.FOLGAS_POR_SEMANA)}
                uteis = sum(1 for d in range(7) if d not in folgas and falta[d])
                opcoes.append((uteis, -sum(falta[d] for d in folgas), -((k - depois_de) % 7), k, folgas))
            uteis, _, _, k, folgas = max(opcoes)
            if uteis < settings.DIAS_UTEIS_REVEZAMENTO:
                break
            dias = [d for d in range(7) if d not in folgas]
            for d in dias:
                falta[d] = max(0, falta[d] - 1)
            pessoas.append({"inicio_folga": k, "folgas": sorted(folgas), "escala": {d: (d * 1440 + ini, d * 1440 + ini + dur) for d in dias}})
            depois_de = k + settings.FOLGAS_POR_SEMANA - 1
        if pessoas:  # em escadinha, pela folga
            grupos.append({"turno": (ini, ini + dur), "falta": demanda,
                           "pessoas": sorted(pessoas, key=lambda p: p["inicio_folga"])})
        sobra += [(d * 1440 + ini, d * 1440 + ini + dur) for d in range(7) for _ in range(falta[d])]
    return grupos, sobra


def horistas(blocos):
    return alocar(turnos_do_rombo(blocos), settings.DIAS_MAXIMOS_HORISTA, settings.LIMITE_HORAS_SEMANA)


def sugerir(blocos):
    """
    Duas formas de cobrir os blocos (rombo ou demanda):
      revezamento: equipes 5x2 por turno (revezar), com turnos iguais de até LIMITE_HORAS_SEMANA / DIAS_TRABALHO
                   horas, e horistas para o que as equipes deixam descoberto;
      horista:     só horistas.
    """
    grupos, _ = revezar(turnos_iguais(blocos, settings.LIMITE_HORAS_SEMANA / settings.DIAS_TRABALHO))
    linha = Linha()
    falta = [0] * linha.n
    for ini, fim in blocos:
        for s in linha.slots(0, [(ini, fim)]):
            falta[s] += 1
    for g in grupos:
        for p in g["pessoas"]:
            for ini, fim in p["escala"].values():
                for s in linha.slots(0, [(ini, fim)]):
                    falta[s] -= 1
    resto = blocos_de_falta([max(0, f) for f in falta])
    return {
        "revezamento": {"turnos": grupos, "horistas": horistas(resto)},
        "horista": horistas(blocos),
    }


def _cabe(escala, max_dias, max_horas):
    """A escala {dia: (ini, fim)} respeita dias, horas na semana, jornada do dia e interjornada (semana circular)?"""
    horas = [horas_turno(*t) for t in escala.values()]
    if (len(escala) > max_dias or sum(horas) > max_horas + 1e-9
            or max(horas) > settings.JORNADA_MAXIMA_DIA + 2 + 1e-9):
        return False
    turnos = sorted(escala.values())
    proximos = turnos[1:] + [(turnos[0][0] + 7 * 1440, None)]
    return all(b[0] - a[1] >= settings.INTERJORNADA_MINIMA * 60 for a, b in zip(turnos, proximos))


def alocar(turnos, max_dias, max_horas):
    """
    Distribui os turnos do rombo entre pessoas novas: cada turno vai para quem pode assumi-lo (_cabe),
    de preferência quem já trabalha no dia e saiu por último (emenda os turnos), senão abre uma contratação.
    Dois turnos no mesmo dia, sem sobreposição, viram um só, da primeira entrada à última saída.
    Devolve, por pessoa, {dia: (ini, fim)}.
    """
    pessoas = []
    for ini, fim in sorted(turnos):
        dia = ini // 1440
        opcoes = []
        for p in pessoas:
            if dia in p and ini < p[dia][1] and p[dia][0] < fim:
                continue  # já está no posto nesse horário
            novo = dict(p)
            novo[dia] = (min(ini, p[dia][0]), max(fim, p[dia][1])) if dia in p else (ini, fim)
            if _cabe(novo, max_dias, max_horas):
                opcoes.append((dia in p, p[dia][1] if dia in p else 0, -len(opcoes), p, novo))
        if opcoes:
            *_, p, novo = max(opcoes, key=lambda o: o[:3])
            p.update(novo)
        else:
            pessoas.append({dia: (ini, fim)})
    return pessoas


# ---------------------------------------------------------------------------
# RELATÓRIO
# ---------------------------------------------------------------------------
def imprimir(r, sem_horario=(), centro=settings.CENTRO_RESULTADO):
    print("=" * 78)
    print(f"ESCALA POR CARGO: ANTES x DEPOIS (meta {settings.LIMITE_HORAS_SEMANA}h por semana em "
          f"{settings.DIAS_TRABALHO}x{settings.FOLGAS_POR_SEMANA}, "
          f"intervalo até {fmt_horas(settings.INTERVALO_MAXIMO / 60)}, "
          f"corte de até {settings.CORTE_MAXIMO} min no fim do turno)")
    print(f"CR: {centro}")
    print("=" * 78)

    # soma da coluna Quantidade por equipe da PEC (inclui os cargos sem horário, que ficam fora do cálculo)
    por_equipe = defaultdict(list)
    total = Counter()
    for e in r["equipes"]:
        por_equipe[e["equipe"]].append(e)
        total[e["equipe"]] += e["quantidade"]
    for equipe, _, _, qtd in sem_horario:
        total[equipe] += qtd

    for equipe, cargos in por_equipe.items():
        print(f"\n{'-' * 78}\nEQUIPE: {equipe} ({total[equipe]} colaborador(es))\n{'-' * 78}")
        for e in cargos:
            imprimir_cargo(e)

    print(f"\nTotal: {sum(total.values())} pessoa(s) em {len(total)} equipe(s)")
    for equipe, qtd in total.items():
        print(f"  {equipe}: {qtd}")
    if sem_horario:
        print(f"\nSem horário na escala (fora do cálculo): {sum(s[3] for s in sem_horario)} pessoa(s)")
        for equipe, cargo, escala, qtd in sem_horario:
            print(f"  {equipe} / {cargo} ({qtd}): {escala if isinstance(escala, str) else '(vazio)'}")

    print()
    imprimir_rombo(r)
    imprimir_sugestoes(r)


def contrato(escala) -> str:
    return f"horista {len(escala)}x por semana"


def dias_extenso(dias) -> str:
    """[2, 3, 4, 5] -> 'de quarta a sábado'; [4, 5] -> 'sexta e sábado'; [5] -> 'só no sábado'."""
    nomes = [settings.NOMES_EXTENSO[d] for d in dias]
    if len(dias) == 1:
        return f"só {'no' if dias[0] >= 5 else 'na'} {nomes[0]}"
    if len(dias) > 2 and all(b - a == 1 for a, b in zip(dias, dias[1:])):
        return f"de {nomes[0]} a {nomes[-1]}"
    return ", ".join(nomes[:-1]) + f" e {nomes[-1]}"


def frase_grupo(tipo, pessoas) -> str:
    """'2 horistas que vão 2x por semana, sexta e sábado, com 16h e 15h.' para horistas com os mesmos dias."""
    n, dias = len(pessoas), sorted(d % 7 for d in pessoas[0])
    frase = f"{n} horista{'s' if n > 1 else ''} que {'vão' if n > 1 else 'vai'} {tipo.removeprefix('horista ')}"
    frase += f", {dias_extenso(dias)}"
    horarios = {(ini % 1440, fim - ini) for p in pessoas for ini, fim in p.values()}
    if len(horarios) == 1:
        ini, dur = horarios.pop()
        frase += f", {fmt_hora(ini)}–{fmt_hora(ini + dur)}"
    horas = [sum(horas_turno(*t) for t in p.values()) for p in pessoas]
    if n == 1:
        frase += f", {fmt_horas(horas[0])} por semana"
    elif max(horas) - min(horas) < 1e-9:
        frase += f", com {fmt_horas(horas[0])} cada"
    elif n == 2:
        frase += f", com {fmt_horas(horas[0])} e {fmt_horas(horas[1])}"
    else:
        frase += f", com {fmt_horas(min(horas))} a {fmt_horas(max(horas))} cada"
    return frase + "."


def frases_horistas(pessoas):
    grupos = defaultdict(list)
    for p in sorted(pessoas, key=lambda p: -len(p)):
        grupos[contrato(p), tuple(sorted(d % 7 for d in p))].append(p)
    return [frase_grupo(tipo, grupo) for (tipo, _), grupo in grupos.items()]


def nome_turno(ini) -> str:
    h = ini % 1440 // 60
    return "manhã" if 5 <= h < 12 else "tarde" if 12 <= h < 18 else "noite"


def por_dia(grupo):
    """Pessoas do revezamento trabalhando em cada dia da semana no turno."""
    return [sum(1 for p in grupo["pessoas"] if d in p["escala"]) for d in range(7)]


def frase_turno(grupo) -> str:
    """'7 pessoas em escala 5x2 no turno da manhã (06:00–14:00), 35h por semana cada, 5 trabalhando por dia.'"""
    ini, fim = grupo["turno"]
    n, dias = len(grupo["pessoas"]), por_dia(grupo)
    trabalhando = [d for d in dias if d]
    por = f"{trabalhando[0]}" if min(trabalhando) == max(trabalhando) else f"de {min(trabalhando)} a {max(trabalhando)}"
    return (f"{n} pessoa{'s' if n > 1 else ''} em escala {settings.DIAS_TRABALHO}x{settings.FOLGAS_POR_SEMANA} "
            f"no turno da {nome_turno(ini)} ({fmt_hora(ini)}–{fmt_hora(fim)}), "
            f"{fmt_horas(horas_turno(ini, fim) * settings.DIAS_TRABALHO)} por semana cada, {por} trabalhando por dia"
            f" (folgas em dias seguidos, em revezamento).")


def total_revezamento(rev) -> int:
    return sum(len(g["pessoas"]) for g in rev["turnos"]) + len(rev["horistas"])


def imprimir_horarios(pessoas):
    print("   Horários dos horistas:")
    for i, p in enumerate(sorted(pessoas, key=lambda p: -len(p)), 1):
        print(f"     Horista {i}: " + "; ".join(f"{settings.NOMES[dia % 7]} {fmt_hora(ini)}–{fmt_hora(fim)}"
                                               for dia, (ini, fim) in sorted(p.items())))


def imprimir_grade(grupo):
    """Grade semana x pessoa do turno, como a escala em escadinha: T = trabalha, F = folga."""
    ini, fim = grupo["turno"]
    print(f"\n   Turno da {nome_turno(ini)}: {fmt_hora(ini)} às {fmt_hora(fim)}")
    print("   Equipe  " + "  ".join(f"{n:<3}" for n in settings.NOMES))
    for i, p in enumerate(grupo["pessoas"]):
        print(f"   {chr(65 + i):<7} " + "  ".join(f"{'F' if d in p['folgas'] else 'T':<3}" for d in range(7)))
    print("   Por dia " + "  ".join(f"{n:<3}" for n in por_dia(grupo)))


def imprimir_sugestoes(r):
    print()
    print("=" * 78)
    print("SUGESTÕES PARA COBRIR O ROMBO")
    print("=" * 78)
    if not r["blocos"]:
        print("Nenhuma contratação necessária.")
        return

    rev = r["revezamento"]
    print(f"\n1) REVEZAMENTO: {total_revezamento(rev)} contratação(ões): equipes "
          f"{settings.DIAS_TRABALHO}x{settings.FOLGAS_POR_SEMANA} por turno, com folgas em escadinha, "
          f"e horistas para o que sobra")
    for frase in [frase_turno(g) for g in rev["turnos"]] + frases_horistas(rev["horistas"]):
        print(f"   {frase}")
    for g in rev["turnos"]:
        imprimir_grade(g)
    if rev["horistas"]:
        print()
        imprimir_horarios(rev["horistas"])

    print(f"\n2) HORISTA: {len(r['horista'])} contratação(ões), todos por hora (intermitente), "
          f"pagando só as horas do rombo (até {settings.DIAS_MAXIMOS_HORISTA} dias por semana)")
    for frase in frases_horistas(r["horista"]):
        print(f"   {frase}")
    imprimir_horarios(r["horista"])


def imprimir_geral(por_centro):
    """Soma da coluna Quantidade de todos os CRs: por CR e por cargo. por_centro = {cr: (resultado, sem_horario)}."""
    por_cr, por_cargo = Counter(), Counter()
    escala = rev_horistas = hor = 0
    for cr, (r, sem_horario) in por_centro.items():
        escala += sum(len(g["pessoas"]) for g in r["revezamento"]["turnos"])
        rev_horistas += len(r["revezamento"]["horistas"])
        hor += len(r["horista"])
        for e in r["equipes"]:
            por_cr[cr] += e["quantidade"]
            por_cargo[e["cargo"]] += e["quantidade"]
        for _, cargo, _, qtd in sem_horario:
            por_cr[cr] += qtd
            por_cargo[cargo] += qtd

    print("\n" + "=" * 78)
    print(f"TOTAL GERAL: {sum(por_cr.values())} colaborador(es) em {len(por_cr)} CR(s)")
    print("=" * 78)
    for cr, qtd in por_cr.items():
        print(f"  {cr}: {qtd}")
    print("\nPor cargo:")
    for cargo, qtd in por_cargo.items():
        print(f"  {cargo}: {qtd}")
    print(f"\nContratações para cobrir o rombo:")
    print(f"  1) Revezamento: {escala + rev_horistas} ({escala} em {settings.DIAS_TRABALHO}x{settings.FOLGAS_POR_SEMANA}, "
          f"{rev_horistas} horista(s))")
    print(f"  2) Horista: {hor}")


def imprimir_cargo(e):
    dias = len(e["pessoas"][0])
    antes, depois = e["antes"], e["depois"]
    if e["corte"] > 0:
        corte = f"corte no fim do turno: {e['corte']} min"
    elif e["corte"] < 0:
        corte = f"extensão no fim do turno: {fmt_horas(-e['corte'] / 60)}"
    else:
        corte = "corte no fim do turno: nenhum"
    print(f"\n{e['cargo']} ({e['quantidade']} pessoa(s))")
    print(f"  {e['escala']}" + ("" if e.get("intervalo") is None
                                else f"  (intervalo informado: {fmt_horas(e['intervalo'] / 60)})"))
    for dias_faixa, antes_faixa, depois_faixa in faixas(e):
        print(f"  {fmt_dias(dias_faixa)}  {desc_turno(antes_faixa):<28} ->  {desc_turno(depois_faixa)}")
    if dias < len(e["dias"]):
        print(f"  {len(e['dias'])}x{7 - len(e['dias'])} -> {dias}x{7 - dias}: "
              + "; ".join(f"{qtd} pessoa(s) {fmt_dias(list(d))}"
                          for d, qtd in Counter(map(tuple, e["pessoas"])).items()))
    print(f"  semana: {fmt_horas(horas_semana(antes, [e['dias']]))} -> "
          f"{fmt_horas(horas_semana(depois, e['pessoas']))}  | {corte}"
          + ("" if e["enquadrou"] else f"  (NÃO enquadrou em {fmt_horas(meta_semana(dias))})"))


def imprimir_rombo(r):
    print("=" * 78)
    print("ROMBO DE COBERTURA (semana-tipo, comparado com a cobertura atual da equipe)")
    print("=" * 78)
    if not r["blocos"] or not r["horas_demandadas"]:
        print("Nenhum. A cobertura atual se mantém.")
        return
    for (ini, fim), qtd in sorted(Counter(r["blocos"]).items()):
        print(f"{fmt_min(ini)} até {fmt_min(fim)}  ({fmt_horas((fim - ini) / 60)}) x {qtd} pessoa(s)")
    print()
    for dia, h in r["horas_por_dia"].items():
        print(f"{settings.NOMES[dia]}: {fmt_horas(h)} descobertas")
    print(f"\nTotal: {fmt_horas(r['total_horas'])} descobertas por semana "
          f"({r['total_horas'] / r['horas_demandadas']:.1%} das {fmt_horas(r['horas_demandadas'])} "
          f"de posto cobertas hoje) ≈ {r['total_horas'] / settings.LIMITE_HORAS_SEMANA:.1f} colaborador(es) "
          f"de {settings.LIMITE_HORAS_SEMANA}h")


if __name__ == "__main__":
    # cada CR é calculado à parte: a cobertura de uma planta não compensa a de outra
    por_centro = {}
    for cr in carregar_centros():
        equipes, sem_horario = carregar_equipes(centro=cr)
        por_centro[cr] = calcular(equipes), sem_horario
        imprimir(*por_centro[cr], cr)
        print("\n")
    imprimir_geral(por_centro)
