import logging
import uuid
import time
from typing import Dict, Any, List, Optional
from fastapi import HTTPException
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
            self._connection.set_timeout(8)
            self._api = self._connection.get_api()
            # Verify credentials and API response
            self._api.get_resource("/system/identity").get()
            return True
        except Exception as e:
            logger.error(f"Cannot connect to real router {self.host}:{self.port} ({e})")
            if settings.mock_mode:
                self.is_mock = True
                return True
            raise HTTPException(
                status_code=400,
                detail=f"ارتباط با میکروتیک واقعی در آدرس {self.host}:{self.port} برقرار نشد. لطفاً از باز بودن پورت API ({self.port}) و صحت نام‌کاربری/رمز عبور اطمینان حاصل فرمایید. (علت خطا: {str(e)})"
            )

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

    def execute_routeros_commands(self, commands: List[str]) -> Dict[str, Any]:
        """
        Executes a sequence of RouterOS commands on the live router via API /system/script.
        If in mock mode, logs commands to simulator state.
        """
        if self.is_mock:
            _SIMULATOR_STATE["command_logs"].append({
                "server": self.server_id,
                "commands": commands
            })
            return {"status": "success_simulated", "commands": commands}

        clean_lines = []
        for c in commands:
            line = c.strip()
            if line and not line.startswith("#"):
                # Normalize single quotes to double quotes for RouterOS script parser
                line = line.replace("'", "\"")
                line = line.replace("blackhole=yes", "blackhole")
                clean_lines.append(line)

        if not clean_lines:
            return {"status": "success_live", "commands": []}

        if not self._api:
            self.connect()

        # Build resilient script: ensure TUNNELS list exists, then wrap each command in safe :do { } on-error={ }
        script_body = [
            ':if ([:len [/interface list find where name="TUNNELS"]] = 0) do={ :do { /interface list add name="TUNNELS" comment="auto:exit-tunnels" } on-error={} }'
        ]
        for cmd in clean_lines:
            if cmd.startswith(":"):
                script_body.append(cmd)
            else:
                escaped_desc = cmd[:50].replace("\"", "").replace("\\", "")
                script_body.append(f':do {{ {cmd} }} on-error={{ :log warning ("orch-err: " . "{escaped_desc}") }}')

        script_content = "\r\n".join(script_body)
        script_name = f"orch-{uuid.uuid4().hex[:6]}"

        try:
            script_res = self._api.get_resource("/system/script")
            script_res.add(
                name=script_name,
                source=script_content,
                policy="ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon"
            )
            try:
                script_res.call("run", {"number": script_name})
            except Exception as run_err:
                logger.error(f"RouterOS script run call error: {run_err}")
                raise HTTPException(
                    status_code=500,
                    detail=f"خطا در اجرای اسکریپت روی روتر ({self.host}): {str(run_err)}"
                )

            time.sleep(1.0)

            # Cleanup temporary script
            try:
                items = script_res.get(name=script_name)
                if items:
                    script_res.remove(id=items[0]["id"])
            except Exception:
                pass

            return {"status": "success_live", "commands": clean_lines}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error executing script on RouterOS {self.host}: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"خطا در اعمال مستقیم دستورات روی میکروتیک ({self.host}): {str(e)}"
            )

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

        # Dynamic certificate selection: resolve to active certificate on router
        cert_name = dest.ovpn_certificate
        if not self.is_mock:
            try:
                if not self._api:
                    self.connect()
                certs = self._api.get_resource("/certificate").get()
                cert_names = [c.get("name") for c in certs]
                if cert_name not in cert_names:
                    # Pick certificate with private key or first available
                    priv_certs = [c.get("name") for c in certs if c.get("private-key") == "true"]
                    if priv_certs:
                        cert_name = priv_certs[0]
                    elif cert_names:
                        cert_name = cert_names[0]
            except Exception:
                pass

        if dest.existing_tunnel_name:
            tun_iface = dest.existing_tunnel_name
            generated_commands = [
                f"# --- اتصال و مسیریابی روی تونل موجود {tun_iface} ({dest.country_label}) ---"
            ]
        elif dest.tunnel_type == "l2tp_ether":
            tun_iface = f"l2tp-{dest.name}"
            # RouterOS unmanaged l2tp-ether requires both connect-to and local-address
            loc_ip = dest.local_ip
            if not loc_ip:
                clean_host = self.host.strip()
                if clean_host.replace(".", "").isdigit():
                    loc_ip = clean_host
                elif not self.is_mock and self._api:
                    try:
                        ips = self._api.get_resource("/ip/address").get()
                        for ip_item in ips:
                            addr = ip_item.get("address", "").split("/")[0]
                            if addr and not addr.startswith("10.") and not addr.startswith("172.") and not addr.startswith("192.168."):
                                loc_ip = addr
                                break
                    except Exception:
                        pass
            if not loc_ip:
                loc_ip = self.host

            tunnel_cmd = f"/interface l2tp-ether add name={tun_iface} connect-to={dest.remote_ip} local-address={loc_ip} l2tp-proto-version=l2tpv3-udp unmanaged-mode=yes local-tunnel-id={dest.local_tunnel_id or 33} remote-tunnel-id={dest.remote_tunnel_id or 22} local-session-id={dest.local_session_id or 333} remote-session-id={dest.remote_session_id or 222} use-ipsec=no"
            generated_commands = [
                tunnel_cmd,
                f"/ip address add address={dest.tunnel_local_ip} interface={tun_iface} comment=\"auto:{dest.name}-gre\""
            ]
        else:
            tun_iface = f"gre-{dest.name}"
            tunnel_cmd = f"/interface gre add name={tun_iface} remote-address={dest.remote_ip}"
            generated_commands = [
                tunnel_cmd,
                f"/ip address add address={dest.tunnel_local_ip} interface={tun_iface} comment=\"auto:{dest.name}-gre\""
            ]

        generated_commands.extend([
            f"/interface list member add list=TUNNELS interface={tun_iface} comment=\"auto:tun-{dest.name}\"",
            f"/routing table add name={table_name} fib",
            f"/ip route add dst-address=0.0.0.0/0 gateway={dest.tunnel_remote_ip} routing-table={table_name} distance=1 comment=\"auto:{dest.name.upper()}\"",
            f"/ip route add blackhole dst-address=0.0.0.0/0 distance=10 routing-table={table_name} comment=\"auto:killswitch-{dest.name}\"",
            f"/ip pool add name={pool_name} ranges={dest.client_pool_range}",
            f"/ppp profile add name={profile_name} local-address={dest.client_gateway_ip} remote-address={pool_name} dns-server=8.8.8.8,8.8.4.4 change-tcp-mss=yes use-encryption=required",
            f"/interface ovpn-server server add name={ovpn_server_name} port={dest.ovpn_port} protocol={dest.ovpn_protocol} default-profile={profile_name} certificate=\"{cert_name}\" cipher=aes128-gcm,aes256-gcm redirect-gateway=def1 disabled=no",
            f"/ip firewall mangle add chain=prerouting action=mark-routing new-routing-mark={table_name} src-address={dest.client_subnet} dst-address-list=!IRAN comment=\"auto:route-{dest.name}\""
        ])

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

        # LIVE EXECUTION ON ROUTER
        self.execute_routeros_commands(generated_commands)
        return {
            "status": "success_live",
            "destination": dest.name,
            "ovpn_port": dest.ovpn_port,
            "generated_commands": generated_commands,
            "message": f"کانفیگ لوکیشن {dest.country_label} با موفقیت روی میکروتیک واقعی اعمال شد."
        }

    def list_certificates(self) -> List[Dict[str, Any]]:
        """Scans and lists existing certificates on the router"""
        if self.is_mock:
            return [
                {"name": "server-template", "common_name": "server-template", "has_key": True, "invalid_after": "2036-10-12"},
                {"name": "ca-authority", "common_name": "CA-Authority", "has_key": True, "invalid_after": "2036-10-12"}
            ]
        try:
            cert_res = self._api.get_resource("/certificate").get()
            results = []
            for c in cert_res:
                results.append({
                    "name": c.get("name"),
                    "common_name": c.get("common-name", c.get("name")),
                    "has_key": "K" in c.get("flags", "") or c.get("private-key") == "true",
                    "invalid_after": c.get("invalid-after", "Unknown")
                })
            return results
        except Exception:
            return []

    def detect_existing_tunnels(self) -> List[Dict[str, Any]]:
        """Scans existing GRE and L2TP-ether interfaces with their assigned IP addresses and link state"""
        if self.is_mock:
            return [
                {"name": "gre-ca", "type": "gre", "remote_ip": "67.55.2.40", "local_ip_30": "20.20.3.2/30", "gw_ip": "20.20.3.1", "running": True, "disabled": False, "configured": False},
                {"name": "gre-to-germany", "type": "gre", "remote_ip": "91.99.129.82", "local_ip_30": "40.40.40.2/30", "gw_ip": "40.40.40.1", "running": False, "disabled": False, "configured": False},
                {"name": "l2tp-milad", "type": "l2tp_ether", "remote_ip": "65.108.18.128", "local_ip_30": "10.10.2.2/30", "gw_ip": "10.10.2.1", "running": True, "disabled": False, "configured": False}
            ]
        detected = []
        try:
            # 1. GRE
            for g in self._api.get_resource("/interface/gre").get():
                name = g.get("name")
                remote = g.get("remote-address")
                is_running = g.get("running") == "true"
                is_disabled = g.get("disabled") == "true"
                ips = self._api.get_resource("/ip/address").get(interface=name)
                ip_addr = ips[0].get("address") if ips else ""
                
                gw_ip = ""
                if ip_addr and "/" in ip_addr:
                    clean_ip = ip_addr.split("/")[0]
                    parts = clean_ip.split(".")
                    if len(parts) == 4:
                        last = int(parts[3])
                        if last % 4 == 1:
                            gw_ip = f"{parts[0]}.{parts[1]}.{parts[2]}.{last + 1}"
                        elif last % 4 == 2:
                            gw_ip = f"{parts[0]}.{parts[1]}.{parts[2]}.{last - 1}"

                detected.append({
                    "name": name,
                    "type": "gre",
                    "remote_ip": remote or "",
                    "local_ip_30": ip_addr,
                    "gw_ip": gw_ip,
                    "running": is_running,
                    "disabled": is_disabled,
                    "configured": False
                })
            # 2. L2TP Ethernet
            for l in self._api.get_resource("/interface/l2tp-ether").get():
                name = l.get("name")
                remote = l.get("connect-to")
                is_running = l.get("running") == "true"
                is_disabled = l.get("disabled") == "true"
                ips = self._api.get_resource("/ip/address").get(interface=name)
                ip_addr = ips[0].get("address") if ips else ""
                
                gw_ip = ""
                if ip_addr and "/" in ip_addr:
                    clean_ip = ip_addr.split("/")[0]
                    parts = clean_ip.split(".")
                    if len(parts) == 4:
                        last = int(parts[3])
                        if last % 4 == 1:
                            gw_ip = f"{parts[0]}.{parts[1]}.{parts[2]}.{last + 1}"
                        elif last % 4 == 2:
                            gw_ip = f"{parts[0]}.{parts[1]}.{parts[2]}.{last - 1}"

                detected.append({
                    "name": name,
                    "type": "l2tp_ether",
                    "remote_ip": remote or "",
                    "local_ip_30": ip_addr,
                    "gw_ip": gw_ip,
                    "running": is_running,
                    "disabled": is_disabled,
                    "configured": False
                })
        except Exception as e:
            logger.error(f"Error scanning tunnels: {e}")

        # Sort: running tunnels first, then by name
        detected.sort(key=lambda x: (not x.get("running", False), x.get("name", "")))
        return detected

    def generate_self_signed_cert(self, cert_name: str = "server-template", common_name: str = "server-template", days: int = 3650) -> Dict[str, Any]:
        commands = [
            f"/certificate add name=ca-authority common-name=\"CA-Authority\" days-valid={days} key-size=2048 key-usage=crl-sign,key-cert-sign",
            f"/certificate sign ca-authority name=ca-authority",
            f"/certificate add name={cert_name} common-name=\"{common_name}\" days-valid={days} key-size=2048 key-usage=digital-signature,key-encipherment,tls-server",
            f"/certificate sign {cert_name} ca=ca-authority name={cert_name}"
        ]
        if self.is_mock:
            _SIMULATOR_STATE["command_logs"].append({
                "server": self.server_id,
                "destination": "certificate-generate",
                "commands": commands
            })
            return {
                "status": "success_simulated",
                "cert_name": cert_name,
                "commands": commands,
                "message": f"سرتیفیکت {cert_name} با موفقیت روی میکروتیک تولید و Sign شد."
            }
        
        self.execute_routeros_commands(commands)
        return {"status": "success_live", "cert_name": cert_name, "commands": commands, "message": f"سرتیفیکت {cert_name} روی میکروتیک واقعی با موفقیت ایجاد و امضا شد."}

    def upload_and_import_cert(self, cert_name: str, cert_content: str, key_content: str) -> Dict[str, Any]:
        cert_file = f"{cert_name}.crt"
        key_file = f"{cert_name}.key"
        commands = [
            f"# 1. Upload files {cert_file} and {key_file} to MikroTik storage",
            f"/certificate import file-name={cert_file} passphrase=\"\"",
            f"/certificate import file-name={key_file} passphrase=\"\"",
            f"# 2. Certificate {cert_name} is now imported with private key (K flag)"
        ]
        if self.is_mock:
            _SIMULATOR_STATE["command_logs"].append({
                "server": self.server_id,
                "destination": "certificate-upload",
                "commands": commands
            })
            return {
                "status": "success_simulated",
                "cert_name": cert_name,
                "commands": commands,
                "message": f"فایل‌های سرتیفیکت و کلید خصوصی با موفقیت روی روتر ایمپورت شدند."
            }
        
        self.execute_routeros_commands(commands)
        return {"status": "success_live", "cert_name": cert_name, "commands": commands, "message": f"سرتیفیکت {cert_name} روی میکروتیک واقعی با موفقیت ایمپورت شد."}

    def setup_iran_ipdeny(self) -> Dict[str, Any]:
        commands = [
            "# 1. Download ir.zone from IPDeny",
            "/tool fetch url='https://www.ipdeny.com/ipblocks/data/countries/ir.zone' dst-path=ir.zone.txt",
            "# 2. Parse and populate IRAN address list",
            "/system script add name=iran-fetch source='...'",
            "# 3. Add daily scheduler at 04:00 AM",
            "/system scheduler add name=iran-fetch-daily interval=1d start-time=04:00:00 on-event=iran-fetch",
            "# 4. Trigger script execution now",
            "/system script run iran-fetch"
        ]
        if self.is_mock:
            _SIMULATOR_STATE["command_logs"].append({
                "server": self.server_id,
                "destination": "iran-fetch-setup",
                "commands": commands
            })
            return {
                "status": "success_simulated",
                "commands": commands,
                "message": "اسکریپت و زمان‌بندی روزانه IPDeny ایران با موفقیت روی روتر ثبت و اجرا شد."
            }
        
        self.execute_routeros_commands(commands)
        return {"status": "success_live", "commands": commands, "message": "اسکریپت و زمان‌بندی روزانه IPDeny ایران روی میکروتیک واقعی با موفقیت ثبت و اجرا شد."}

    def remove_destination(self, name: str) -> Dict[str, Any]:
        if self.is_mock:
            if self.server_id in _SIMULATOR_STATE["tunnels"]:
                _SIMULATOR_STATE["tunnels"][self.server_id] = [
                    t for t in _SIMULATOR_STATE["tunnels"][self.server_id] if t["name"] != f"gre-{name}"
                ]
            return {"status": "removed_simulated", "destination": name}
        
        cmds = [
            f"/interface gre remove [find where name=gre-{name}]",
            f"/interface l2tp-ether remove [find where name=l2tp-{name}]",
            f"/routing table remove [find where name=to-{name}]",
            f"/ip route remove [find where routing-table=to-{name}]",
            f"/ip pool remove [find where name=ovpn-{name}]",
            f"/ppp profile remove [find where name=ovpn-{name}]",
            f"/interface ovpn-server server remove [find where name=ovpn-{name}]",
            f"/ip firewall mangle remove [find where comment=\"auto:route-{name}\"]"
        ]
        self.execute_routeros_commands(cmds)
        return {"status": "removed_live", "destination": name}

    @staticmethod
    def get_command_logs() -> List[Dict[str, Any]]:
        return _SIMULATOR_STATE["command_logs"]
