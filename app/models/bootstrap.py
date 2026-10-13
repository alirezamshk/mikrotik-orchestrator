from pydantic import BaseModel, Field
from typing import List, Optional

class BootstrapRequest(BaseModel):
    server_identity: Optional[str] = None
    winbox_port: int = 2020
    dns_servers: List[str] = ["8.8.8.8", "8.8.4.4"]
    radius_server: str = "91.199.27.107"
    radius_secret: str = "radius_secret_change_me"
    ikev2_pool: str = "10.0.0.2-10.0.0.254"
    ikev2_gateway: str = "10.0.0.1"
    kuma_push_url: Optional[str] = "http://91.223.116.173:3000/api/push/fqPZPvZJqy"
    enable_iran_fetch: bool = True
    enable_tunnel_monitor: bool = True
    enable_killswitch_sync: bool = True
