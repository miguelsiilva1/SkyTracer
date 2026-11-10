# Product Backlog — SkyTracer

Gestão em **Scrum**, sprints de 2 semanas. Prioridade MoSCoW (M = must, S = should, C = could). Story points (SP) em Fibonacci — estimativas iniciais, a rever no planning de cada sprint.

## Épicos

| ID | Épico |
|---|---|
| E1 | Recolha e dados (dump1090 + enriquecimento) |
| E2 | Mapa e visualização |
| E3 | Funcionalidades "premium" |
| E4 | Análise de cobertura e relatório |
| E5 | App multiplataforma |

## User stories

| ID | Épico | Prio | SP | User story |
|---|---|---|---|---|
| US01 | E1 | M | 3 | Como sistema, quero ler o `aircraft.json` do dump1090 a cada segundo para ter as posições atualizadas. |
| US02 | E1 | M | 5 | Como sistema, quero guardar cada posição em PostgreSQL para manter o histórico dos voos. |
| US03 | E1 | M | 5 | Como utilizador, quero ver a companhia e a rota (origem → destino) de um voo. |
| US04 | E1 | S | 3 | Como utilizador, quero ver a foto, a matrícula e o modelo do avião. |
| US05 | E1 | S | 3 | Como sistema, quero guardar em cache os dados de enriquecimento para não abusar das APIs externas. |
| US06 | E2 | M | 5 | Como utilizador, quero ver os aviões num mapa em tempo real, com ícone orientado pelo rumo. |
| US07 | E2 | M | 3 | Como utilizador, quero clicar num avião e ver um painel com altitude, velocidade, squawk, rota e foto. |
| US08 | E2 | M | 5 | Como utilizador, quero filtrar por aeroporto de origem/destino, altitude, companhia e tipo de avião. |
| US09 | E2 | S | 2 | Como utilizador, quero pesquisar por callsign, matrícula ou hex. |
| US10 | E2 | S | 3 | Como utilizador, quero ver o rasto que o avião já percorreu. |
| US11 | E2 | C | 2 | Como utilizador, quero ver informação meteorológica discreta (METAR: vento, visibilidade) no painel do aeroporto e um indicador no mapa. |
| US12 | E3 | S | 8 | Como utilizador, quero escolher um momento passado numa barra de tempo e ver o espaço aéreo como estava (replay). |
| US13 | E3 | S | 5 | Como utilizador, quero ativar/desativar e configurar alertas (emergência 7500/7600/7700, avião ou modelo específico, militares). |
| US14 | E3 | C | 5 | Como utilizador, quero ver as chegadas e partidas do aeroporto do Porto (LPPR). |
| US15 | E3 | C | 3 | Como utilizador, quero estatísticas diárias (top companhias, avião mais alto/rápido, horas de pico). |
| US16 | E3 | C | 8 | Como utilizador, quero uma vista 3D dos voos. |
| US17 | E4 | M | 5 | Como avaliador, quero um mapa de cobertura do recetor (alcance por direção e RSSI) para identificar obstáculos que atenuam ou bloqueiam o sinal. |
| US18 | E5 | M | 8 | Como utilizador, quero usar a aplicação na web, em Android e em iOS com as mesmas funcionalidades. |
| US19 | E5 | C | 2 | Como utilizador, quero guardar voos ou aviões favoritos. |

## Critérios de aceitação (sprint atual / próximo)

**US01**
- Dado o `aircraft.json` do professor disponível, o collector lê-o a cada `POLL_INTERVAL_SECONDS`.
- Aceita campos do dump1090-mutability (`altitude`, `speed`) e do dump1090-fa (`alt_baro`, `gs`).
- Se a leitura falhar, regista o erro e tenta de novo na iteração seguinte sem terminar.

**US02**
- Cada avião visto fica na tabela `aircraft` com `first_seen` / `last_seen`.
- A posição de cada avião é guardada no máximo a cada `POSITION_MIN_INTERVAL_SECONDS`.
- Aviões sem posição não geram linhas em `position`.

## Plano de sprints

| Sprint | Datas | Objetivo | Stories |
|---|---|---|---|
| 0 | 10 – 16 nov | Repositório, arquitetura, ambiente Docker, backlog | — |
| 1 | 17 – 30 nov | Recolha e persistência a funcionar na cloud | US01, US02, US05 |
| 2 | 1 – 14 dez | Mapa completo com enriquecimento | US03, US04, US06–US10 |
| 3 | 15 – 28 dez | App multiplataforma, alertas, replay, cobertura | US12, US13, US17, US18 |
| 4 | 29 dez – 5 jan | Extras, polimento, relatório, ensaio da demo | US11, US14–US16, US19 |

## Definition of Done

- Código no `main` via pull request, com CI verde.
- Testes para a lógica de parsing/tratamento de dados.
- Funcionalidade disponível no deploy (não só em local).
- Documentação/README atualizados quando aplicável.
