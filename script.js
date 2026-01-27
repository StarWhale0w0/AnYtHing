/* * Booktoki Downloader Script (Fixed SPAGE logic)
 * V10: spage 파라미터 강제 적용 및 리스트 선택자 정밀화
 */

(function () {
  // UI 중복 제거
  const existingUI = document.getElementById('my-downloader-ui');
  if (existingUI) existingUI.remove();

  // 설정: 잡다한 링크 제외하고 '진짜 목록'만 타겟팅
  const CONFIG = {
    contentSelector: '.view-content, #novel_content, .content, .viewer-text',
    // .serial-list나 .list-body 직계 자식만 찾아서 사이드바 광고/인기글 제외
    listLinkSelector:
      '.serial-list .list-item a, .list-body .list-item a, #novel_list .list-item a',
    titleSelector: '.view-tit, .tit_subject, h1',
  };

  let state = {
    isPaused: false,
    allLinks: [],
    downloadQueue: [],
    downloadedText: [],
    currentNovelId:
      window.location.pathname.match(/\/novel\/(\d+)/)?.[1] || null,
  };

  // UI 생성 (유니코드 적용)
  const ui = document.createElement('div');
  ui.id = 'my-downloader-ui';
  ui.style.cssText = `
        position: fixed; top: 20px; right: 20px; width: 340px;
        background: #121212; color: #e0e0e0; padding: 20px;
        z-index: 9999999; border-radius: 12px; font-family: sans-serif;
        box-shadow: 0 10px 30px rgba(0,0,0,0.8); border: 1px solid #333;
        font-size: 13px; line-height: 1.5;
    `;

  ui.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:10px;">
            <h3 style="margin:0; color:#00E676; font-size:16px;">📥 Booktoki Fixer</h3>
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
                <div style="font-size:11px; color:#888; margin-top:4px;">(\uc0ac\uc774\ub4dc\ubc14 \uad11\uace0 \uc81c\uac70\ub428)</div>
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
            \uc900\ube44 \uc644\ub8cc.
        </div>

        <button id="btn-save" style="width:100%; margin-top:10px; padding:12px; background:#FF9800; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold; display:none;">
            💾 \ud14d\uc2a4\ud2b8 \ud30c\uc77c \uc800\uc7a5
        </button>
    `;
  document.body.appendChild(ui);

  const log = (msg) => {
    const box = document.getElementById('status-box');
    if (box) {
      box.innerHTML += `<div>> ${msg}</div>`;
      box.scrollTop = box.scrollHeight;
    }
  };

  // [핵심 수정] spage 파라미터 강제 적용
  const getPageUrl = (pageNum) => {
    const url = new URL(window.location.href);
    url.searchParams.delete('page'); // 기존 page 삭제
    url.searchParams.set('spage', pageNum); // spage 강제 설정
    return url.toString();
  };

  const startScan = async () => {
    const btnScan = document.getElementById('btn-scan');
    btnScan.disabled = true;
    btnScan.style.background = '#555';
    btnScan.innerText = '\uc2a4\uce94 \uc911...';

    let page = 1;
    let collected = new Set();
    let firstPageHtml = null;

    log('🚀 \ubaa9\ucc28 \uc2a4\uce94 (\uac15\ub825 \ubaa8\ub4dc)...');

    while (true) {
      const url = getPageUrl(page);
      try {
        const res = await fetch(url);
        const text = await res.text();

        // 페이지 반복 감지
        const currentHtmlSignature = text.substring(500, 2000);
        if (page === 1) {
          firstPageHtml = currentHtmlSignature;
        } else if (currentHtmlSignature === firstPageHtml) {
          log(`✅ \ub05d! (\ud398\uc774\uc9c0 \ubc18\ubcf5)`);
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

          // 순수 회차 링크만 수집
          if (/\/novel\/\d+/.test(href)) {
            if (!collected.has(href)) {
              collected.add(href);
              validCountOnPage++;
            }
          }
        });

        if (validCountOnPage === 0 && page > 1) {
          log(
            `✅ \ub05d! (\ub354 \uc774\uc0c1 \uac80\uc0c9\ub418\ub294 \ud68c\ucc28 \uc5c6\uc74c)`,
          );
          break;
        }

        log(
          `📃 ${page}P: ${validCountOnPage}\uac1c \ucc3e\uc74c (\ub204\uc801 ${collected.size}\uac1c)`,
        );
        page++;
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        log(`❌ \uc624\ub958: ${e.message}`);
        break;
      }
    }

    state.allLinks = Array.from(collected);
    // 역순 정렬 (1화부터 받으려면) - 필요시 주석 해제
    // state.allLinks.reverse();

    document.getElementById('step-scan').style.display = 'none';
    document.getElementById('step-download').style.display = 'block';
    document.getElementById('count-total').innerText = state.allLinks.length;
    document.getElementById('range-end').value = state.allLinks.length;
    log(`✅ \ucd1d ${state.allLinks.length}\uac1c \uc900\ube44 \uc644\ub8cc.`);
  };

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

    log(`🚀 \ub2e4\uc6b4\ub85c\ub4dc \uc2dc\uc791!`);

    for (let i = 0; i < state.downloadQueue.length; i++) {
      while (state.isPaused) {
        log('⏸ \uc77c\uc2dc\uc815\uc9c0...');
        btnPause.style.display = 'none';
        btnResume.style.display = 'block';
        await new Promise((r) => setTimeout(r, 1000));
      }
      btnResume.style.display = 'none';
      btnPause.style.display = 'block';

      const url = state.downloadQueue[i];
      const displayNum = startIdx + i + 1;

      try {
        const res = await fetch(url);
        if (
          res.url.includes('captcha') ||
          res.status === 403 ||
          res.status === 429
        ) {
          throw new Error('\ucc28\ub2e8/\ucea1\ucc28');
        }

        const text = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');

        const title =
          doc.querySelector(CONFIG.titleSelector)?.textContent.trim() ||
          `${displayNum}\ud654`;
        const contentEl = doc.querySelector(CONFIG.contentSelector);

        if (!contentEl) {
          log(`⚠️ \ubcf8\ubb38 \uc5c6\uc74c: ${url}`);
          state.downloadedText.push(`\n\n=== ${title} (Skip) ===\n\n`);
        } else {
          let content = contentEl.innerHTML;
          content = content.replace(/<br\s*\/?>/gi, '\n');
          content = content.replace(/<\/p>/gi, '\n\n');
          const temp = document.createElement('div');
          temp.innerHTML = content;
          state.downloadedText.push(
            `\n\n=== ${title} ===\n\n${temp.textContent.trim()}`,
          );
          log(`⬇ [${displayNum}] ${title}`);
        }
        await new Promise((r) => setTimeout(r, speed));
      } catch (e) {
        log(`⛔ \uc624\ub958: ${e.message}`);
        state.isPaused = true;
        i--;
      }
    }
    log('🎉 \ubaa8\ub4e0 \uc791\uc5c5 \uc644\ub8cc!');
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
      return alert('\ub0b4\uc6a9 \uc5c6\uc74c');
    const blob = new Blob([state.downloadedText.join('\n')], {
      type: 'text/plain',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Novel_Full.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  log('Engine Loaded. (SPAGE Fixed)');
})();
