from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    # API Keys
    DEEPGRAM_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    CARTESIA_API_KEY: str = ""
    TAVILY_API_KEY: str = ""
    
    # Optional providers
    ASSEMBLYAI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    
    # Database
    DATABASE_URL: str = "sqlite:///./voice.db"
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Application
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str = "your-secret-key-change-in-production"
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:3001"]
    
    # Performance
    MAX_CONCURRENT_SESSIONS: int = 100
    SESSION_TIMEOUT_SECONDS: int = 1800
    
    # Cache
    CACHE_TTL_DEFAULT: int = 3600
    CACHE_SIMILARITY_THRESHOLD: float = 0.85
    
    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    
    # Audio Processing
    SAMPLE_RATE: int = 16000
    CHUNK_DURATION_MS: int = 100
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
