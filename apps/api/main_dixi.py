import heapq
import re
import unicodedata
from collections import Counter, defaultdict

import pandas as pd

from core.settings import settings

# ---------------------------------------------------------------------------
# LEITURA DO EXCEL
# ---------------------------------------------------------------------------
def _coluna(df, nome):
    """Acha a coluna ignorando acentos (o export vem com caracteres corrompidos)."""
    ascii_ = lambda s: "".join(ch for ch in str(s) if ch.isascii()).lower()
    alvo = ascii_(nome)
    for c in df.columns:
        if ascii_(c) == alvo:
            return c
    raise KeyError(nome)


DIAS = {"SEG": 0, "TER": 1, "QUA": 2, "QUI": 3, "SEX": 4, "SAB": 5, "DOM": 6}
_DIA = r"(SEG|TER|QUA|QUI|SEX|SAB|DOM)"
_HORARIO = r"(\d{1,2})H(\d{2})?\s*AS\s*(\d{1,2})H(\d{2})?"
RE_DIAS_HORARIO = re.compile(rf"{_DIA}(?:\s*/\s*{_DIA})?[\s-]*{_HORARIO}")
RE_CICLO = re.compile(rf"(\d{{1,2}})X(\d{{1,2}})[\s-]*{_HORARIO}")
RE_INTERVALO = re.compile(r"(\d{1,2}):(\d{2})\s*/\s*(\d{1,2}):(\d{2})|(\d{1,2})H\s*/\s*(\d{1,2})H\b")
RE_INTRAJORNADA = re.compile(r"INTRAJORNADA DE (\d+)\s*(H|MIN)")


def _min(h, m) -> int:
    return int(h) * 60 + int(m or 0)


def _turno(ini, fim, intervalo_fixo, duracao):
    """
    Segmentos trabalhados de um turno 'ini'-'fim' (minutos a partir das 00h; noturno passa de 1440).
    O intervalo fica onde a jornada diz; sem horário, no meio do turno, com a duração informada
    ou a mínima da CLT art. 71 (1h acima de 6h, 15min acima de 4h).
    """
    if fim <= ini:
        fim += 1440
    if intervalo_fixo:
        a, b = intervalo_fixo
        if a < ini:
            a, b = a + 1440, b + 1440
        if ini < a < b < fim:
            return [(ini, a), (b, fim)]
    if duracao is None:
        duracao = 60 if fim - ini > 360 else 15 if fim - ini > 240 else 0
    if not duracao:
        return [(ini, fim)]
    meio = ini + (fim - ini - duracao) // 2
    meio -= meio % settings.SLOT
    return [(ini, meio), (meio + duracao, fim)]


def ler_jornada(texto):
    """
    Converte a coluna "Jornada" em {dia da semana: segs}, ou None se não houver horário.
    Ex.: '017 - SEG/SAB-06h30as14h40/TER-06h30as15h40' (o dia citado depois sobrescreve a faixa),
         '018 - SEG/SEX-06h30as16h30 12:30/13:30', '003 - 12X36-07has19h ... - Grupo 2'.
    """
    if not isinstance(texto, str):
        return None
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().upper()

    intervalo_fixo = duracao = None
    if m := RE_INTERVALO.search(t):
        if m.group(1):
            intervalo_fixo = _min(m.group(1), m.group(2)), _min(m.group(3), m.group(4))
        else:
            intervalo_fixo = _min(m.group(5), 0), _min(m.group(6), 0)
    if m := RE_INTRAJORNADA.search(t):
        duracao = int(m.group(1)) * (60 if m.group(2) == "H" else 1)
    if "SEM REPOUSO" in t:
        duracao = 0

    semana = {}
    for m in RE_DIAS_HORARIO.finditer(t):
        de = DIAS[m.group(1)]
        ate = DIAS[m.group(2)] if m.group(2) else de
        segs = _turno(_min(m.group(3), m.group(4)), _min(m.group(5), m.group(6)), intervalo_fixo, duracao)
        for i in range((ate - de) % 7 + 1):
            semana[(de + i) % 7] = segs
    if semana:
        return semana

    if m := RE_CICLO.search(t):
        trabalho, descanso = int(m.group(1)), int(m.group(2))
        if (trabalho, descanso) == (12, 36):  # dia sim, dia não: aproximado pelo grupo
            dias = [1, 3, 5] if "GRUPO 2" in t else [0, 2, 4, 6]
        elif trabalho + descanso == 7:      # 6x1, 5x2: tratado como dias corridos a partir de segunda
            dias = range(trabalho)
        else:
            return None
        segs = _turno(_min(m.group(3), m.group(4)), _min(m.group(5), m.group(6)), intervalo_fixo, duracao)
        return {d: segs for d in dias}
    return None


def carregar_escopo(arquivo=settings.ARQUIVO_DIXI, centro=settings.CENTRO_RESULTADO):
    """
    Lê o relatório de colaboradores e devolve
    ({nome: {"cargo", "jornada", "turnos": {dia da semana: segs}}}, [(nome, jornada) sem horário]).
    Cada turno é uma lista de segmentos trabalhados (sem o intervalo) em minutos a partir das 00h
    do dia em que começa; turno noturno pertence ao dia em que começa.
    """
    df = pd.read_excel(arquivo, dtype=str, header=1)
    c_cr = _coluna(df, "CR")
    c_nome = _coluna(df, "Colaborador")
    c_jor = _coluna(df, "Jornada")
    c_cargo = _coluna(df, "Categoria profissional")
    c_deslig = _coluna(df, "Data de desligamento")

    df = df[(df[c_cr].str.strip() == centro) & df[c_deslig].isna()]

    escopo, sem_horario = {}, []
    for _, row in df.iterrows():
        turnos = ler_jornada(row[c_jor])
        if not turnos:
            sem_horario.append((row[c_nome], row[c_jor]))
            continue
        escopo[row[c_nome]] = {"cargo": row[c_cargo], "jornada": row[c_jor], "turnos": turnos}
    return escopo, sem_horario


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
    """'06:30-14:40 int 1h  7h10'."""
    if segs is None:
        return "FOLGA"
    ini, fim = janela(segs)
    return f"{fmt_hora(ini)}-{fmt_hora(fim)} int {fmt_horas(intervalo(segs) / 60):<5} {fmt_horas(horas_legais(segs))}"


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

    def funcionamento(self):
        """Slots em que o CR está aberto."""
        aberto = [False] * self.n
        for d in settings.DIAS_FUNCIONAMENTO:
            ini = d * 1440 + settings.INICIO_FUNCIONAMENTO * 60
            for m in range(ini, ini + settings.HORAS_FUNCIONAMENTO * 60, settings.SLOT):
                aberto[m // settings.SLOT % self.n] = True
        return aberto


def cobertura(linha, alocacao):
    """alocacao: {nome: {dia: segs}}. Retorna nº de pessoas por slot."""
    cob = [0] * linha.n
    for turnos in alocacao.values():
        for d, segs in turnos.items():
            for s in linha.slots(d, segs):
                cob[s] += 1
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
    """Horas a cumprir na semana: o limite semanal, proporcional se a jornada tem menos dias."""
    return min(settings.LIMITE_HORAS_SEMANA, settings.LIMITE_HORAS_SEMANA / settings.DIAS_TRABALHO * dias)


def calcular_rombo(escopo):
    """
    Demanda: dentro do funcionamento do CR, a cobertura atual (no mín. PESSOAS_MINIMAS); fora, nenhuma.
    Monta a nova jornada sobre a jornada contratual de cada pessoa, numa semana-tipo (seg-dom):
      1. Retira turnos até sobrarem DIAS_TRABALHO dias, sempre o que menos descobre a demanda.
      2. Leva a semana a LIMITE_HORAS_SEMANA horas (proporcional se a jornada tem menos dias):
         - acima: aumenta o intervalo (até INTERVALO_MAXIMO), mantendo entrada e saída;
           se não bastar, encurta o turno onde ele faz menos falta;
         - abaixo: estende os turnos, primeiro sobre o rombo, depois antecipando a entrada.
    Retorna a nova jornada e o rombo resultante.
    """
    linha = Linha()
    atual = {n: dict(p["turnos"]) for n, p in escopo.items()}
    cob_atual = cobertura(linha, atual)
    limite = settings.COBERTURA_LIMITE
    demanda = [
        max(settings.PESSOAS_MINIMAS, c if limite is None else min(c, limite)) if aberto else 0
        for c, aberto in zip(cob_atual, linha.funcionamento())
    ]

    novo = {n: dict(t) for n, t in atual.items()}
    cob = list(cob_atual)
    slot = settings.SLOT
    descanso = settings.INTERJORNADA_MINIMA * 60

    def trocar(nome, d, segs):
        """Substitui o turno do dia (None = folga), atualizando a cobertura."""
        for s in linha.slots(d, novo[nome].pop(d)):
            cob[s] -= 1
        if segs is not None:
            novo[nome][d] = segs
            for s in linha.slots(d, segs):
                cob[s] += 1

    def minutos(segs):
        return horas_legais(segs) * 60

    def ajustaveis(nome):
        return [d for d, s in novo[nome].items() if len(s) == 2]

    # --- 1. dias por semana ------------------------------------------------
    def custo_remover(d, segs):
        """Falta acumulada nos slots desse turno se ele sair: penaliza empilhar cortes no mesmo horário."""
        return sum(max(0, demanda[s] - cob[s] + 1) for s in linha.slots(d, segs))

    # guloso: a cada passo remove, entre todas as pessoas acima do limite de dias, o turno mais barato
    while True:
        estouradas = [nome for nome, t in novo.items() if len(t) > settings.DIAS_TRABALHO]
        if not estouradas:
            break
        _, nome, d = min(
            ((custo_remover(d, segs), nome, d) for nome in estouradas for d, segs in novo[nome].items()),
            key=lambda x: (x[0], -x[2], x[1]),  # empate: folga no fim da semana
        )
        trocar(nome, d, None)

    # --- 2. horas por semana -----------------------------------------------
    # nome -> minutos legais que faltam (+) ou sobram (-) para a meta
    saldo = {nome: meta_semana(len(t)) * 60 - sum(minutos(s) for s in t.values()) for nome, t in novo.items()}

    def respeita_limites(nome, d, segs):
        """Jornada máxima do dia e interjornada com os turnos vizinhos (sem piorar o que já era menor)."""
        if horas_legais(segs) > settings.JORNADA_MAXIMA_DIA + 1e-9:
            return False
        todos = novo[nome]
        (ini, fim), (ini0, fim0) = janela(segs), janela(todos[d])
        anterior, seguinte = todos.get((d - 1) % 7), todos.get((d + 1) % 7)
        if anterior and ini - janela(anterior)[1] + 1440 < min(descanso, ini0 - janela(anterior)[1] + 1440):
            return False
        if seguinte and janela(seguinte)[0] + 1440 - fim < min(descanso, janela(seguinte)[0] + 1440 - fim0):
            return False
        return True

    # acima da meta: primeiro alarga o intervalo (mesma entrada e saída), depois encurta o turno
    for nome in [k for k, v in saldo.items() if v < 0]:
        while saldo[nome] < -1e-6:
            dias = [d for d in ajustaveis(nome) if intervalo(novo[nome][d]) < settings.INTERVALO_MAXIMO]
            if not dias:
                break
            d = max(dias, key=lambda d: (minutos(novo[nome][d]), d))
            (a, b), (c, e) = novo[nome][d]
            novos = [(a, b), (c + 1, e)]
            saldo[nome] += minutos(novo[nome][d]) - minutos(novos)
            novo[nome][d] = novos  # janela igual: cobertura não muda

        while saldo[nome] < -1e-6:
            dias = ajustaveis(nome)
            if not dias:
                break
            d = max(dias, key=lambda d: (minutos(novo[nome][d]), d))
            (a, b), (c, e) = segs = novo[nome][d]
            velhos = linha.slots(d, segs)
            opcoes = []
            for lado, novos in ((0, [(a + 1, b), (c, e)]), (1, [(a, b), (c, e - 1)])):
                if novos[lado][0] < novos[lado][1]:
                    restantes = set(linha.slots(d, novos))
                    custo = sum(1 for s in velhos if s not in restantes and cob[s] <= demanda[s])
                    opcoes.append((custo, lado, novos))
            if not opcoes:
                break
            _, _, novos = min(opcoes, key=lambda x: x[:2])
            saldo[nome] += minutos(segs) - minutos(novos)
            trocar(nome, d, novos)

    def estender(nome, d, lado, limite):
        """Turno estendido até a próxima fronteira de slot, ou menos para caber em 'limite' minutos legais."""
        (a, b), (c, e) = segs = novo[nome][d]
        passo = (a % slot or slot) if lado == 0 else slot - e % slot
        base = minutos(segs)
        for m in range(passo, 0, -1):
            novos = [(a - m, b), (c, e)] if lado == 0 else [(a, b), (c, e + m)]
            if minutos(novos) - base <= limite + 1e-9 and respeita_limites(nome, d, novos):
                return novos
        return None

    def ganho(d, antes, depois):
        velhos = set(linha.slots(d, antes))
        return sum(1 for s in linha.slots(d, depois) if s not in velhos and demanda[s] > cob[s])

    def aplicar_extensao(nome, d, novos):
        saldo[nome] -= minutos(novos) - minutos(novo[nome][d])
        trocar(nome, d, novos)

    # abaixo da meta, passo 1: estende sobre o rombo, sempre onde mais cobre (fila preguiçosa:
    # o ganho de uma extensão só cai com o tempo, então basta reavaliar ao tirar da fila)
    fila = []

    def enfileirar(nome, d):
        for lado in (0, 1):
            novos = estender(nome, d, lado, saldo[nome])
            if novos and (g := ganho(d, novo[nome][d], novos)):
                heapq.heappush(fila, (-g, minutos(novo[nome][d]), lado, d, nome))

    for nome, v in saldo.items():
        if v > 1e-6:
            for d in ajustaveis(nome):
                enfileirar(nome, d)
    while fila:
        g, _, lado, d, nome = heapq.heappop(fila)
        novos = estender(nome, d, lado, saldo[nome])
        g_atual = ganho(d, novo[nome][d], novos) if novos else 0
        if g_atual and g_atual < -g:
            heapq.heappush(fila, (-g_atual, minutos(novo[nome][d]), lado, d, nome))
        elif g_atual:
            aplicar_extensao(nome, d, novos)
            enfileirar(nome, d)

    # passo 2: o que ainda falta para a meta vai nos turnos mais curtos, antecipando a entrada
    for nome in saldo:
        while saldo[nome] > 1e-6:
            for d in sorted(ajustaveis(nome), key=lambda d: (minutos(novo[nome][d]), d)):
                novos = estender(nome, d, 0, saldo[nome]) or estender(nome, d, 1, saldo[nome])
                if novos:
                    aplicar_extensao(nome, d, novos)
                    break
            else:
                break

    falta = [max(0, dem - c) for dem, c in zip(demanda, cob)]
    falta_atual = [max(0, dem - c) for dem, c in zip(demanda, cob_atual)]

    jornada = []
    for nome, p in escopo.items():
        dias = [(d, atual[nome].get(d), novo[nome].get(d)) for d in range(7)]
        jornada.append({
            "nome": nome,
            "cargo": p["cargo"],
            "jornada": p["jornada"],
            "dias": dias,
            "turnos_antes": len(atual[nome]),
            "turnos_depois": len(novo[nome]),
            "horas_antes": sum(horas_legais(s) for s in atual[nome].values()),
            "horas_depois": sum(horas_legais(s) for s in novo[nome].values()),
            "meta": meta_semana(len(novo[nome])),
        })

    horas_por_dia = defaultdict(float)
    for i, f in enumerate(falta):
        if f:
            horas_por_dia[i * slot // 1440] += f * slot / 60

    return {
        "jornada": jornada,
        "blocos": blocos_de_falta(falta),
        "horas_por_dia": dict(sorted(horas_por_dia.items())),
        "total_horas": sum(falta) * slot / 60,
        "total_horas_atual": sum(falta_atual) * slot / 60,
        "horas_demandadas": sum(demanda) * slot / 60,
    }


# ---------------------------------------------------------------------------
# RELATÓRIO
# ---------------------------------------------------------------------------
def imprimir(r, sem_horario=()):
    dias_func = ", ".join(settings.NOMES[d] for d in settings.DIAS_FUNCIONAMENTO)
    print("=" * 78)
    print(f"ESCALA ANTES x DEPOIS (máx. {settings.DIAS_TRABALHO} dias e "
          f"{settings.LIMITE_HORAS_SEMANA}h por semana)")
    print(f"Funcionamento do CR: {settings.HORAS_FUNCIONAMENTO}h por dia a partir das "
          f"{settings.INICIO_FUNCIONAMENTO:02d}:00 ({dias_func})")
    print("=" * 78)
    na_meta_total = 0
    for j in r["jornada"]:
        na_meta = j["horas_depois"] >= j["meta"] - 1 / 60
        na_meta_total += na_meta
        aviso = "" if na_meta else f"  (meta {fmt_horas(j['meta'])} não atingida)"
        print(f"\n{j['nome']} ({j['cargo']})")
        print(f"  jornada: {j['jornada']}")
        print(f"  semana: {fmt_horas(j['horas_antes'])} -> {fmt_horas(j['horas_depois'])} | "
              f"{j['turnos_antes']} -> {j['turnos_depois']} turnos{aviso}")
        for d, antes, depois in j["dias"]:
            if antes or depois:
                print(f"    {settings.NOMES[d]}  {desc_turno(antes):<28} ->  {desc_turno(depois)}")

    print()
    print(f"Colaboradores no limite de horas: {na_meta_total} de {len(r['jornada'])}")
    if sem_horario:
        print(f"\nSem horário na jornada (fora do cálculo): {len(sem_horario)}")
        for nome, jor in sem_horario:
            print(f"  {nome}: {jor if isinstance(jor, str) else '(vazio)'}")

    print()
    print("=" * 78)
    print("ROMBO DE COBERTURA (semana-tipo)")
    print("=" * 78)
    print(f"Rombo com a jornada atual: {fmt_horas(r['total_horas_atual'])} por semana")
    if not r["blocos"]:
        print("Nenhum rombo com a nova escala. A cobertura atual se mantém.")
        return
    for (ini, fim), qtd in sorted(Counter(r["blocos"]).items()):
        print(f"{fmt_min(ini)} até {fmt_min(fim)}  ({fmt_horas((fim - ini) / 60)}) x {qtd} pessoa(s)")
    print()
    for dia, h in r["horas_por_dia"].items():
        print(f"{settings.NOMES[dia]}: {fmt_horas(h)} descobertas")
    print(f"\nTotal: {fmt_horas(r['total_horas'])} descobertas por semana "
          f"({r['total_horas'] / r['horas_demandadas']:.1%} das {fmt_horas(r['horas_demandadas'])} "
          f"de posto exigidas) ≈ {r['total_horas'] / settings.LIMITE_HORAS_SEMANA:.1f} colaborador(es) "
          f"de {settings.LIMITE_HORAS_SEMANA}h")


if __name__ == "__main__":
    escopo, sem_horario = carregar_escopo()
    imprimir(calcular_rombo(escopo), sem_horario)
