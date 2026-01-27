/* * Booktoki Downloader Script
 * GitHub 업로드용 script.js
 */

(function () {
  // 1. 이미 UI가 떠 있다면 제거하고 재실행 (중복 방지)
  const existingUI = document.getElementById('my-downloader-ui');
  if (existingUI) existingUI.remove();

  // 설정: 북토키 구조에 최적화
  const CONFIG = {
    // 소설 본문 영역
    contentSelector: '.view-content, #novel_content, .content, .viewer-text',
    // 목차 리스트 내의 링크만 정확히 타겟팅 (일반 링크 제외)
    listLinkSelector:
      '.list-body .list-item a, .list-row .list-subject a, .list-wrap a',
    // 제목
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

  // UI 생성
  const ui = document.createElement('div');
  ui.id = 'my-downloader-ui';
  ui.style.cssText = `
        position: fixed; top: 20px; right: 20px; width: 320px;
        background: #121212; color: #e0e0e0; padding: 20px;
        z-index: 9999999; border-radius: 12px; font-family: sans-serif;
        box-shadow: 0 10px 30px rgba(0,0,0,0.8); border: 1px solid #333;
        font-size: 13px; line-height: 1.5;
    `;

  ui.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:10px;">
            <h3 style="margin:0; color:#00E676; font-size:16px;">📥 Booktoki Downloader</h3>
            <button id="btn-close" style="background:none; border:none; color:#777; cursor:pointer; font-size:16px;">✕</button>
        </div>

        <div id="step-scan">
            <p style="color:#aaa; margin-bottom:10px;">소설 ID: <b style="color:#fff">${state.currentNovelId || '감지 불가'}</b></p>
            <button id="btn-scan" style="width:100%; padding:12px; background:#333; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold; transition:0.2s;">
                🔍 전체 목차 스캔 시작
            </button>
        </div>

        <div id="step-download" style="display:none;">
            <div style="background:#1e1e1e; padding:10px; border-radius:6px; margin-bottom:10px;">
                <div style="color:#00E676; font-weight:bold; font-size:14px;">총 <span id="count-total">0</span>화 발견</div>
                <div style="font-size:11px; color:#888; margin-top:4px;">다운로드할 범위를 확인하세요.</div>
            </div>
            
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <input type="number" id="range-start" value="1" style="width:50px; background:#2c2c2c; border:none; color:#fff; text-align:center; padding:5px; border-radius:4px;">
                <span style="align-self:center;">~</span>
                <input type="number" id="range-end" value="0" style="width:50px; background:#2c2c2c; border:none; color:#fff; text-align:center; padding:5px; border-radius:4px;">
                <span style="align-self:center; font-size:11px; color:#aaa;">화</span>
            </div>

            <div style="margin-bottom:15px;">
                <label style="color:#aaa; font-size:12px;">속도(초): </label>
                <input type="number" id="speed" value="1.5" step="0.5" style="width:50px; background:#2c2c2c; border:none; color:#fff; text-align:center; padding:4px; border-radius:4px;">
            </div>

            <div style="display:flex; gap:8px;">
                <button id="btn-start" style="flex:2; padding:10px; background:#00E676; color:#000; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">시작</button>
                <button id="btn-pause" style="flex:1; padding:10px; background:#f44336; color:#fff; border:none; border-radius:6px; cursor:pointer; display:none;">일시정지</button>
                <button id="btn-resume" style="flex:1; padding:10px; background:#2196F3; color:#fff; border:none; border-radius:6px; cursor:pointer; display:none;">재개</button>
            </div>
        </div>

        <div id="status-box" style="margin-top:15px; background:#000; padding:10px; height:100px; overflow-y:auto; border-radius:6px; border:1px solid #333; font-family:monospace; color:#ccc;">
            준비 완료. [스캔 시작]을 누르세요.
        </div>

        <button id="btn-save" style="width:100%; margin-top:10px; padding:12px; background:#FF9800; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold; display:none;">
            💾 텍스트 파일 저장
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
    // p, page 등 다양한 파라미터 대응
    if (url.searchParams.has('page')) url.searchParams.set('page', pageNum);
    else if (url.searchParams.has('p')) url.searchParams.set('p', pageNum);
    else if (url.searchParams.has('spage'))
      url.searchParams.set('spage', pageNum);
    else url.searchParams.append('page', pageNum);
    return url.toString();
  };

  // 스캔 로직 (핵심)
  const startScan = async () => {
    const btnScan = document.getElementById('btn-scan');
    btnScan.disabled = true;
    btnScan.style.background = '#555';
    btnScan.innerText = '스캔 중... (멈출 때까지 대기)';

    let page = 1;
    let collected = new Set();
    let firstPageHtml = null; // 리다이렉트 감지용

    log('🚀 목차 스캔 시작...');

    while (true) {
      const url = getPageUrl(page);
      try {
        const res = await fetch(url);
        const text = await res.text();

        // 1. 리다이렉트 감지 (페이지 1과 똑같은 내용이 반복되면 종료)
        // 내용의 앞부분 500자 정도만 비교 (효율성)
        const currentHtmlSignature = text.substring(500, 2000);
        if (page === 1) {
          firstPageHtml = currentHtmlSignature;
        } else if (currentHtmlSignature === firstPageHtml) {
          log(`✅ 스캔 종료 (페이지 ${page}에서 1페이지 반복 감지)`);
          break;
        }

        // 2. 링크 파싱
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const links = doc.querySelectorAll(CONFIG.listLinkSelector);

        let validCountOnPage = 0;

        links.forEach((a) => {
          const href = a.getAttribute('href');
          if (!href) return;

          // 자기 자신(목차 ID)이 포함된 링크는 제외
          if (state.currentNovelId && href.includes(state.currentNovelId))
            return;

          // 소설 링크 패턴 (/novel/숫자) 확인
          if (/\/novel\/\d+/.test(href)) {
            if (!collected.has(href)) {
              collected.add(href);
              validCountOnPage++;
            }
          }
        });

        if (validCountOnPage === 0 && page > 1) {
          log(`✅ 스캔 종료 (페이지 ${page}에서 링크 없음)`);
          break;
        }

        log(
          `📃 ${page}페이지: ${validCountOnPage}개 추가 (누적 ${collected.size}개)`,
        );
        page++;

        // 서버 부하 방지 딜레이
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        log(`❌ 오류 발생: ${e.message}`);
        break;
      }
    }

    // 결과 처리
    state.allLinks = Array.from(collected); // 순서 보장을 위해 배열로 변환

    // 정렬 (옵션: 번호순 정렬이 필요하다면 여기서 처리)
    // 보통 최신화가 위에 있으므로 역순 정렬이 필요할 수 있음. 확인 필요.
    // 여기서는 일단 있는 그대로 둠. 필요시 state.allLinks.reverse(); 추가

    document.getElementById('step-scan').style.display = 'none';
    document.getElementById('step-download').style.display = 'block';
    document.getElementById('count-total').innerText = state.allLinks.length;
    document.getElementById('range-end').value = state.allLinks.length;
    log(`✅ 총 ${state.allLinks.length}개 회차 준비 완료.`);
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

    log(`🚀 ${startIdx + 1}화 ~ ${endIdx}화 다운로드 시작!`);

    for (let i = 0; i < state.downloadQueue.length; i++) {
      // 일시정지 체크
      while (state.isPaused) {
        log('⏸ 일시정지 중... (재개 버튼 대기)');
        btnPause.style.display = 'none';
        btnResume.style.display = 'block';
        await new Promise((r) => setTimeout(r, 1000));
      }
      btnResume.style.display = 'none';
      btnPause.style.display = 'block';

      const url = state.downloadQueue[i];
      const displayNum = startIdx + i + 1;

      try {
        log(`⬇ [${displayNum}/${endIdx}] 다운로드 중...`);

        const res = await fetch(url);
        // 캡차 감지
        if (
          res.url.includes('captcha') ||
          res.status === 403 ||
          res.status === 429
        ) {
          throw new Error('캡차/차단 감지');
        }

        const text = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');

        // 제목 & 본문 추출
        const title =
          doc.querySelector(CONFIG.titleSelector)?.textContent.trim() ||
          `${displayNum}화`;
        const contentEl = doc.querySelector(CONFIG.contentSelector);

        if (!contentEl) {
          log(`⚠️ 본문 없음 (권한 부족?): ${url}`);
          state.downloadedText.push(
            `\n\n=== ${title} (본문 로드 실패) ===\n\n`,
          );
        } else {
          // 줄바꿈 처리
          let content = contentEl.innerHTML;
          content = content.replace(/<br\s*\/?>/gi, '\n');
          content = content.replace(/<\/p>/gi, '\n\n');
          const temp = document.createElement('div');
          temp.innerHTML = content;
          state.downloadedText.push(
            `\n\n=== ${title} ===\n\n${temp.textContent.trim()}`,
          );
        }

        // 속도 조절
        await new Promise((r) => setTimeout(r, speed));
      } catch (e) {
        log(`⛔ 오류 발생! ${e.message}`);
        log(`👉 캡차를 해결하고 [재개]를 누르세요.`);
        state.isPaused = true;
        i--; // 현재 화 다시 시도
      }
    }

    log('🎉 모든 다운로드 완료!');
    btnPause.style.display = 'none';
    btnSave.style.display = 'block';
  };

  // 이벤트 리스너 연결
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
      return alert('저장할 내용이 없습니다.');
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

  log('Booktoki 엔진 로드됨. ID 감지: ' + (state.currentNovelId || '실패'));
})();
