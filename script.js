/* * Booktoki Downloader (V23: CAPTCHA vs 403 Separation)
 * 1. 캡차 감지 시: 자동 일시정지 -> 사용자가 풀고 [재개] 누르면 해당 화부터 다시 시도
 * 2. 403 감지 시: 즉시 루프 종료 -> 현재까지 다운로드한 분량으로 파일명 생성 및 저장 유도
 */

(function () {
  const existingUI = document.getElementById('my-downloader-ui');
  if (existingUI) existingUI.remove();

  // 소설 제목 추출
  const getNovelTitle = () => {
    try {
      const meta = document.querySelector('meta[property="og:title"]');
      if (meta) return meta.content.replace(' | 북토키', '').trim();
      const header = document.querySelector(
        '.view-tit, .tit_subject, .board-title',
      );
      if (header) return header.innerText.trim();
    } catch (e) {}
    return 'Booktoki_Novel';
  };

  const unescapeHTML = (text) => {
    const entities = {
      '&lt;': '<',
      '&gt;': '>',
      '&amp;': '&',
      '&quot;': '"',
      '&apos;': "'",
      '&nbsp;': ' ',
    };
    return text.replace(
      /&[a-z0-9#]+;/g,
      (entity) => entities[entity] || entity,
    );
  };

  const cleanText = (text) => {
    text = text
      .replace(/<div>/g, '\n')
      .replace(/<\/div>/g, '\n')
      .replace(/<p>/g, '\n')
      .replace(/<\/p>/g, '\n')
      .replace(/<br\s*[/]?>/g, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/ {2,}/g, ' ');
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
    realEndIndex: 0,
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
                width: 80px !important; height: 35px !important;
                background-color: #ffffff !important; color: #000000 !important;
                border: 2px solid #999 !important; border-radius: 4px !important;
                text-align: center !important; font-size: 16px !important;
                font-weight: bold !important; display: inline-block !important;
            }
            #my-downloader-ui #total-pages { width: 100% !important; }
            #my-downloader-ui button { cursor: pointer; }
        </style>

        <div style="border-bottom:1px solid #444; padding-bottom:10px; margin-bottom:15px; display:flex; justify-content:space-between;">
            <div style="width: 85%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">
                <h3 style="margin:0; color:#00E676; font-size:14px;">🤖 V23: 지능형 예외처리</h3>
            </div>
            <button id="btn-close" style="background:none; border:none; color:#fff; cursor:pointer;">✕</button>
        </div>

        <div id="step-setup">
            <div style="margin-bottom:15px;">
                <label style="display:block; margin-bottom:5px;">총 페이지 수:</label>
                <input type="number" id="total-pages" value="1">
            </div>
            <button id="btn-scan" style="width:100%; padding:12px; background:#00E676; color:#000; border:none; border-radius:4px; font-weight:bold;">목차 가져오기</button>
        </div>

        <div id="step-download" style="display:none;">
            <div style="background:#222; padding:10px; margin-bottom:15px; border:1px solid #444;">
                발견: <span id="found-count" style="color:#00E676; font-weight:bold;">0</span> 화
            </div>
            <div style="margin-bottom:15px;">
                <label style="display:block; margin-bottom:5px;">구간 (시작 ~ 끝):</label>
                <div style="display:flex; gap:10px; align-items:center;">
                    <input type="number" id="range-start" value="1"> <span>~</span> <input type="number" id="range-end" value="1">
                </div>
            </div>
             <div style="margin-bottom:20px;">
                <label style="display:block; margin-bottom:5px;">기본 속도 (초):</label>
                <input type="number" id="dl-speed" value="1.5" step="0.5">
            </div>
            <div style="display:flex; gap:5px;">
                <button id="btn-start" style="flex:1; padding:12px; background:#00E676; border:none; border-radius:4px; font-weight:bold;">시작</button>
                <button id="btn-pause" style="flex:1; padding:12px; background:#f44336; border:none; border-radius:4px; display:none; color:white;">일시정지</button>
                <button id="btn-resume" style="flex:1; padding:12px; background:#2196F3; border:none; border-radius:4px; display:none; color:white;">재개</button>
            </div>
        </div>

        <div id="log-box" style="margin-top:15px; background:#000; height:100px; overflow-y:auto; padding:10px; font-family:monospace; color:#ccc; border:1px solid #555; font-size:12px;">
            제목: ${state.novelTitle}<br>페이지 수를 입력하세요.
        </div>

        <button id="btn-save" style="width:100%; margin-top:10px; padding:12px; background:#FF9800; color:white; border:none; border-radius:4px; font-weight:bold; display:none;">💾 저장 (파일명 자동생성)</button>
    `;
  document.body.appendChild(ui);

  const log = (msg) => {
    const box = document.getElementById('log-box');
    box.innerHTML += `<div>> ${msg}</div>`;
    box.scrollTop = box.scrollHeight;
  };

  const scanEpisodes = async () => {
    const totalPages = parseInt(document.getElementById('total-pages').value);
    if (!totalPages) return alert('페이지 수 입력 필요');
    document.getElementById('btn-scan').disabled = true;
    const currentBaseUrl = window.location.href.split('?')[0];
    let collected = [];

    log(`🚀 ${totalPages}페이지 스캔 시작...`);
    for (let page = totalPages; page >= 1; page--) {
      const url = `${currentBaseUrl}?spage=${page}`;
      log(`... ${page}페이지 읽는 중`);
      try {
        const res = await fetch(url);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const links = Array.from(doc.querySelectorAll('.item-subject')).map(
          (el) => ({
            text: el.innerText.trim(),
            href: el.getAttribute('href'),
          }),
        );
        collected.push(...links.reverse());
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        log(`❌ 오류: ${e.message}`);
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
    const baseSpeed =
      parseFloat(document.getElementById('dl-speed').value) * 1000;
    const targets = state.allLinks.slice(startIdx, endIdx);
    state.downloadedText = [];

    document.getElementById('btn-start').style.display = 'none';
    document.getElementById('btn-pause').style.display = 'block';

    let stopFlag = false; // 403 발생 시 루프 탈출용 플래그

    for (let i = 0; i < targets.length; i++) {
      if (stopFlag) break;

      while (state.isPaused) {
        log('⏸ 일시정지 (대기 중...)');
        document.getElementById('btn-pause').style.display = 'none';
        document.getElementById('btn-resume').style.display = 'block';
        await new Promise((r) => setTimeout(r, 1000));
      }
      document.getElementById('btn-resume').style.display = 'none';
      document.getElementById('btn-pause').style.display = 'block';

      const ep = targets[i];
      const displayNum = startIdx + i + 1;

      if (i > 0 && i % 30 === 0) {
        log(`☕ 30화마다 휴식... (10초)`);
        await new Promise((r) => setTimeout(r, 10000));
      }

      log(`⬇ [${displayNum}/${endIdx}] 받는 중...`);

      try {
        const res = await fetch(ep.href);

        // [구분 로직 1] 캡차 감지 -> 일시정지
        if (
          res.url.includes('captcha') ||
          res.url.includes('challenge') ||
          res.url.includes('antibot')
        ) {
          throw new Error('CAPTCHA_DETECTED');
        }

        // [구분 로직 2] 403/429 차단 -> 즉시 종료
        if (res.status === 403 || res.status === 429) {
          throw new Error('403_BLOCKED');
        }

        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const contentEl = doc.querySelector('#novel_content');

        if (contentEl) {
          const cleanBody = cleanText(contentEl.innerHTML);
          state.downloadedText.push(`\n\n=== ${ep.text} ===\n\n${cleanBody}`);
        } else {
          log(`⚠️ 본문 없음: ${ep.text}`);
        }

        const randomJitter = Math.random() * 1000;
        await new Promise((r) => setTimeout(r, baseSpeed + randomJitter));
      } catch (e) {
        // 에러 종류에 따른 분기 처리
        if (e.message === 'CAPTCHA_DETECTED') {
          log(`🚨 캡차 발생! 새 탭에서 풀고 [재개]를 누르세요.`);
          alert(
            `[캡차 감지]\n새 탭에서 해당 화(${displayNum}화)에 접속해 캡차를 푸세요.\n풀고 나서 여기로 돌아와 [재개] 버튼을 누르면 다시 시작합니다.`,
          );

          window.open(ep.href, '_blank'); // 사용자를 위해 새 탭 열어줌
          state.isPaused = true;
          i--; // 현재 화(i)를 다운 못 받았으므로 다시 시도하기 위해 인덱스 감소
        } else if (e.message === '403_BLOCKED') {
          log(`⛔ 403 차단됨! 작업을 중단하고 파일 저장을 준비합니다.`);
          alert(
            `[403 에러 발생]\n더 이상 진행이 불가능합니다.\n지금까지 다운로드된 분량(${state.downloadedText.length}화)까지만 저장합니다.`,
          );
          stopFlag = true; // 루프 완전 종료
        } else {
          log(`❌ 기타 오류: ${e.message}. 일시정지 합니다.`);
          state.isPaused = true;
          i--; // 재시도
        }
      }
    }

    // 종료 처리
    document.getElementById('btn-pause').style.display = 'none';
    document.getElementById('btn-save').style.display = 'block';

    const actualCount = state.downloadedText.length;
    const realEndNum = startIdx + actualCount;
    state.realEndIndex = realEndNum;

    if (stopFlag) {
      log(`⚠️ 403으로 인해 ${actualCount}화에서 중단됨.`);
    } else {
      log(`🎉 완료! (총 ${actualCount}화)`);
    }

    const safeTitle = state.novelTitle.replace(/[\\/:*?"<>|]/g, '_');
    const displayStart = actualCount > 0 ? startIdx + 1 : 0;
    log(`📝 저장될 파일명: ${safeTitle} ${displayStart}-${realEndNum}.txt`);
  };

  document.getElementById('btn-close').onclick = () => ui.remove();
  document.getElementById('btn-scan').onclick = scanEpisodes;
  document.getElementById('btn-start').onclick = downloadEpisodes;
  document.getElementById('btn-pause').onclick = () => (state.isPaused = true);
  document.getElementById('btn-resume').onclick = () =>
    (state.isPaused = false);

  document.getElementById('btn-save').onclick = () => {
    if (state.downloadedText.length === 0)
      return alert('저장할 내용이 없습니다.');

    const startIdx = parseInt(document.getElementById('range-start').value);
    // 사용자가 처음에 입력한 '끝'이 아니라, 실제로 멈춘 'realEndIndex'를 사용
    const realEnd = startIdx + state.downloadedText.length - 1;

    let safeTitle = state.novelTitle.replace(/[\\/:*?"<>|]/g, '_');
    const filename = `${safeTitle} ${startIdx}-${realEnd}.txt`;

    const blob = new Blob([state.downloadedText.join('\n')], {
      type: 'text/plain',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  };
})();
