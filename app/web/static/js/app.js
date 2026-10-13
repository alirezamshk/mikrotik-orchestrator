// Modal handlers
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

// Close modal when clicking outside modal-content
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};

// Add server
async function submitServer(e) {
    e.preventDefault();
    const data = {
        id: 'srv-' + Math.random().toString(36).substring(2, 7),
        name: document.getElementById('srv_name').value,
        host: document.getElementById('srv_host').value,
        api_port: parseInt(document.getElementById('srv_api_port').value),
        username: document.getElementById('srv_user').value,
        password: document.getElementById('srv_pass').value
    };
    try {
        const res = await fetch('/api/servers', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        if (res.ok) {
            window.location.reload();
        } else {
            alert('خطا در ثبت سرور');
        }
    } catch (err) {
        alert('خطای ارتباط با سرور: ' + err.message);
    }
}

// Add country destination to all servers
async function submitDestination(e) {
    e.preventDefault();
    const data = {
        name: document.getElementById('dst_name').value.toLowerCase().trim(),
        country_label: document.getElementById('dst_label').value.trim(),
        remote_ip: document.getElementById('dst_remote_ip').value.trim(),
        tunnel_local_ip: document.getElementById('dst_local_ip').value.trim(),
        tunnel_remote_ip: document.getElementById('dst_remote_tun_ip').value.trim(),
        ovpn_port: parseInt(document.getElementById('dst_ovpn_port').value),
        ovpn_protocol: 'udp',
        client_pool_range: document.getElementById('dst_pool_range').value.trim(),
        client_gateway_ip: document.getElementById('dst_gw').value.trim(),
        client_subnet: document.getElementById('dst_subnet').value.trim(),
        enable_killswitch: true,
        bypass_iran: true
    };
    
    closeModal('addDestModal');
    
    try {
        const res = await fetch('/api/fleet/destinations', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        
        let allCmds = [];
        for (let srv in result) {
            if (result[srv].result && result[srv].result.generated_commands) {
                allCmds = result[srv].result.generated_commands;
                break;
            }
        }
        
        document.getElementById('resultTitle').innerText = '✅ کشور ' + data.country_label + ' با موفقیت به تمام سرورها اضافه شد!';
        document.getElementById('resultCode').innerText = allCmds.join('\n');
        openModal('resultModal');
    } catch (err) {
        alert('خطا در اعمال مقصد: ' + err.message);
    }
}

// View tunnels of a server
async function viewServerTunnels(id, name) {
    document.getElementById('tunServerTitle').innerText = 'تونل‌های سرور ' + name;
    try {
        const res = await fetch('/api/servers/' + id + '/destinations');
        const tunnels = await res.json();
        let html = '<table style="width: 100%; border-collapse: collapse; text-align: right;">';
        html += '<tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);"><th style="padding: 8px 0;">نام تونل</th><th>IP ریموت</th><th>وضعیت</th></tr>';
        tunnels.forEach(t => {
            html += '<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">';
            html += '<td style="padding: 10px 0;"><code>' + t.name + '</code></td>';
            html += '<td>' + t.remote_address + '</td>';
            html += '<td><span class="status-badge badge-online">فعال</span></td>';
            html += '</tr>';
        });
        html += '</table>';
        document.getElementById('tunListContent').innerHTML = html;
        openModal('tunnelsModal');
    } catch (err) {
        alert('خطا در دریافت لیست تونل‌ها: ' + err.message);
    }
}

// Show command logs
async function showLogsModal() {
    try {
        const res = await fetch('/api/commands-log');
        const logs = await res.json();
        if (logs.length === 0) {
            alert('هنوز دستوری ثبت نشده است. ابتدا روی دکمه «تست افزودن کشور جدید» کلیک کنید!');
            return;
        }
        let all = logs.map(l => '# --- سرور ' + l.server + ' برای کشور ' + l.destination + ' ---\n' + l.commands.join('\n')).join('\n\n');
        document.getElementById('resultTitle').innerText = '📜 لاگ تمام دستورات تولیدشده میکروتیک';
        document.getElementById('resultCode').innerText = all;
        openModal('resultModal');
    } catch (err) {
        alert('خطا در دریافت لاگ‌ها: ' + err.message);
    }
}

// Delete server
async function deleteServer(id) {
    if (confirm('آیا از حذف این سرور اطمینان دارید؟')) {
        await fetch('/api/servers/' + id, { method: 'DELETE' });
        window.location.reload();
    }
}
