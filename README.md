# SkyTracer ✈

Radar de tráfego aéreo em tempo real para a região do Porto, construído a partir dos dados Modo S / ADS-B do recetor **dump1090** da unidade curricular de STAER (ISEP / DEE), e enriquecido com fontes públicas gratuitas (rotas, fotos, matrículas, meteorologia).

Objetivo: uma experiência ao estilo do FlightRadar24 — incluindo funcionalidades que lá são pagas (histórico/replay, alertas, estatísticas, mapa de cobertura) — de forma gratuita.

## Arquitetura

```
 dump1090 (professor)          APIs públicas (adsbdb, planespotters, OurAirports, METAR)
        │  aircraft.json                 │
        ▼                                ▼
 ┌──────────────┐   insere    ┌──────────────┐
 │  collector   │ ──────────▶ │  PostgreSQL  │
 │  (Python)    │             └──────┬───────┘
 └──────────────┘                    │
                              ┌──────▼───────┐   REST + WebSocket
                              │  API FastAPI │ ───────────────────┐
                              └──────────────┘                    ▼
                                                    ┌──────────────────────────┐
                                                    │ app Expo (React Native)  │
                                                    │ web · Android · iOS      │
                                                    └──────────────────────────┘
```

| Pasta | Conteúdo |
|---|---|
| `backend/` | Python: `collector` (polling do dump1090), `enrichment` (worker de enriquecimento), `api` (FastAPI) e `db` (migrações SQL) |
| `app/` | App Expo / React Native (web + Android + iOS), mapas com MapLibre |
| `infra/` | `docker-compose.yml`, schema da base de dados, configuração de deploy |
| `docs/` | Backlog Scrum, arquitetura, decisões, relatório |
| `.github/workflows/` | CI/CD (testes, deploy da web e do backend) |

## Fonte de dados obrigatória

`https://ads-b.jcboliveira.xyz/dump1090/data/aircraft.json` (dump1090-mutability). Todas as posições dos aviões vêm desta fonte; as APIs externas só **enriquecem** os aviões que o recetor vê.

## Serviços

| Serviço | Comando | O que faz |
|---|---|---|
| `collector` | `python -m skytracer.collector` | Lê o `aircraft.json` a cada segundo. Atualiza `aircraft_live` (estado atual) a cada leitura, guarda em `position` no máximo uma posição a cada 5 s por avião (só posições recentes, `seen_pos` ≤ 60 s) e um resumo do recetor em `receiver_snapshot` a cada 10 s. |
| `enricher` | `python -m skytracer.enrichment` | Para cada avião visto, consulta [adsbdb](https://www.adsbdb.com) (matrícula, modelo, operador, rota) e [planespotters.net](https://www.planespotters.net) (foto, com crédito ao fotógrafo). Tem limite de 1 pedido/s por API, retry com backoff exponencial e cache na BD (aeronave 30 dias, rota 7 dias, "não encontrado" também em cache, erros repetidos ao fim de 1 h). Faz também a limpeza diária de retenção. |
| `api` | `uvicorn skytracer.api.main:app` | REST + WebSocket, sempre a partir da BD local. Se o dump1090 falhar, continua a servir o último estado e o histórico. |

Todos os serviços aplicam as migrações (`backend/skytracer/db/migrations/NNN_*.sql`) ao arrancar. Para as aplicar à mão: `python -m skytracer.db.migrate`.

### API

| Endpoint | Descrição |
|---|---|
| `GET /aircraft/live?max_age_seconds=60` | Aviões com posição recente, já com enriquecimento (matrícula, modelo, foto) e rota (origem/destino) |
| `GET /aircraft/{hex}` | Dados de um avião e o seu estado atual (`live`, `null` se não estiver a ser visto) |
| `GET /aircraft/{hex}/track?minutes=60` | Rasto: posições guardadas nos últimos N minutos (máx. 1440) |
| `WS /ws/live` | Envia a cada ~1 s `{"ts": ..., "aircraft": [...]}`, no mesmo formato do `/aircraft/live` |

Documentação interativa em `http://127.0.0.1:8000/docs`.

### Retenção dos dados

| Tabela | Frequência | Guardado durante |
|---|---|---|
| `aircraft_live` | 1 linha por avião, atualizada a cada segundo (`UNLOGGED`) | 5 min sem mensagens (`LIVE_EXPIRY_SECONDS`) |
| `position` | ≤ 1 por avião a cada 5 s (`POSITION_MIN_INTERVAL_SECONDS`), ~100 MB/dia em hora de ponta | 30 dias (`RETENTION_DAYS`) |
| `receiver_snapshot` | 1 a cada 10 s (`SNAPSHOT_INTERVAL_SECONDS`) | 30 dias (`RETENTION_DAYS`) |
| `aircraft`, `flight_route` | cache do enriquecimento | sem limite (pequenas; renovadas pelo TTL) |

O mapa de cobertura (US17) vai usar uma tabela agregada (alcance máximo por direção) que não é apagada.

## Arrancar em local

```bash
# 1. Base de dados
docker compose -f infra/docker-compose.yml up -d db

# 2. Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp ../.env.example ../.env
python -m skytracer.collector          # inicia o polling
uvicorn skytracer.api.main:app --reload  # API em http://localhost:8000/docs
```

Ou tudo de uma vez (BD, collector, enricher e API): `cp .env.example .env && docker compose -f infra/docker-compose.yml up --build`.

### Testes

```bash
cd backend
ruff check . && pytest -q
```

Os testes marcados com `db` precisam de um PostgreSQL de teste e são saltados se não houver um:

```bash
docker run -d --name skytracer-test-db -p 5433:5432 \
  -e POSTGRES_USER=skytracer -e POSTGRES_PASSWORD=skytracer -e POSTGRES_DB=skytracer_test postgres:17
```

(ou definir `TEST_DATABASE_URL`). No CI corre um serviço `postgres:17`.

## Deploy

| Serviço | Onde |
|---|---|
| collector + API + PostgreSQL | VM Oracle Cloud Always Free (Docker Compose) |
| app web (export estático do Expo) | GitHub Pages |
| CI/CD | GitHub Actions |

## Gestão

Scrum, sprints de 2 semanas até à entrega (1.ª semana de janeiro 2027). Ver [`docs/backlog.md`](docs/backlog.md).
