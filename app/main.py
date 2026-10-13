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
    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "servers": statuses,
        "total_users": total_users,
        "online_count": online_count,
        "total_count": len(statuses),
        "app_version": settings.app_version
    })

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
    with RouterOSClient(server.host, server.username, server.password, server.api_port, server.use_ssl) as client:
        return client.list_destinations()

@app.post("/api/servers/{server_id}/destinations")
async def add_destination_to_server(server_id: str, dest: DestinationConfig):
    server = fleet_service.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    with RouterOSClient(server.host, server.username, server.password, server.api_port, server.use_ssl) as client:
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
    with RouterOSClient(server.host, server.username, server.password, server.api_port, server.use_ssl) as client:
        return client.remove_destination(name)
