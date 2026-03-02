const API = "https://api.github.com";

async function build() {
    const token = document.getElementById('token').value;
    const name = document.getElementById('appName').value;
    const pkg = document.getElementById('pkgId').value;
    const logContainer = document.getElementById('log-container');
    const logText = document.getElementById('log-text');

    if(!token || !name) return alert('Data belum lengkap, Tuan!');

    logContainer.style.display = 'block';
    logText.innerHTML = "Otentikasi GitHub...";

    try {
        const userRes = await fetch(`${API}/user`, { headers: {'Authorization': `token ${token}`} });
        if(!userRes.ok) throw new Error("Token lu ampas/salah,");
        const userData = await userRes.json();
        const username = userData.login;
        const repo = `apk-pro-${Date.now()}`;

        logText.innerHTML = "Membangun APK...";
        await fetch(`${API}/user/repos`, {
            method: 'POST',
            headers: {'Authorization': `token ${token}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({ name: repo, auto_init: true })
        });

        const send = async (p, c, b64 = false) => {
            const content = b64 ? c.split(',')[1] : btoa(unescape(encodeURIComponent(c)));
            return fetch(`${API}/repos/${username}/${repo}/contents/${p}`, {
                method: 'PUT',
                headers: {'Authorization': `token ${token}`},
                body: JSON.stringify({ message: 'setup', content: content })
            });
        };

        const iconInput = document.getElementById('iconFile');
        let hasIcon = false;
        if(iconInput.files.length > 0) {
            const iconFile = iconInput.files[0];
            await send('www/icon.png', await toBase64(iconFile), true);
            hasIcon = true;
        }

        let start = "index.html";
        if(window.currentMode === 'url') {
            start = document.getElementById('webUrl').value;
        } else {
            const f = document.getElementById('sourceFile').files[0];
            if(f) await send('www/index.html', await toText(f));
        }

        await send('config.xml', getConfig(pkg, name, start, hasIcon));
        await send('.github/workflows/main.yml', getWorkflow(pkg, name));

        logText.innerHTML = "✅ Berhasil! Proses Build Apps...";
        pollStatus(username, repo, token);

    } catch (e) { logText.innerHTML = "❌ Error: " + e.message; }
}

const toBase64 = f => new Promise(r => { const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.readAsDataURL(f); });
const toText = f => new Promise(r => { const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.readAsText(f); });

function getConfig(p, n, s, hasIcon) {
    return `<?xml version='1.0' encoding='utf-8'?>
<widget id="${p}" version="1.0.0" xmlns="http://www.w3.org/ns/widgets" xmlns:android="http://schemas.android.com/apk/res/android">
    <name>${n}</name>
    <content src="${s}" />
    <access origin="*" />
    <allow-intent href="http://*/*" />
    <allow-intent href="https://*/*" />
    ${hasIcon ? '<icon src="www/icon.png" />' : ''}
    <preference name="Orientation" value="portrait" />
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
                    const artRes = await fetch(run.artifacts_url, { headers: {'Authorization': `token ${t}`} });
                    const artData = await artRes.json();
                    const artifact = artData.artifacts[0];

                    if(artifact) {
                        const dlUrl = `https://github.com/${u}/${r}/suites/${run.check_suite_id}/artifacts/${artifact.id}`;
                        dot.innerHTML = '<i class="fa-solid fa-circle-check fa-2x" style="color:#34c759"></i>';
                        logText.innerHTML = `<br><a href="${dlUrl}" target="_blank" style="background:#34c759; color:white; padding:15px 25px; border-radius:10px; display:inline-block; text-decoration:none; font-weight:bold; margin-top:10px; box-shadow: 0 4px 15px rgba(52,199,89,0.4)">📥 DOWNLOAD APK</a><br><small style="color:#888; display:block; margin-top:10px">Format .zip (Ekstrak untuk ambil APK)</small>`;
                    } else {
                        logText.innerHTML = "Build sukses, tapi file gagal diarsip!";
                    }
                } else {
                    dot.innerHTML = '<i class="fa-solid fa-circle-xmark fa-2x" style="color:#ff3b30"></i>';
                    logText.innerHTML = "Build Gagal! Cek Log di GitHub.";
                }
            } else if(run) {
                logText.innerHTML = `Status: <b style="color:#0a84ff">${run.status}...</b>`;
            }
        } catch (e) {}
    }, 15000);
}

function getWorkflow(pkg, name) {
    return `name: Build
on: [push]
permissions:
  contents: write
jobs:
  apk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
      - name: Setup Android SDK
        uses: android-actions/setup-android@v3
      - name: Create & Build Project
        run: |
          npm install -g cordova
          cordova create build_box ${pkg} "${name}"
          rm -rf build_box/www/*
          cp -r www/* build_box/www/ || true
          cp config.xml build_box/config.xml
          cd build_box
          cordova platform add android
          yes | sdkmanager --licenses || true
          cordova build android --debug
      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: application-debug
          path: build_box/platforms/android/app/build/outputs/apk/debug/app-debug.apk`;
                            }
