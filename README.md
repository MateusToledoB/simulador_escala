# Calcula escala

Simulador que leva o quadro da PEC para 5x2 de 42h, mede o rombo de cobertura e sugere contratações
(revezamento ou horista).

```
apps/
  api/   Python: simulador (main.py), regras (core/settings.py) e API FastAPI (api.py)
  web/   Next.js: formulário do quadro e tela de resultado
```

## Rodar

Pré-requisitos: Node 20+ e Python 3.12+.

```bash
npm install          # dependências do front (workspaces)
npm run setup:api    # dependências da API (pip)
npm run dev          # API em :8000 e site em http://localhost:3000
```

O site chama `/api/*`, que o Next repassa para a API (`API_URL`, padrão `http://localhost:8000`).

## API

- `POST /simular`: `{"linhas": [{"equipe", "cargo", "escala", "quantidade"}]}` devolve o resultado da simulação.
  A escala segue o texto da PEC: `ESCALA SEGUNDA - SEXTA (07:30 - 17:18)` ou `ESCALA 6 X 1 (07:30 - 16:00)`.
- `POST /importar`: recebe o xlsx da PEC (colunas SL_CR, SL_DESC, QF_CARGO, Escala, Quantidade) e devolve as linhas por CR.

## Formato do xlsx da PEC

Arquivo `.xlsx` com o cabeçalho na primeira linha e uma linha por cargo e escala. Colunas obrigatórias
(outras, como Salario, Total e QF_ID, são ignoradas; o nome não diferencia maiúsculas e tolera acentos corrompidos):

| Coluna | O que é | Exemplo |
|---|---|---|
| `SL_CR` | Centro de resultado; as linhas são agrupadas por CR | `10006 - RS - LPG - AGRALE - PLANTA AGRALE 1 (FRT)` |
| `SL_DESC` | Equipe (posto); o código do início é removido | `22383847 - AGRALE LIMPEZA UNIDADE I` |
| `QF_CARGO` | Cargo; o código do início é removido | `14833188 - AUXILIAR DE LIMPEZA I - DIA` |
| `Escala` | Dias e horário de entrada e saída | `ESCALA SEGUNDA - SEXTA (07:30 - 17:18)` |
| `Quantidade` | Pessoas do cargo nessa escala (inteiro) | `4` |

Formatos aceitos em `Escala`:

- `ESCALA <DIA> - <DIA> (HH:MM - HH:MM)`: dias corridos, ex. `ESCALA SEGUNDA - SABADO (07:00 - 15:20)`.
  Basta o início do dia (SEG, TER, QUA, QUI, SEX, SAB, DOM), com ou sem acento.
- `ESCALA N X M (HH:MM - HH:MM)`: ciclo com N + M = 7, ex. `ESCALA 6 X 1 (07:30 - 16:00)` (N dias a partir de segunda).
- Saída menor que a entrada é turno que vira a noite, ex. `(22:00 - 06:00)`.
- Escala fora desses formatos (12x36, vazia…) entra na soma de pessoas, mas fica fora do cálculo ("sem horário").

## Relatório no terminal

```bash
cd apps/api
python main.py       # lê o xlsx de core/settings.py (ARQUIVO) e imprime o relatório de cada CR
```
