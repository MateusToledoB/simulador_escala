"""
Simulação de um CR da base do relatório (aba "Simular CR"), otimizada com o Google OR-Tools (CP-SAT).

1. Cada JORNADA do cadastro vira presença por dia e horário, por exemplo:
   '018 - SEG/QUI-07has17h/SEX 07has16h'      -> Seg a Qui 07:00-17:00 e Sex 07:00-16:00
   '003 - 12X36-07has19h 12:00/13:00'         -> todos os dias, metade da equipe (12x36), intervalo 12:00-13:00
   '035 - SEG/SEX-SAB/ALTERNADO-08h30as18h00' -> Seg a Sex e metade da equipe no sábado
2. A presença somada de cada função (pessoas x dias x horário, sem os intervalos) é a cobertura de hoje, que a nova
   escala tem de manter.
3. O CP-SAT escolhe as equipes 5x2 (entrada, intervalo e as 2 folgas) e, num segundo cenário, horistas pontuais
   (até 80h por mês), com o menor número de pessoas e de horas que cubra a cobertura de hoje minuto a minuto.
"""
import math
import re
from collections import defaultdict

from ortools.sat.python import cp_model

from core.settings import settings
from main import fmt_dias, fmt_hora, fmt_horas

SLOT = 6                      # minutos: 8h24 (42h / 5) e os horários do cadastro (17h18, 16h48...) caem na grade
SLOTS_SEMANA = 7 * 1440 // SLOT
PASSO_ENTRADA = 30            # entradas dos turnos a cada 30 min
DURACOES_HORISTA = (2 * 60, 4 * 60, 6 * 60)
PESO_HORISTA = 1.5            # hora de horista "custa" 1,5 hora de CLT: só entra onde a CLT sobraria muito
FRACAO_HORISTA = 1 / 3        # horistas cobrem no máximo um terço das horas
TEMPO_LIMITE = 10             # segundos por cenário (a solução fica "boa" em vez de "ótima" se esgotar)

DIAS = {"SEG": 0, "TER": 1, "QUA": 2, "QUI": 3, "SEX": 4, "SAB": 5, "DOM": 6}
_DIA = r"(?:SEG|TER|QUA|QUI|SEX|SAB|DOM)"
RE_CADEIA = re.compile(rf"{_DIA}\w*(?:\s*/\s*(?:{_DIA}|FER|ALT)\w*)*")
_HORA = r"(\d{1,2})(?:H|:(?=\d))(\d{2})?"  # 07h, 07h30, 23:05
RE_FAIXA = re.compile(rf"{_HORA}H?\s*(?:AS|A|/)\s*{_HORA}")
RE_INTERVALO = re.compile(r"(\d{1,2}):(\d{2})\s*[/-]\s*(\d{1,2}):(\d{2})")
RE_INTRA = re.compile(r"(?:INTRA\w*|INTERVALO)\s*(?:DE\s*)?(\d+)\s*(H|MIN|M)\b|\b(\d+)\s*(H|MIN)\s*INTERVALO")
RE_CICLO = re.compile(r"\b(\d{1,2})\s*X\s*(\d{1,2})\b")


def _min(h, m) -> int:
    return int(h) * 60 + int(m or 0)


def _dias_da_cadeia(cadeia: str):
    """'SEG/SEX' -> Seg a Sex; 'SEG/QUA/SEX' -> só esses; 'DOM/SEX' -> Dom a Sex (vira a semana)."""
    dias = [DIAS[t[:3]] for t in re.split(r"\s*/\s*", cadeia) if t[:3] in DIAS]
    if len(dias) == 2:
        a, b = dias
        return [(a + k) % 7 for k in range((b - a) % 7 + 1)]
    return dias


def _intervalo_padrao(entrada, saida):
    """Sem intervalo no cadastro: o mínimo da CLT (art. 71) no meio do turno."""
    dur = saida - entrada
    pausa = 60 if dur > 6 * 60 + 60 else 15 if dur > 4 * 60 else 0
    if not pausa:
        return None
    ini = entrada + (dur - pausa) // 2 // 15 * 15
    return ini, ini + pausa


def ler_jornada(jornada, escala=None):
    """
    Texto da JORNADA -> lista de turnos {dias: {dia: peso}, entrada, saida, intervalo} em minutos (saída > 24h quando
    vira a noite), ou None quando não há horário (N/I, HORISTA, CARGO DE CONFIANCA, REVEZAMENTO sem hora...).
    peso = fração da equipe presente no dia (12x36: 0,5; 6x1: 6/7; sábado alternado: 0,5).
    """
    if jornada is None or not str(jornada).strip():
        return None
    texto = str(jornada).upper()
    texto = re.sub(r"^\s*\d{3}\s*-\s*", "", texto)  # código do cadastro
    sem_repouso = "SEM REPOUSO" in texto

    intervalos = [(_min(a, b), _min(c, d)) for a, b, c, d in RE_INTERVALO.findall(texto)]
    texto = RE_INTERVALO.sub(" ", texto)
    m = RE_INTRA.search(texto)
    pausa = None
    if m:
        n, unidade = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
        pausa = int(n) * (60 if unidade == "H" else 1)
        texto = texto[:m.start()] + " " + texto[m.end():]

    ciclo = None
    for fonte in (texto, str(escala or "").upper()):
        c = RE_CICLO.search(fonte)
        if c:
            n, folga = int(c.group(1)), int(c.group(2))
            ciclo = 0.5 if (n, folga) == (12, 36) else n / (n + folga) if n + folga else None
            if fonte is texto:
                texto = texto[:c.start()] + " " + texto[c.end():]
            break

    faixas, fim_anterior = [], 0
    for f in RE_FAIXA.finditer(texto):
        antes = texto[fim_anterior:f.start()]
        fim_anterior = f.end()
        entrada, saida = _min(f.group(1), f.group(2)), _min(f.group(3), f.group(4))
        if entrada >= 1440 or saida > 1440:
            continue
        if saida <= entrada:
            saida += 1440
        anterior = faixas[-1] if faixas else None
        # '07has16h 11h/12h': faixa dentro da anterior e sem dias novos é o intervalo dela
        if anterior and not RE_CADEIA.search(antes) and anterior["entrada"] < entrada and saida < anterior["saida"]:
            anterior["intervalo"] = (entrada, saida)
            continue
        dias = {}
        alternado = "ALT" in antes
        for cadeia in RE_CADEIA.findall(antes):
            for d in _dias_da_cadeia(cadeia):
                dias[d] = 0.5 if alternado and d >= 5 else 1.0
        faixas.append({"dias": dias, "entrada": entrada, "saida": saida, "intervalo": None})
    if not faixas:
        return None

    sem_dias = [f for f in faixas if not f["dias"]]
    if sem_dias:
        if ciclo is None:
            if len(sem_dias) < len(faixas):  # 'SEG/SEX-08h/12h ... 13h/17h': herda os dias da faixa anterior
                for i, f in enumerate(faixas):
                    if not f["dias"]:
                        f["dias"] = dict(faixas[i - 1]["dias"]) if i else {}
            else:
                return None
        else:  # ciclo (12x36, 6x2...): turnos que se alternam dividem a equipe
            for f in sem_dias:
                f["dias"] = {d: ciclo / len(sem_dias) for d in range(7)}

    # faixa posterior vale nos dias dela ('SEG/SAB-07has15h10 TER 07has16h10': terça é 07h-16h10)
    for i, f in enumerate(faixas):
        for g in faixas[i + 1:]:
            if ciclo is None or g["dias"] != f["dias"]:
                for d in g["dias"]:
                    if g["dias"][d] == 1.0:
                        f["dias"].pop(d, None)
    faixas = [f for f in faixas if f["dias"]]

    for f in faixas:
        if sem_repouso:
            f["intervalo"] = None
            continue
        if f["intervalo"] is None:
            for a, b in intervalos:
                for desloc in (0, 1440):
                    a2, b2 = a + desloc, b + desloc if b > a else b + desloc + 1440
                    if f["entrada"] < a2 and b2 < f["saida"]:
                        f["intervalo"] = (a2, b2)
                        break
                if f["intervalo"]:
                    break
        if f["intervalo"] is None and pausa:
            dur = f["saida"] - f["entrada"]
            ini = f["entrada"] + (dur - pausa) // 2 // 15 * 15
            f["intervalo"] = (ini, ini + pausa)
        if f["intervalo"] is None:
            f["intervalo"] = _intervalo_padrao(f["entrada"], f["saida"])
    return faixas or None


def descrever(faixas) -> str:
    partes = []
    for f in faixas:
        cheios = sorted(d for d, p in f["dias"].items() if p == 1.0)
        meio = sorted((d, p) for d, p in f["dias"].items() if p != 1.0)
        dias = []
        if cheios:
            dias.append(fmt_dias(cheios))
        if meio:
            fracs = {p for _, p in meio}
            nomes = fmt_dias([d for d, _ in meio]) if len(meio) < 7 else "todos os dias"
            dias.append(f"{nomes} ({'/'.join(f'{p * 100:.0f}%' for p in sorted(fracs))} da equipe)")
        txt = f"{' e '.join(dias)} {fmt_hora(f['entrada'])}-{fmt_hora(f['saida'])}"
        if f["intervalo"]:
            txt += f", intervalo {fmt_hora(f['intervalo'][0])}-{fmt_hora(f['intervalo'][1])}"
        partes.append(txt)
    return "; ".join(partes)


def horas_semana(faixas) -> float:
    total = 0.0
    for f in faixas:
        pausa = f["intervalo"][1] - f["intervalo"][0] if f["intervalo"] else 0
        total += sum(f["dias"].values()) * (f["saida"] - f["entrada"] - pausa)
    return total / 60


def _presenca(dia, entrada, saida, intervalo):
    """Slots da semana (cíclica) em que a pessoa está no posto."""
    inicio = dia * 1440
    fora = set()
    if intervalo:
        fora = set(range((inicio + intervalo[0]) // SLOT, (inicio + intervalo[1]) // SLOT))
    return [s % SLOTS_SEMANA for s in range((inicio + entrada) // SLOT, math.ceil((inicio + saida) / SLOT))
            if s not in fora]


# ---------------------------------------------------------------------------
# COBERTURA DE HOJE
# ---------------------------------------------------------------------------
def demanda(grupos):
    """[(faixas, pessoas)] -> pessoas no posto por slot da semana (presença somada, arredondada)."""
    soma = [0.0] * SLOTS_SEMANA
    for faixas, pessoas in grupos:
        for f in faixas:
            for d, peso in f["dias"].items():
                for s in _presenca(d, f["entrada"], f["saida"], f["intervalo"]):
                    soma[s] += pessoas * peso
    return [math.floor(v + 0.5 + 1e-9) for v in soma]


# ---------------------------------------------------------------------------
# MODELO (OR-Tools CP-SAT)
# ---------------------------------------------------------------------------
def _mudancas(dem):
    """Minutos do dia em que a demanda sobe (entradas de hoje, fim de intervalo) e desce (saídas, início de
    intervalo), em qualquer dia da semana."""
    sobe = {s * SLOT % 1440 for s in range(SLOTS_SEMANA) if dem[s] > dem[s - 1]}
    desce = {s * SLOT % 1440 for s in range(SLOTS_SEMANA) if dem[s] < dem[s - 1]}
    return sobe, desce


def _ocioso(dem, entrada, saida, intervalo):
    """Slots sem demanda em cada dia da semana, para o turno (o desempate prefere turnos colados na demanda)."""
    return [sum(1 for s in _presenca(d, entrada, saida, intervalo) if not dem[s]) for d in range(7)]


def _turnos_clt(limite, dem):
    """
    Turnos 5x2 possíveis, todos com a carga do dia = limite / 5 (42h: 8h24; 40h: 8h):
      - entrada a cada 30 min ou onde a demanda sobe; saída onde a demanda desce;
      - intervalo de 1h (o mínimo) até 2h (CLT art. 71), começando depois de 2h de trabalho e terminando até 2h
        antes da saída, de preferência onde a demanda de hoje já para (o intervalo atual).
    Turnos que cobrem exatamente os mesmos horários com demanda ficam num só (o com menos tempo ocioso).
    """
    trabalho = round(limite * 60 / settings.DIAS_TRABALHO)
    pausa_min = 60 if trabalho > 6 * 60 else 15
    pausa_max = settings.INTERVALO_MAXIMO if trabalho > 6 * 60 else 15
    sobe, desce = _mudancas(dem)
    desce2 = sorted(desce | {x + 1440 for x in desce})
    sobe2 = sorted(sobe | {x + 1440 for x in sobe})
    melhores = {}
    for entrada in sorted(set(range(0, 1440, PASSO_ENTRADA)) | sobe):
        saidas = {entrada + trabalho + pausa_min} | {
            x for x in desce2 if trabalho + pausa_min < x - entrada <= trabalho + pausa_max}
        for saida in sorted(saidas):
            pausa = saida - entrada - trabalho
            inicios = {entrada + a for a in range(180, 301, 30)} | set(desce2) | {x - pausa for x in sobe2}
            for ini in sorted(inicios):
                if ini < entrada + 120 or ini + pausa > saida - 120:
                    continue
                intervalo = (ini, ini + pausa)
                pres = {d: [s for s in _presenca(d, entrada, saida, intervalo) if dem[s]] for d in range(7)}
                pres = {d: p for d, p in pres.items() if p}
                if not pres:
                    continue
                chave = tuple(s for d in sorted(pres) for s in pres[d])
                ocioso = _ocioso(dem, entrada, saida, intervalo)
                if chave not in melhores or sum(ocioso) < sum(melhores[chave]["ocioso"]):
                    melhores[chave] = {"entrada": entrada, "saida": saida, "intervalo": intervalo, "pres": pres,
                                       "trabalho": trabalho, "ocioso": ocioso}
    return list(melhores.values())


def _blocos_horista(dem):
    sobe, _ = _mudancas(dem)
    melhores = {}
    for d in range(7):
        for entrada in sorted(set(range(0, 1440, PASSO_ENTRADA)) | sobe):
            for dur in DURACOES_HORISTA:
                p = [s for s in _presenca(d, entrada, entrada + dur, None) if dem[s]]
                if p and (tuple(p), dur) not in melhores:
                    melhores[tuple(p), dur] = {"dia": d, "entrada": entrada, "saida": entrada + dur, "pres": p}
    return list(melhores.values())


def _dica_atual(turnos, atuais):
    """Ponto de partida do 'mesmo quadro': cada jornada de hoje de 5 dias no turno 5x2 mais parecido."""
    dica = {}
    for faixas, pessoas in atuais:
        if len(faixas) != 1 or sorted(faixas[0]["dias"].values()) != [1.0] * 5:
            continue
        f = faixas[0]
        i = min(range(len(turnos)), key=lambda i: abs(turnos[i]["entrada"] - f["entrada"])
                + abs(turnos[i]["saida"] - f["saida"]))
        qtd, por_dia = dica.get(i, (0, [0] * 7))
        dica[i] = (qtd + pessoas, [v + (pessoas if d in f["dias"] else 0) for d, v in enumerate(por_dia)])
    return dica


def otimizar(dem, limite, modo, quadro=None, dica=None, atuais=None):
    """
    Equipes 5x2 (e horistas) para a demanda dem (pessoas por slot). Modos:
      quadro      -> no máximo `quadro` pessoas CLT; deixa o menor rombo possível (minutos sem cobertura)
      clt         -> cobre tudo só com CLT, com o menor número de pessoas
      clt_horista -> cobre tudo com CLT + horistas, com o menor custo em horas (hora de horista = PESO_HORISTA)
    Variáveis: n[t] pessoas no turno t, y[t, d] quantas trabalham no dia d (0 <= y <= n, soma dos dias = 5n:
    sempre dá para montar as folgas de 2 dias); h[b] horistas no bloco b. Desempate: menos tempo ocioso.
    dica: solução anterior {turno: (n, y)}; atuais: jornadas de hoje [(faixas, pessoas)], ponto de partida do quadro.
    """
    turnos = _turnos_clt(limite, dem)
    blocos = _blocos_horista(dem) if modo == "clt_horista" else []
    teto = max(dem)
    m = cp_model.CpModel()
    n = [m.NewIntVar(0, teto, f"n{i}") for i in range(len(turnos))]
    y = {}
    cobre = defaultdict(list)
    for i, t in enumerate(turnos):
        dias = [m.NewIntVar(0, teto, f"y{i}_{d}") for d in range(7)]
        for d in range(7):
            m.Add(dias[d] <= n[i])
            y[i, d] = dias[d]
            for s in t["pres"].get(d, ()):
                cobre[s].append(dias[d])
        m.Add(sum(dias) == settings.DIAS_TRABALHO * n[i])
    h = [m.NewIntVar(0, teto, f"h{k}") for k in range(len(blocos))]
    for k, b in enumerate(blocos):
        for s in b["pres"]:
            cobre[s].append(h[k])

    # slots cobertos pelas mesmas variáveis viram uma restrição só (por valor de demanda, para contar o rombo)
    grupos = defaultdict(lambda: defaultdict(int))
    termos = {}
    for s, d in enumerate(dem):
        if d:
            chave = tuple(sorted(v.Index() for v in cobre[s]))
            grupos[chave][d] += 1
            termos[chave] = cobre[s]
    pessoas = sum(n)
    ocioso = sum(y[i, d] * t["ocioso"][d] for i, t in enumerate(turnos) for d in range(7) if t["ocioso"][d])
    if modo == "quadro":
        falta = []
        for chave, por_valor in grupos.items():
            cob = sum(termos[chave])
            for d, qtd in por_valor.items():
                f = m.NewIntVar(0, d, "")
                m.Add(f >= d - cob)
                falta.append(f * qtd)
        m.Add(pessoas <= quadro)
        m.Minimize(sum(falta) * 1000 + ocioso)
    else:
        for chave, por_valor in grupos.items():
            m.Add(sum(termos[chave]) >= max(por_valor))
        if blocos:
            min_horista = sum(hk * (b["saida"] - b["entrada"]) for hk, b in zip(h, blocos))
            m.Add(min_horista <= round(FRACAO_HORISTA * sum(dem) * SLOT))  # horista é pontual, nunca a maior parte
            m.Minimize((pessoas * limite * 60 * 2 + min_horista * round(PESO_HORISTA * 2)) * 20 + ocioso)
        else:
            m.Minimize(pessoas * 100000 + ocioso)

    if dica:
        for i, t in enumerate(turnos):
            chave = (t["entrada"], t["saida"], t["intervalo"])
            m.AddHint(n[i], dica.get(chave, (0,))[0])
            for d in range(7):
                m.AddHint(y[i, d], dica.get(chave, (0, [0] * 7))[1][d])
        for v in h:
            m.AddHint(v, 0)
    elif atuais:
        for i, (qtd, por_dia) in _dica_atual(turnos, atuais).items():
            m.AddHint(n[i], qtd)
            for d in range(7):
                m.AddHint(y[i, d], por_dia[d])

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = TEMPO_LIMITE
    solver.parameters.num_workers = 8
    status = solver.Solve(m)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None
    clt = {(t["entrada"], t["saida"], t["intervalo"]): (solver.Value(n[i]), [solver.Value(y[i, d]) for d in range(7)])
           for i, t in enumerate(turnos) if solver.Value(n[i])}
    horistas = [(b, solver.Value(hk)) for hk, b in zip(h, blocos) if solver.Value(hk)]
    return {"clt": clt, "turnos": {(t["entrada"], t["saida"], t["intervalo"]): t for t in turnos},
            "horistas": horistas, "otima": status == cp_model.OPTIMAL, "segundos": round(solver.WallTime(), 1),
            "piso": _piso(modo, solver.BestObjectiveBound())}


def _piso(modo, limite_inferior):
    """O que o OR-Tools garante que não dá para melhorar (vale quando a solução não foi provada ótima):
    clt -> mínimo de pessoas; quadro -> menor rombo possível, em horas."""
    if modo == "clt":
        return math.floor(limite_inferior / 100000 + 1e-6)  # o desempate (ocioso) fica abaixo de 100000
    if modo == "quadro":
        return max(0.0, math.floor(limite_inferior / 1000) * SLOT / 60)
    return None


# ---------------------------------------------------------------------------
# SAÍDA
# ---------------------------------------------------------------------------
def montar_folgas(pessoas, por_dia):
    """
    n pessoas e quantas trabalham em cada dia -> pares de folga. Cada pessoa folga nos 2 dias com mais folgas
    restantes (assim sempre fecha), preferindo dias emendados quando empatam.
    """
    resta = [pessoas - t for t in por_dia]
    pares = defaultdict(int)
    for _ in range(pessoas):
        ordem = sorted(range(7), key=lambda d: -resta[d])
        a = ordem[0]
        # o 2º dia tem de ser um dos que ainda precisam de folga; entre os de mesmo saldo, o vizinho de a
        candidatos = [d for d in ordem[1:] if resta[d] == resta[ordem[1]]]
        b = next((d for d in candidatos if (d - a) % 7 in (1, 6)), candidatos[0])
        resta[a] -= 1
        resta[b] -= 1
        pares[tuple(sorted((a, b)))] += 1
    return sorted(pares.items(), key=lambda kv: (-kv[1], kv[0]))


def _nome_folgas(p) -> str:
    return f"{settings.NOMES[p[0]]} e {settings.NOMES[p[1]]}"


def _distribuir_horistas(blocos):
    """Blocos (dia, horário) -> pessoas: cada horista até 80h por mês, no máximo 6 dias e 1 bloco por dia."""
    teto = settings.HORAS_MENSAIS_HORISTA * 12 / 52 * 60
    pessoas = []
    for b, n in sorted(blocos, key=lambda x: (-(x[0]["saida"] - x[0]["entrada"]), x[0]["dia"], x[0]["entrada"])):
        dur = b["saida"] - b["entrada"]
        for _ in range(n):
            alvo = next((p for p in pessoas if b["dia"] not in p["dias"]
                         and len(p["dias"]) < settings.DIAS_MAXIMOS_HORISTA and p["minutos"] + dur <= teto), None)
            if alvo is None:
                alvo = {"dias": {}, "minutos": 0}
                pessoas.append(alvo)
            alvo["dias"][b["dia"]] = (b["entrada"], b["saida"])
            alvo["minutos"] += dur
    return [{"horas_semana": fmt_horas(p["minutos"] / 60),
             "turnos": [{"dia": settings.NOMES[d], "entrada": fmt_hora(e), "saida": fmt_hora(s)}
                        for d, (e, s) in sorted(p["dias"].items())]} for p in pessoas]


def _oferta(sol):
    oferta = [0] * SLOTS_SEMANA
    for chave, (_, por_dia) in sol["clt"].items():
        t = sol["turnos"][chave]
        for d, qtd in enumerate(por_dia):
            for s in _presenca(d, t["entrada"], t["saida"], t["intervalo"]):
                oferta[s] += qtd
    for b, qtd in sol["horistas"]:
        for s in b["pres"]:
            oferta[s] += qtd
    return oferta


def _grade(dem, oferta=None):
    """Por dia e hora: o pico de pessoas necessárias e (com oferta) quantas a escala põe no posto no pior momento."""
    por_hora = 60 // SLOT
    grade = []
    for d in range(7):
        linha = []
        for hora in range(24):
            slots = range((d * 24 + hora) * por_hora, (d * 24 + hora + 1) * por_hora)
            if oferta is None:
                linha.append(max(dem[s] for s in slots))
            else:
                pior = min(slots, key=lambda s: (oferta[s] - dem[s], -dem[s]))
                linha.append([dem[pior], oferta[pior]])
        grade.append(linha)
    return grade


CENARIOS = {
    "quadro": ("Mesmo quadro em 5x2",
               "As mesmas pessoas de hoje (ou menos, se sobrar) em 5x2 com a carga inteira; o otimizador escolhe "
               "entradas, intervalos (1h a 2h) e folgas para deixar o menor rombo possível."),
    "clt": ("Só CLT, cobrindo tudo",
            "Equipes 5x2 com a carga inteira cobrindo todo o horário de hoje, com o menor número de pessoas; "
            "nenhum horista."),
    "clt_horista": ("CLT + horista pontual",
                    "Equipes 5x2 com a carga inteira e horistas (blocos de 2h a 6h, até 80h por mês cada, no máximo "
                    "um terço das horas) onde um CLT a mais ficaria ocioso boa parte do turno."),
}


def cenario_json(modo, sol, dem, limite):
    titulo, descricao = CENARIOS[modo]
    base = {"id": modo, "titulo": titulo, "descricao": descricao}
    if sol is None:
        return {**base, "erro": "O otimizador não achou solução no tempo limite."}
    turnos = []
    for chave, (qtd, por_dia) in sorted(sol["clt"].items()):
        t = sol["turnos"][chave]
        turnos.append({"entrada": fmt_hora(t["entrada"]), "saida": fmt_hora(t["saida"]),
                       "intervalo": f"{fmt_hora(t['intervalo'][0])}-{fmt_hora(t['intervalo'][1])}",
                       "horas_dia": fmt_horas(t["trabalho"] / 60), "pessoas": qtd, "por_dia": por_dia,
                       "folgas": [{"dias": _nome_folgas(p), "pessoas": q} for p, q in montar_folgas(qtd, por_dia)]})
    horistas = _distribuir_horistas(sol["horistas"])
    min_horista = sum((b["saida"] - b["entrada"]) * q for b, q in sol["horistas"])
    clt = sum(q for q, _ in sol["clt"].values())
    oferta = _oferta(sol)
    rombo = sum(max(0, d - o) for d, o in zip(dem, oferta)) * SLOT / 60
    necessarias = sum(dem) * SLOT / 60
    contratadas = clt * limite + min_horista / 60
    return {
        **base, "clt": clt, "horistas": len(horistas), "total": clt + len(horistas),
        "horas_horista": fmt_horas(min_horista / 60), "horas_contratadas": fmt_horas(contratadas),
        "rombo": fmt_horas(rombo), "rombo_pct": round(rombo / necessarias, 3) if necessarias else 0,
        "aproveitamento": round((necessarias - rombo) / contratadas, 3) if contratadas else None,
        "turnos": turnos, "pessoas_horistas": horistas, "grade": _grade(dem, oferta),
        "otima": sol["otima"], "segundos": sol["segundos"],
        "piso": None if sol["otima"] or sol["piso"] is None else
        (f"{sol['piso']} pessoas" if modo == "clt" else fmt_horas(sol["piso"])),
    }


def jornadas_da_funcao(itens):
    """Linhas de uma função -> (jornadas lidas, grupos (faixas, pessoas), sem horário)."""
    jornadas, grupos, sem_horario = [], [], []
    for l in sorted(itens, key=lambda l: -l["pessoas"]):
        faixas = ler_jornada(l["jornada"], l["escala"])
        if faixas is None:
            sem_horario.append({"jornada": l["jornada"] or "N/I", "escala": l["escala"] or "N/I",
                                "pessoas": l["pessoas"]})
            continue
        grupos.append((faixas, l["pessoas"]))
        jornadas.append({"jornada": l["jornada"], "escala": l["escala"], "pessoas": l["pessoas"],
                         "leitura": descrever(faixas), "horas_semana": fmt_horas(horas_semana(faixas))})
    return jornadas, grupos, sem_horario


def resumo_funcoes(linhas):
    """Funções de um CR com as pessoas, quantas têm horário lido e as jornadas (sem otimizar)."""
    por_funcao = defaultdict(list)
    for l in linhas:
        por_funcao[l["funcao"]].append(l)
    saida = []
    for funcao, itens in por_funcao.items():
        jornadas, grupos, sem = jornadas_da_funcao(itens)
        saida.append({"funcao": funcao, "pessoas": sum(l["pessoas"] for l in itens),
                      "com_horario": sum(q for _, q in grupos), "jornadas": jornadas, "sem_horario": sem})
    return sorted(saida, key=lambda f: (-f["pessoas"], f["funcao"]))


def simular_funcao(itens, limite):
    """Linhas de uma função de um CR -> cobertura de hoje e os três cenários otimizados."""
    jornadas, grupos, sem = jornadas_da_funcao(itens)
    dem = demanda(grupos)
    atual = {"pessoas": sum(q for _, q in grupos), "horas_semana": fmt_horas(sum(horas_semana(f) * q for f, q in grupos)),
             "jornadas": jornadas, "sem_horario": sem}
    if not any(dem):
        return {"atual": atual, "horas_necessarias": "0h", "pico": 0, "grade": None, "cenarios": []}
    so_clt = otimizar(dem, limite, "clt")
    cenarios = [
        cenario_json("quadro", otimizar(dem, limite, "quadro", quadro=atual["pessoas"], atuais=grupos), dem, limite),
        cenario_json("clt", so_clt, dem, limite),
        cenario_json("clt_horista", otimizar(dem, limite, "clt_horista", dica=so_clt and so_clt["clt"]), dem, limite),
    ]
    return {"atual": atual, "horas_necessarias": fmt_horas(sum(dem) * SLOT / 60), "pico": max(dem),
            "grade": _grade(dem), "cenarios": cenarios}
