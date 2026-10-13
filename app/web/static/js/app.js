let currentServerIdForCert = null;

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

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
        if (res.ok) { window.location.reload(); }
        else { alert('خطا در ثبت سرور'); }
    } catch (err) { alert('خطا: ' + err.message); }
}

// Add country destination (to all or specific server)
async function submitDestination(e) {
    e.preventDefault();
    const targetServer = document.getElementById('dst_target_server').value;
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
        let endpoint = '/api/fleet/destinations';
        if (targetServer !== 'all') {
            endpoint = '/api/servers/' + targetServer + '/destinations';
        }

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        
        let allCmds = [];
        if (targetServer === 'all') {
            for (let srv in result) {
                if (result[srv].result && result[srv].result.generated_commands) {
                    allCmds = result[srv].result.generated_commands;
                    break;
                }
            }
            document.getElementById('resultTitle').innerText = '✅ کشور ' + data.country_label + ' به تمام سرورها اضافه شد!';
        } else {
            allCmds = result.generated_commands || [];
            document.getElementById('resultTitle').innerText = '✅ کشور ' + data.country_label + ' به سرور انتخاب‌شده اضافه شد!';
        }
        
        document.getElementById('resultCode').innerText = allCmds.join('\n');
        openModal('resultModal');
    } catch (err) { alert('خطا در اعمال مقصد: ' + err.message); }
}

// Certificate Manager Modal & Tabs
function openCertModal(serverId, serverName) {
    currentServerIdForCert = serverId;
    document.getElementById('certServerTitle').innerText = 'مدیریت سرتیفیکت: ' + serverName;
    switchCertTab('selfSigned');
    openModal('certModal');
}

function switchCertTab(tabName) {
    document.getElementById('tabSelfSigned').style.display = tabName === 'selfSigned' ? 'block' : 'none';
    document.getElementById('tabUpload').style.display = tabName === 'upload' ? 'block' : 'none';
    document.getElementById('btnTabSelfSigned').classList.toggle('active', tabName === 'selfSigned');
    document.getElementById('btnTabUpload').classList.toggle('active', tabName === 'upload');
}

// Generate Self-Signed on router
async function submitGenerateCert(e) {
    e.preventDefault();
    if (!currentServerIdForCert) return;
    const data = {
        cert_name: document.getElementById('gen_cert_name').value.trim(),
        common_name: document.getElementById('gen_common_name').value.trim(),
        days_valid: parseInt(document.getElementById('gen_days').value),
        key_size: 2048
    };
    closeModal('certModal');
    try {
        const res = await fetch('/api/servers/' + currentServerIdForCert + '/certificates/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        document.getElementById('resultTitle').innerText = '🔐 سرتیفیکت روی میکروتیک تولید شد!';
        document.getElementById('resultCode').innerText = result.commands ? result.commands.join('\n') : JSON.stringify(result);
        openModal('resultModal');
    } catch (err) { alert('خطا: ' + err.message); }
}

// Upload custom cert
async function submitUploadCert(e) {
    e.preventDefault();
    if (!currentServerIdForCert) return;
    const data = {
        cert_name: document.getElementById('up_cert_name').value.trim(),
        cert_content: document.getElementById('up_cert_content').value.trim(),
        key_content: document.getElementById('up_key_content').value.trim()
    };
    closeModal('certModal');
    try {
        const res = await fetch('/api/servers/' + currentServerIdForCert + '/certificates/upload', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        document.getElementById('resultTitle').innerText = '📁 سرتیفیکت اختصاصی ایمپورت شد!';
        document.getElementById('resultCode').innerText = result.commands ? result.commands.join('\n') : JSON.stringify(result);
        openModal('resultModal');
    } catch (err) { alert('خطا: ' + err.message); }
}

// Trigger Iran IPDeny Sync
async function syncIranList(serverId, serverName) {
    if (!confirm('آیا مایلید اسکریپت دریافت رنج‌های آی‌پی ایران از IPDeny روی سرور ' + serverName + ' اجرا شود؟')) return;
    try {
        const res = await fetch('/api/servers/' + serverId + '/sync-iran-ips', { method: 'POST' });
        const result = await res.json();
        alert('✅ اسکریپت IPDeny ایران با موفقیت روی روتر تنظیم و اجرا شد.');
    } catch (err) { alert('خطا: ' + err.message); }
}

// View tunnels
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
    } catch (err) { alert('خطا در دریافت لیست تونل‌ها: ' + err.message); }
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
        let all = logs.map(l => '# --- عملیات ' + l.destination + ' روی سرور ' + l.server + ' ---\n' + l.commands.join('\n')).join('\n\n');
        document.getElementById('resultTitle').innerText = '📜 لاگ تمام دستورات تولیدشده میکروتیک';
        document.getElementById('resultCode').innerText = all;
        openModal('resultModal');
    } catch (err) { alert('خطا در دریافت لاگ‌ها: ' + err.message); }
}

// Delete server
async function deleteServer(id) {
    if (confirm('آیا از حذف این سرور اطمینان دارید؟')) {
        await fetch('/api/servers/' + id, { method: 'DELETE' });
        window.location.reload();
    }
}
