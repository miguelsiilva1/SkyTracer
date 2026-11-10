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
| `backend/` | Python: `collector` (polling do dump1090 + enriquecimento) e `api` (FastAPI) |
| `app/` | App Expo / React Native (web + Android + iOS), mapas com MapLibre |
| `infra/` | `docker-compose.yml`, schema da base de dados, configuração de deploy |
| `docs/` | Backlog Scrum, arquitetura, decisões, relatório |
| `.github/workflows/` | CI/CD (testes, deploy da web e do backend) |

## Fonte de dados obrigatória

`https://ads-b.jcboliveira.xyz/dump1090/data/aircraft.json` (dump1090-mutability). Todas as posições dos aviões vêm desta fonte; as APIs externas só **enriquecem** os aviões que o recetor vê.

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

Ou tudo de uma vez: `docker compose -f infra/docker-compose.yml up --build`.

## Deploy

| Serviço | Onde |
|---|---|
| collector + API + PostgreSQL | VM Oracle Cloud Always Free (Docker Compose) |
| app web (export estático do Expo) | GitHub Pages |
| CI/CD | GitHub Actions |

## Gestão

Scrum, sprints de 2 semanas até à entrega (1.ª semana de janeiro 2027). Ver [`docs/backlog.md`](docs/backlog.md).
