import os
import json
import logging
from typing import List, Optional, Dict, Any
from app.config import settings
from app.models.server import ServerCredentials, ServerStatus
from app.core.ros_client import RouterOSClient

logger = logging.getLogger(__name__)

class FleetService:
    def __init__(self):
        self.db_file = os.path.join(settings.data_dir, "servers.json")
        os.makedirs(settings.data_dir, exist_ok=True)
        if not os.path.exists(self.db_file):
            with open(self.db_file, "w", encoding="utf-8") as f:
                json.dump([], f)

    def _load_servers(self) -> List[Dict[str, Any]]:
        try:
            with open(self.db_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def _save_servers(self, servers: List[Dict[str, Any]]):
        with open(self.db_file, "w", encoding="utf-8") as f:
            json.dump(servers, f, indent=2, ensure_ascii=False)

    def list_servers(self) -> List[ServerCredentials]:
        raw = self._load_servers()
        return [ServerCredentials(**s) for s in raw]

    def get_server(self, server_id: str) -> Optional[ServerCredentials]:
        servers = self.list_servers()
        for s in servers:
            if s.id == server_id:
                return s
        return None

    def add_or_update_server(self, server: ServerCredentials) -> ServerCredentials:
        servers = self._load_servers()
        filtered = [s for s in servers if s["id"] != server.id]
        filtered.append(server.dict())
        self._save_servers(filtered)
        return server

    def delete_server(self, server_id: str) -> bool:
        servers = self._load_servers()
        new_list = [s for s in servers if s["id"] != server_id]
        if len(new_list) < len(servers):
            self._save_servers(new_list)
            return True
        return False

    def get_server_status(self, server_id: str) -> ServerStatus:
        server = self.get_server(server_id)
        if not server:
            return ServerStatus(id=server_id, name="Not Found", host="", online=False, error_message="Server not found")

        try:
            with RouterOSClient(server.host, server.username, server.password, server.api_port, server.use_ssl, server_id=server.id) as client:
                data = client.get_system_summary()
                return ServerStatus(
                    id=server.id,
                    name=data["identity"],
                    host=server.host,
                    online=True,
                    version=data["version"],
                    uptime=data["uptime"],
                    cpu_load=data["cpu_load"],
                    free_memory_mb=data["free_memory_mb"],
                    total_memory_mb=data["total_memory_mb"],
                    ppp_active_users=data["ppp_active_users"],
                    ipsec_active_peers=data["ipsec_active_peers"],
                    wireguard_peers_count=data["wireguard_peers_count"],
                    tunnels_count=data["tunnels_count"]
                )
        except Exception as e:
            return ServerStatus(
                id=server.id,
                name=server.name,
                host=server.host,
                online=False,
                error_message=str(e)
            )

    def get_all_statuses(self) -> List[ServerStatus]:
        servers = self.list_servers()
        results = []
        for s in servers:
            results.append(self.get_server_status(s.id))
        return results

fleet_service = FleetService()
