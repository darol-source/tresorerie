from decimal import Decimal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "mysql+pymysql://root:@localhost:3306/tresorerie?charset=utf8mb4"
    secret_key: str = "change-me"
    algorithm: str = "HS256"
    access_token_minutes: int = 480
    seuil_validation_directeur: Decimal = Decimal("500000")
    cors_origins: str = "http://localhost:5173"
    upload_dir: str = "uploads"
    taille_max_fichier: int = 5 * 1024 * 1024
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_reply_to: str = ""
    smtp_tls: str = "starttls"  # starttls | ssl | none
    societe_nom: str = "Notre societe"
    societe_contact: str = ""
    rappels_auto: bool = False
    rappels_heure: int = 8
    rappels_calendrier: str = "-3,0,1,7,15"  # jours par rapport a l'echeance (negatif = avant)
    rappels_pause_secondes: float = 0.3
    rappels_max_par_execution: int = 100
    email_test_destinataire: str = ""  # si renseigne, TOUS les e-mails sont envoyes a cette adresse
    agent_provider: str = "anthropic"  # anthropic | ollama | openai (API compatible OpenAI : Groq, Gemini, OpenRouter...)
    agent_timeout: int = 180
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b"
    ollama_num_ctx: int = 8192
    openai_base_url: str = ""
    openai_api_key: str = ""
    openai_model: str = ""
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5-5"
    agent_max_tours: int = 6
    agent_requetes_par_10min: int = 30


settings = Settings()
