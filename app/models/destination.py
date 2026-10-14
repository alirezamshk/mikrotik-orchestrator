from pydantic import BaseModel, Field
from typing import Optional

class DestinationConfig(BaseModel):
    name: str = Field(..., description="Short name code, e.g. 'de', 'usa', 'pln', 'eng'")
    country_label: str = Field(..., description="Display name, e.g. 'Germany', 'USA'")
    tunnel_type: str = Field(default="gre", description="Tunnel type: gre, l2tp, wireguard")
    existing_tunnel_name: Optional[str] = Field(default=None, description="Attach to an existing tunnel interface on the router")
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
    ovpn_protocol: str = Field(default="udp", description="Protocol: udp or tcp")
    ovpn_certificate: str = Field(default="server-template", description="Certificate name in router")
    
    # L2TP Ethernet (L2TPv3) specific fields
    local_ip: Optional[str] = Field(default=None, description="Local Iran Server IP for L2TPv3")
    local_tunnel_id: Optional[int] = Field(default=33, description="Local Tunnel ID for L2TPv3")
    remote_tunnel_id: Optional[int] = Field(default=22, description="Remote Tunnel ID for L2TPv3")
    local_session_id: Optional[int] = Field(default=333, description="Local Session ID for L2TPv3")
    remote_session_id: Optional[int] = Field(default=222, description="Remote Session ID for L2TPv3")

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
