/* * Booktoki Downloader (V13: UI Visibility Fixed)
 * 입력창이 흰색 배경에 검은 글씨로 잘 보이게 수정됨
 */

(function () {
  // UI 중복 제거
  const existingUI = document.getElementById('my-downloader-ui');
  if (existingUI) existingUI.remove();

  // 1. 텍스트 정제 함수들
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
    text = text.replace(/<div>/g, '');
    text = text.replace(/<\/div>/g, '');
    text = text.replace(/<p>/g, '\n');
    text = text.replace(/<\/p>/g, '\n\n');
    text = text.replace(/<br\s*[/]?>/g, '\n');
    text = text.replace(/<[^>]*>/g, '');
    text = text.replace(/ {2,}/g, ' ');
    text = unescapeHTML(text);
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');
  };

  // 상태 변수
  let state = {
    isPaused: false,
    allLinks: [],
    downloadedText: [],
  };

  // UI 생성
  const ui = document.createElement('div');
  ui.id = 'my-downloader-ui';
  ui.style.cssText = `
        position: fixed; top: 20px; right: 20px; width: 350px;
        background: #1a1a1a; color: #fff; padding: 25px;
        z-index: 9999999; border-radius: 12px; font-family: sans-serif;
        box-shadow: 0 15px 40px rgba(0,0,0,0.9); border: 2px solid #444;
        font-size: 14px; line-height: 1.5;
    `;

  // 입력창 공통 스타일 (흰색 배경, 검은 글씨, 잘 보이게)
  const inputStyle = `
        width: 80px; 
        padding: 8px; 
        background-color: #ffffff !important; 
        color: #000000 !important; 
        border: 2px solid #888; 
        border-radius: 4px; 
        font-weight: bold; 
        text-align: center;
        font-size: 14px;
    `;

  ui.innerHTML = `
        <div style="border-bottom:1px solid #555; padding-bottom:15px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0; color:#00E676; font-size:16px;">✅ 입력창 개선판 (V13)</h3>
            <button id="btn-close" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:18px; font-weight:bold;">✕</button>
        </div>

        <div id="step-setup">
            <div style="margin-bottom:20px;">
                <label style="display:block; color:#ddd; margin-bottom:8px; font-weight:bold;">1. 전체 페이지 수 (spage):</label>
                <input type="number" id="total-pages" value="1" style="width:100%; box-sizing:border-box; padding:10px; background-color:#ffffff !important; color:#000000 !important; border:2px solid #ccc; border-radius:5px; font-size:15px; font-weight:bold;">
                
                <p style="font-size:12px; color:#aaa; margin-top:8px; line-height:1.4;">
                    * 사이트 맨 아래 숫자 버튼 중 <b>가장 큰 숫자</b>를 입력하세요.<br>
                    (클릭해서 타이핑 가능)
                </p>
            </div>
            
            <button id="btn-scan" style="width:100%; padding:14px; background:#00E676; color:#000; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:15px;">
                목차 가져오기 (스캔)
            </button>
        </div>

        <div id="step-download" style="display:none;">
            <div style="background:#333; padding:12px; border-radius:6px; margin-bottom:15px; border:1px solid #555;">
                발견된 회차: <span id="found-count" style="color:#00E676; font-weight:bold; font-size:16px;">0</span> 화
            </div>

            <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
                <span style="color:#ddd;">구간:</span>
                <input type="number" id="range-start" value="1" style="${inputStyle}">
                <span style="color:#ddd;">~</span>
                <input type="number" id="range-end" value="1" style="${inputStyle}">
            </div>
            
             <div style="display:flex; align-items:center; gap:10px; margin-bottom:20px;">
                <span style="color:#ddd;">속도(초):</span>
                <input type="number" id="dl-speed" value="1.0" step="0.5" style="${inputStyle}">
            </div>

            <div style="display:flex; gap:8px;">
                <button id="btn-start" style="flex:1; padding:12px; background:#00E676; color:#000; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">다운로드</button>
                <button id="btn-pause" style="flex:1; padding:12px; background:#f44336; color:#fff; border:none; border-radius:6px; cursor:pointer; display:none;">일시정지</button>
                <button id="btn-resume" style="flex:1; padding:12px; background:#2196F3; color:#fff; border:none; border-radius:6px; cursor:pointer; display:none;">재개</button>
            </div>
        </div>

        <div id="log-box" style="margin-top:15px; background:#000; height:100px; overflow-y:auto; padding:10px; font-family:monospace; color:#ccc; border:1px solid #444; font-size:12px;">
            페이지 수를 입력하고 스캔 버튼을 누르세요.
        </div>

        <button id="btn-save" style="width:100%; margin-top:15px; padding:14px; background:#FF9800; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; display:none; font-size:15px;">
            💾 통합 txt 파일 저장
        </button>
    `;
  document.body.appendChild(ui);

  const log = (msg) => {
    const box = document.getElementById('log-box');
    box.innerHTML += `<div>> ${msg}</div>`;
    box.scrollTop = box.scrollHeight;
  };

  // 2. 목차 수집
  const scanEpisodes = async () => {
    const totalPages = parseInt(document.getElementById('total-pages').value);
    if (!totalPages || totalPages < 1)
      return alert('페이지 수를 정확히 입력해주세요.');

    document.getElementById('btn-scan').disabled = true;
    const currentBaseUrl = window.location.href.split('?')[0];
    let collected = [];

    log(`🚀 ${totalPages} 페이지 역순 스캔 시작...`);

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

        links.reverse(); // 과거 -> 최신 순 정렬
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
    log(`✅ 스캔 완료! 총 ${state.allLinks.length}화 발견.`);
  };

  // 3. 다운로드
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
        log('⏸ 일시정지됨');
        btnPause.style.display = 'none';
        btnResume.style.display = 'block';
        await new Promise((r) => setTimeout(r, 1000));
      }
      btnResume.style.display = 'none';
      btnPause.style.display = 'block';

      const ep = targets[i];
      const displayNum = startIdx + i + 1;

      log(`⬇ [${displayNum}/${endIdx}] 다운로드 중...`);

      try {
        const res = await fetch(ep.href);
        if (!res.ok || res.url.includes('captcha'))
          throw new Error('캡차/차단 감지');

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
  };

  document.getElementById('btn-close').onclick = () => ui.remove();
  document.getElementById('btn-scan').onclick = scanEpisodes;
  document.getElementById('btn-start').onclick = downloadEpisodes;
  document.getElementById('btn-pause').onclick = () => (state.isPaused = true);
  document.getElementById('btn-resume').onclick = () =>
    (state.isPaused = false);
  document.getElementById('btn-save').onclick = () => {
    if (state.downloadedText.length === 0) return alert('내용 없음');
    const blob = new Blob([state.downloadedText.join('\n')], {
      type: 'text/plain',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Novel_Merged.txt';
    a.click();
  };
})();
