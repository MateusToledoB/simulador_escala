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

## Acesso

O site pede uma senha (tela `/entrar`); depois do login, um cookie libera o acesso por 30 dias. O código guarda só o
hash da senha padrão. Para trocar a senha sem mexer no código, defina a variável de ambiente `SENHA_ACESSO` (no
EasyPanel, em Ambiente) e reinicie o serviço.

## Relatório Radar Escala 5x2

Aba **Relatório** (`/relatorio`): confronta as escalas e jornadas cadastradas (exportação com as colunas ESCALA,
HORAS SEMANAIS, DIRETOR, CR, NEGÓCIO, GERENTE_REGIONAL, COLABORADORES, INCONSISTÊNCIAS, COLAB. SEM ESCALA) com a
PEC 221/2019: níveis de impacto, ação por CR, FTE estimado, matriz UF x diretor, plano por regional e cruzamento
com o Cockpit. A base é enviada pelo botão "Enviar base (xlsx)" e fica salva no servidor em
`apps/api/storage/relatorio.xlsx` (fora do git e da imagem Docker: depois de um novo deploy, envie de novo).
Rotas: `GET /relatorio`, `POST /relatorio` (xlsx) e `POST /relatorio/cockpit` (csv/xlsx).

## Simular CR (Google OR-Tools)

Aba **Simular CR** (`/cr`): escolhe um CR da base do relatório (lista com filtro) e a carga de 42h ou 40h. Para cada
função do CR, as JORNADAS do cadastro (ex. `018 - SEG/QUI-07has17h/SEX 07has16h`, `003 - 12X36-07has19h 12:00/13:00`)
viram a cobertura de hoje por dia e horário (sem os intervalos; 12x36, 6x1 e sábado alternado entram pela fração da
equipe presente no dia). O CP-SAT do OR-Tools (`apps/api/otimizar_cr.py`) monta a escala 5x2 com a carga inteira
(entradas, intervalos de 1h a 2h e folgas) em três cenários: **mesmo quadro em 5x2** (as pessoas de hoje, menor
rombo possível), **só CLT cobrindo tudo** (menos pessoas) e **CLT + horista pontual** (horistas de 2h a 6h por dia,
até 80h por mês, no máximo um terço das horas). Jornadas sem horário (N/I, horista, cargo de confiança, revezamento
sem hora) ficam fora do cálculo. Cada cenário tem até 10 s; se o tempo acaba, a tela avisa e mostra o mínimo que o
OR-Tools garante. Rotas: `GET /cr`, `GET /cr/funcoes?cr=...` e `POST /cr/simular` (`{"cr", "funcao", "limite_horas"}`).

## API

- `POST /simular`: `{"limite_horas": 42 | 40, "linhas": [{"cargo", "escala", "quantidade"}]}` (carga semanal máxima, padrão 42), com `"salario"` opcional em cada linha (salário médio do cargo: custo de cada pessoa = salário x 1,75; horista proporcional às horas; anual = 12 meses) devolve uma opção por forma de ajuste (aumentar o intervalo, sair mais cedo), cada uma com o seu rombo, o impacto por cargo e três sugestões de contratação: revezamento com escalas iguais (só 5x2, mesmo abaixo da carga), revezamento + horista (5x2 aproveitando a carga inteira, horistas no resto) e CLT + horista pontual (5x2 com a carga do turno; horistas só nos rombos pontuais, até 80h por mês).
  A escala segue o texto da PEC: `ESCALA SEGUNDA - SEXTA (07:30 - 17:18)` ou `ESCALA 6 X 1 (07:30 - 16:00)`.
- `POST /dimensionar`: mesmo corpo, mas cada linha é a demanda. Devolve duas propostas: **manter o horário do posto** (cobre todo o horário informado, inclusive os intervalos) e **mínimo de colaboradores** (turnos cheios, o posto fecha mais cedo no que sobra e fica sem ninguém no intervalo). Cada linha é a demanda (quantidade = postos ocupados nos dias e horário da
  escala, ex. 5 postos em `ESCALA SEGUNDA - DOMINGO (06:00 - 22:00)`). Devolve as equipes 5x2 por turno, com folgas
  em escadinha (grade semana x pessoa), e a alternativa só com horistas. O intervalo da CLT entra no cálculo: o
  posto não pode ficar vazio, então os turnos se sobrepõem para um cobrir o intervalo do outro (o que sobra vai para
  horistas), e cada turno 5x2 usa a carga semanal inteira (42h: 8h24 por dia; 40h: 8h) quando a demanda permite.
- Nas duas rotas, quem fica abaixo da carga no revezamento é completado com o que sobraria para horistas, nos dias em
  que já trabalha: emendando no turno ou em turno quebrado (pelo menos 1h entre as partes, até 10h no dia, com
  interjornada de 11h). Se os turnos de uma pessoa cabem inteiros nas outras, ela deixa de ser contratada.
- `GET /modelo`: baixa o xlsx modelo da PEC (cabeçalho, linhas de exemplo e aba de instruções).
- `POST /importar`: recebe o xlsx da PEC e devolve as linhas (colunas QF_CARGO, Escala, Quantidade).

## Formato do xlsx da PEC

Arquivo `.xlsx` com o cabeçalho na primeira linha e uma linha por cargo e escala. Outras colunas, como Salario,
Total e QF_ID, são ignoradas; o nome não diferencia maiúsculas e tolera acentos corrompidos.

| Coluna | Tipo | O que é | Exemplo |
|---|---|---|---|
| `QF_CARGO` | Texto | Cargo; o código do início é removido | `14833188 - AUXILIAR DE LIMPEZA I - DIA` |
| `Escala` | Texto | Dias, entrada e saída e, se houver, o intervalo | `ESCALA SEGUNDA - SEXTA (07:30 - 17:18, INTERVALO 12:00 - 13:00)` |
| `Quantidade` | Número inteiro | Pessoas do cargo nessa escala | `4` |

Formatos aceitos em `Escala`:

- `ESCALA <DIA> - <DIA> (HH:MM - HH:MM)`: dias corridos, ex. `ESCALA SEGUNDA - SABADO (07:00 - 15:20)`.
  Basta o início do dia (SEG, TER, QUA, QUI, SEX, SAB, DOM), com ou sem acento.
- Intervalo (opcional) com início e fim dentro dos parênteses: `(07:30 - 17:18, INTERVALO 12:00 - 13:00)`.
  Sem ele, o cálculo usa o mínimo da CLT no meio do turno; intervalo fora do turno deixa a linha fora do cálculo.
- Escala dinâmica (horário diferente por dia): faixas separadas por `/`, ex.
  `ESCALA SEGUNDA - QUINTA (08:00 - 19:00) / SEXTA (08:00 - 18:00)`. Um dia sozinho também vale: `SABADO (08:00 - 12:00)`.
- `ESCALA N X M (HH:MM - HH:MM)`: ciclo com N + M = 7, ex. `ESCALA 6 X 1 (07:30 - 16:00)` (N dias a partir de segunda).
- Saída menor que a entrada é turno que vira a noite, ex. `(22:00 - 06:00)`.
- Escala fora desses formatos (12x36, vazia…) entra na soma de pessoas, mas fica fora do cálculo ("sem horário").

## Relatório no terminal

```bash
cd apps/api
python main.py       # lê o xlsx de core/settings.py (ARQUIVO) e imprime o relatório de cada CR
```
