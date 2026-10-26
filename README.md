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

## Relatório no terminal

```bash
cd apps/api
python main.py       # lê o xlsx de core/settings.py (ARQUIVO) e imprime o relatório de cada CR
```
