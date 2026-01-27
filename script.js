/* * Booktoki Downloader (Based on User's Working Reference)
 * V12: Reference Logic Integrated + Merged TXT Output
 */

(function () {
  // UI 중복 제거
  const existingUI = document.getElementById('my-downloader-ui');
  if (existingUI) existingUI.remove();

  // 1. 님이 주신 코드의 핵심 함수들 (텍스트 정제)
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
    text = text.replace(/<\/p>/g, '\n\n'); // 문단 구분 명확히
    text = text.replace(/<br\s*[/]?>/g, '\n');
    text = text.replace(/<[^>]*>/g, ''); // 나머지 태그 제거
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
    allLinks: [], // { title, url } 객체 저장
    downloadedText: [],
  };

  // UI 생성
  const ui = document.createElement('div');
  ui.id = 'my-downloader-ui';
  ui.style.cssText = `
        position: fixed; top: 20px; right: 20px; width: 350px;
        background: #1a1a1a; color: #fff; padding: 20px;
        z-index: 9999999; border-radius: 10px; font-family: sans-serif;
        box-shadow: 0 10px 30px rgba(0,0,0,0.8); border: 1px solid #444;
        font-size: 13px; line-height: 1.5;
    `;

  ui.innerHTML = `
        <div style="border-bottom:1px solid #444; padding-bottom:10px; margin-bottom:15px; display:flex; justify-content:space-between;">
            <h3 style="margin:0; color:#00E676;">✅ Reference 기반 다운로더</h3>
            <button id="btn-close" style="background:none; border:none; color:#888; cursor:pointer;">X</button>
        </div>

        <div id="step-setup">
            <div style="margin-bottom:15px;">
                <label style="display:block; color:#aaa; margin-bottom:5px;">1. 목차 페이지 수 (spage):</label>
                <input type="number" id="total-pages" value="1" style="width:100%; padding:8px; background:#333; border:1px solid #555; color:#fff; border-radius:4px;">
                <p style="font-size:11px; color:#888; margin-top:5px;">
                    * 사이트 하단에 적힌 <b>가장 큰 페이지 숫자</b>를 적으세요.<br>
                    * 예: 1500화라면 보통 <b>30~50</b> 정도입니다.
                </p>
            </div>
            
            <button id="btn-scan" style="width:100%; padding:12px; background:#00E676; color:#000; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">
                목차 가져오기 (역순 스캔)
            </button>
        </div>

        <div id="step-download" style="display:none;">
            <div style="background:#222; padding:10px; border-radius:4px; margin-bottom:10px;">
                총 <span id="found-count" style="color:#00E676; font-weight:bold;">0</span>화 발견됨
            </div>

            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <input type="number" id="range-start" value="1" style="width:60px; text-align:center; padding:5px;"> ~ 
                <input type="number" id="range-end" value="1" style="width:60px; text-align:center; padding:5px;"> 화
            </div>
             <div style="margin-bottom:10px;">
                속도(초): <input type="number" id="dl-speed" value="1.0" step="0.5" style="width:50px; text-align:center;">
            </div>

            <div style="display:flex; gap:5px;">
                <button id="btn-start" style="flex:1; padding:10px; background:#00E676; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">다운로드</button>
                <button id="btn-pause" style="flex:1; padding:10px; background:#f44336; border:none; border-radius:4px; cursor:pointer; display:none; color:white;">일시정지</button>
                <button id="btn-resume" style="flex:1; padding:10px; background:#2196F3; border:none; border-radius:4px; cursor:pointer; display:none; color:white;">재개</button>
            </div>
        </div>

        <div id="log-box" style="margin-top:15px; background:#000; height:120px; overflow-y:auto; padding:10px; font-family:monospace; color:#ccc; border:1px solid #333; font-size:11px;">
            목차 페이지 수를 입력하고 버튼을 누르세요.
        </div>

        <button id="btn-save" style="width:100%; margin-top:10px; padding:12px; background:#FF9800; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer; display:none;">
            💾 통합 txt 파일 저장
        </button>
    `;
  document.body.appendChild(ui);

  const log = (msg) => {
    const box = document.getElementById('log-box');
    box.innerHTML += `<div>> ${msg}</div>`;
    box.scrollTop = box.scrollHeight;
  };

  // 2. 목차 수집 로직 (Reference: 역순 스캔 & .item-subject)
  const scanEpisodes = async () => {
    const totalPages = parseInt(document.getElementById('total-pages').value);
    if (!totalPages || totalPages < 1)
      return alert('올바른 페이지 수를 입력하세요.');

    document.getElementById('btn-scan').disabled = true;
    const currentBaseUrl = window.location.href.split('?')[0];
    let collected = [];

    log(`🚀 총 ${totalPages} 페이지 역순 스캔 시작...`);

    // Reference Logic: page를 totalPages부터 1까지 역순으로 돔
    for (let page = totalPages; page >= 1; page--) {
      const url = `${currentBaseUrl}?spage=${page}`;
      log(`... ${page} 페이지 읽는 중`);

      try {
        const res = await fetch(url);
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Reference Selector: .item-subject (이게 정답이었음)
        const links = Array.from(doc.querySelectorAll('.item-subject')).map(
          (el) => ({
            text: el.innerText.trim(), // 제목도 같이 저장
            href: el.getAttribute('href'),
          }),
        );

        // 한 페이지 내에서는 최신순(위) -> 과거순(아래)이므로
        // 과거 -> 최신 순서로 맞추기 위해 reverse()
        links.reverse();

        collected.push(...links);

        await new Promise((r) => setTimeout(r, 200)); // 차단 방지
      } catch (e) {
        log(`❌ 오류 (Page ${page}): ${e.message}`);
      }
    }

    state.allLinks = collected;

    // UI 전환
    document.getElementById('step-setup').style.display = 'none';
    document.getElementById('step-download').style.display = 'block';
    document.getElementById('found-count').innerText = state.allLinks.length;
    document.getElementById('range-end').value = state.allLinks.length;
    log(`✅ 스캔 완료! 총 ${state.allLinks.length}화 발견.`);
  };

  // 3. 다운로드 로직 (Reference: cleanText 적용)
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
        // 캡차 감지
        if (!res.ok || res.url.includes('captcha'))
          throw new Error('캡차/차단 감지');

        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Reference Selector: #novel_content
        const contentEl = doc.querySelector('#novel_content');

        if (contentEl) {
          const cleanBody = cleanText(contentEl.innerHTML);
          // 제목 + 본문 합치기
          state.downloadedText.push(`\n\n=== ${ep.text} ===\n\n${cleanBody}`);
        } else {
          log(`⚠️ 본문 없음: ${ep.text}`);
        }

        await new Promise((r) => setTimeout(r, speed));
      } catch (e) {
        log(`⛔ 오류: ${e.message}`);
        state.isPaused = true;
        i--; // 재시도
      }
    }

    log('🎉 완료! 저장 버튼을 누르세요.');
    btnPause.style.display = 'none';
    document.getElementById('btn-save').style.display = 'block';
  };

  // 버튼 이벤트
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
    a.download = 'Novel_Merged.txt'; // 통합 txt 파일
    a.click();
  };
})();
