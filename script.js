/* * Novel Downloader (V26: 69shuba catalog filtering & deduplication)
 * 1. 69shuba 정규 목차(#catalog 또는 .catalog-all) 정밀 분석
 * 2. 상단 노이즈(북마크, 최신 업데이트 요약본) 강제 필터링 제거
 * 3. IndexedDB 실시간 자동 저장 및 이어받기 지원
 */

(function () {
  const existingUI = document.getElementById('my-downloader-ui');
  if (existingUI) existingUI.remove();

  // --- [신규] IndexedDB 데이터베이스 설정 ---
  const DB_NAME = "NovelDownloaderDB";
  const STORE_NAME = "chapters";
  let db;

  const initDB = () => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createStore = database.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        }
      };
      request.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };
      request.onerror = (e) => reject(e);
    });
  };

  // 실시간 단일 챕터 DB 저장
  const saveChapterToDB = (novelKey, index, text, title) => {
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.put({ novelKey, index, text, title });
      transaction.oncomplete = () => resolve();
    });
  };

  // 저장되어 있는 모든 챕터 불러오기
  const loadChaptersFromDB = (novelKey) => {
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const filtered = request.result
          .filter(item => item.novelKey === novelKey)
          .sort((a, b) => a.index - b.index);
        resolve(filtered);
      };
    });
  };

  // DB 초기화
  const clearNovelDB = (novelKey) => {
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.value.novelKey === novelKey) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  };

  // --- 메타 데이터 및 텍스트 파싱 로직 ---
  const getNovelTitle = () => {
    try {
      const meta = document.querySelector('meta[property="og:novel:book_name"]');
      if (meta) return meta.content.trim();
      
      const h1 = document.querySelector('.booknav2 h1 a, h1, .book-info h1');
      if (h1) return h1.innerText.replace('最新章节', '').trim();
    } catch (e) {}
    return '69shuba_Novel';
  };

  const cleanText = (text) => {
    text = text
      .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '') 
      .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')   
      .replace(/<div[^>]*>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<br\s*[/]?>/gi, '\n')
      .replace(/<[^>]*>/g, '') 
      .replace(/ {2,}/g, ' ');

    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.includes('www.69shuba.com') && !line.includes('69书吧')) 
      .join('\n\n');
  };

  // --- 상태 관리 ---
  let state = {
    isPaused: false,
    allLinks: [],
    novelTitle: getNovelTitle(),
    realEndIndex: 0,
    novelKey: window.location.pathname.replace(/\/$/, "").split('/').pop() || 'default_novel_key' 
  };

  // --- UI 빌더 ---
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
                <h3 style="margin:0; color:#00E676; font-size:14px;">📖 V26: 69shuba (정밀 목차 정렬)</h3>
            </div>
            <button id="btn-close" style="background:none; border:none; color:#fff; cursor:pointer;">✕</button>
        </div>

        <div id="step-setup">
            <p style="margin: 0 0 10px 0; font-size:12px; color:#aaa;">소설 메인 페이지(목차)에서 작동합니다.</p>
            <button id="btn-scan" style="width:100%; padding:12px; background:#00E676; color:#000; border:none; border-radius:4px; font-weight:bold;">목차 가져오기</button>
        </div>

        <div id="step-download" style="display:none;">
            <div style="background:#222; padding:10px; margin-bottom:15px; border:1px solid #444; font-size: 13px;">
                발견된 챕터: <span id="found-count" style="color:#00E676; font-weight:bold;">0</span> 개 <br/>
                <span id="saved-info" style="color:#FF9800; font-size:11px;"></span>
            </div>
            <div style="margin-bottom:15px;">
                <label style="display:block; margin-bottom:5px;">구간 (시작 ~ 끝):</label>
                <div style="display:flex; gap:10px; align-items:center;">
                    <input type="number" id="range-start" value="1"> <span>~</span> <input type="number" id="range-end" value="1">
                </div>
            </div>
             <div style="margin-bottom:20px;">
                <label style="display:block; margin-bottom:5px;">기본 속도 (초):</label>
                <input type="number" id="dl-speed" value="3.0" step="0.5">
            </div>
            <div style="display:flex; gap:5px;">
                <button id="btn-start" style="flex:1; padding:12px; background:#00E676; border:none; border-radius:4px; font-weight:bold; color:black;">시작</button>
                <button id="btn-pause" style="flex:1; padding:12px; background:#f44336; border:none; border-radius:4px; display:none; color:white;">일시정지</button>
                <button id="btn-resume" style="flex:1; padding:12px; background:#2196F3; border:none; border-radius:4px; display:none; color:white;">재개</button>
            </div>
        </div>

        <div id="log-box" style="margin-top:15px; background:#000; height:100px; overflow-y:auto; padding:10px; font-family:monospace; color:#ccc; border:1px solid #555; font-size:12px;">
            제목: ${state.novelTitle}<br>데이터베이스 초기화 중...
        </div>

        <button id="btn-save" style="width:100%; margin-top:10px; padding:12px; background:#FF9800; color:white; border:none; border-radius:4px; font-weight:bold; display:none;">💾 수집 데이터 통합 저장</button>
        <button id="btn-clear-db" style="width:100%; margin-top:5px; padding:6px; background:#555; color:#ccc; border:none; border-radius:4px; font-size:11px; display:none;">저장소 기록 완전히 지우기 (초기화)</button>
    `;
  document.body.appendChild(ui);

  const log = (msg) => {
    const box = document.getElementById('log-box');
    box.innerHTML += `<div>> ${msg}</div>`;
    box.scrollTop = box.scrollHeight;
  };

  // --- DB 초기화 및 복구 데이터 조회 ---
  initDB().then(async () => {
    log("데이터베이스 로드 성공.");
    const saved = await loadChaptersFromDB(state.novelKey);
    if (saved.length > 0) {
      log(`⚠️ 감지됨: 이전에 수집한 기록이 ${saved.length}개 있습니다.`);
      document.getElementById('saved-info').innerText = `(임시 저장된 분량: ${saved.length}화 존재)`;
    }
  }).catch(e => log(`DB 에러: ${e.message}`));

  // --- [핵심 수정] 목차 스캔 로직 (노이즈 필터링 강화) ---
  const scanEpisodes = async () => {
    document.getElementById('btn-scan').disabled = true;
    log(`🚀 목차 스캔 시작...`);

    try {
      // 69shuba의 정규 목차 리스트(catalog)만 강제로 타겟팅합니다.
      // '.catalog-all ul', '.catalog-list ul' 혹은 '#catalog ul' 내부의 링크만 선별
      let container = document.querySelector('.catalog-all ul, #catalog ul, .catalog-list ul, .p_list ul');
      let rawLinks = [];

      if (container) {
        rawLinks = Array.from(container.querySelectorAll('li a'));
      } else {
        // 백업용 광범위 수집
        rawLinks = Array.from(document.querySelectorAll('a'));
      }

      let parsedLinks = rawLinks.map((el) => {
        const text = el.innerText ? el.innerText.trim() : "";
        const href = el.getAttribute('href') || "";
        return { text, href };
      });

      // 정밀 필터링 시작
      parsedLinks = parsedLinks.filter(link => {
        if (!link.text || !link.href) return false;
        
        // 1. 제외할 노이즈 텍스트 패턴 (북마크, 최신장, 제목 등 가짜 링크)
        const blockKeywords = ["书签", "最新章节", "目录", "加入书架", "推荐", "返回", "电脑版", "手机版", "最新", "원문"];
        const hasBlockWord = blockKeywords.some(word => link.text.includes(word));
        if (hasBlockWord) return false;

        // 2. 69shuba의 실제 소설 챕터 링크는 대개 .htm 또는 .html로 끝나는 수식어 형식입니다.
        const isValidHref = link.href.endsWith('.htm') || link.href.endsWith('.html') || /\/txt\/\d+\/\d+/.test(link.href);
        if (!isValidHref) return false;

        // 3. 챕터 형태 정렬 (제X장, 제X화 등으로 시작하거나 숫자를 포함하는지 점검)
        const hasChapterPattern = /第?\s*\d+\s*[章|话|화|回]/g.test(link.text) || link.text.startsWith("第");
        
        return hasChapterPattern;
      });

      // 상대경로 -> 절대경로 보정
      parsedLinks = parsedLinks.map(link => {
        if (link.href && !link.href.startsWith('http')) {
          link.href = new URL(link.href, window.location.href).href;
        }
        return link;
      });

      // 링크 기반 완벽 중복 제거
      const uniqueLinks = [];
      const seen = new Set();
      for (const link of parsedLinks) {
        if (!seen.has(link.href)) {
          seen.add(link.href);
          uniqueLinks.push(link);
        }
      }

      if (uniqueLinks.length === 0) {
        throw new Error("목차 링크를 찾을 수 없습니다. 현재 페이지가 소설 메인 목차 화면이 맞는지 다시 확인해 주세요.");
      }

      // 첫 장 확인용 샘플 로그 출력
      log(`확인된 첫 챕터: ${uniqueLinks[0].text}`);
      log(`확인된 마지막 챕터: ${uniqueLinks[uniqueLinks.length - 1].text}`);

      state.allLinks = uniqueLinks;
      document.getElementById('step-setup').style.display = 'none';
      document.getElementById('step-download').style.display = 'block';
      document.getElementById('found-count').innerText = state.allLinks.length;
      document.getElementById('range-end').value = state.allLinks.length;

      // DB 이력 확인 및 이어받기 세팅
      const saved = await loadChaptersFromDB(state.novelKey);
      if (saved.length > 0) {
        const nextTargetNum = saved.length + 1;
        document.getElementById('range-start').value = Math.min(nextTargetNum, state.allLinks.length);
        log(`💡 이전에 ${saved.length}화까지 수집했습니다. ${nextTargetNum}화부터 이어받기를 추천합니다.`);
      }

      log(`✅ 완료! 실제 총 ${state.allLinks.length}화 탐색됨.`);
    } catch (e) {
      log(`❌ 오류: ${e.message}`);
      document.getElementById('btn-scan').disabled = false;
    }
  };

  // --- 메인 다운로드 루프 ---
  const downloadEpisodes = async () => {
    const startIdx = parseInt(document.getElementById('range-start').value) - 1;
    const endIdx = parseInt(document.getElementById('range-end').value);
    const baseSpeed = parseFloat(document.getElementById('dl-speed').value) * 1000;
    const targets = state.allLinks.slice(startIdx, endIdx);

    document.getElementById('btn-start').style.display = 'none';
    document.getElementById('btn-pause').style.display = 'block';
    document.getElementById('btn-clear-db').style.display = 'none';

    let stopFlag = false;

    for (let i = 0; i < targets.length; i++) {
      if (stopFlag) break;

      while (state.isPaused) {
        log('⏸ 일시정지 대기 중...');
        document.getElementById('btn-pause').style.display = 'none';
        document.getElementById('btn-resume').style.display = 'block';
        await new Promise((r) => setTimeout(r, 1000));
      }
      document.getElementById('btn-resume').style.display = 'none';
      document.getElementById('btn-pause').style.display = 'block';

      const ep = targets[i];
      const displayNum = startIdx + i + 1;

      if (i > 0 && i % 30 === 0) {
        log(`☕ 과열 방지 휴식 중... (8초)`);
        await new Promise((r) => setTimeout(r, 8000));
      }

      log(`⬇ [${displayNum}/${endIdx}] 받는 중...`);

      try {
        const res = await fetch(ep.href);

        if (
          res.url.includes('captcha') ||
          res.url.includes('challenge') ||
          res.url.includes('antibot')
        ) {
          throw new Error('CAPTCHA_DETECTED');
        }

        if (res.status === 403 || res.status === 429) {
          throw new Error('403_BLOCKED');
        }

        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        const contentEl = doc.querySelector('.txtnav, #txtnav, .showtxt, #content');

        if (contentEl) {
          const cleanBody = cleanText(contentEl.innerHTML);
          await saveChapterToDB(state.novelKey, displayNum, cleanBody, ep.text);
        } else {
          log(`⚠️ 본문 영역 탐색 실패: ${ep.text}`);
        }

        const randomJitter = Math.random() * 1000;
        await new Promise((r) => setTimeout(r, baseSpeed + randomJitter));

      } catch (e) {
        if (e.message === 'CAPTCHA_DETECTED') {
          log(`🚨 캡차 차단 감지! 새 탭을 통해 캡차를 풀고 [재개]를 누르세요.`);
          alert(`[보안 캡차 감지]\n동작이 일시정지됩니다.\n새 탭으로 해당 주소(${ep.href})에 접속하셔서 보안 확인을 마치신 뒤 [재개]를 클릭하세요.`);
          window.open(ep.href, '_blank');
          state.isPaused = true;
          i--; 
        } else if (e.message === '403_BLOCKED') {
          log(`⛔ 403 / 429 IP가 완전히 차단당했습니다. 작업을 임시 종료합니다.`);
          alert(`[접근 거부 차단]\n일시적으로 해당 사이트 접근이 금지되었습니다.\n현재까지 수집 완료된 파일만 통합하여 다운로드할 수 있습니다.`);
          stopFlag = true;
        } else {
          log(`❌ 통신 에러: ${e.message}. 일시정지 상태로 전환합니다.`);
          state.isPaused = true;
          i--; 
        }
      }
    }

    document.getElementById('btn-pause').style.display = 'none';
    document.getElementById('btn-save').style.display = 'block';
    document.getElementById('btn-clear-db').style.display = 'block';

    const savedList = await loadChaptersFromDB(state.novelKey);
    state.realEndIndex = savedList.length > 0 ? savedList[savedList.length - 1].index : 0;

    if (stopFlag) {
      log(`⚠️ 차단으로 수집 중단. 현재 저장된 최종 화: ${state.realEndIndex}화`);
    } else {
      log(`🎉 선택 구간 수집 프로세스 마감!`);
    }
  };

  // --- 통합 저장 및 파일 다운로드 ---
  const compileAndSave = async () => {
    const savedList = await loadChaptersFromDB(state.novelKey);
    if (savedList.length === 0) return alert('저장소에 보존된 소설 텍스트가 존재하지 않습니다.');

    const startNum = savedList[0].index;
    const endNum = savedList[savedList.length - 1].index;

    log("📝 수집된 전 장 통합 컴파일 및 텍스트 렌더링 중...");
    
    const compiledText = savedList.map(item => `\n\n=== ${item.title} ===\n\n${item.text}`).join('\n');
    
    let safeTitle = state.novelTitle.replace(/[\\/:*?"<>|]/g, '_');
    const filename = `${safeTitle} ${startNum}-${endNum}.txt`;

    const blob = new Blob([compiledText], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    
    log(`💾 통합 다운로드 완료: ${filename}`);
  };

  // --- 수동 데이터베이스 청소 ---
  const handleClearDB = async () => {
    if (confirm("이 소설의 수집 중이던 임시 데이터를 브라우저 저장소에서 완전히 지우시겠습니까?\n(수집 완료 후 안전하게 새 작업을 시작할 때 사용하세요.)")) {
      await clearNovelDB(state.novelKey);
      log("🧹 로컬 임시 저장소가 완전 초기화되었습니다.");
      document.getElementById('saved-info').innerText = "";
    }
  };

  // --- 이벤트 리스너 세팅 ---
  document.getElementById('btn-close').onclick = () => ui.remove();
  document.getElementById('btn-scan').onclick = scanEpisodes;
  document.getElementById('btn-start').onclick = downloadEpisodes;
  document.getElementById('btn-pause').onclick = () => (state.isPaused = true);
  document.getElementById('btn-resume').onclick = () => (state.isPaused = false);
  document.getElementById('btn-save').onclick = compileAndSave;
  document.getElementById('btn-clear-db').onclick = handleClearDB;
})();
