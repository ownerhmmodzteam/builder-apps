const API = "https://api.github.com";

async function build() {
    const token = document.getElementById('token').value;
    const name = document.getElementById('appName').value;
    const pkg = document.getElementById('pkgId').value;
    const logContainer = document.getElementById('log-container');
    const logText = document.getElementById('log-text');

    if(!token || !name || !pkg) return alert('Data belum lengkap, Tuan!');

    logContainer.style.display = 'block';
    logText.innerHTML = '<i class="fas fa-sync fa-spin"></i> Menghubungi Server GitHub...';

    try {
        const userRes = await fetch(`${API}/user`, { headers: {'Authorization': `token ${token}`} });
        if(!userRes.ok) throw new Error("Token salah atau expired!");
        const userData = await userRes.json();
        const username = userData.login;
        const repo = `apk-pro-${Date.now()}`;

        logText.innerHTML = `Membangun pabrik: ${repo}`;
        await fetch(`${API}/user/repos`, {
            method: 'POST',
            headers: {'Authorization': `token ${token}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({ name: repo, private: false, auto_init: true })
        });

        const send = async (p, c, b64 = false) => {
            const data = b64 ? c.split(',')[1] : btoa(c);
            return fetch(`${API}/repos/${username}/${repo}/contents/${p}`, {
                method: 'PUT',
                headers: {'Authorization': `token ${token}`},
                body: JSON.stringify({ message: 'setup app', content: data })
            });
        };

        const icon = document.getElementById('iconFile').files[0];
        if(icon) await send('www/icon.png', await toBase64(icon), true);

        let start = "index.html";
        if(window.currentMode === 'url') {
            start = document.getElementById('webUrl').value;
        } else {
            const f = document.getElementById('sourceFile').files[0];
            if(f) await send('www/index.html', await toText(f));
        }

        await send('config.xml', getConfig(pkg, name, start));
        await send('.github/workflows/main.yml', getWorkflow());

        logText.innerHTML = "✅ Pabrik Siap! Menunggu Server (3-5 menit)...";
        pollStatus(username, repo, token);

    } catch (e) { logText.innerHTML = "❌ Error: " + e.message; }
}

const toBase64 = f => new Promise(r => { const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.readAsDataURL(f); });
const toText = f => new Promise(r => { const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.readAsText(f); });

function getConfig(p, n, s) {
    return `<?xml version='1.0' encoding='utf-8'?>
<widget id="${p}" version="1.0.0" xmlns="http://www.w3.org/ns/widgets">
    <name>${n}</name>
    <content src="${s}" />
    <icon src="icon.png" />
    <preference name="Orientation" value="portrait" />
    <preference name="Fullscreen" value="true" />
</widget>`;
}

async function pollStatus(u, r, t) {
    const logText = document.getElementById('log-text');
    const dot = document.getElementById('status-icon');
    const check = setInterval(async () => {
        try {
            const res = await fetch(`${API}/repos/${u}/${r}/actions/runs`, { headers: {'Authorization': `token ${t}`} });
            const data = await res.json();
            const run = data.workflow_runs[0];
            if(run?.status === 'completed') {
                clearInterval(check);
                if(run.conclusion === 'success') {
                    dot.innerHTML = '<i class="fa-solid fa-circle-check fa-2x" style="color:#34c759"></i>';
                    logText.innerHTML = `<br><a href="https://github.com/${u}/${r}/actions" target="_blank" style="background:#0a84ff; color:white; padding:12px 20px; border-radius:10px; display:inline-block; text-decoration:none; font-weight:bold; margin-top:10px">DOWNLOAD APK</a>`;
                } else {
                    dot.innerHTML = '<i class="fa-solid fa-circle-xmark fa-2x" style="color:#ff3b30"></i>';
                    logText.innerHTML = "Build Gagal. Cek Log di GitHub.";
                }
            } else if(run) {
                logText.innerHTML = `Sedang Memasak: <b style="color:#0a84ff">${run.status}...</b>`;
            }
        } catch (e) { console.error(e); }
    }, 15000);
}

function getWorkflow() {
    return `name: Build
on: [push]
jobs:
  apk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-java@v3
        with:
          distribution: 'temurin'
          java-version: '11'
      - uses: android-actions/setup-android@v2
      - name: Install & Build
        run: |
          npm install -g cordova
          cordova platform add android
          yes | sdkmanager --licenses || true
          cordova build android --debug
      - name: Upload
        uses: actions/upload-artifact@v3
        with:
          name: application-debug
          path: platforms/android/app/build/outputs/apk/debug/app-debug.apk`;
}
