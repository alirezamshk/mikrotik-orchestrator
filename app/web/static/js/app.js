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
        name: document.getElementById('srv_name').value.trim(),
        host: document.getElementById('srv_host').value.trim(),
        api_port: parseInt(document.getElementById('srv_api_port').value),
        winbox_port: parseInt(document.getElementById('srv_winbox_port').value) || 2020,
        username: document.getElementById('srv_user').value.trim(),
        password: document.getElementById('srv_pass').value
    };
    try {
        const res = await fetch('/api/servers', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        if (res.ok) { window.location.reload(); }
        else { alert('خطا در ثبت روتر'); }
    } catch (err) { alert('خطا: ' + err.message); }
}

// Add country destination
async function submitDestination(e) {
    e.preventDefault();
    const targetServer = document.getElementById('dst_target_server').value;
    const data = {
        name: document.getElementById('dst_name').value.toLowerCase().trim(),
        country_label: document.getElementById('dst_label').value.trim(),
        tunnel_type: document.getElementById('dst_tunnel_type') ? document.getElementById('dst_tunnel_type').value : 'gre',
        remote_ip: document.getElementById('dst_remote_ip').value.trim(),
        tunnel_local_ip: document.getElementById('dst_local_ip').value.trim(),
        tunnel_remote_ip: document.getElementById('dst_remote_tun_ip').value.trim(),
        ovpn_port: parseInt(document.getElementById('dst_ovpn_port').value),
        ovpn_protocol: document.getElementById('dst_ovpn_protocol') ? document.getElementById('dst_ovpn_protocol').value : 'udp',
        client_pool_range: document.getElementById('dst_pool_range').value.trim(),
        client_gateway_ip: '10.20.1.1',
        client_subnet: '10.20.1.0/24',
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
            document.getElementById('resultTitle').innerText = '✅ کشور ' + data.country_label + ' به تمام روترها اضافه شد!';
        } else {
            allCmds = result.generated_commands || [];
            document.getElementById('resultTitle').innerText = '✅ کشور ' + data.country_label + ' به روتر انتخاب‌شده اضافه شد!';
        }
        
        document.getElementById('resultCode').innerText = allCmds.join('\n');
        openModal('resultModal');
    } catch (err) { alert('خطا در اعمال مقصد: ' + err.message); }
}

// Certificate Manager Modal & Tabs
function openCertModal(serverId, serverName) {
    currentServerIdForCert = serverId;
    document.getElementById('certServerTitle').innerText = '🔐 مدیریت سرتیفیکت: ' + serverName;
    switchCertTab('selfSigned');
    openModal('certModal');
}

function switchCertTab(tabName) {
    document.getElementById('tabSelfSigned').style.display = tabName === 'selfSigned' ? 'block' : 'none';
    document.getElementById('tabUpload').style.display = tabName === 'upload' ? 'block' : 'none';
    document.getElementById('btnTabSelfSigned').style.borderBottom = tabName === 'selfSigned' ? '2px solid var(--primary)' : 'none';
    document.getElementById('btnTabUpload').style.borderBottom = tabName === 'upload' ? '2px solid var(--primary)' : 'none';
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
    if (!confirm('آیا مایلید اسکریپت دریافت رنج‌های آی‌پی ایران از IPDeny روی روتر ' + serverName + ' اجرا شود؟')) return;
    try {
        const res = await fetch('/api/servers/' + serverId + '/sync-iran-ips', { method: 'POST' });
        const result = await res.json();
        alert('✅ اسکریپت IPDeny ایران با موفقیت روی روتر تنظیم و اجرا شد.');
    } catch (err) { alert('خطا: ' + err.message); }
}

// View tunnels
async function viewServerTunnels(id, name) {
    document.getElementById('tunServerTitle').innerText = '🌐 تونل‌های فعال روتر: ' + name;
    try {
        const res = await fetch('/api/servers/' + id + '/destinations');
        const tunnels = await res.json();
        let html = '<table style="width: 100%; border-collapse: collapse; text-align: right;">';
        html += '<tr style="border-bottom: 1px solid var(--border-subtle); color: var(--text-muted);"><th style="padding: 10px 0;">نام اینترفیس</th><th>IP سرور خارج</th><th>پورت و پروتکل</th><th>وضعیت</th></tr>';
        if (tunnels.length === 0) {
            html += '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">هیچ تونل فعالی یافت نشد. با کلیک روی «ستاپ و کانفیگ» می‌توانید تونل جدید اضافه کنید.</td></tr>';
        } else {
            tunnels.forEach(t => {
                html += '<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">';
                html += '<td style="padding: 12px 0;"><code style="color: var(--primary); font-weight: 600;">' + t.name + '</code></td>';
                html += '<td>' + (t.remote_address || '—') + '</td>';
                html += '<td><span class="tag-pill">UDP/TCP</span></td>';
                html += '<td><span class="status-badge badge-online">● فعال</span></td>';
                html += '</tr>';
            });
        }
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
            alert('هنوز دستوری ثبت نشده است.');
            return;
        }
        let all = logs.map(l => '# --- عملیات ' + l.destination + ' روی روتر ' + l.server + ' ---\n' + l.commands.join('\n')).join('\n\n');
        document.getElementById('resultTitle').innerText = '📜 لاگ تمام دستورات ارسال‌شده به روتر';
        document.getElementById('resultCode').innerText = all;
        openModal('resultModal');
    } catch (err) { alert('خطا: ' + err.message); }
}

// Delete server
async function deleteServer(id) {
    if (confirm('آیا از حذف این روتر اطمینان دارید؟')) {
        await fetch('/api/servers/' + id, { method: 'DELETE' });
        window.location.reload();
    }
}

// ========================================================
// SMART MULTI-SCENARIO INTERACTIVE WIZARD (CLEAN & GUIDED)
// ========================================================
let activeWizardScenario = 'full'; // 'full' | 'adopt' | 'services_only'
let wizCurrentStep = 1;
let wizServerId = null;
let wizServerName = 'CHR-Production-New';
let detectedTunnelsList = [];
let allExecutedWizardCommands = [];
let addedDestinationsList = [];
let cachedFleetServers = [];

// Beautiful Curated Country Cards with Smart Defaults
let customizableCountriesList = [
    { checked: false, code: 'de', flag: '🇩🇪', label: 'آلمان', port: 6066, proto: 'udp', type: 'gre', remote_ip: '', local_30: '40.10.1.2/30', gw_30: '40.10.1.1', pool: '10.18.1.2-10.18.1.200', subnet: '10.18.1.0/24' },
    { checked: false, code: 'usa', flag: '🇺🇸', label: 'آمریکا', port: 6065, proto: 'udp', type: 'gre', remote_ip: '', local_30: '40.11.1.2/30', gw_30: '40.11.1.1', pool: '10.17.1.2-10.17.1.200', subnet: '10.17.1.0/24' },
    { checked: false, code: 'eng', flag: '🇬🇧', label: 'انگلیس', port: 6060, proto: 'tcp', type: 'gre', remote_ip: '', local_30: '40.12.1.2/30', gw_30: '40.12.1.1', pool: '10.16.1.2-10.16.1.200', subnet: '10.16.1.0/24' },
    { checked: false, code: 'nl', flag: '🇳🇱', label: 'هلند', port: 6064, proto: 'udp', type: 'gre', remote_ip: '', local_30: '40.13.1.2/30', gw_30: '40.13.1.1', pool: '10.15.1.2-10.15.1.200', subnet: '10.15.1.0/24' },
    { checked: false, code: 'fin', flag: '🇫🇮', label: 'فنلاند', port: 6059, proto: 'udp', type: 'gre', remote_ip: '', local_30: '40.14.1.2/30', gw_30: '40.14.1.1', pool: '10.12.1.2-10.12.1.200', subnet: '10.12.1.0/24' },
    { checked: false, code: 'pol', flag: '🇵🇱', label: 'لهستان', port: 6063, proto: 'udp', type: 'gre', remote_ip: '', local_30: '40.15.1.2/30', gw_30: '40.15.1.1', pool: '10.13.1.2-10.13.1.200', subnet: '10.13.1.0/24' },
    { checked: false, code: 'ca', flag: '🇨🇦', label: 'کانادا', port: 6067, proto: 'udp', type: 'gre', remote_ip: '', local_30: '40.16.1.2/30', gw_30: '40.16.1.1', pool: '10.19.1.2-10.19.1.200', subnet: '10.19.1.0/24' },
    { checked: false, code: 'trk', flag: '🇹🇷', label: 'ترکیه', port: 6058, proto: 'udp', type: 'gre', remote_ip: '', local_30: '40.17.1.2/30', gw_30: '40.17.1.1', pool: '10.11.1.2-10.11.1.200', subnet: '10.11.1.0/24' }
];

// Open Wizard Modal
async function openWizardModal() {
    wizCurrentStep = 1;
    wizServerId = null;
    allExecutedWizardCommands = [];
    addedDestinationsList = [];
    
    // Clear console windows
    ['consoleStep1Window', 'consoleStep2Window', 'consoleStep3Window', 'consoleStep4Window'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    document.querySelectorAll('.wiz-console').forEach(c => c.innerText = '');
    document.querySelectorAll('.wiz-next-btn').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
    
    document.getElementById('wizardScenarioPicker').style.display = 'block';
    document.getElementById('wizardScenarioSteps').style.display = 'none';
    
    // Fetch registered servers for fleet dropdown
    try {
        const res = await fetch('/api/servers');
        cachedFleetServers = await res.json();
        const sel = document.getElementById('wiz_fleet_select');
        sel.innerHTML = '<option value="">+ افزودن روتر جدید به صورت دستی</option>';
        cachedFleetServers.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.innerText = `${s.name} (${s.host}:${s.api_port})`;
            sel.appendChild(opt);
        });
    } catch (e) {
        console.error('Failed to load fleet servers', e);
    }

    renderCustomizableCountryRows();
    openModal('wizardModal');
}

// 1-Click Launch from Server Card
async function launchWizardForServer(serverId, serverName, serverHost) {
    await openWizardModal();
    const sel = document.getElementById('wiz_fleet_select');
    sel.value = serverId;
    onFleetServerSelect();
    selectWizardScenario('full');
    executeStep1WithScan();
}

// Fleet server select onchange
function onFleetServerSelect() {
    const srvId = document.getElementById('wiz_fleet_select').value;
    if (!srvId) {
        document.getElementById('wiz_name').value = 'CHR-Production-New';
        document.getElementById('wiz_host').value = '95.216.100.50';
        document.getElementById('wiz_api_port').value = 8728;
        document.getElementById('wiz_winbox_port').value = 2020;
        document.getElementById('wiz_user').value = 'admin';
        document.getElementById('wiz_pass').value = 'strong_pass';
        return;
    }
    const found = cachedFleetServers.find(s => s.id === srvId);
    if (found) {
        document.getElementById('wiz_name').value = found.name;
        document.getElementById('wiz_host').value = found.host;
        document.getElementById('wiz_api_port').value = found.api_port;
        document.getElementById('wiz_winbox_port').value = found.winbox_port || 2020;
        document.getElementById('wiz_user').value = found.username || 'admin';
        document.getElementById('wiz_pass').value = found.password || '';
    }
}

// Select Scenario
function selectWizardScenario(scenario) {
    activeWizardScenario = scenario;
    document.getElementById('wizardScenarioPicker').style.display = 'none';
    document.getElementById('wizardScenarioSteps').style.display = 'block';
    
    const badge = document.getElementById('activeScenarioBadge');
    const stepInd2 = document.getElementById('stepInd2');
    const stepInd3 = document.getElementById('stepInd3');
    const stepInd4 = document.getElementById('stepInd4');
    const stepTitle4 = document.getElementById('stepTitle4');

    if (scenario === 'full') {
        badge.innerText = '🟢 سناریوی ۱: راه‌اندازی کامل روتر خام (Fresh Setup)';
        badge.style.color = 'var(--primary)';
        badge.style.borderColor = 'var(--primary)';
        stepInd2.style.display = 'flex';
        stepInd3.style.display = 'flex';
        stepInd4.style.display = 'flex';
        stepTitle4.innerText = 'کشورها و پورت‌ها';
    } else if (scenario === 'adopt') {
        badge.innerText = '🔵 سناریوی ۲: همگام‌سازی تونل‌های موجود (Adopt)';
        badge.style.color = 'var(--success)';
        badge.style.borderColor = 'var(--success)';
        stepInd2.style.display = 'none';
        stepInd3.style.display = 'none';
        stepInd4.style.display = 'flex';
        stepTitle4.innerText = 'همگام‌سازی تونل‌ها';
    } else if (scenario === 'services_only') {
        badge.innerText = '🟣 سناریوی ۳: فقط سرتیفیکت و فایروال (Services)';
        badge.style.color = 'var(--warning)';
        badge.style.borderColor = 'var(--warning)';
        stepInd2.style.display = 'flex';
        stepInd3.style.display = 'flex';
        stepInd4.style.display = 'none';
    }
    
    wizCurrentStep = 1;
    updateWizardStepperUI();
}

function resetWizardToScenarios() {
    document.getElementById('wizardScenarioPicker').style.display = 'block';
    document.getElementById('wizardScenarioSteps').style.display = 'none';
}

function updateWizardStepperUI() {
    const stepContentIds = ['wizardStep1', 'wizardStep2', 'wizardStep3', 'wizardStep4', 'wizardStepAdopt', 'wizardStep5'];
    stepContentIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });

    if (activeWizardScenario === 'adopt' && wizCurrentStep === 4) {
        document.getElementById('wizardStepAdopt').classList.add('active');
    } else {
        const activeContent = document.getElementById('wizardStep' + wizCurrentStep);
        if (activeContent) activeContent.classList.add('active');
    }

    // Indicators
    for (let i = 1; i <= 5; i++) {
        const ind = document.getElementById('stepInd' + i);
        if (ind) {
            ind.classList.toggle('active', i === wizCurrentStep);
            ind.classList.toggle('completed', i < wizCurrentStep);
        }
    }
}

function goToWizardStep(step) {
    wizCurrentStep = step;
    updateWizardStepperUI();
    if (step === 4 && activeWizardScenario === 'full') {
        renderCustomizableCountryRows();
    }
    if (step === 5) {
        renderFinalSummary();
    }
}

// Certificate UI toggle
function toggleCertModeFields() {
    const mode = document.querySelector('input[name="wiz_cert_mode"]:checked').value;
    document.getElementById('wiz_existing_cert_box').style.display = mode === 'existing' ? 'block' : 'none';
    document.getElementById('wiz_cert_name_box').style.display = mode === 'existing' ? 'none' : 'block';
    document.getElementById('wiz_upload_box').style.display = mode === 'upload' ? 'block' : 'none';
}

// ==============================================
// MODERN COUNTRY CARDS (CUSTOM PORTS & PROTOCOLS)
// ==============================================
function onCountryTunnelSelect(idx, tunnelName) {
    if (!tunnelName) {
        customizableCountriesList[idx].assigned_tunnel = null;
        renderCustomizableCountryRows();
        return;
    }
    const t = detectedTunnelsList.find(x => x.name === tunnelName);
    if (t) {
        customizableCountriesList[idx].assigned_tunnel = t.name;
        customizableCountriesList[idx].type = t.type;
        customizableCountriesList[idx].remote_ip = t.remote_ip || '';
        customizableCountriesList[idx].local_30 = t.local_ip_30 || `40.${idx+10}.1.2/30`;
        customizableCountriesList[idx].gw_30 = t.gw_ip || `40.${idx+10}.1.1`;
        customizableCountriesList[idx].checked = true;
        renderCustomizableCountryRows();
    }
}

function setCountryTunnelType(idx, tunType) {
    customizableCountriesList[idx].type = tunType;
    const btnGre = document.getElementById(`btn_tun_gre_${idx}`);
    const btnL2tp = document.getElementById(`btn_tun_l2tp_${idx}`);
    if (btnGre && btnL2tp) {
        btnGre.classList.toggle('active', tunType === 'gre');
        btnL2tp.classList.toggle('active', tunType === 'l2tp_ether');
    }
    const badge = document.getElementById(`c_badge_${idx}`);
    if (badge && !customizableCountriesList[idx].assigned_tunnel) {
        badge.innerText = `تونل جدید (${tunType === 'l2tp_ether' ? 'L2TP-ETHER' : 'GRE'})`;
    }
}

function setAllCountriesTunnelType(tunType) {
    customizableCountriesList.forEach((c, idx) => {
        c.type = tunType;
    });
    renderCustomizableCountryRows();
    const btnGre = document.getElementById('btn_global_tun_gre');
    const btnL2tp = document.getElementById('btn_global_tun_l2tp');
    if (btnGre && btnL2tp) {
        btnGre.classList.toggle('active', tunType === 'gre');
        btnL2tp.classList.toggle('active', tunType === 'l2tp_ether');
    }
}

function renderCustomizableCountryRows() {
    const container = document.getElementById('countryCustomList');
    if (!container) return;
    container.innerHTML = '';

    customizableCountriesList.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = `country-item-card ${item.checked ? 'selected' : ''}`;
        card.id = `c_card_${idx}`;

        // Options for tunnel selector dropdown
        let tunnelOptions = '<option value="">➕ ساخت تونل جدید (ورود دستی IP)</option>';
        if (detectedTunnelsList && detectedTunnelsList.length > 0) {
            detectedTunnelsList.forEach(t => {
                const isRun = t.running ? '🟢 فعال' : '🔴 قطع';
                const isSel = (item.assigned_tunnel === t.name) ? 'selected' : '';
                tunnelOptions += `<option value="${t.name}" ${isSel}>${t.name} (${t.type.toUpperCase()}) | ${isRun} | ریموت: ${t.remote_ip || '---'}</option>`;
            });
        }

        const assignedBadge = item.assigned_tunnel 
            ? `<span style="background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 2px 8px; border-radius: 6px; font-weight: 600; font-size: 0.72rem;">متصل به تونل: <code>${item.assigned_tunnel}</code></span>`
            : `<span class="tag-pill" id="c_badge_${idx}" style="font-size: 0.72rem;">تونل جدید (${item.type === 'l2tp_ether' ? 'L2TP-ETHER' : 'GRE'})</span>`;

        card.innerHTML = `
            <div class="country-card-header">
                <div class="country-flag-title">
                    <span class="country-flag-icon">${item.flag || '🌐'}</span>
                    <div>
                        <strong style="color: #fff; font-size: 0.95rem;">${item.label}</strong>
                        <span style="font-size: 0.75rem; color: var(--text-dim); display: block; font-family: var(--font-mono);">${item.code.toUpperCase()}</span>
                    </div>
                </div>
                <label class="switch">
                    <input type="checkbox" id="c_chk_${idx}" ${item.checked ? 'checked' : ''} onchange="toggleCountrySelection(${idx}, this.checked)">
                    <span class="slider"></span>
                </label>
            </div>

            <!-- Existing Tunnel Selector Dropdown -->
            <div style="margin-top: 6px;">
                <label style="font-size: 0.74rem; color: var(--accent-cyan, #38bdf8); display: block; margin-bottom: 2px; font-weight: 600;">🔗 انتخاب از لیست تونل‌های موجود روتر:</label>
                <select id="c_tun_select_${idx}" style="font-size: 0.8rem; width: 100%; padding: 5px 8px; font-family: var(--font-mono); border-radius: 6px; background: rgba(15, 23, 42, 0.8); color: #fff; border: 1px solid var(--border-color);" onchange="onCountryTunnelSelect(${idx}, this.value)">
                    ${tunnelOptions}
                </select>
            </div>

            <!-- Tunnel Model Selector (GRE vs L2TP-Ethernet) for New Tunnels -->
            <div style="margin-top: 6px;">
                <label style="font-size: 0.74rem; color: var(--text-muted); display: block; margin-bottom: 2px;">مدل ساخت تونل جدید:</label>
                <div class="segmented-control" style="width: 100%;">
                    <button type="button" class="segmented-btn ${item.type === 'gre' ? 'active' : ''}" id="btn_tun_gre_${idx}" onclick="setCountryTunnelType(${idx}, 'gre')">GRE Tunnel</button>
                    <button type="button" class="segmented-btn ${item.type === 'l2tp_ether' ? 'active' : ''}" id="btn_tun_l2tp_${idx}" onclick="setCountryTunnelType(${idx}, 'l2tp_ether')">L2TPv3 Ethernet</button>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px;">
                <div>
                    <label style="font-size: 0.74rem; color: var(--text-muted); display: block; margin-bottom: 2px;">پورت OpenVPN</label>
                    <input type="number" id="c_port_${idx}" value="${item.port}" style="font-family: var(--font-mono); font-weight: 600;" onchange="customizableCountriesList[${idx}].port = parseInt(this.value)">
                </div>
                <div>
                    <label style="font-size: 0.74rem; color: var(--text-muted); display: block; margin-bottom: 2px;">پروتکل</label>
                    <div class="segmented-control" style="width: 100%;">
                        <button type="button" class="segmented-btn ${item.proto === 'udp' ? 'active' : ''}" id="btn_proto_udp_${idx}" onclick="setCountryProto(${idx}, 'udp')">UDP</button>
                        <button type="button" class="segmented-btn ${item.proto === 'tcp' ? 'active' : ''}" id="btn_proto_tcp_${idx}" onclick="setCountryProto(${idx}, 'tcp')">TCP</button>
                    </div>
                </div>
            </div>

            <div style="margin-top: 6px;">
                <label style="font-size: 0.74rem; color: var(--text-muted); display: block; margin-bottom: 2px;">آی‌پی سرور خارج (مقصد تونل)</label>
                <input type="text" id="c_remote_${idx}" placeholder="آی‌پی سرور خارج شما (مثال: 185.x.x.x)" value="${item.remote_ip || ''}" style="font-family: var(--font-mono); font-size: 0.82rem; width: 100%; padding: 5px 8px;" onchange="customizableCountriesList[${idx}].remote_ip = this.value.trim()">
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
                ${assignedBadge}
                <span style="font-size: 0.72rem; color: var(--text-dim);">ساب‌نت: <code>10.${idx+20}.1.0/24</code></span>
            </div>
        `;
        container.appendChild(card);
    });
}

function toggleCountrySelection(idx, isChecked) {
    customizableCountriesList[idx].checked = isChecked;
    const card = document.getElementById(`c_card_${idx}`);
    if (card) {
        card.classList.toggle('selected', isChecked);
    }
}

function toggleAllCountries(select) {
    customizableCountriesList.forEach((c, idx) => {
        c.checked = select;
    });
    renderCustomizableCountryRows();
}

function setCountryProto(idx, proto) {
    customizableCountriesList[idx].proto = proto;
    const btnUdp = document.getElementById(`btn_proto_udp_${idx}`);
    const btnTcp = document.getElementById(`btn_proto_tcp_${idx}`);
    if (btnUdp && btnTcp) {
        btnUdp.classList.toggle('active', proto === 'udp');
        btnTcp.classList.toggle('active', proto === 'tcp');
    }
}

function addCustomCountryRow() {
    const countryName = prompt('نام کشور یا مقصد جدید را وارد کنید (مثال: فرانسه یا France):', 'فرانسه');
    if (!countryName) return;
    const code = prompt('کد کوتاه انگلیسی کشور (مثال: fr یا uae):', 'fr');
    if (!code) return;
    const port = prompt('شماره پورت اختصاصی OpenVPN:', '6070');
    if (!port) return;

    const nextIdx = customizableCountriesList.length + 1;
    const newCountry = {
        checked: true,
        code: code.toLowerCase().trim(),
        flag: '🌐',
        label: countryName.trim(),
        port: parseInt(port) || 6070,
        proto: 'udp',
        type: 'gre',
        remote_ip: '1.2.3.4',
        local_30: `10.${50 + nextIdx}.1.2/30`,
        gw_30: `10.${50 + nextIdx}.1.1`,
        pool: `10.${50 + nextIdx}.1.2-10.${50 + nextIdx}.1.200`,
        subnet: `10.${50 + nextIdx}.1.0/24`
    };
    customizableCountriesList.push(newCountry);
    renderCustomizableCountryRows();
}

// Execute Batch Custom Countries
async function executeBatchCustomCountries() {
    const btn = document.getElementById('btnExecBatchCountries');
    const consoleBox = document.getElementById('consoleStep4');
    const windowBox = document.getElementById('consoleStep4Window');
    const nextBtn = document.getElementById('btnNextStep4');
    const addedBox = document.getElementById('wiz_added_tunnels_box');

    const selectedDests = [];
    customizableCountriesList.forEach((item, idx) => {
        const chk = document.getElementById(`c_chk_${idx}`);
        const isChecked = chk ? chk.checked : item.checked;
        if (isChecked) {
            const portInput = document.getElementById(`c_port_${idx}`);
            const port = portInput ? (parseInt(portInput.value) || item.port) : item.port;
            const remoteInput = document.getElementById(`c_remote_${idx}`);
            const remoteIp = (remoteInput && remoteInput.value.trim()) ? remoteInput.value.trim() : item.remote_ip;
            if (!remoteIp) {
                alert(`لطفاً آی‌پی سرور خارج را برای کشور ${item.label} وارد نمایید.`);
                return;
            }

            selectedDests.push({
                name: item.code.toLowerCase(),
                country_label: item.label,
                tunnel_type: item.type,
                existing_tunnel_name: item.assigned_tunnel || null,
                remote_ip: remoteIp,
                local_ip: (document.getElementById('wiz_host') ? document.getElementById('wiz_host').value.trim() : ''),
                tunnel_local_ip: item.local_30 || `40.${idx+10}.1.2/30`,
                tunnel_remote_ip: item.gw_30 || `40.${idx+10}.1.1`,
                local_tunnel_id: 30 + idx,
                remote_tunnel_id: 20 + idx,
                local_session_id: 300 + idx,
                remote_session_id: 200 + idx,
                ovpn_port: port,
                ovpn_protocol: item.proto,
                ovpn_certificate: (document.getElementById('wiz_existing_cert_select') && document.getElementById('wiz_existing_cert_select').value) ? document.getElementById('wiz_existing_cert_select').value : 'ov',
                client_pool_range: item.pool || `10.${idx+20}.1.2-10.${idx+20}.1.200`,
                client_gateway_ip: item.gw_30 ? item.pool.split('-')[0].replace(/\.[0-9]+$/, '.1') : `10.${idx+20}.1.1`,
                client_subnet: item.subnet || `10.${idx+20}.1.0/24`,
                enable_killswitch: true,
                bypass_iran: true
            });
        }
    });

    if (selectedDests.length === 0) {
        alert('لطفاً حداقل یک کشور را جهت فعال‌سازی تیک بزنید.');
        return;
    }

    btn.disabled = true;
    btn.innerText = `⏳ در حال پیکربندی ${selectedDests.length} کشور با پورت و پروتکل سفارشی...`;
    windowBox.style.display = 'block';
    consoleBox.innerText = `# [گام ۴] در حال ساخت ${selectedDests.length} مسیر روتینگ، Killswitch و OpenVPN Server...\n\n`;

    try {
        const res = await fetch('/api/wizard/step4-batch-tunnels', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ server_id: wizServerId, destinations: selectedDests })
        });
        const data = await res.json();
        allExecutedWizardCommands.push(...data.commands);
        addedDestinationsList.push(...selectedDests);

        consoleBox.innerText += '✅ ' + data.message + '\n\n' + data.commands.join('\n');
        btn.innerText = `✅ تعداد ${selectedDests.length} کشور با موفقیت ساخته شد`;
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';

        addedBox.innerHTML = '';
        selectedDests.forEach(d => {
            const badge = document.createElement('span');
            badge.className = 'tag-pill';
            badge.style.margin = '4px';
            badge.style.color = 'var(--success)';
            badge.innerText = `✅ ${d.country_label} (${d.tunnel_type.toUpperCase()} | پورت ${d.ovpn_port} ${d.ovpn_protocol.toUpperCase()})`;
            addedBox.appendChild(badge);
        });

        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
    } catch (err) {
        consoleBox.innerText += '❌ خطا: ' + err.message;
        btn.disabled = false;
        btn.innerText = 'تلاش مجدد';
    }
}

// Step 1: Connect
async function executeStep1WithScan() {
    const btn = document.getElementById('btnExecStep1');
    const consoleBox = document.getElementById('consoleStep1');
    const windowBox = document.getElementById('consoleStep1Window');
    const nextBtn = document.getElementById('btnNextStep1');
    const alertBox = document.getElementById('wiz_detected_alert');

    btn.disabled = true;
    btn.innerText = '⏳ در حال تست اتصال به میکروتیک...';
    windowBox.style.display = 'block';
    consoleBox.innerText = '# [1/4] در حال برقراری ارتباط با پورت API روتر (8728)...\n';
    alertBox.style.display = 'none';

    const selectedFleetId = document.getElementById('wiz_fleet_select').value;
    const payload = {
        server_id: selectedFleetId || undefined,
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
        wizServerName = data.server_name;
        allExecutedWizardCommands.push(...data.commands);

        consoleBox.innerText += '✅ اتصال برقرار شد! اطلاعات روتر:\n' + data.commands.join('\n') + '\n\n';
        consoleBox.innerText += '# [2/4] در حال اسکن خودکار سرتیفیکت‌ها و اینترفیس‌های موجود در روتر...\n';

        // Auto Scan Certs
        try {
            const cRes = await fetch('/api/servers/' + wizServerId + '/certificates');
            const certs = await cRes.json();
            const select = document.getElementById('wiz_existing_cert_select');
            select.innerHTML = '';
            if (certs && certs.length > 0) {
                certs.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.name;
                    opt.innerText = `${c.name} (${c.common_name} | ${c.has_key ? 'دارای Private Key' : 'بدون کلید'})`;
                    select.appendChild(opt);
                });
                document.getElementById('wiz_found_cert_notice').style.display = 'block';
                document.getElementById('rad_cert_existing').checked = true;
                toggleCertModeFields();
                consoleBox.innerText += `✅ تعداد ${certs.length} سرتیفیکت روی روتر شناسایی شد: [${certs.map(c=>c.name).join(', ')}]\n`;
            } else {
                document.getElementById('wiz_found_cert_notice').style.display = 'none';
                document.getElementById('rad_cert_self_signed').checked = true;
                toggleCertModeFields();
                consoleBox.innerText += 'ℹ️ سرتیفیکت قبلی روی روتر یافت نشد؛ حالت ساخت خودکار انتخاب شد.\n';
            }
        } catch (e) {
            console.error('Cert scan err', e);
        }

        // Auto Scan Tunnels
        try {
            const tRes = await fetch('/api/servers/' + wizServerId + '/detected-tunnels');
            detectedTunnelsList = await tRes.json();
            if (detectedTunnelsList && detectedTunnelsList.length > 0) {
                consoleBox.innerText += `✅ تعداد ${detectedTunnelsList.length} تونل روی روتر کشف شد: [${detectedTunnelsList.map(t=>t.name).join(', ')}]\n`;
                alertBox.style.display = 'block';
                alertBox.style.background = 'rgba(16, 185, 129, 0.1)';
                alertBox.style.border = '1px solid rgba(16, 185, 129, 0.3)';
                alertBox.style.color = 'var(--success)';
                alertBox.innerHTML = `💡 <strong>کشف خودکار:</strong> تعداد ${detectedTunnelsList.length} تونل موجود روی روتر شناسایی شد (${detectedTunnelsList.map(t=>'<code>'+t.name+'</code>').join(', ')}).`;
            } else {
                consoleBox.innerText += 'ℹ️ هیچ اینترفیس تونل GRE یا L2TP از قبل روی روتر تعریف نشده است (روتر خام).\n';
            }
        } catch (e) {
            console.error('Tunnel scan err', e);
        }

        // Re-render country rows with detected tunnels populated in dropdowns
        renderCustomizableCountryRows();

        btn.innerText = '✅ اتصال و اسکن روتر تایید شد';
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';

    } catch (err) {
        consoleBox.innerText += '❌ خطا در اتصال به روتر: ' + err.message;
        btn.disabled = false;
        btn.innerText = 'تلاش مجدد';
    }
}

function proceedFromStep1() {
    if (activeWizardScenario === 'adopt') {
        goToWizardStep(4);
        renderAdoptTunnels();
    } else {
        goToWizardStep(2);
    }
}

// Step 2: Cert
async function executeStep2Cert() {
    const btn = document.getElementById('btnExecStep2');
    const consoleBox = document.getElementById('consoleStep2');
    const windowBox = document.getElementById('consoleStep2Window');
    const nextBtn = document.getElementById('btnNextStep2');

    btn.disabled = true;
    btn.innerText = '⏳ در حال اعمال تنظیمات سرتیفیکت...';
    windowBox.style.display = 'block';

    const certMode = document.querySelector('input[name="wiz_cert_mode"]:checked').value;
    let chosenCertName = document.getElementById('wiz_cert_name').value.trim();
    if (certMode === 'existing') {
        chosenCertName = document.getElementById('wiz_existing_cert_select').value;
    }

    const payload = {
        server_id: wizServerId,
        cert_mode: certMode,
        cert_name: chosenCertName,
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
        allExecutedWizardCommands.push(...data.commands);

        consoleBox.innerText = '✅ ' + data.message + '\n\n' + data.commands.join('\n');
        btn.innerText = '✅ گام ۲ انجام شد';
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
    } catch (err) {
        consoleBox.innerText = '❌ خطا: ' + err.message;
        btn.disabled = false;
        btn.innerText = 'تلاش مجدد';
    }
}

// Step 3: Services
async function executeStep3Services() {
    const btn = document.getElementById('btnExecStep3');
    const consoleBox = document.getElementById('consoleStep3');
    const windowBox = document.getElementById('consoleStep3Window');
    const nextBtn = document.getElementById('btnNextStep3');

    btn.disabled = true;
    btn.innerText = '⏳ در حال اعمال RADIUS، IKEv2 و اسکریپت ایران...';
    windowBox.style.display = 'block';

    const payload = {
        server_id: wizServerId,
        radius_ip: document.getElementById('wiz_radius_ip').value.trim(),
        radius_secret: document.getElementById('wiz_radius_secret').value.trim(),
        ikev2_pool: document.getElementById('wiz_ikev2_pool').value.trim(),
        cert_name: document.getElementById('wiz_cert_name').value.trim() || 'server-template',
        enable_iran_fetch: document.getElementById('wiz_iran_check').checked
    };

    try {
        const res = await fetch('/api/wizard/step3-services', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        allExecutedWizardCommands.push(...data.commands);

        consoleBox.innerText = '✅ ' + data.message + '\n\n' + data.commands.join('\n');
        btn.innerText = '✅ گام ۳ انجام شد';
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
    } catch (err) {
        consoleBox.innerText = '❌ خطا: ' + err.message;
        btn.disabled = false;
        btn.innerText = 'تلاش مجدد';
    }
}

function onFinishStep3() {
    if (activeWizardScenario === 'services_only') {
        goToWizardStep(5);
    } else {
        goToWizardStep(4);
    }
}

// Scenario 2: Adopt Tunnels
let adoptFilterActiveOnly = true;

function toggleAdoptFilter() {
    adoptFilterActiveOnly = !adoptFilterActiveOnly;
    renderAdoptTunnels();
}

function onAdoptPresetSelect(idx, code) {
    if (!code) return;
    const presets = {
        'de': { name: 'de', label: 'آلمان', port: 6066 },
        'nl': { name: 'nl', label: 'هلند', port: 6064 },
        'eng': { name: 'eng', label: 'انگلیس', port: 6060 },
        'fin': { name: 'fin', label: 'فنلاند', port: 6059 },
        'usa': { name: 'usa', label: 'آمریکا', port: 6065 },
        'trk': { name: 'trk', label: 'ترکیه', port: 6058 },
        'ca': { name: 'ca', label: 'کانادا', port: 6067 },
        'pol': { name: 'pol', label: 'لهستان', port: 6063 }
    };
    if (presets[code]) {
        document.getElementById(`ad_code_${idx}`).value = presets[code].name;
        document.getElementById(`ad_port_${idx}`).value = presets[code].port;
    }
}

function renderAdoptTunnels() {
    const container = document.getElementById('wizAdoptTunnelsContainer');
    container.innerHTML = '';
    
    if (!detectedTunnelsList || detectedTunnelsList.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); padding: 2rem; text-align: center; background: rgba(30, 41, 59, 0.4); border-radius: var(--radius-md);">هیچ اینترفیس تونل GRE یا L2TP روی روتر کشف نشد. پیشنهاد می‌شود سناریوی ۱ (راه‌اندازی کامل روتر خام) را انتخاب فرمایید.</div>';
        return;
    }

    const runningCount = detectedTunnelsList.filter(t => t.running).length;
    const downCount = detectedTunnelsList.length - runningCount;

    // Filter toolbar
    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.justifyContent = 'space-between';
    toolbar.style.alignItems = 'center';
    toolbar.style.marginBottom = '14px';
    toolbar.style.padding = '10px 16px';
    toolbar.style.background = 'rgba(15, 23, 42, 0.6)';
    toolbar.style.borderRadius = 'var(--radius-md)';
    toolbar.style.border = '1px solid var(--border-color)';
    toolbar.innerHTML = `
        <div style="font-size: 0.85rem; display: flex; gap: 12px; align-items: center;">
            <span>مجموع تونل‌های روتر: <strong>${detectedTunnelsList.length}</strong></span>
            <span style="color: #10b981;">🟢 فعال (Running): <strong>${runningCount}</strong></span>
            <span style="color: #ef4444;">🔴 غیرفعال/قطع (Down): <strong>${downCount}</strong></span>
        </div>
        <div>
            <label style="cursor: pointer; font-size: 0.85rem; color: #fff; display: inline-flex; align-items: center; gap: 6px;">
                <input type="checkbox" ${adoptFilterActiveOnly ? 'checked' : ''} onchange="toggleAdoptFilter()">
                فقط نمایش تونل‌های فعال و متصل (Running)
            </label>
        </div>
    `;
    container.appendChild(toolbar);

    const filteredList = adoptFilterActiveOnly ? detectedTunnelsList.filter(t => t.running) : detectedTunnelsList;

    if (filteredList.length === 0) {
        const emptyNotice = document.createElement('div');
        emptyNotice.style.padding = '1.5rem';
        emptyNotice.style.textAlign = 'center';
        emptyNotice.style.color = 'var(--text-muted)';
        emptyNotice.innerHTML = 'هیچ تونل فعالی (Running) یافت نشد. تیک گزینه بالا را بردارید تا تونل‌های قطع نیز نمایش داده شوند.';
        container.appendChild(emptyNotice);
        return;
    }

    filteredList.forEach((tun, idx) => {
        const card = document.createElement('div');
        card.className = 'country-item-card';
        card.style.marginBottom = '12px';
        if (!tun.running) {
            card.style.opacity = '0.65';
        }
        
        const cleanName = tun.name.replace(/^gre-/, '').replace(/^l2tp-/, '').replace(/^to-/, '');
        const defaultPort = 6050 + idx;
        const defaultPool = `10.${20 + idx}.1.2-10.${20 + idx}.1.200`;
        const defaultGw = tun.gw_ip || `10.${20 + idx}.1.2`;
        const defaultSubnet = `10.${20 + idx}.1.0/24`;

        const statusBadge = tun.running 
            ? '<span style="background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 2px 8px; border-radius: 6px; font-weight: 600; font-size: 0.75rem;">🟢 متصل و فعال (Running)</span>'
            : '<span style="background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 2px 8px; border-radius: 6px; font-weight: 600; font-size: 0.75rem;">🔴 قطع یا غیرفعال (Down)</span>';

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <strong style="font-size: 1.05rem; color: #fff;">اینترفیس: <code>${tun.name}</code></strong>
                    <span class="tag-pill" style="color: var(--primary);">${tun.type.toUpperCase()}</span>
                    ${statusBadge}
                    <span style="font-size: 0.8rem; color: var(--text-muted); margin-right: 8px;">IP ریموت: <strong>${tun.remote_ip || 'نامشخص'}</strong></span>
                    ${tun.local_ip_30 ? '<span style="font-size: 0.8rem; color: var(--text-dim);">لوکال: ' + tun.local_ip_30 + '</span>' : ''}
                </div>
                <button type="button" class="btn btn-primary" id="btnAdopt_${idx}" onclick="adoptSingleTunnel(${idx}, '${tun.name}', '${tun.type}', '${defaultGw}')">⚡ ساخت روتینگ و OpenVPN</button>
            </div>
            
            <div style="display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr 1fr 1fr; gap: 8px; font-size: 0.85rem; margin-top: 10px;">
                <div>
                    <label>تخصیص کشور:</label>
                    <select id="ad_preset_${idx}" onchange="onAdoptPresetSelect(${idx}, this.value)" style="font-size: 0.8rem; padding: 4px;">
                        <option value="">-- انتخاب کشور --</option>
                        <option value="de">🇩🇪 آلمان (۶۰۶۶)</option>
                        <option value="nl">🇳🇱 هلند (۶۰۶۴)</option>
                        <option value="eng">🇬🇧 انگلیس (۶۰۶۰)</option>
                        <option value="fin">🇫🇮 فنلاند (۶۰۵۹)</option>
                        <option value="usa">🇺🇸 آمریکا (۶۰۶۵)</option>
                        <option value="trk">🇹🇷 ترکیه (۶۰۵۸)</option>
                        <option value="ca">🇨🇦 کانادا (۶۰۶۷)</option>
                        <option value="pol">🇵🇱 لهستان (۶۰۶۳)</option>
                    </select>
                </div>
                <div><label>کد مقصد:</label><input type="text" id="ad_code_${idx}" value="${cleanName}"></div>
                <div><label>پورت OpenVPN:</label><input type="number" id="ad_port_${idx}" value="${defaultPort}"></div>
                <div>
                    <label>پروتکل:</label>
                    <select id="ad_proto_${idx}">
                        <option value="udp" selected>UDP</option>
                        <option value="tcp">TCP</option>
                    </select>
                </div>
                <div><label>استخر کلاینت:</label><input type="text" id="ad_pool_${idx}" value="${defaultPool}"></div>
                <div><label>ساب‌نت کلاینت:</label><input type="text" id="ad_sub_${idx}" value="${defaultSubnet}"></div>
            </div>
            <div class="wiz-console" id="ad_console_${idx}" style="display: none; margin-top: 8px;"></div>
        `;
        container.appendChild(card);
    });
}

async function adoptSingleTunnel(idx, tunName, tunType, defaultGw) {
    const btn = document.getElementById('btnAdopt_' + idx);
    const consoleBox = document.getElementById('ad_console_' + idx);
    btn.disabled = true;
    btn.innerText = '⏳ در حال ساخت...';
    
    const payload = {
        server_id: wizServerId,
        tunnel_name: tunName,
        tunnel_type: tunType,
        country_code: document.getElementById('ad_code_' + idx).value.trim(),
        country_label: document.getElementById('ad_code_' + idx).value.toUpperCase(),
        tunnel_remote_ip: defaultGw,
        client_pool_range: document.getElementById('ad_pool_' + idx).value.trim(),
        client_gateway_ip: document.getElementById('ad_pool_' + idx).value.split('-')[0].replace(/\.[0-9]+$/, '.1'),
        client_subnet: document.getElementById('ad_sub_' + idx).value.trim(),
        ovpn_port: parseInt(document.getElementById('ad_port_' + idx).value),
        ovpn_protocol: document.getElementById('ad_proto_' + idx).value,
        certificate: (document.getElementById('wiz_existing_cert_select') && document.getElementById('wiz_existing_cert_select').value) ? document.getElementById('wiz_existing_cert_select').value : 'ov'
    };

    try {
        const res = await fetch('/api/wizard/adopt-tunnel', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        allExecutedWizardCommands.push(...data.commands);

        consoleBox.style.display = 'block';
        consoleBox.innerText = '✅ ' + data.message + '\n\n' + data.commands.join('\n');
        btn.innerText = '✅ همگام شد';
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';
    } catch (err) {
        alert('خطا: ' + err.message);
        btn.disabled = false;
        btn.innerText = 'تلاش مجدد';
    }
}

async function adoptAllDetectedTunnels() {
    if (!detectedTunnelsList || detectedTunnelsList.length === 0) return;
    const btnAll = document.getElementById('btnAdoptAll');
    btnAll.disabled = true;
    btnAll.innerText = '⏳ در حال همگام‌سازی دسته جمعی...';

    const tunnelsPayload = [];
    detectedTunnelsList.forEach((tun, idx) => {
        const code = document.getElementById('ad_code_' + idx).value.trim();
        const port = parseInt(document.getElementById('ad_port_' + idx).value);
        const proto = document.getElementById('ad_proto_' + idx).value;
        const pool = document.getElementById('ad_pool_' + idx).value.trim();
        const sub = document.getElementById('ad_sub_' + idx).value.trim();
        const gw = tun.gw_ip || pool.split('-')[0].replace(/\.[0-9]+$/, '.1');

        tunnelsPayload.push({
            server_id: wizServerId,
            tunnel_name: tun.name,
            tunnel_type: tun.type,
            country_code: code,
            country_label: code.toUpperCase(),
            tunnel_remote_ip: gw,
            client_pool_range: pool,
            client_gateway_ip: pool.split('-')[0].replace(/\.[0-9]+$/, '.1'),
            client_subnet: sub,
            ovpn_port: port,
            ovpn_protocol: proto,
            certificate: (document.getElementById('wiz_existing_cert_select') && document.getElementById('wiz_existing_cert_select').value) ? document.getElementById('wiz_existing_cert_select').value : 'ov'
        });
    });

    try {
        const res = await fetch('/api/wizard/adopt-all-tunnels', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ server_id: wizServerId, tunnels: tunnelsPayload })
        });
        const data = await res.json();
        allExecutedWizardCommands.push(...data.commands);

        detectedTunnelsList.forEach((tun, idx) => {
            const b = document.getElementById('btnAdopt_' + idx);
            if (b) {
                b.innerText = '✅ همگام شد';
                b.style.background = 'var(--success)';
                b.style.color = '#000';
            }
        });

        btnAll.innerText = `✅ تمام ${tunnelsPayload.length} تونل همگام شدند`;
        alert(`🎉 تبریک! تعداد ${tunnelsPayload.length} تونل با پورت و پروتکل سفارشی، روتینگ، Killswitch و OpenVPN دریافت کردند.`);
    } catch (err) {
        alert('خطا: ' + err.message);
        btnAll.disabled = false;
        btnAll.innerText = 'تلاش مجدد';
    }
}

// Step 5: Summary
function renderFinalSummary() {
    const box = document.getElementById('wizardFinalSummaryBox');
    let html = '<ul style="padding-right: 20px;">';
    html += `<li><strong>نام روتر:</strong> ${wizServerName} (<code>${wizServerId}</code>)</li>`;
    html += `<li><strong>سناریوی اجراشده:</strong> ${activeWizardScenario.toUpperCase()}</li>`;
    html += `<li><strong>تعداد کل دستورات اجرا شده:</strong> ${allExecutedWizardCommands.length} خط CLI RouterOS</li>`;
    html += `<li><strong>امنیت Killswitch:</strong> فعال با رول Blackhole (Distance 10)</li>`;
    html += `<li><strong>بای‌پس ایران:</strong> رول Mangle پری‌روتینگ با <code>dst-address-list=!IRAN</code> فعال</li>`;
    html += '</ul>';
    box.innerHTML = html;
}

function copyAllWizardCommands() {
    if (allExecutedWizardCommands.length === 0) {
        alert('دستوری برای کپی وجود ندارد.');
        return;
    }
    navigator.clipboard.writeText(allExecutedWizardCommands.join('\n')).then(() => {
        alert('📋 تمام دستورات با موفقیت در کلیپ‌بورد کپی شد!');
    }).catch(() => {
        prompt('دستورات جهت کپی:', allExecutedWizardCommands.join('\n'));
    });
}

function finishWizardAndReload() {
    closeModal('wizardModal');
    window.location.reload();
}


// ==========================================
// System Mode Management (Live vs Simulator)
// ==========================================
let currentMockMode = false;

async function checkSystemMode() {
    try {
        const res = await fetch('/api/system/mode');
        const data = await res.json();
        currentMockMode = data.mock_mode;
        updateModeUI();
    } catch (e) {
        console.error('Error fetching system mode:', e);
    }
}

function updateModeUI() {
    const banner = document.getElementById('modeBanner');
    const dot = document.getElementById('modeDot');
    const text = document.getElementById('modeStatusText');
    const btn = document.getElementById('toggleModeBtn');
    if (!banner || !dot || !text || !btn) return;

    if (currentMockMode) {
        banner.style.background = 'rgba(245, 158, 11, 0.08)';
        banner.style.borderBottom = '1px solid rgba(245, 158, 11, 0.2)';
        dot.style.background = '#f59e0b';
        text.innerHTML = '<strong>حالت شبیه‌ساز (Simulator Mode) فعال است:</strong> تمام عملیات کانفیگ و روتینگ به صورت ایمن و آزمایشی تست می‌شوند.';
        btn.innerHTML = '🟢 سوئیچ به میکروتیک واقعی (Live)';
        btn.className = 'btn btn-primary';
    } else {
        banner.style.background = 'rgba(16, 185, 129, 0.08)';
        banner.style.borderBottom = '1px solid rgba(16, 185, 129, 0.2)';
        dot.style.background = '#10b981';
        text.innerHTML = '<strong>حالت تست زنده میکروتیک (Live RouterOS) فعال است:</strong> دستورات مستقیماً از طریق API پورت ۸۷۲۸ روی روتر فیزیکی/ابری اعمال می‌شوند.';
        btn.innerHTML = '🟠 سوئیچ به شبیه‌ساز (Simulator)';
        btn.className = 'btn btn-secondary';
    }
}

async function toggleSystemMode() {
    const nextMode = !currentMockMode;
    const msg = nextMode ? 'آیا می‌خواهید به حالت شبیه‌ساز (آزمایشی و بدون دستکاری روتر واقعی) سوئیچ کنید؟' : 'آیا می‌خواهید به حالت تست واقعی (اجرای مستقیم فرامین روی میکروتیک) سوئیچ کنید؟';
    if (!confirm(msg)) return;
    try {
        const res = await fetch('/api/system/mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mock_mode: nextMode })
        });
        const data = await res.json();
        currentMockMode = data.mock_mode;
        updateModeUI();
        alert(nextMode ? 'سیستم به حالت شبیه‌ساز امن تغییر یافت.' : 'سیستم به حالت تست زنده و مستقیم روی میکروتیک تغییر یافت.');
    } catch (e) {
        alert('خطا در تغییر حالت سیستم: ' + e);
    }
}

document.addEventListener('DOMContentLoaded', checkSystemMode);
