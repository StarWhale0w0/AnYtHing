/* * Novel Downloader (V38: Reverse Array Order for novel543)
 * 1. novel543 리스트 역순 정렬 버그 수정: 최신화가 위에 있는 사이트 특성에 맞춰 배열을 강제로 뒤집어(Reverse) 1화부터 순차 수집 유도
 * 2. 2초 렌더링 지연 및 와일드카드 초광대역 수집 탑재
 * 3. 69shuba / novel543 하이브리드 수집 엔진, UTF-8 BOM 보정, 임시 저장소 대시보드 완비
 */

(function () {
  const existingUI = document.getElementById('my-downloader-ui');
  if (existingUI) existingUI.remove();

  // --- 사이트 타입 분석 ---
  const hostname = window.location.hostname;
  let siteType = "69shuba"; 

  if (hostname.includes("novel543") || hostname.includes("novel543.com")) {
    siteType = "novel543";
  } else {
    siteType = "69shuba";
  }

  // --- IndexedDB 데이터베이스 설정 ---
  const DB_NAME = "NovelDownloaderDB";
  const STORE_NAME = "chapters";
  let db;

  const initDB = () => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
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
      store.put({ id: `${novelKey}_${index}`, novelKey, index, text, title });
      transaction.oncomplete = () => resolve();
    });
  };

  // 특정 소설의 모든 챕터 불러오기
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

  // DB에 저장된 모든 원시 데이터 가져오기
  const getAllStoredData = () => {
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
    });
  };

  // DB 특정 소설 데이터 초기화
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

  // --- 메타 데이터 추출 ---
  const getNovelTitle = () => {
    try {
      if (siteType === "novel543") {
        const h1 = document.querySelector('h1.title, .info_title h1, h1, .book-title');
        if (h1) return h1.innerText.replace("章節列表", "").replace("章节列表", "").trim();
      } else {
        const meta = document.querySelector('meta[property="og:novel:book_name"]');
        if (meta) return meta.content.trim();
        const h1 = document.querySelector('.booknav2 h1 a, h1, .book-info h1');
        if (h1) return h1.innerText.replace('最新章节', '').trim();
      }
    } catch (e) {}
    return `${siteType}_Novel`;
  };

  // --- 本문 텍스트 정제 ---
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
      .filter((line) => {
        const l = line.toLowerCase();
        return (
          line.length > 0 && 
          !l.includes('www.69shuba.com') && 
          !l.includes('69书吧') &&
          !l.includes('novel543.com') &&
          !l.includes('ads by pubfuture')
        );
      }) 
      .join('\n\n');
  };

  // --- 상태 관리 ---
  const getNovelKey = () => {
    const pathParts = window.location.pathname.replace(/\/$/, "").split('/');
    let lastPart = pathParts.pop();
    if (lastPart === "dir") {
      lastPart = pathParts.pop();
    }
    return lastPart || 'default_key';
  };

  let state = {
    isPaused: false,
    allLinks: [],
    novelTitle: getNovelTitle(),
    realEndIndex: 0,
    novelKey: getNovelKey()
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
            #my-downloader-ui button { cursor: pointer; }
            .db-item { display: flex; justify-content: space-between; align-items: center; background: #222; padding: 6px 10px; margin-bottom: 5px; border-radius: 4px; font-size: 12px; border: 1px solid #333; }
            .db-del-btn { background: #e74c3c; color: white; border: none; padding: 3px 8px; border-radius: 3px; font-size: 11px; cursor: pointer; }
            .db-del-btn:hover { background: #c0392b; }
        </style>

        <div style="border-bottom:1px solid #444; padding-bottom:10px; margin-bottom:15px; display:flex; justify-content:space-between;">
            <div style="width: 85%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">
                <h3 style="margin:0; color:#00E676; font-size:14px;">📖 V38: 통합 슈퍼 크롤러 (${siteType.toUpperCase()})</h3>
            </div>
            <button id="btn-close" style="background:none; border:none; color:#fff; cursor:pointer;">✕</button>
        </div>

        <!-- 저장소 대시보드 영역 -->
        <div id="db-dashboard" style="margin-bottom: 15px; border-bottom: 1px dashed #444; padding-bottom: 15px;">
            <div style="font-weight: bold; margin-bottom: 8px; color: #00E676; font-size: 12px; display: flex; justify-content: space-between;">
                <span>📦 브라우저 임시 저장소 현황</span>
                <span id="total-db-size" style="color: #aaa; font-weight: normal;">조회 중...</span>
            </div>
            <div id="db-list" style="max-height: 120px; overflow-y: auto; background: #000; padding: 8px; border-radius: 6px; border: 1px solid #444;">
                <div style="color: #aaa; font-size: 11px; text-align: center; padding: 10px 0;">저장된 데이터 분석 중...</div>
            </div>
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
            감지된 도메인: ${hostname}<br>데이터베이스 정보를 불러옵니다...
        </div>

        <button id="btn-save" style="width:100%; margin-top:10px; padding:12px; background:#FF9800; color:white; border:none; border-radius:4px; font-weight:bold; display:none;">💾 수집한 구간 저장하기</button>
    `;
  document.body.appendChild(ui);

  const log = (msg) => {
    const box = document.getElementById('log-box');
    box.innerHTML += `<div>> ${msg}</div>`;
    box.scrollTop = box.scrollHeight;
  };

  // --- 대시보드 새로고침 ---
  const refreshDashboard = async () => {
    const dbListEl = document.getElementById('db-list');
    const dbSizeEl = document.getElementById('total-db-size');
    dbListEl.innerHTML = "";

    try {
      const allData = await getAllStoredData();
      
      if (allData.length === 0) {
        dbListEl.innerHTML = `<div style="color: #666; font-size: 11px; text-align: center; padding: 15px 0;">임시 저장된 소설 데이터가 없습니다.</div>`;
        dbSizeEl.innerText = "비어있음";
        document.getElementById('saved-info').innerText = "";
        return;
      }

      const grouped = {};
      allData.forEach(item => {
        if (!grouped[item.novelKey]) {
          grouped[item.novelKey] = {
            count: 0,
            title: item.title ? item.title.split(' ')[0] : '소설'
          };
        }
        grouped[item.novelKey].count++;
      });

      dbSizeEl.innerText = `총 ${Object.keys(grouped).length}개 분류`;

      for (const [key, info] of Object.entries(grouped)) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'db-item';
        
        const isCurrentNovel = (key === state.novelKey);
        const titleColor = isCurrentNovel ? "#00E676" : "#fff";
        const currentTag = isCurrentNovel ? " <span style='color: #00E676; font-size: 10px;'>(현재)</span>" : "";

        itemDiv.innerHTML = `
          <div style="max-width: 210px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <strong style="color: ${titleColor};">${key}</strong>${currentTag}<br/>
            <span style="font-size:11px; color:#aaa;">수집 분량: ${info.count}화</span>
          </div>
          <button class="db-del-btn" data-key="${key}">삭제</button>
        `;
        dbListEl.appendChild(itemDiv);

        if (isCurrentNovel) {
          document.getElementById('saved-info').innerText = `(임시 저장된 분량: ${info.count}화 존재)`;
        }
      }

      const delBtns = dbListEl.querySelectorAll('.db-del-btn');
      delBtns.forEach(btn => {
        btn.onclick = async (e) => {
          const targetKey = e.target.getAttribute('data-key');
          if (confirm(`⚠️ [소설 ID: ${targetKey}]의 모든 저장 데이터를 로컬 저장소에서 삭제하시겠습니까?\n(삭제 후 복구 불가능합니다!)`)) {
            await clearNovelDB(targetKey);
            log(`🧹 [${targetKey}] 데이터 삭제 완료.`);
            refreshDashboard();
          }
        };
      });

    } catch (e) {
      dbListEl.innerHTML = `<div style="color: #e74c3c; font-size: 11px;">현황 로드 실패: ${e.message}</div>`;
    }
  };

  // --- DB 초기화 ---
  initDB().then(async () => {
    log("데이터베이스 로드 성공.");
    await refreshDashboard();
  }).catch(e => log(`DB 에러: ${e.message}`));

  // --- 목차 스캔 로직 ---
  const scanEpisodes = async () => {
    document.getElementById('btn-scan').disabled = true;
    log(`🚀 [${siteType.toUpperCase()}] 목차 스캔 시작... (광고 스크립트 로딩 대기 2.0초)`);

    setTimeout(async () => {
      try {
        let rawLinks = Array.from(document.querySelectorAll('a'));
        let parsedLinks = [];

        if (siteType === "novel543") {
          const novelId = state.novelKey; 
          log(`💡 와일드카드 초광대역 수집기 가동 (ID: ${novelId} 연관 모든 링크 추적)`);

          parsedLinks = rawLinks.map((el) => {
            const text = el.innerText ? el.innerText.trim() : "";
            let href = el.getAttribute('href') || "";
            return { text, href };
          }).filter(link => {
            if (!link.href) return false;
            const hasNovelId = link.href.includes(novelId);
            const isNoise = link.href.endsWith('/dir') || link.href.endsWith('/dir/') || link.text === "";
            return hasNovelId && !isNoise;
          });

          // 💡 [핵심 보정] 최신화가 상단에 배치되는 novel543의 특성에 맞게 배열을 거꾸로 뒤집어(Reverse) 1화부터 정렬합니다.
          parsedLinks.reverse();

        } else {
          // 69shuba 챕터 탐색
          parsedLinks = rawLinks.map((el) => {
            const text = el.innerText ? el.innerText.trim() : "";
            const href = el.getAttribute('href') || "";
            return { text, href };
          }).filter(link => {
            if (!link.text || !link.href) return false;
            const blockKeywords = ["书签", "最新章节", "目录", "加入书架", "推荐", "返回", "电脑版", "手机版", "最新", "원문", "完本感言"];
            const hasBlockWord = blockKeywords.some(word => link.text.includes(word));
            if (hasBlockWord) return false;

            const isValidHref = link.href.endsWith('.htm') || link.href.endsWith('.html') || /\/txt\/\d+\/\d+/.test(link.href);
            if (!isValidHref) return false;

            const hasChapterPattern = /第?\s*\d+\s*[章|话|화|回]/g.test(link.text) || link.text.startsWith("第");
            return hasChapterPattern;
          });
        }

        // 절대 경로 변환
        parsedLinks = parsedLinks.map(link => {
          if (link.href && !link.href.startsWith('http')) {
            link.href = new URL(link.href, window.location.origin).href;
          }
          return link;
        });

        // 중복 제거
        const uniqueLinks = [];
        const seen = new Set();
        for (const link of parsedLinks) {
          if (!seen.has(link.href)) {
            seen.add(link.href);
            uniqueLinks.push(link);
          }
        }

        if (uniqueLinks.length === 0) {
          throw new Error("소설 목차 링크를 가져오지 못했습니다. 다시 시도해 주세요.");
        }

        log(`첫 챕터 탐색 성공: ${uniqueLinks[0].text}`);
        log(`마지막 챕터 탐색 성공: ${uniqueLinks[uniqueLinks.length - 1].text}`);

        state.allLinks = uniqueLinks;
        document.getElementById('step-setup').style.display = 'none';
        document.getElementById('step-download').style.display = 'block';
        document.getElementById('found-count').innerText = state.allLinks.length;
        document.getElementById('range-end').value = state.allLinks.length;

        // 현재 소설의 DB 수집분량 확인 후 자동 설정
        const saved = await loadChaptersFromDB(state.novelKey);
        if (saved.length > 0) {
          const nextTargetNum = saved.length + 1;
          document.getElementById('range-start').value = Math.min(nextTargetNum, state.allLinks.length);
        }

        log(`✅ 스캔 완료! 실제 총 ${state.allLinks.length}화 정렬됨.`);
      } catch (e) {
        log(`❌ 오류: ${e.message}`);
        document.getElementById('btn-scan').disabled = false;
      }
    }, 2000); 
  };

  // --- 메인 다운로드 루프 ---
  const downloadEpisodes = async () => {
    const startIdx = parseInt(document.getElementById('range-start').value) - 1;
    const endIdx = parseInt(document.getElementById('range-end').value);
    const baseSpeed = parseFloat(document.getElementById('dl-speed').value) * 1000;
    const targets = state.allLinks.slice(startIdx, endIdx);

    document.getElementById('btn-start').style.display = 'none';
    document.getElementById('btn-pause').style.display = 'block';

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

      if (i > 0 && i % 40 === 0) {
        log(`☕ 보안 장치 과열 방지 휴식... (8초)`);
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

        const buffer = await res.arrayBuffer();
        const contentType = res.headers.get("content-type") || "";
        let encoding = 'utf-8';
        
        if (contentType.toLowerCase().includes("gbk") || contentType.toLowerCase().includes("gb2312")) {
          encoding = 'gbk';
        } else {
          try {
            const tempDecoder = new TextDecoder('utf-8', { fatal: true });
            tempDecoder.decode(buffer);
            encoding = 'utf-8';
          } catch (e) {
            encoding = 'gbk';
          }
        }

        const decoder = new TextDecoder(encoding);
        const htmlText = decoder.decode(buffer);

        const doc = new DOMParser().parseFromString(htmlText, 'text/html');
        let contentEl = null;

        if (siteType === "novel543") {
          contentEl = doc.querySelector('.content_detail, #content_detail, .read-content, #chapter-content');
        } else {
          contentEl = doc.querySelector('.txtnav, #txtnav, .showtxt, #content');
        }

        if (contentEl) {
          const cleanBody = cleanText(contentEl.innerHTML);
          await saveChapterToDB(state.novelKey, displayNum, cleanBody, ep.text);
        } else {
          log(`⚠️ 본문 영역 추출 실패: ${ep.text}`);
        }

        const randomJitter = Math.random() * 1000;
        await new Promise((r) => setTimeout(r, baseSpeed + randomJitter));

      } catch (e) {
        if (e.message === 'CAPTCHA_DETECTED') {
          log(`🚨 캡차 감지! 새 창으로 캡차를 풀고 [재개]를 누르세요.`);
          alert(`[보안 캡차 감지]\n작업이 임시 정지됩니다.\n새 탭으로 해당 화(${ep.href})에 접속해 캡차를 풀고 [재개]를 누르세요.`);
          window.open(ep.href, '_blank');
          state.isPaused = true;
          i--; 
        } else if (e.message === '403_BLOCKED') {
          log(`⛔ 403/429 차단 발생! 데이터 손실 방지를 위해 다운로드 세션을 임시 봉인합니다.`);
          alert(`[IP 임시 차단]\n현재 수집된 분량까지 저장한 뒤 브라우저를 재접속하거나 VPN 우회를 고려해 보세요.`);
          stopFlag = true;
        } else {
          log(`❌ 통신 오류: ${e.message}. 일시정지 상태로 재도전 대기.`);
          state.isPaused = true;
          i--; 
        }
      }
    }

    document.getElementById('btn-pause').style.display = 'none';
    document.getElementById('btn-save').style.display = 'block';

    const savedList = await loadChaptersFromDB(state.novelKey);
    state.realEndIndex = savedList.length > 0 ? savedList[savedList.length - 1].index : 0;

    await refreshDashboard();

    if (stopFlag) {
      log(`⚠️ 차단으로 수집 중단. 현재 세션 누적: ${state.realEndIndex}화`);
    } else {
      log(`🎉 수집 완료! 통합 저장 파일을 생성할 준비가 되었습니다.`);
    }
  };

  // --- 통합 저장 및 파일 다운로드 ---
  const compileAndSave = async () => {
    const startNum = parseInt(document.getElementById('range-start').value);
    const endNum = parseInt(document.getElementById('range-end').value);

    if (isNaN(startNum) || isNaN(endNum) || startNum > endNum) {
      return alert('다운로드 구간 범위 설정이 잘못되었습니다.');
    }

    const savedList = await loadChaptersFromDB(state.novelKey);
    const strictRangeList = savedList.filter(item => item.index >= startNum && item.index <= endNum);

    if (strictRangeList.length === 0) {
      return alert('설정한 구간 범위에 해당하는 저장 데이터가 로컬에 존재하지 않습니다.');
    }

    log(`📝 선택구간 [${startNum}화 ~ ${endNum}화] 통합 컴파일 렌더링 중...`);
    
    const compiledText = strictRangeList.map(item => `\n\n=== ${item.title} ===\n\n${item.text}`).join('\n');
    
    let safeTitle = state.novelTitle.replace(/[\\/:*?"<>|]/g, '_');
    const filename = `${safeTitle} ${startNum}-${endNum}.txt`;

    const BOM = new Uint8Array([0xEF, 0xBB, 0xBF]); 
    const blob = new Blob([BOM, compiledText], { type: 'text/plain;charset=utf-8' });
    
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    
    log(`💾 통합 다운로드 완료: ${filename}`);
  };

  // --- 이벤트 리스너 세팅 ---
  document.getElementById('btn-close').onclick = () => ui.remove();
  document.getElementById('btn-scan').onclick = scanEpisodes;
  document.getElementById('btn-start').onclick = downloadEpisodes;
  document.getElementById('btn-pause').onclick = () => (state.isPaused = true);
  document.getElementById('btn-resume').onclick = () => (state.isPaused = false);
  document.getElementById('btn-save').onclick = compileAndSave;
})();
