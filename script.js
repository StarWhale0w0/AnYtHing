/* * Booktoki Downloader Script (Unicode Version)
 * 한글 깨짐 방지용 유니코드 적용 완료
 */

(function () {
  // 1. 중복 실행 방지
  const existingUI = document.getElementById('my-downloader-ui');
  if (existingUI) existingUI.remove();

  // 설정
  const CONFIG = {
    contentSelector: '.view-content, #novel_content, .content, .viewer-text',
    listLinkSelector:
      '.list-body .list-item a, .list-row .list-subject a, .list-wrap a',
    titleSelector: '.view-tit, .tit_subject, h1',
  };

  // 상태 변수
  let state = {
    isPaused: false,
    allLinks: [],
    downloadQueue: [],
    downloadedText: [],
    currentNovelId:
      window.location.pathname.match(/\/novel\/(\d+)/)?.[1] || null,
  };

  // UI 생성 (한글을 유니코드로 변환)
  const ui = document.createElement('div');
  ui.id = 'my-downloader-ui';
  ui.style.cssText = `
        position: fixed; top: 20px; right: 20px; width: 340px;
        background: #121212; color: #e0e0e0; padding: 20px;
        z-index: 9999999; border-radius: 12px; font-family: sans-serif;
        box-shadow: 0 10px 30px rgba(0,0,0,0.8); border: 1px solid #333;
        font-size: 13px; line-height: 1.5;
    `;

  // "\u..." 는 한글입니다. 건드리지 마세요.
  ui.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:10px;">
            <h3 style="margin:0; color:#00E676; font-size:16px;">📥 Booktoki Downloader</h3>
            <button id="btn-close" style="background:none; border:none; color:#777; cursor:pointer; font-size:16px;">✕</button>
        </div>

        <div id="step-scan">
            <p style="color:#aaa; margin-bottom:10px;">\uc18c\uc124 ID: <b style="color:#fff">${state.currentNovelId || '\uac10\uc9c0 \ubd88\uac00'}</b></p>
            <button id="btn-scan" style="width:100%; padding:12px; background:#333; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold; transition:0.2s;">
                🔍 \uc804\uccb4 \ubaa9\ucc28 \uc2a4\uce94 \uc2dc\uc791
            </button>
        </div>

        <div id="step-download" style="display:none;">
            <div style="background:#1e1e1e; padding:10px; border-radius:6px; margin-bottom:10px;">
                <div style="color:#00E676; font-weight:bold; font-size:14px;">\ucd1d <span id="count-total">0</span>\ud654 \ubc1c\uacac</div>
                <div style="font-size:11px; color:#888; margin-top:4px;">\ub2e4\uc6b4\ub85c\ub4dc\ud560 \ubc94\uc704\ub97c \ud655\uc778\ud558\uc138\uc694.</div>
            </div>
            
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <input type="number" id="range-start" value="1" style="width:50px; background:#2c2c2c; border:none; color:#fff; text-align:center; padding:5px; border-radius:4px;">
                <span style="align-self:center;">~</span>
                <input type="number" id="range-end" value="0" style="width:50px; background:#2c2c2c; border:none; color:#fff; text-align:center; padding:5px; border-radius:4px;">
                <span style="align-self:center; font-size:11px; color:#aaa;">\ud654</span>
            </div>

            <div style="margin-bottom:15px;">
                <label style="color:#aaa; font-size:12px;">\uc18d\ub3c4(\ucd08): </label>
                <input type="number" id="speed" value="1.5" step="0.5" style="width:50px; background:#2c2c2c; border:none; color:#fff; text-align:center; padding:4px; border-radius:4px;">
            </div>

            <div style="display:flex; gap:8px;">
                <button id="btn-start" style="flex:2; padding:10px; background:#00E676; color:#000; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">\uc2dc\uc791</button>
                <button id="btn-pause" style="flex:1; padding:10px; background:#f44336; color:#fff; border:none; border-radius:6px; cursor:pointer; display:none;">\uc77c\uc2dc\uc815\uc9c0</button>
                <button id="btn-resume" style="flex:1; padding:10px; background:#2196F3; color:#fff; border:none; border-radius:6px; cursor:pointer; display:none;">\uc7ac\uac1c</button>
            </div>
        </div>

        <div id="status-box" style="margin-top:15px; background:#000; padding:10px; height:100px; overflow-y:auto; border-radius:6px; border:1px solid #333; font-family:monospace; color:#ccc;">
            \uc900\ube44 \uc644\ub8cc. [\uc2a4\uce94 \uc2dc\uc791]\uc744 \ub204\ub974\uc138\uc694.
        </div>

        <button id="btn-save" style="width:100%; margin-top:10px; padding:12px; background:#FF9800; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold; display:none;">
            💾 \ud14d\uc2a4\ud2b8 \ud30c\uc77c \uc800\uc7a5
        </button>
    `;
  document.body.appendChild(ui);

  // 로그 유틸리티
  const log = (msg) => {
    const box = document.getElementById('status-box');
    if (box) {
      box.innerHTML += `<div>> ${msg}</div>`;
      box.scrollTop = box.scrollHeight;
    }
  };

  // URL 생성기
  const getPageUrl = (pageNum) => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('page')) url.searchParams.set('page', pageNum);
    else if (url.searchParams.has('p')) url.searchParams.set('p', pageNum);
    else if (url.searchParams.has('spage'))
      url.searchParams.set('spage', pageNum);
    else url.searchParams.append('page', pageNum);
    return url.toString();
  };

  // 스캔 로직
  const startScan = async () => {
    const btnScan = document.getElementById('btn-scan');
    btnScan.disabled = true;
    btnScan.style.background = '#555';
    btnScan.innerText =
      '\uc2a4\uce94 \uc911... (\uba48\ucd9c \ub54c\uae4c\uc9c0 \ub300\uae30)'; // 스캔 중...

    let page = 1;
    let collected = new Set();
    let firstPageHtml = null;

    log('🚀 \ubaa9\ucc28 \uc2a4\uce94 \uc2dc\uc791...'); // 목차 스캔 시작

    while (true) {
      const url = getPageUrl(page);
      try {
        const res = await fetch(url);
        const text = await res.text();

        const currentHtmlSignature = text.substring(500, 2000);
        if (page === 1) {
          firstPageHtml = currentHtmlSignature;
        } else if (currentHtmlSignature === firstPageHtml) {
          log(
            `✅ \uc2a4\uce94 \uc885\ub8cc (1\ud398\uc774\uc9c0 \ubc18\ubcf5 \uac10\uc9c0)`,
          );
          break;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const links = doc.querySelectorAll(CONFIG.listLinkSelector);

        let validCountOnPage = 0;

        links.forEach((a) => {
          const href = a.getAttribute('href');
          if (!href) return;
          if (state.currentNovelId && href.includes(state.currentNovelId))
            return;

          if (/\/novel\/\d+/.test(href)) {
            if (!collected.has(href)) {
              collected.add(href);
              validCountOnPage++;
            }
          }
        });

        if (validCountOnPage === 0 && page > 1) {
          log(
            `✅ \uc2a4\uce94 \uc885\ub8cc (\ud398\uc774\uc9c0 ${page}\uc5d0\uc11c \ub9c1\ud06c \uc5c6\uc74c)`,
          );
          break;
        }

        log(
          `📃 ${page}\ud398\uc774\uc9c0: ${validCountOnPage}\uac1c \ucd94\uac00 (\ub204\uc801 ${collected.size}\uac1c)`,
        );
        page++;
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        log(`❌ \uc624\ub958 \ubc1c\uc0dd: ${e.message}`);
        break;
      }
    }

    state.allLinks = Array.from(collected);

    document.getElementById('step-scan').style.display = 'none';
    document.getElementById('step-download').style.display = 'block';
    document.getElementById('count-total').innerText = state.allLinks.length;
    document.getElementById('range-end').value = state.allLinks.length;
    log(
      `✅ \ucd1d ${state.allLinks.length}\uac1c \ud68c\ucc28 \uc900\ube44 \uc644\ub8cc.`,
    );
  };

  // 다운로드 로직
  const startDownload = async () => {
    const startIdx = parseInt(document.getElementById('range-start').value) - 1;
    const endIdx = parseInt(document.getElementById('range-end').value);
    const speed = parseFloat(document.getElementById('speed').value) * 1000;

    state.downloadQueue = state.allLinks.slice(startIdx, endIdx);
    state.downloadedText = [];

    const btnStart = document.getElementById('btn-start');
    const btnPause = document.getElementById('btn-pause');
    const btnResume = document.getElementById('btn-resume');
    const btnSave = document.getElementById('btn-save');

    btnStart.style.display = 'none';
    btnPause.style.display = 'block';

    log(
      `🚀 ${startIdx + 1}\ud654 ~ ${endIdx}\ud654 \ub2e4\uc6b4\ub85c\ub4dc \uc2dc\uc791!`,
    );

    for (let i = 0; i < state.downloadQueue.length; i++) {
      while (state.isPaused) {
        log(
          '⏸ \uc77c\uc2dc\uc815\uc9c0 \uc911... (\uc7ac\uac1c \ubc84\ud2bc \ub300\uae30)',
        );
        btnPause.style.display = 'none';
        btnResume.style.display = 'block';
        await new Promise((r) => setTimeout(r, 1000));
      }
      btnResume.style.display = 'none';
      btnPause.style.display = 'block';

      const url = state.downloadQueue[i];
      const displayNum = startIdx + i + 1;

      try {
        log(`⬇ [${displayNum}/${endIdx}] \ub2e4\uc6b4\ub85c\ub4dc \uc911...`);

        const res = await fetch(url);
        if (
          res.url.includes('captcha') ||
          res.status === 403 ||
          res.status === 429
        ) {
          throw new Error('\ucea1\ucc28/\ucc28\ub2e8 \uac10\uc9c0');
        }

        const text = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');

        const title =
          doc.querySelector(CONFIG.titleSelector)?.textContent.trim() ||
          `${displayNum}\ud654`;
        const contentEl = doc.querySelector(CONFIG.contentSelector);

        if (!contentEl) {
          log(
            `⚠️ \ubcf8\ubb38 \uc5c6\uc74c (\uad8c\ud55c \ubd80\uc871?): ${url}`,
          );
          state.downloadedText.push(
            `\n\n=== ${title} (\ubcf8\ubb38 \ub85c\ub4dc \uc2e4\ud328) ===\n\n`,
          );
        } else {
          let content = contentEl.innerHTML;
          content = content.replace(/<br\s*\/?>/gi, '\n');
          content = content.replace(/<\/p>/gi, '\n\n');
          const temp = document.createElement('div');
          temp.innerHTML = content;
          state.downloadedText.push(
            `\n\n=== ${title} ===\n\n${temp.textContent.trim()}`,
          );
        }

        await new Promise((r) => setTimeout(r, speed));
      } catch (e) {
        log(`⛔ \uc624\ub958 \ubc1c\uc0dd! ${e.message}`);
        log(
          `👉 \ucea1\ucc28\ub97c \ud574\uacb0\ud558\uace0 [\uc7ac\uac1c]\ub97c \ub204\ub974\uc138\uc694.`,
        );
        state.isPaused = true;
        i--;
      }
    }

    log('🎉 \ubaa8\ub4e0 \ub2e4\uc6b4\ub85c\ub4dc \uc644\ub8cc!');
    btnPause.style.display = 'none';
    btnSave.style.display = 'block';
  };

  document.getElementById('btn-close').onclick = () => ui.remove();
  document.getElementById('btn-scan').onclick = startScan;
  document.getElementById('btn-start').onclick = startDownload;
  document.getElementById('btn-pause').onclick = () => {
    state.isPaused = true;
  };
  document.getElementById('btn-resume').onclick = () => {
    state.isPaused = false;
  };

  document.getElementById('btn-save').onclick = () => {
    if (state.downloadedText.length === 0)
      return alert(
        '\uc800\uc7a5\ud560 \ub0b4\uc6a9\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.',
      );
    const blob = new Blob([state.downloadedText.join('\n')], {
      type: 'text/plain',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Novel_Download_${state.allLinks.length}chapters.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  log(
    '\uc5d4\uc9c4 \ub85c\ub4dc\ub428. ID \uac10\uc9c0: ' +
      (state.currentNovelId || '\uc2e4\ud328'),
  );
})();
