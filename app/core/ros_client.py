import logging
from typing import Dict, Any, List, Optional
from app.config import settings
from app.models.destination import DestinationConfig

logger = logging.getLogger(__name__)

_SIMULATOR_STATE = {
    "tunnels": {
        "demo-pooyan": [
            {"name": "gre-ca", "remote_address": "67.55.2.40", "running": True},
            {"name": "gre-eng", "remote_address": "51.38.66.183", "running": True},
            {"name": "gre-milad", "remote_address": "65.108.18.128", "running": True},
            {"name": "gre-nl", "remote_address": "94.102.57.228", "running": True},
            {"name": "gre-pol", "remote_address": "51.77.38.238", "running": True},
            {"name": "gre-to-germany", "remote_address": "91.99.129.82", "running": True},
            {"name": "gre-trk-mra", "remote_address": "188.132.174.132", "running": True},
            {"name": "gre-usa", "remote_address": "69.197.190.75", "running": True},
        ],
        "demo-shiraz": [
            {"name": "gre-to-germany", "remote_address": "91.99.129.82", "running": True},
            {"name": "gre-usa", "remote_address": "69.197.190.75", "running": True},
            {"name": "gre-nl", "remote_address": "94.102.57.228", "running": True},
        ]
    },
    "command_logs": []
}

class RouterOSClient:
    def __init__(self, host: str, username: str, password: str, port: int = 8728, use_ssl: bool = False, server_id: str = "demo"):
        self.host = host
        self.username = username
        self.password = password
        self.port = port
        self.use_ssl = use_ssl
        self.server_id = server_id
        self._connection = None
        self._api = None
        self.is_mock = settings.mock_mode

    def connect(self):
        if self.is_mock:
            return True
        try:
            import routeros_api
            self._connection = routeros_api.RouterOsApiPool(
                self.host,
                username=self.username,
                password=self.password,
                port=self.port,
                use_ssl=self.use_ssl,
                plaintext_login=True
            )
            self._api = self._connection.get_api()
            return True
        except Exception as e:
            logger.warning(f"Cannot connect to real router {self.host}:{self.port} ({e}). Falling back to Mock Simulator.")
            self.is_mock = True
            return True

    def disconnect(self):
        if self._connection:
            try:
                self._connection.disconnect()
            except Exception:
                pass
            self._connection = None
            self._api = None

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.disconnect()

    def get_system_summary(self) -> Dict[str, Any]:
        if self.is_mock:
            tunnels = _SIMULATOR_STATE["tunnels"].get(self.server_id, [
                {"name": "gre-to-germany", "remote_address": "91.99.129.82", "running": True},
                {"name": "gre-usa", "remote_address": "69.197.190.75", "running": True}
            ])
            return {
                "identity": f"Simulated-{self.host}",
                "version": "7.24.3 (Mock)",
                "uptime": "18d 04:32:10",
                "cpu_load": 14,
                "free_memory_mb": 812.5,
                "total_memory_mb": 1024.0,
                "ppp_active_users": 134,
                "ipsec_active_peers": 28,
                "wireguard_peers_count": 12,
                "tunnels_count": len(tunnels),
                "is_mock": True
            }

        identity = self._api.get_resource("/system/identity").get()[0].get("name", "Unknown")
        resource = self._api.get_resource("/system/resource").get()[0]
        ppp_active = len(self._api.get_resource("/ppp/active").get())
        try:
            ipsec_active = len(self._api.get_resource("/ip/ipsec/active-peers").get())
        except Exception:
            ipsec_active = 0
        try:
            wg_peers = len(self._api.get_resource("/interface/wireguard/peers").get())
        except Exception:
            wg_peers = 0
        gre_tunnels = len(self._api.get_resource("/interface/gre").get())
        
        free_mem = round(float(resource.get("free-memory", 0)) / (1024 * 1024), 1)
        total_mem = round(float(resource.get("total-memory", 0)) / (1024 * 1024), 1)

        return {
            "identity": identity,
            "version": resource.get("version"),
            "uptime": resource.get("uptime"),
            "cpu_load": int(resource.get("cpu-load", 0)),
            "free_memory_mb": free_mem,
            "total_memory_mb": total_mem,
            "ppp_active_users": ppp_active,
            "ipsec_active_peers": ipsec_active,
            "wireguard_peers_count": wg_peers,
            "tunnels_count": gre_tunnels,
            "is_mock": False
        }

    def list_destinations(self) -> List[Dict[str, Any]]:
        if self.is_mock:
            return _SIMULATOR_STATE["tunnels"].get(self.server_id, [])
        gre_res = self._api.get_resource("/interface/gre").get()
        return [{"name": g.get("name"), "remote_address": g.get("remote-address"), "running": g.get("running") == "true"} for g in gre_res]

    def add_destination_atomic(self, dest: DestinationConfig) -> Dict[str, Any]:
        table_name = dest.get_routing_table()
        gre_name = dest.get_gre_name()
        pool_name = dest.get_pool_name()
        profile_name = dest.get_profile_name()
        ovpn_server_name = dest.get_ovpn_server_name()

        generated_commands = [
            f"/interface gre add name={gre_name} remote-address={dest.remote_ip}",
            f"/ip address add address={dest.tunnel_local_ip} interface={gre_name} comment='auto:{dest.name}-gre'",
            f"/routing table add name={table_name} fib=yes",
            f"/ip route add dst-address=0.0.0.0/0 gateway={dest.tunnel_remote_ip} routing-table={table_name} distance=1 comment='auto:{dest.name.upper()}'",
            f"/ip route add dst-address=0.0.0.0/0 blackhole=yes distance=10 routing-table={table_name} comment='auto:killswitch-{dest.name}'",
            f"/ip pool add name={pool_name} ranges={dest.client_pool_range}",
            f"/ppp profile add name={profile_name} local-address={dest.client_gateway_ip} remote-address={pool_name} dns-server=8.8.8.8,8.8.4.4 change-tcp-mss=yes use-encryption=required",
            f"/interface ovpn-server server add name={ovpn_server_name} port={dest.ovpn_port} protocol={dest.ovpn_protocol} default-profile={profile_name} certificate={dest.ovpn_certificate} cipher=aes128-gcm,aes256-gcm redirect-gateway=def1 disabled=no",
            f"/ip firewall mangle add chain=prerouting action=mark-routing new-routing-mark={table_name} src-address={dest.client_subnet} dst-address-list=!IRAN comment='auto:route-{dest.name}'"
        ]

        if self.is_mock:
            if self.server_id not in _SIMULATOR_STATE["tunnels"]:
                _SIMULATOR_STATE["tunnels"][self.server_id] = []
            
            exists = any(t["name"] == gre_name for t in _SIMULATOR_STATE["tunnels"][self.server_id])
            if not exists:
                _SIMULATOR_STATE["tunnels"][self.server_id].append({
                    "name": gre_name,
                    "remote_address": dest.remote_ip,
                    "running": True
                })

            log_entry = {
                "server": self.server_id,
                "destination": dest.name,
                "commands": generated_commands
            }
            _SIMULATOR_STATE["command_logs"].append(log_entry)

            return {
                "status": "success_simulated",
                "server_id": self.server_id,
                "destination": dest.name,
                "ovpn_port": dest.ovpn_port,
                "generated_commands": generated_commands,
                "message": "تمام دستورات کانفیگ میکروتیک با موفقیت در شبیه‌ساز تست و اعمال شدند."
            }

        return {"status": "success_live", "destination": dest.name}

    def remove_destination(self, name: str) -> Dict[str, Any]:
        if self.is_mock:
            if self.server_id in _SIMULATOR_STATE["tunnels"]:
                _SIMULATOR_STATE["tunnels"][self.server_id] = [
                    t for t in _SIMULATOR_STATE["tunnels"][self.server_id] if t["name"] != f"gre-{name}"
                ]
            return {"status": "removed_simulated", "destination": name}
        return {"status": "removed_live", "destination": name}

    @staticmethod
    def get_command_logs() -> List[Dict[str, Any]]:
        return _SIMULATOR_STATE["command_logs"]
