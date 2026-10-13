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

// --- WIZARD LOGIC ---
let currentWizardStep = 1;
const totalWizardSteps = 5;

function openWizardModal() {
    currentWizardStep = 1;
    updateWizardUI();
    openModal('wizardModal');
}

function updateWizardUI() {
    for (let i = 1; i <= totalWizardSteps; i++) {
        const content = document.getElementById('wizardStep' + i);
        const indicator = document.getElementById('stepInd' + i);
        if (content) {
            content.classList.toggle('active', i === currentWizardStep);
        }
        if (indicator) {
            indicator.classList.toggle('active', i === currentWizardStep);
            indicator.classList.toggle('completed', i < currentWizardStep);
        }
    }
    
    const prevBtn = document.getElementById('btnWizardPrev');
    const nextBtn = document.getElementById('btnWizardNext');
    const submitBtn = document.getElementById('btnWizardSubmit');
    
    if (prevBtn) prevBtn.style.display = currentWizardStep > 1 ? 'inline-flex' : 'none';
    if (nextBtn) nextBtn.style.display = currentWizardStep < totalWizardSteps ? 'inline-flex' : 'none';
    if (submitBtn) submitBtn.style.display = currentWizardStep === totalWizardSteps ? 'inline-flex' : 'none';
    
    if (currentWizardStep === 5) {
        updateWizardSummary();
    }
}

function wizardNext() {
    if (currentWizardStep === 1) {
        const name = document.getElementById('wiz_name').value.trim();
        const host = document.getElementById('wiz_host').value.trim();
        if (!name || !host) {
            alert('لطفاً نام و آدرس IP سرور را وارد کنید.');
            return;
        }
    }
    if (currentWizardStep < totalWizardSteps) {
        currentWizardStep++;
        updateWizardUI();
    }
}

function wizardPrev() {
    if (currentWizardStep > 1) {
        currentWizardStep--;
        updateWizardUI();
    }
}

function updateWizardSummary() {
    const name = document.getElementById('wiz_name').value;
    const host = document.getElementById('wiz_host').value;
    const certMode = document.querySelector('input[name="wiz_cert_mode"]:checked').value;
    const radiusIp = document.getElementById('wiz_radius_ip').value;
    
    const selectedTunnels = [];
    document.querySelectorAll('.wiz-tun-check:checked').forEach(c => {
        selectedTunnels.push(c.dataset.label);
    });
    
    let html = '<ul style="padding-right: 20px;">';
    html += '<li><strong>نام و IP سرور:</strong> ' + name + ' (' + host + ')</li>';
    html += '<li><strong>نحوه سرتیفیکت:</strong> ' + (certMode === 'self_signed' ? 'تولید و Sign خودکار روی میکروتیک (Self-Signed)' : 'آپلود فایل‌های CRT / Key') + '</li>';
    html += '<li><strong>احراز هویت RADIUS:</strong> ' + radiusIp + ' + EAP-RADIUS برای IKEv2</li>';
    html += '<li><strong>اسکریپت IPDeny ایران:</strong> دانلود خودکار و Scheduler روزانه فعال</li>';
    html += '<li><strong>کشورها و تونل‌های انتخابی (' + selectedTunnels.length + ' مورد):</strong> ' + (selectedTunnels.join(', ') || 'هیچکدام') + '</li>';
    html += '</ul>';
    
    document.getElementById('wizardSummaryBox').innerHTML = html;
}

const PRESET_DESTINATIONS = {
    'de': { name: 'de', country_label: 'Germany', tunnel_type: 'gre', remote_ip: '91.99.129.82', tunnel_local_ip: '40.40.40.2/30', tunnel_remote_ip: '40.40.40.1', ovpn_port: 6066, ovpn_protocol: 'udp', client_pool_range: '10.18.1.2-10.18.1.200', client_gateway_ip: '10.18.1.1', client_subnet: '10.18.1.0/24', enable_killswitch: true, bypass_iran: true },
    'usa': { name: 'usa', country_label: 'United States', tunnel_type: 'gre', remote_ip: '69.197.190.75', tunnel_local_ip: '10.10.11.2/30', tunnel_remote_ip: '10.10.11.1', ovpn_port: 6065, ovpn_protocol: 'udp', client_pool_range: '10.17.1.2-10.17.1.200', client_gateway_ip: '10.17.1.1', client_subnet: '10.17.1.0/24', enable_killswitch: true, bypass_iran: true },
    'eng': { name: 'eng', country_label: 'United Kingdom', tunnel_type: 'gre', remote_ip: '51.38.66.183', tunnel_local_ip: '10.10.3.2/30', tunnel_remote_ip: '10.10.3.1', ovpn_port: 6060, ovpn_protocol: 'udp', client_pool_range: '10.16.1.2-10.16.1.200', client_gateway_ip: '10.16.1.1', client_subnet: '10.16.1.0/24', enable_killswitch: true, bypass_iran: true },
    'nl': { name: 'nl', country_label: 'Netherlands', tunnel_type: 'gre', remote_ip: '94.102.57.228', tunnel_local_ip: '10.10.7.2/30', tunnel_remote_ip: '10.10.7.1', ovpn_port: 6064, ovpn_protocol: 'udp', client_pool_range: '10.15.1.2-10.15.1.200', client_gateway_ip: '10.15.1.1', client_subnet: '10.15.1.0/24', enable_killswitch: true, bypass_iran: true },
    'pol': { name: 'pol', country_label: 'Poland', tunnel_type: 'gre', remote_ip: '51.77.38.238', tunnel_local_ip: '10.10.4.2/30', tunnel_remote_ip: '10.10.4.1', ovpn_port: 6063, ovpn_protocol: 'udp', client_pool_range: '10.13.1.2-10.13.1.200', client_gateway_ip: '10.13.1.1', client_subnet: '10.13.1.0/24', enable_killswitch: true, bypass_iran: true },
    'fin': { name: 'fin', country_label: 'Finland', tunnel_type: 'gre', remote_ip: '65.108.18.128', tunnel_local_ip: '10.10.2.2/30', tunnel_remote_ip: '10.10.2.1', ovpn_port: 6059, ovpn_protocol: 'udp', client_pool_range: '10.12.1.2-10.12.1.200', client_gateway_ip: '10.12.1.1', client_subnet: '10.12.1.0/24', enable_killswitch: true, bypass_iran: true },
    'ca': { name: 'ca', country_label: 'Canada', tunnel_type: 'gre', remote_ip: '67.55.2.40', tunnel_local_ip: '20.20.3.2/30', tunnel_remote_ip: '20.20.3.1', ovpn_port: 6067, ovpn_protocol: 'udp', client_pool_range: '10.19.1.2-10.19.1.200', client_gateway_ip: '10.19.1.1', client_subnet: '10.19.1.0/24', enable_killswitch: true, bypass_iran: true },
    'trk': { name: 'trk', country_label: 'Turkey', tunnel_type: 'gre', remote_ip: '188.132.174.132', tunnel_local_ip: '10.10.12.2/30', tunnel_remote_ip: '10.10.12.1', ovpn_port: 6058, ovpn_protocol: 'udp', client_pool_range: '10.11.1.2-10.11.1.200', client_gateway_ip: '10.11.1.1', client_subnet: '10.11.1.0/24', enable_killswitch: true, bypass_iran: true }
};

async function submitWizard(e) {
    e.preventDefault();
    
    const selectedDests = [];
    document.querySelectorAll('.wiz-tun-check:checked').forEach(c => {
        const key = c.value;
        if (PRESET_DESTINATIONS[key]) {
            selectedDests.push(PRESET_DESTINATIONS[key]);
        }
    });
    
    const payload = {
        server_name: document.getElementById('wiz_name').value.trim(),
        server_host: document.getElementById('wiz_host').value.trim(),
        api_port: parseInt(document.getElementById('wiz_api_port').value),
        username: document.getElementById('wiz_user').value.trim(),
        password: document.getElementById('wiz_pass').value,
        winbox_port: parseInt(document.getElementById('wiz_winbox_port').value),
        cert_mode: document.querySelector('input[name="wiz_cert_mode"]:checked').value,
        cert_name: document.getElementById('wiz_cert_name').value.trim(),
        cert_content: document.getElementById('wiz_cert_content').value.trim(),
        key_content: document.getElementById('wiz_key_content').value.trim(),
        radius_ip: document.getElementById('wiz_radius_ip').value.trim(),
        radius_secret: document.getElementById('wiz_radius_secret').value,
        ikev2_pool: document.getElementById('wiz_ikev2_pool').value.trim(),
        enable_iran_fetch: document.getElementById('wiz_iran_check').checked,
        destinations: selectedDests
    };
    
    closeModal('wizardModal');
    
    try {
        const res = await fetch('/api/wizard/apply', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        
        document.getElementById('resultTitle').innerText = '🎉 ویزارد با موفقیت سرور ' + payload.server_name + ' را کانفیگ کرد!';
        document.getElementById('resultCode').innerText = result.generated_commands.join('\n');
        openModal('resultModal');
    } catch (err) {
        alert('خطا در اجرای ویزارد: ' + err.message);
    }
}

// --- INTERACTIVE STEP-BY-STEP WIZARD ---
let wizCurrentStep = 1;
let wizServerId = null;
let wizServerName = '';

function openWizardModal() {
    wizCurrentStep = 1;
    wizServerId = null;
    document.querySelectorAll('.wiz-console').forEach(c => { c.style.display = 'none'; c.innerText = ''; });
    document.querySelectorAll('.wiz-next-btn').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
    updateWizardStepperUI();
    openModal('wizardModal');
}

function updateWizardStepperUI() {
    for (let i = 1; i <= 5; i++) {
        const content = document.getElementById('wizardStep' + i);
        const indicator = document.getElementById('stepInd' + i);
        if (content) content.classList.toggle('active', i === wizCurrentStep);
        if (indicator) {
            indicator.classList.toggle('active', i === wizCurrentStep);
            indicator.classList.toggle('completed', i < wizCurrentStep);
        }
    }
}

function goToWizardStep(step) {
    wizCurrentStep = step;
    updateWizardStepperUI();
}

function toggleTunnelTypeFields() {
    const isL2tp = document.getElementById('wiz_tun_type').value === 'l2tp_ether';
    document.getElementById('wiz_l2tp_specific_fields').style.display = isL2tp ? 'grid' : 'none';
}

// STEP 1 EXECUTE
async function executeStep1() {
    const btn = document.getElementById('btnExecStep1');
    const consoleBox = document.getElementById('consoleStep1');
    const nextBtn = document.getElementById('btnNextStep1');
    
    btn.disabled = true;
    btn.innerText = '⏳ در حال تست اتصال و ست کردن پورت‌ها...';
    consoleBox.style.display = 'block';
    consoleBox.innerText = '# [1/4] در حال برقراری اتصال با پورت API میکروتیک...\n';

    const payload = {
        server_name: document.getElementById('wiz_name').value.trim(),
        server_host: document.getElementById('wiz_host').value.trim(),
        api_port: parseInt(document.getElementById('wiz_api_port').value),
        username: document.getElementById('wiz_user').value.trim(),
        password: document.getElementById('wiz_pass').value,
        winbox_port: parseInt(document.getElementById('wiz_winbox_port').value)
    };

    try {
        const res = await fetch('/api/wizard/step1-connect', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        wizServerId = data.server_id;
        wizServerName = payload.server_name;
        
        consoleBox.innerText += '✅ اتصال تایید شد! دستورات زیر روی روتر ست شدند:\n\n';
        consoleBox.innerText += data.commands.join('\n');
        
        btn.innerText = '✅ مرحله ۱ با موفقیت انجام شد';
        btn.style.background = 'var(--success)';
        
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
    } catch (err) {
        consoleBox.innerText += '❌ خطا در اتصال: ' + err.message;
        btn.disabled = false;
        btn.innerText = 'تلاش مجدد';
    }
}

// STEP 2 EXECUTE
async function executeStep2() {
    const btn = document.getElementById('btnExecStep2');
    const consoleBox = document.getElementById('consoleStep2');
    const nextBtn = document.getElementById('btnNextStep2');
    
    btn.disabled = true;
    btn.innerText = '⏳ در حال تولید و Sign کردن سرتیفیکت...';
    consoleBox.style.display = 'block';
    consoleBox.innerText = '# [2/4] در حال تولید کلید و امضای گواهی در میکروتیک...\n';

    const payload = {
        server_id: wizServerId,
        cert_mode: document.querySelector('input[name="wiz_cert_mode"]:checked').value,
        cert_name: document.getElementById('wiz_cert_name').value.trim(),
        cert_content: document.getElementById('wiz_cert_content').value.trim(),
        key_content: document.getElementById('wiz_key_content').value.trim()
    };

    try {
        const res = await fetch('/api/wizard/step2-cert', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        consoleBox.innerText += '✅ ' + data.message + '\n\n';
        consoleBox.innerText += data.commands.join('\n');
        
        btn.innerText = '✅ سرتیفیکت ساخته شد';
        btn.style.background = 'var(--success)';
        
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
    } catch (err) {
        consoleBox.innerText += '❌ خطا: ' + err.message;
        btn.disabled = false;
        btn.innerText = 'تلاش مجدد';
    }
}

// STEP 3 EXECUTE
async function executeStep3() {
    const btn = document.getElementById('btnExecStep3');
    const consoleBox = document.getElementById('consoleStep3');
    const nextBtn = document.getElementById('btnNextStep3');
    
    btn.disabled = true;
    btn.innerText = '⏳ در حال اعمال RADIUS، IKEv2 و IPDeny...';
    consoleBox.style.display = 'block';
    consoleBox.innerText = '# [3/4] در حال ثبت تنظیمات رادیوس و فایروال...\n';

    const payload = {
        server_id: wizServerId,
        radius_ip: document.getElementById('wiz_radius_ip').value.trim(),
        radius_secret: document.getElementById('wiz_radius_secret').value,
        ikev2_pool: document.getElementById('wiz_ikev2_pool').value.trim(),
        cert_name: document.getElementById('wiz_cert_name').value.trim(),
        enable_iran_fetch: document.getElementById('wiz_iran_check').checked
    };

    try {
        const res = await fetch('/api/wizard/step3-services', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        consoleBox.innerText += '✅ ' + data.message + '\n\n';
        consoleBox.innerText += data.commands.join('\n');
        
        btn.innerText = '✅ رادیوس و سرویس‌ها فعال شدند';
        btn.style.background = 'var(--success)';
        
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
    } catch (err) {
        consoleBox.innerText += '❌ خطا: ' + err.message;
        btn.disabled = false;
        btn.innerText = 'تلاش مجدد';
    }
}

// STEP 4 EXECUTE (Add Tunnel)
let createdTunnelsCount = 0;
async function executeStep4AddTunnel() {
    const btn = document.getElementById('btnExecStep4');
    const consoleBox = document.getElementById('consoleStep4');
    const nextBtn = document.getElementById('btnNextStep4');
    
    btn.disabled = true;
    btn.innerText = '⏳ در حال ساخت تونل و مسیر...';
    consoleBox.style.display = 'block';

    const tunType = document.getElementById('wiz_tun_type').value;
    const dest = {
        name: document.getElementById('wiz_dst_name').value.toLowerCase().trim(),
        country_label: document.getElementById('wiz_dst_label').value.trim(),
        tunnel_type: tunType,
        remote_ip: document.getElementById('wiz_dst_remote_ip').value.trim(),
        local_ip: document.getElementById('wiz_dst_local_ip').value.trim() || null,
        local_tunnel_id: parseInt(document.getElementById('wiz_dst_loc_tun_id').value) || 33,
        remote_tunnel_id: parseInt(document.getElementById('wiz_dst_rem_tun_id').value) || 22,
        local_session_id: parseInt(document.getElementById('wiz_dst_loc_sess_id').value) || 333,
        remote_session_id: parseInt(document.getElementById('wiz_dst_rem_sess_id').value) || 222,
        tunnel_local_ip: document.getElementById('wiz_dst_tun_loc_ip').value.trim(),
        tunnel_remote_ip: document.getElementById('wiz_dst_tun_rem_ip').value.trim(),
        ovpn_port: parseInt(document.getElementById('wiz_dst_ovpn_port').value),
        ovpn_protocol: 'udp',
        client_pool_range: document.getElementById('wiz_dst_pool_range').value.trim(),
        client_gateway_ip: document.getElementById('wiz_dst_gw').value.trim(),
        client_subnet: document.getElementById('wiz_dst_subnet').value.trim(),
        enable_killswitch: true,
        bypass_iran: true
    };

    try {
        const res = await fetch('/api/wizard/step4-tunnel', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ server_id: wizServerId, destination: dest })
        });
        const data = await res.json();
        
        consoleBox.innerText = '✅ ' + data.message + '\n\n';
        consoleBox.innerText += data.commands.join('\n');
        
        createdTunnelsCount++;
        btn.disabled = false;
        btn.innerText = '➕ افزودن یک تونل دیگر به این سرور';
        
        // Add badge
        const badge = document.createElement('span');
        badge.className = 'status-badge badge-online';
        badge.style.margin = '4px';
        badge.innerText = dest.country_label + ' (' + (tunType === 'l2tp_ether' ? 'L2TP' : 'GRE') + ' :' + dest.ovpn_port + ')';
        document.getElementById('wizCreatedTunnelsList').appendChild(badge);
        
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
    } catch (err) {
        consoleBox.innerText += '❌ خطا: ' + err.message;
        btn.disabled = false;
        btn.innerText = 'تلاش مجدد';
    }
}
