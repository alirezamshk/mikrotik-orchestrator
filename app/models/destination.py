from pydantic import BaseModel, Field
from typing import Optional

class DestinationConfig(BaseModel):
    name: str = Field(..., description="Short name code, e.g. 'de', 'usa', 'pln', 'eng'")
    country_label: str = Field(..., description="Display name, e.g. 'Germany', 'USA'")
    tunnel_type: str = Field(default="gre", description="Tunnel type: gre, l2tp, wireguard")
    remote_ip: str = Field(..., description="Public IP of the foreign tunnel endpoint")
    
    # Internal point-to-point /30 subnet
    tunnel_local_ip: str = Field(..., description="Router IP on tunnel, e.g. '40.40.40.2/30'")
    tunnel_remote_ip: str = Field(..., description="Remote VPS IP on tunnel, e.g. '40.40.40.1'")
    
    # Client pool & profile
    client_pool_range: str = Field(..., description="Client pool range, e.g. '10.18.1.2-10.18.1.200'")
    client_gateway_ip: str = Field(..., description="Client gateway IP, e.g. '10.18.1.1'")
    client_subnet: str = Field(..., description="Client subnet CIDR, e.g. '10.18.1.0/24'")
    
    # OpenVPN server instance for this country
    ovpn_port: int = Field(..., description="Dedicated UDP port for this country, e.g. 6066")
    ovpn_certificate: str = Field(default="server-template", description="Certificate name in router")
    
    # Routing & Killswitch
    routing_table: Optional[str] = None
    enable_killswitch: bool = True
    bypass_iran: bool = True

    def get_routing_table(self) -> str:
        return self.routing_table or f"to-{self.name}"

    def get_gre_name(self) -> str:
        return f"gre-{self.name}"

    def get_pool_name(self) -> str:
        return f"ovpn-{self.name}"

    def get_profile_name(self) -> str:
        return f"ovpn-{self.name}"

    def get_ovpn_server_name(self) -> str:
        return f"ovpn-{self.name}"
