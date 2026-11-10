from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    dump1090_url: str = "https://ads-b.jcboliveira.xyz/dump1090/data/aircraft.json"
    poll_interval_seconds: float = 1.0
    position_min_interval_seconds: float = 5.0
    snapshot_interval_seconds: float = 10.0
    live_expiry_seconds: int = 300
    retention_days: int = 30
    database_url: str = "postgresql://skytracer:skytracer@localhost:5432/skytracer"
    api_cors_origins: str = "http://localhost:8081,http://localhost:19006"
    ws_interval_seconds: float = 1.0

    # Enriquecimento (adsbdb + planespotters)
    http_user_agent: str = "SkyTracer/0.1 (+https://github.com/miguelsiilva1/SkyTracer)"
    adsbdb_url: str = "https://api.adsbdb.com/v0"
    planespotters_url: str = "https://api.planespotters.net/pub/photos"
    enrich_requests_per_second: float = 1.0
    enrich_interval_seconds: float = 5.0
    aircraft_ttl_days: int = 30
    route_ttl_days: int = 7


settings = Settings()
