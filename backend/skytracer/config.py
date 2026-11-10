from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    dump1090_url: str = "https://ads-b.jcboliveira.xyz/dump1090/data/aircraft.json"
    poll_interval_seconds: float = 1.0
    position_min_interval_seconds: float = 5.0
    database_url: str = "postgresql://skytracer:skytracer@localhost:5432/skytracer"
    api_cors_origins: str = "http://localhost:8081,http://localhost:19006"


settings = Settings()
