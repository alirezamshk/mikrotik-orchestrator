from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class ServerCredentials(BaseModel):
    id: str
    name: str
    host: str
    api_port: int = 8728
    username: str = "admin"
    password: str = ""
    use_ssl: bool = False
    winbox_port: int = 2020
    tags: List[str] = Field(default_factory=list)
    description: Optional[str] = ""

class ServerStatus(BaseModel):
    id: str
    name: str
    host: str
    online: bool
    version: Optional[str] = None
    uptime: Optional[str] = None
    cpu_load: Optional[int] = None
    free_memory_mb: Optional[float] = None
    total_memory_mb: Optional[float] = None
    ppp_active_users: int = 0
    ipsec_active_peers: int = 0
    wireguard_peers_count: int = 0
    tunnels_count: int = 0
    last_check: datetime = Field(default_factory=datetime.utcnow)
    error_message: Optional[str] = None
