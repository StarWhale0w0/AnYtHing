/* * Booktoki Downloader (V20: Filename Debug)
 * 파일명 생성 로직 강화 및 로그 출력
 */

(function () {
  const existingUI = document.getElementById('my-downloader-ui');
  if (existingUI) existingUI.remove();

  // 1. 소설 제목 추출 (여러 방법 시도)
  const getNovelTitle = () => {
    try {
      // 방법 A: 메타 태그
      const meta = document.querySelector('meta[property="og:title"]');
      if (meta) return meta.content.replace(' | 북토키', '').trim();

      // 방법 B: 헤더 제목
      const header = document.querySelector(
        '.view-tit, .tit_subject, .board-title',
      );
      if (header) return header.innerText.trim();

      // 방법 C: Reference 코드 방식 (XPath 대응)
      const xpathEl = document.evaluate(
        '//*[@id="content_wrapper"]//span',
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      ).singleNodeValue;
      if (xpathEl && xpathEl.textContent.length > 2)
        return xpathEl.textContent.trim();
    } catch (e) {}
    return 'Booktoki_Novel'; // 실패 시 기본값
  };

  const unescapeHTML = (text) => {
    const entities = {
      '&lt;': '<',
      '&gt;': '>',
      '&amp;': '&',
      '&quot;': '"',
      '&apos;': "'",
      '&#039;': "'",
      '&nbsp;': ' ',
      '&ndash;': '–',
      '&mdash;': '—',
      '&lsquo;': '‘',
      '&rsquo;': '’',
      '&ldquo;': '“',
      '&rdquo;': '”',
    };
    return text.replace(
      /&[a-z0-9#]+;/g,
      (entity) => entities[entity] || entity,
    );
  };

  const cleanText = (text) => {
    text = text.replace(/<div>/g, '\n');
    text = text.replace(/<\/div>/g, '\n');
    text = text.replace(/<p>/g, '\n');
    text = text.replace(/<\/p>/g, '\n');
    text = text.replace(/<br\s*[/]?>/g, '\n');
    text = text.replace(/<[^>]*>/g, '');
    text = text.replace(/ {2,}/g, ' ');
    text = unescapeHTML(text);
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n\n');
  };

  let state = {
    isPaused: false,
    allLinks: [],
    downloadedText: [],
    novelTitle: getNovelTitle(),
  };

  const ui = document.createElement('div');
  ui.id = 'my-downloader-ui';

  ui.style.cssText = `
        position: fixed; top: 20px; right: 20px; width: 360px;
        background: #111; color: #fff; padding: 20px;
        z-index: 2147483647; border-radius: 10px; font-family: sans-serif;
        box-shadow: 0 0 20px rgba(0,0,0,1); border: 2px solid #555;
        font-size: 14px; line-height: 1.5; text-align: left;
        box-sizing: border-box !important;
    `;

  ui.innerHTML = `
        <style>
            #my-downloader-ui * { box-sizing: border-box !important; }
            #my-downloader-ui input[type="number"] {
                width: 80px !important; min-width: 80px !important; max-width: 80px !important;
                height: 35px !important;
                background-color: #ffffff !important; color: #000000 !important;
                border: 2px solid #999 !important; border-radius: 4px !important;
                padding: 5px !important; font-weight: bold !important;
                text-align: center !important; font-size: 16px !important;
                margin: 0 !important; display: inline-block !important;
                -webkit-text-fill-color: #000000 !important; opacity: 1 !important;
            }
            #my-downloader-ui #total-pages { width: 100% !important; max-width: 100% !important; }
            #my-downloader-ui label, #my-downloader-ui span { color: #ffffff !important; font-weight: normal; display: inline-block; }
            #my-downloader-ui button { cursor: pointer; }
        </style>

        <div style="border-bottom:1px solid #444; padding-bottom:10px; margin-bottom:15px; display:flex; justify-content:space-between;">
            <div style="width: 85%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">
                <h3 style="margin:0; color:#00E676; font-size:14px;">📘 ${state.novelTitle}</h3>
            </div>
            <button id="btn-close" style="background:none; border:none; color:#fff; cursor:pointer; font-size:16px;">✕</button>
        </div>

        <div id="step-setup">
            <div style="margin-bottom:15px;">
                <label style="display:block; margin-bottom:5px;">총 페이지 수 (맨 아래 숫자):</label>
                <input type="number" id="total-pages" value="1">
            </div>
            <button id="btn-scan" style="width:100%; padding:12px; background:#00E676; color:#000; border:none; border-radius:4px; font-weight:bold; font-size:15px;">목차 가져오기</button>
        </div>

        <div id="step-download" style="display:none;">
            <div style="background:#222; padding:10px; margin-bottom:15px; border:1px solid #444;">
                발견: <span id="found-count" style="color:#00E676; font-weight:bold;">0</span> 화
            </div>
            <div style="margin-bottom:15px;">
                <label style="display:block; margin-bottom:5px;">다운로드 구간 (시작 ~ 끝):</label>
                <div style="display:flex !important; flex-direction: row !important; align-items:center !important; gap:10px !important;">
                    <input type="number" id="range-start" value="1">
                    <span>~</span>
                    <input type="number" id="range-end" value="1">
                </div>
            </div>
             <div style="margin-bottom:20px;">
                <label style="display:block; margin-bottom:5px;">속도 (초):</label>
                <input type="number" id="dl-speed" value="1.0" step="0.5">
            </div>
            <div style="display:flex; gap:5px;">
                <button id="btn-start" style="flex:1; padding:12px; background:#00E676; border:none; border-radius:4px; font-weight:bold; font-size:15px;">시작</button>
                <button id="btn-pause" style="flex:1; padding:12px; background:#f44336; border:none; border-radius:4px; display:none; color:white;">일시정지</button>
                <button id="btn-resume" style="flex:1; padding:12px; background:#2196F3; border:none; border-radius:4px; display:none; color:white;">재개</button>
            </div>
        </div>

        <div id="log-box" style="margin-top:15px; background:#000; height:100px; overflow-y:auto; padding:10px; font-family:monospace; color:#ccc; border:1px solid #555; font-size:12px;">
            제목: ${state.novelTitle}<br>페이지 수를 입력하세요.
        </div>

        <button id="btn-save" style="width:100%; margin-top:10px; padding:12px; background:#FF9800; color:white; border:none; border-radius:4px; font-weight:bold; display:none; font-size:15px;">
            💾 파일 저장
        </button>
    `;
  document.body.appendChild(ui);

  const log = (msg) => {
    const box = document.getElementById('log-box');
    box.innerHTML += `<div>> ${msg}</div>`;
    box.scrollTop = box.scrollHeight;
  };

  const scanEpisodes = async () => {
    const totalPages = parseInt(document.getElementById('total-pages').value);
    if (!totalPages || totalPages < 1) return alert('페이지 수를 입력하세요.');

    document.getElementById('btn-scan').disabled = true;
    const currentBaseUrl = window.location.href.split('?')[0];
    let collected = [];

    log(`🚀 ${totalPages} 페이지 스캔 시작...`);

    for (let page = totalPages; page >= 1; page--) {
      const url = `${currentBaseUrl}?spage=${page}`;
      log(`... ${page} 페이지 읽는 중`);
      try {
        const res = await fetch(url);
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const links = Array.from(doc.querySelectorAll('.item-subject')).map(
          (el) => ({
            text: el.innerText.trim(),
            href: el.getAttribute('href'),
          }),
        );
        links.reverse();
        collected.push(...links);
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        log(`❌ 오류 (Page ${page}): ${e.message}`);
      }
    }

    state.allLinks = collected;
    document.getElementById('step-setup').style.display = 'none';
    document.getElementById('step-download').style.display = 'block';
    document.getElementById('found-count').innerText = state.allLinks.length;
    document.getElementById('range-end').value = state.allLinks.length;
    log(`✅ 완료! 총 ${state.allLinks.length}화.`);
  };

  const downloadEpisodes = async () => {
    const startIdx = parseInt(document.getElementById('range-start').value) - 1;
    const endIdx = parseInt(document.getElementById('range-end').value);
    const speed = parseFloat(document.getElementById('dl-speed').value) * 1000;
    const targets = state.allLinks.slice(startIdx, endIdx);
    state.downloadedText = [];

    const btnStart = document.getElementById('btn-start');
    const btnPause = document.getElementById('btn-pause');
    const btnResume = document.getElementById('btn-resume');

    btnStart.style.display = 'none';
    btnPause.style.display = 'block';

    for (let i = 0; i < targets.length; i++) {
      while (state.isPaused) {
        log('⏸ 일시정지');
        btnPause.style.display = 'none';
        btnResume.style.display = 'block';
        await new Promise((r) => setTimeout(r, 1000));
      }
      btnResume.style.display = 'none';
      btnPause.style.display = 'block';

      const ep = targets[i];
      const displayNum = startIdx + i + 1;
      log(`⬇ [${displayNum}/${endIdx}] 받는 중...`);

      try {
        const res = await fetch(ep.href);
        if (!res.ok || res.url.includes('captcha'))
          throw new Error('캡차/차단');
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const contentEl = doc.querySelector('#novel_content');
        if (contentEl) {
          const cleanBody = cleanText(contentEl.innerHTML);
          state.downloadedText.push(`\n\n=== ${ep.text} ===\n\n${cleanBody}`);
        } else {
          log(`⚠️ 본문 없음: ${ep.text}`);
        }
        await new Promise((r) => setTimeout(r, speed));
      } catch (e) {
        log(`⛔ 오류: ${e.message}`);
        state.isPaused = true;
        i--;
      }
    }
    log('🎉 완료! 저장 버튼을 누르세요.');
    btnPause.style.display = 'none';
    document.getElementById('btn-save').style.display = 'block';

    // [V20 추가] 파일명 미리보기 로그 출력
    const safeTitle = state.novelTitle.replace(/[\\/:*?"<>|]/g, '_');
    const filename = `${safeTitle} ${startIdx + 1}-${endIdx}.txt`;
    log(`📝 생성된 파일명: ${filename}`);
  };

  document.getElementById('btn-close').onclick = () => ui.remove();
  document.getElementById('btn-scan').onclick = scanEpisodes;
  document.getElementById('btn-start').onclick = downloadEpisodes;
  document.getElementById('btn-pause').onclick = () => (state.isPaused = true);
  document.getElementById('btn-resume').onclick = () =>
    (state.isPaused = false);

  document.getElementById('btn-save').onclick = () => {
    if (state.downloadedText.length === 0) return alert('내용 없음');

    const start = document.getElementById('range-start').value;
    const end = document.getElementById('range-end').value;
    let safeTitle = state.novelTitle.replace(/[\\/:*?"<>|]/g, '_');

    // [최종 확인] 파일명 생성
    const filename = `${safeTitle} ${start}-${end}.txt`;

    const blob = new Blob([state.downloadedText.join('\n')], {
      type: 'text/plain',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  };
})();
