import routeros_api
import logging
from typing import Dict, Any, List, Optional
from app.models.destination import DestinationConfig

logger = logging.getLogger(__name__)

class RouterOSClient:
    def __init__(self, host: str, username: str, password: str, port: int = 8728, use_ssl: bool = False):
        self.host = host
        self.username = username
        self.password = password
        self.port = port
        self.use_ssl = use_ssl
        self._connection = None
        self._api = None

    def connect(self):
        try:
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
            logger.error(f"Failed to connect to RouterOS {self.host}:{self.port} - {e}")
            raise e

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

    @property
    def api(self):
        if not self._api:
            self.connect()
        return self._api

    def ping(self) -> bool:
        try:
            res = self.api.get_resource("/system/identity")
            res.get()
            return True
        except Exception:
            return False

    def get_system_summary(self) -> Dict[str, Any]:
        identity = self.api.get_resource("/system/identity").get()[0].get("name", "Unknown")
        resource = self.api.get_resource("/system/resource").get()[0]
        
        # Count online PPP users
        ppp_active = len(self.api.get_resource("/ppp/active").get())
        
        # Count active IPsec peers
        try:
            ipsec_active = len(self.api.get_resource("/ip/ipsec/active-peers").get())
        except Exception:
            ipsec_active = 0

        # Count WireGuard peers
        try:
            wg_peers = len(self.api.get_resource("/interface/wireguard/peers").get())
        except Exception:
            wg_peers = 0

        # Outbound Tunnels count
        gre_tunnels = len(self.api.get_resource("/interface/gre").get())
        
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
            "tunnels_count": gre_tunnels
        }

    def list_destinations(self) -> List[Dict[str, Any]]:
        gre_res = self.api.get_resource("/interface/gre").get()
        routes = self.api.get_resource("/ip/route").get()
        t_tables = self.api.get_resource("/routing/table").get()
        
        results = []
        for gre in gre_res:
            name = gre.get("name")
            running = gre.get("running") == "true"
            remote = gre.get("remote-address")
            results.append({
                "name": name,
                "remote_address": remote,
                "running": running
            })
        return results

    def add_destination_atomic(self, dest: DestinationConfig) -> Dict[str, Any]:
        """
        Executes all 7 steps required to provision an outbound tunnel destination atomically:
        1. GRE Interface
        2. /30 IP Address on GRE
        3. Routing Table
        4. Default Route via GRE gateway
        5. Killswitch Blackhole Route
        6. Pool & PPP Profile
        7. OpenVPN Server instance on dedicated port
        8. Firewall Mangle rule (!IRAN)
        """
        table_name = dest.get_routing_table()
        gre_name = dest.get_gre_name()
        pool_name = dest.get_pool_name()
        profile_name = dest.get_profile_name()
        ovpn_server_name = dest.get_ovpn_server_name()

        # Step 1: Create GRE interface
        gre_api = self.api.get_resource("/interface/gre")
        if not gre_api.get(name=gre_name):
            gre_api.add(name=gre_name, remote_address=dest.remote_ip)

        # Step 2: Assign IP on GRE
        ip_api = self.api.get_resource("/ip/address")
        if not ip_api.get(interface=gre_name):
            ip_api.add(
                address=dest.tunnel_local_ip,
                interface=gre_name,
                comment=f"auto:{dest.name}-gre"
            )

        # Step 3: Add Routing Table (ROS 7)
        table_api = self.api.get_resource("/routing/table")
        if not table_api.get(name=table_name):
            table_api.add(name=table_name, fib="true")

        # Step 4: Add Default Route
        route_api = self.api.get_resource("/ip/route")
        existing_routes = route_api.get(routing_table=table_name, dst_address="0.0.0.0/0", blackhole="false")
        if not existing_routes:
            route_api.add(
                dst_address="0.0.0.0/0",
                gateway=dest.tunnel_remote_ip,
                routing_table=table_name,
                distance="1",
                scope="30",
                target_scope="10",
                comment=f"auto:{dest.name.upper()}"
            )

        # Step 5: Add Blackhole Killswitch Route
        if dest.enable_killswitch:
            existing_bh = route_api.get(routing_table=table_name, dst_address="0.0.0.0/0", blackhole="true")
            if not existing_bh:
                route_api.add(
                    dst_address="0.0.0.0/0",
                    blackhole="true",
                    distance="10",
                    routing_table=table_name,
                    comment=f"auto:killswitch-{dest.name}"
                )

        # Step 6: Create IP Pool & PPP Profile
        pool_api = self.api.get_resource("/ip/pool")
        if not pool_api.get(name=pool_name):
            pool_api.add(name=pool_name, ranges=dest.client_pool_range)

        profile_api = self.api.get_resource("/ppp/profile")
        if not profile_api.get(name=profile_name):
            profile_api.add(
                name=profile_name,
                local_address=dest.client_gateway_ip,
                remote_address=pool_name,
                dns_server="8.8.8.8,8.8.4.4",
                change_tcp_mss="yes",
                use_encryption="required",
                use_compression="no"
            )

        # Step 7: Create OpenVPN Server instance
        ovpn_api = self.api.get_resource("/interface/ovpn-server/server")
        if not ovpn_api.get(port=str(dest.ovpn_port)):
            ovpn_api.add(
                name=ovpn_server_name,
                port=str(dest.ovpn_port),
                protocol=dest.ovpn_protocol,
                default_profile=profile_name,
                certificate=dest.ovpn_certificate,
                cipher="aes128-gcm,aes256-gcm",
                auth="sha1",
                max_mtu="1300",
                redirect_gateway="def1",
                disabled="no"
            )

        # Step 8: Add Mangle Rule
        mangle_api = self.api.get_resource("/ip/firewall/mangle")
        existing_mangle = mangle_api.get(new_routing_mark=table_name, src_address=dest.client_subnet)
        if not existing_mangle:
            mangle_args = {
                "chain": "prerouting",
                "action": "mark-routing",
                "new_routing_mark": table_name,
                "src_address": dest.client_subnet,
                "comment": f"auto:route-{dest.name}"
            }
            if dest.bypass_iran:
                mangle_args["dst_address_list"] = "!IRAN"
            mangle_api.add(**mangle_args)

        return {"status": "success", "destination": dest.name, "port": dest.ovpn_port}

    def remove_destination(self, name: str) -> Dict[str, Any]:
        """Cleanly removes all objects related to a country destination"""
        table_name = f"to-{name}"
        gre_name = f"gre-{name}"
        pool_name = f"ovpn-{name}"
        profile_name = f"ovpn-{name}"

        # 1. Remove Mangle
        mangle_api = self.api.get_resource("/ip/firewall/mangle")
        for m in mangle_api.get(new_routing_mark=table_name):
            mangle_api.remove(id=m["id"])

        # 2. Remove OpenVPN Server
        ovpn_api = self.api.get_resource("/interface/ovpn-server/server")
        for o in ovpn_api.get(default_profile=profile_name):
            ovpn_api.remove(id=o["id"])

        # 3. Remove PPP Profile
        profile_api = self.api.get_resource("/ppp/profile")
        for p in profile_api.get(name=profile_name):
            profile_api.remove(id=p["id"])

        # 4. Remove Pool
        pool_api = self.api.get_resource("/ip/pool")
        for p in pool_api.get(name=pool_name):
            pool_api.remove(id=p["id"])

        # 5. Remove Routes
        route_api = self.api.get_resource("/ip/route")
        for r in route_api.get(routing_table=table_name):
            route_api.remove(id=r["id"])

        # 6. Remove Routing Table
        table_api = self.api.get_resource("/routing/table")
        for t in table_api.get(name=table_name):
            table_api.remove(id=t["id"])

        # 7. Remove IP on GRE
        ip_api = self.api.get_resource("/ip/address")
        for a in ip_api.get(interface=gre_name):
            ip_api.remove(id=a["id"])

        # 8. Remove GRE
        gre_api = self.api.get_resource("/interface/gre")
        for g in gre_api.get(name=gre_name):
            gre_api.remove(id=g["id"])

        return {"status": "removed", "destination": name}
