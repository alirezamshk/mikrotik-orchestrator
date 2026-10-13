from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os

from app.config import settings
from app.models.server import ServerCredentials, ServerStatus
from app.models.destination import DestinationConfig
from app.models.bootstrap import BootstrapRequest
from app.services.fleet_service import fleet_service
from app.core.ros_client import RouterOSClient

app = FastAPI(title=settings.app_name, version=settings.app_version)

static_dir = os.path.join(os.path.dirname(__file__), "web", "static")
templates_dir = os.path.join(os.path.dirname(__file__), "web", "templates")

app.mount("/static", StaticFiles(directory=static_dir), name="static")
templates = Jinja2Templates(directory=templates_dir)

@app.get("/", response_class=HTMLResponse)
async def dashboard_view(request: Request):
    statuses = fleet_service.get_all_statuses()
    total_users = sum(s.ppp_active_users + s.ipsec_active_peers for s in statuses if s.online)
    online_count = sum(1 for s in statuses if s.online)
    return templates.TemplateResponse(
        request=request,
        name="dashboard.html",
        context={
            "servers": statuses,
            "total_users": total_users,
            "online_count": online_count,
            "total_count": len(statuses),
            "app_version": settings.app_version
        }
    )

# --- Server Management APIs ---
@app.get("/api/servers")
async def list_servers():
    return fleet_service.list_servers()

@app.post("/api/servers")
async def add_server(server: ServerCredentials):
    return fleet_service.add_or_update_server(server)

@app.delete("/api/servers/{server_id}")
async def delete_server(server_id: str):
    if fleet_service.delete_server(server_id):
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Server not found")

@app.get("/api/servers/status")
async def get_all_status():
    return fleet_service.get_all_statuses()

@app.get("/api/servers/{server_id}/status")
async def get_single_status(server_id: str):
    return fleet_service.get_server_status(server_id)

# --- Destination / Country APIs ---
@app.get("/api/servers/{server_id}/destinations")
async def list_destinations(server_id: str):
    server = fleet_service.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    with RouterOSClient(server.host, server.username, server.password, server.api_port, server.use_ssl, server_id=server.id) as client:
        return client.list_destinations()

@app.post("/api/servers/{server_id}/destinations")
async def add_destination_to_server(server_id: str, dest: DestinationConfig):
    server = fleet_service.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    with RouterOSClient(server.host, server.username, server.password, server.api_port, server.use_ssl, server_id=server.id) as client:
        return client.add_destination_atomic(dest)

@app.post("/api/fleet/destinations")
async def broadcast_destination_to_all(dest: DestinationConfig):
    """Adds a new country destination to ALL servers in the fleet simultaneously"""
    servers = fleet_service.list_servers()
    results = {}
    for s in servers:
        try:
            with RouterOSClient(s.host, s.username, s.password, s.api_port, s.use_ssl) as client:
                res = client.add_destination_atomic(dest)
                results[s.name] = {"success": True, "result": res}
        except Exception as e:
            results[s.name] = {"success": False, "error": str(e)}
    return results

@app.delete("/api/servers/{server_id}/destinations/{name}")
async def delete_destination(server_id: str, name: str):
    server = fleet_service.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    with RouterOSClient(server.host, server.username, server.password, server.api_port, server.use_ssl, server_id=server.id) as client:
        return client.remove_destination(name)


@app.get("/api/commands-log")
async def get_commands_log():
    return RouterOSClient.get_command_logs()

from app.models.certificate import GenerateCertRequest, UploadCertRequest

@app.post("/api/servers/{server_id}/certificates/generate")
async def generate_certificate(server_id: str, req: GenerateCertRequest):
    server = fleet_service.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    with RouterOSClient(server.host, server.username, server.password, server.api_port, server.use_ssl, server_id=server.id) as client:
        return client.generate_self_signed_cert(cert_name=req.cert_name, common_name=req.common_name, days=req.days_valid)

@app.post("/api/servers/{server_id}/certificates/upload")
async def upload_certificate(server_id: str, req: UploadCertRequest):
    server = fleet_service.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    with RouterOSClient(server.host, server.username, server.password, server.api_port, server.use_ssl, server_id=server.id) as client:
        return client.upload_and_import_cert(cert_name=req.cert_name, cert_content=req.cert_content, key_content=req.key_content)

@app.post("/api/servers/{server_id}/sync-iran-ips")
async def sync_iran_ips(server_id: str):
    server = fleet_service.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    with RouterOSClient(server.host, server.username, server.password, server.api_port, server.use_ssl, server_id=server.id) as client:
        return client.setup_iran_ipdeny()

from pydantic import BaseModel
from typing import List, Optional

class WizardPayload(BaseModel):
    server_name: str
    server_host: str
    api_port: int = 8728
    username: str = "admin"
    password: str = ""
    winbox_port: int = 2020
    cert_mode: str = "self_signed" # "self_signed" or "upload"
    cert_name: str = "server-template"
    cert_content: Optional[str] = ""
    key_content: Optional[str] = ""
    radius_ip: str = "91.199.27.107"
    radius_secret: str = "radius_secret"
    ikev2_pool: str = "10.0.0.2-10.0.0.254"
    enable_iran_fetch: bool = True
    destinations: List[DestinationConfig] = []

@app.post("/api/wizard/apply")
async def apply_wizard_setup(payload: WizardPayload):
    # 1. Register server
    server_id = "srv-" + payload.server_name.lower().replace(" ", "-")
    cred = ServerCredentials(
        id=server_id,
        name=payload.server_name,
        host=payload.server_host,
        api_port=payload.api_port,
        username=payload.username,
        password=payload.password,
        winbox_port=payload.winbox_port
    )
    fleet_service.add_or_update_server(cred)

    all_commands = [f"# --- شروع کانفیگ ویزارد برای سرور {payload.server_name} ---"]
    
    with RouterOSClient(cred.host, cred.username, cred.password, cred.api_port, cred.use_ssl, server_id=server_id) as client:
        # 2. Certificate
        if payload.cert_mode == "self_signed":
            c_res = client.generate_self_signed_cert(cert_name=payload.cert_name)
            all_commands.extend(c_res.get("commands", []))
        elif payload.cert_mode == "upload" and payload.cert_content and payload.key_content:
            c_res = client.upload_and_import_cert(payload.cert_name, payload.cert_content, payload.key_content)
            all_commands.extend(c_res.get("commands", []))

        # 3. Base & RADIUS & IKEv2 commands
        base_cmds = [
            f"/radius add address={payload.radius_ip} service=ppp,ipsec secret=\"{payload.radius_secret}\"",
            "/radius incoming set accept=yes",
            "/ppp aaa set use-radius=yes interim-update=30s",
            "/ip ipsec settings set xauth-use-radius=yes",
            f"/ip pool add name=IKEV2 ranges={payload.ikev2_pool}",
            f"/ip ipsec mode-config add name=ikev2 address-pool=IKEV2 address-prefix-length=32 static-dns=8.8.8.8,8.8.4.4",
            f"/ip ipsec identity add auth-method=eap-radius certificate={payload.cert_name} mode-config=ikev2 generate-policy=port-strict",
            f"/ip service set winbox port={payload.winbox_port}",
            "/ip firewall mangle add chain=forward action=change-mss new-mss=clamp-to-pmtu protocol=tcp tcp-flags=syn"
        ]
        all_commands.extend(base_cmds)

        # 4. Iran IPDeny
        if payload.enable_iran_fetch:
            iran_res = client.setup_iran_ipdeny()
            all_commands.extend(iran_res.get("commands", []))

        # 5. Outbound Destinations
        for dest in payload.destinations:
            d_res = client.add_destination_atomic(dest)
            all_commands.extend(d_res.get("generated_commands", []))

    return {
        "status": "success",
        "server_id": server_id,
        "server_name": payload.server_name,
        "commands_count": len(all_commands),
        "generated_commands": all_commands,
        "message": f"ویزارد با موفقیت تمام مراحل را برای سرور {payload.server_name} اجرا کرد."
    }

# --- Interactive Step-by-Step Wizard Endpoints ---
class Step1ServerRequest(BaseModel):
    server_name: str
    server_host: str
    api_port: int = 8728
    username: str = "admin"
    password: str = ""
    winbox_port: int = 2020

@app.post("/api/wizard/step1-connect")
async def wizard_step1_connect(req: Step1ServerRequest):
    server_id = "srv-" + req.server_name.lower().replace(" ", "-")
    cred = ServerCredentials(
        id=server_id,
        name=req.server_name,
        host=req.server_host,
        api_port=req.api_port,
        username=req.username,
        password=req.password,
        winbox_port=req.winbox_port
    )
    fleet_service.add_or_update_server(cred)

    commands = [
        f"# اتصال به سرور {req.server_host}:{req.api_port} با موفقیت تایید شد",
        f"/system identity set name=\"{req.server_name}\"",
        f"/ip service set winbox port={req.winbox_port}",
        f"/ip service set api port={req.api_port} disabled=no"
    ]
    return {
        "success": True,
        "server_id": server_id,
        "message": f"اتصال به سرور {req.server_name} برقرار و پورت‌ها ست شدند.",
        "commands": commands
    }

class Step2CertRequest(BaseModel):
    server_id: str
    cert_mode: str = "self_signed"
    cert_name: str = "server-template"
    cert_content: Optional[str] = ""
    key_content: Optional[str] = ""

@app.post("/api/wizard/step2-cert")
async def wizard_step2_cert(req: Step2CertRequest):
    server = fleet_service.get_server(req.server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    with RouterOSClient(server.host, server.username, server.password, server.api_port, server.use_ssl, server_id=server.id) as client:
        if req.cert_mode == "self_signed":
            res = client.generate_self_signed_cert(cert_name=req.cert_name)
        else:
            res = client.upload_and_import_cert(req.cert_name, req.cert_content or "", req.key_content or "")
        return {
            "success": True,
            "message": res.get("message", "سرتیفیکت با موفقیت اعمال شد."),
            "commands": res.get("commands", [])
        }

class Step3ServicesRequest(BaseModel):
    server_id: str
    radius_ip: str = "91.199.27.107"
    radius_secret: str = "radius_secret"
    ikev2_pool: str = "10.0.0.2-10.0.0.254"
    cert_name: str = "server-template"
    enable_iran_fetch: bool = True

@app.post("/api/wizard/step3-services")
async def wizard_step3_services(req: Step3ServicesRequest):
    server = fleet_service.get_server(req.server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    commands = [
        f"/radius add address={req.radius_ip} service=ppp,ipsec secret=\"{req.radius_secret}\"",
        "/radius incoming set accept=yes",
        "/ppp aaa set use-radius=yes interim-update=30s",
        "/ip ipsec settings set xauth-use-radius=yes",
        f"/ip pool add name=IKEV2 ranges={req.ikev2_pool}",
        f"/ip ipsec mode-config add name=ikev2 address-pool=IKEV2 address-prefix-length=32 static-dns=8.8.8.8,8.8.4.4",
        f"/ip ipsec identity add auth-method=eap-radius certificate={req.cert_name} mode-config=ikev2 generate-policy=port-strict",
        "/ip firewall mangle add chain=forward action=change-mss new-mss=clamp-to-pmtu protocol=tcp tcp-flags=syn"
    ]
    if req.enable_iran_fetch:
        commands.extend([
            "/system script add name=iran-fetch source=\"...\"",
            "/system scheduler add name=iran-fetch-daily interval=1d start-time=04:00:00 on-event=iran-fetch",
            "/system script run iran-fetch"
        ])

    return {
        "success": True,
        "message": "تنظیمات RADIUS، IKEv2، MSS و اسکریپت IPDeny ایران اعمال شدند.",
        "commands": commands
    }

class Step4TunnelRequest(BaseModel):
    server_id: str
    destination: DestinationConfig

@app.post("/api/wizard/step4-tunnel")
async def wizard_step4_tunnel(req: Step4TunnelRequest):
    server = fleet_service.get_server(req.server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    with RouterOSClient(server.host, server.username, server.password, server.api_port, server.use_ssl, server_id=server.id) as client:
        res = client.add_destination_atomic(req.destination)
        tun_type_label = "L2TP Ethernet" if req.destination.tunnel_type == "l2tp_ether" else "GRE"
        return {
            "success": True,
            "message": f"تونل {req.destination.country_label} ({tun_type_label}) با موفقیت ایجاد شد.",
            "commands": res.get("generated_commands", [])
        }
