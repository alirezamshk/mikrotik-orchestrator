from pydantic_settings import BaseSettings
from typing import List, Optional
import os

class Settings(BaseSettings):
    app_name: str = "MikroTik Fleet Orchestrator"
    app_version: str = "1.0.0"
    debug: bool = True
    host: str = "0.0.0.0"
    port: int = 8080
    data_dir: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
    default_api_port: int = 8728
    default_winbox_port: int = 2020
    default_radius_ip: str = "91.199.27.107"
    default_kuma_push: str = "http://91.223.116.173:3000/api/push/fqPZPvZJqy"
    
    class Config:
        env_file = ".env"

settings = Settings()
