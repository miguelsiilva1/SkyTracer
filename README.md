# SkyTracer

Sistema de visualização de tráfego aéreo em tempo real para a região do Porto, desenvolvido no âmbito da unidade curricular de Sistemas de Telecomunicações Aeronáuticas (STAER), ISEP / DEE.

O sistema recolhe as mensagens Modo S / ADS-B descodificadas pelo recetor **dump1090** disponibilizado pela unidade curricular, persiste-as numa base de dados e enriquece-as com informação de fontes públicas e gratuitas (rotas, fotografias, matrículas e meteorologia). O objetivo é disponibilizar, sem custos, funcionalidades que em serviços comerciais como o FlightRadar24 são pagas: histórico e *replay*, alertas, estatísticas e mapa de cobertura do recetor.

## Índice

1. [Arquitetura](#1-arquitetura)
2. [Estrutura do repositório](#2-estrutura-do-repositório)
3. [Fonte de dados](#3-fonte-de-dados)
4. [Serviços](#4-serviços)
5. [Execução em ambiente local](#5-execução-em-ambiente-local)
6. [Testes](#6-testes)
7. [Implementação em produção](#7-implementação-em-produção)
8. [Gestão do projeto e documentação](#8-gestão-do-projeto-e-documentação)

## 1. Arquitetura

```
 dump1090 (UC STAER)           APIs públicas (adsbdb, planespotters, OurAirports, METAR)
        │  aircraft.json                 │
        ▼                                ▼
 ┌──────────────┐            ┌──────────────┐
 │  collector   │            │   enricher   │
 └──────┬───────┘            └──────┬───────┘
        │ escrita                   │ escrita
        ▼                           ▼
              ┌──────────────┐
              │  PostgreSQL  │
              └──────┬───────┘
                     │ leitura
              ┌──────▼───────┐   REST + WebSocket   ┌──────────────────────────┐
              │  API FastAPI │ ───────────────────▶ │ App Expo (React Native)  │
              └──────────────┘                      │ web · Android · iOS      │
                                                    └──────────────────────────┘
```

Os três serviços de backend são processos independentes que comunicam exclusivamente através da base de dados. Em consequência, a API responde sempre a partir de dados locais e mantém-se disponível (último estado conhecido e histórico) mesmo que o recetor ou as APIs externas falhem.

## 2. Estrutura do repositório

| Pasta | Conteúdo |
|---|---|
| `backend/` | Código Python: `collector` (leitura do dump1090), `enrichment` (enriquecimento e retenção), `api` (FastAPI) e `db` (migrações SQL); testes em `backend/tests/` |
| `app/` | Aplicação Expo / React Native (web, Android e iOS), com mapas MapLibre |
| `infra/` | `docker-compose.yml` com a base de dados e os serviços |
| `docs/` | Backlog, documentação do sistema (glossário, modelo de domínio, diagrama de classes, casos de uso, SSD e SD) |
| `.github/workflows/` | Integração contínua (lint e testes) |

## 3. Fonte de dados

Todas as posições provêm exclusivamente do recetor da unidade curricular:

`https://ads-b.jcboliveira.xyz/dump1090/data/aircraft.json` (dump1090-mutability)

As APIs externas são utilizadas apenas para **enriquecer** as aeronaves efetivamente recebidas por este recetor.

## 4. Serviços

| Serviço | Comando | Responsabilidade |
|---|---|---|
| `collector` | `python -m skytracer.collector` | Lê o `aircraft.json` a cada segundo. Atualiza o estado atual de cada aeronave (`aircraft_live`) em todas as leituras; guarda no máximo uma posição a cada 5 s por aeronave (`position`), apenas para posições com idade `seen_pos` ≤ 60 s; e regista um resumo do recetor (`receiver_snapshot`) a cada 10 s. |
| `enricher` | `python -m skytracer.enrichment` | Para cada aeronave recebida, consulta o [adsbdb](https://www.adsbdb.com) (matrícula, modelo, operador e rota) e o [planespotters.net](https://www.planespotters.net) (fotografia, com crédito ao autor). Limita os pedidos a 1 por segundo por API, repete com *backoff* exponencial e guarda os resultados em cache na base de dados (aeronave: 30 dias; rota: 7 dias; respostas "não encontrado" também ficam em cache; erros são repetidos ao fim de 1 h). Executa ainda a limpeza diária de retenção. |
| `api` | `uvicorn skytracer.api.main:app` | Disponibiliza a interface REST e WebSocket, sempre a partir da base de dados local. |

Todos os serviços aplicam as migrações pendentes (`backend/skytracer/db/migrations/NNN_*.sql`) no arranque. A aplicação manual faz-se com `python -m skytracer.db.migrate`.

### 4.1 Interface da API

| Endpoint | Descrição |
|---|---|
| `GET /health` | Verificação do estado do serviço |
| `GET /aircraft/live?max_age_seconds=60` | Aeronaves com posição recente, incluindo enriquecimento (matrícula, modelo, fotografia) e rota (origem e destino) |
| `GET /aircraft/{hex}` | Dados de uma aeronave e o seu estado atual (`live`, `null` se não estiver a ser recebida) |
| `GET /aircraft/{hex}/track?minutes=60` | Rasto: posições guardadas nos últimos *N* minutos (máximo 1440) |
| `WS /ws/live` | Envia o estado atual na ligação e depois a cada ~1 s, no formato `{"ts": ..., "aircraft": [...]}`, idêntico ao de `/aircraft/live` |

A documentação interativa (OpenAPI) está disponível em `http://127.0.0.1:8000/docs`.

### 4.2 Política de retenção

| Tabela | Frequência de escrita | Período de retenção |
|---|---|---|
| `aircraft_live` | 1 linha por aeronave, atualizada a cada segundo (`UNLOGGED`) | 5 min sem mensagens (`LIVE_EXPIRY_SECONDS`) |
| `position` | ≤ 1 por aeronave a cada 5 s (`POSITION_MIN_INTERVAL_SECONDS`); cerca de 100 MB/dia em hora de ponta | 30 dias (`RETENTION_DAYS`) |
| `receiver_snapshot` | 1 a cada 10 s (`SNAPSHOT_INTERVAL_SECONDS`) | 30 dias (`RETENTION_DAYS`) |
| `aircraft`, `flight_route` | Cache do enriquecimento | Sem limite (tabelas pequenas, renovadas segundo o TTL) |

O mapa de cobertura (US17) utilizará uma tabela agregada (alcance máximo por direção) que não é abrangida pela retenção.

## 5. Execução em ambiente local

**Pré-requisitos:** Python ≥ 3.11 e Docker.

```bash
# 1. Configuração e base de dados
cp .env.example .env
docker compose --env-file .env -f infra/docker-compose.yml up -d db

# 2. Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
python -m skytracer.collector             # recolha de dados
python -m skytracer.enrichment            # enriquecimento (noutro terminal)
uvicorn skytracer.api.main:app --reload   # API em http://localhost:8000/docs
```

Em alternativa, a base de dados e os três serviços podem ser iniciados em conjunto:

```bash
docker compose --env-file .env -f infra/docker-compose.yml up --build
```

### 5.1 Configuração

A configuração é feita por variáveis de ambiente, documentadas em [`.env.example`](.env.example). O ficheiro `.env` não é versionado.

- As credenciais da base de dados (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`) são obrigatórias: o Docker Compose recusa-se a arrancar se faltarem. A opção `--env-file .env` é necessária porque o ficheiro de Compose se encontra em `infra/`.
- Em produção deve ser usada uma password própria, apenas com letras e números (por exemplo, gerada com `openssl rand -hex 24`), refletida também em `DATABASE_URL`.
- A base de dados (5432) e a API (8000) ficam acessíveis apenas na própria máquina (`127.0.0.1`); o acesso externo à API é feito através de um *reverse proxy* HTTPS.

## 6. Testes

```bash
cd backend
ruff check . && pytest -q
```

Os testes marcados com `db` requerem uma instância PostgreSQL de teste e são ignorados quando esta não está disponível:

```bash
docker run -d --name skytracer-test-db -p 5433:5432 \
  -e POSTGRES_USER=skytracer -e POSTGRES_PASSWORD=skytracer -e POSTGRES_DB=skytracer_test postgres:17
```

O endereço pode ser alterado com a variável `TEST_DATABASE_URL`. Na integração contínua é utilizado um serviço `postgres:17`.

## 7. Implementação em produção

| Componente | Plataforma |
|---|---|
| collector, enricher, API e PostgreSQL | VM Oracle Cloud Always Free (Docker Compose) |
| Aplicação web (exportação estática do Expo) | GitHub Pages |
| CI/CD | GitHub Actions |

## 8. Gestão do projeto e documentação

O projeto segue a metodologia Scrum, com sprints de duas semanas até à entrega final (primeira semana de janeiro de 2027).

- [Product backlog e plano de sprints](docs/backlog.md)
- [Documentação do sistema](docs/system-documentation/README.md): glossário, modelo de domínio, diagrama de classes, diagrama de casos de uso e, por user story, critérios de aceitação, SSD e SD.
