from pathlib import Path

class Settings:
    ARQUIVO = Path(__file__).resolve().parent.parent / "storage/shopping.xlsx"
    CENTRO_RESULTADO = "10006 - RS - LPG - AGRALE - PLANTA AGRALE 1 (FRT)"  # main_dixi.py
    CENTROS_RESULTADO = None  # main.py: lista de CRs da PEC a calcular; None = todos os CRs da planilha

    NOMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
    NOMES_EXTENSO = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]

    LIMITE_HORAS_SEMANA = 42
    FATOR_ENCARGOS = 1.75         # custo mensal de uma pessoa = salário x fator (encargos e benefícios)
    FOLGAS_POR_SEMANA = 2
    DIAS_TRABALHO = 7 - FOLGAS_POR_SEMANA
    INTERVALO_MAXIMO = 120        # minutos; intervalo pode crescer até 2h (CLT art. 71)
    CORTE_MAXIMO = 60             # minutos que podem ser retirados do fim do turno se o intervalo não bastar
    HORA_NOTURNA_REDUZIDA = True  # 22h-5h: hora de 52min30s (CLT art. 73)
    SLOT = 30                     # granularidade em minutos
    JORNADA_MAXIMA_DIA = 8        # horas por turno (8h + 2h, CLT art. 59)
    INTERJORNADA_MINIMA = 11      # horas de descanso entre turnos (CLT art. 66)
    DIAS_MAXIMOS_HORISTA = 6      # horista: dias por semana, com 1 descanso semanal (CLT art. 67)
    DIAS_UTEIS_REVEZAMENTO = 4    # revezamento: só contrata 5x2 se a pessoa cobre o rombo em pelo menos tantos dos 5 dias; o resto vai para horista

    # --- só para main_dixi.py (relatório DIXI, cobertura pelo funcionamento do CR) ---
    ARQUIVO_DIXI = Path(__file__).resolve().parent.parent / "storage/Relatório Colaboradores DIXI_10_2026.xlsx"
    DIAS_FUNCIONAMENTO = [0, 1, 2, 3, 4, 5]  # Seg a Sáb (0 = Seg ... 6 = Dom)
    INICIO_FUNCIONAMENTO = 0                 # hora em que o posto abre
    HORAS_FUNCIONAMENTO = 24                 # horas por dia de funcionamento
    PESSOAS_MINIMAS = 2                      # mínimo de pessoas no posto durante o funcionamento
    COBERTURA_LIMITE = None       # None = manter a cobertura atual; n = exigir no máx. n pessoas por horário

settings = Settings()
