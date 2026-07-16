/* * Novel Downloader (V49: Pure Body Text Ad & Notice Annihilator)
 * 1. 알림/공지 노이즈 완벽 제거: 본문 하단에 끈질기게 붙는 '溫馨提示(温馨提示)', '站內信', '加入書架' 등의 노이즈 단락을 통째로 숙청
 * 2. 제목 기반 (현재/전체) 정밀 타겟팅 결합 보호막을 통해 전/후반부 조각 Seamless 병합
 * 3. 69shuba / novel543 하이브리드 완벽 최적화 스위칭, UTF-8 BOM 인코딩 교정 기본 장착
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

  // --- 💡 [V49 핵심 교정] 본문 텍스트 알림 완벽 제거 필터 장착 ---
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
        
        // 💡 사이트 자체 노이즈 가드 작동 조건
        const isNoticeNoise = 
          l.includes('溫馨提示') || l.includes('温馨提示') ||
          l.includes('加入書架') || l.includes('加入书架') ||
          l.includes('站內信') || l.includes('站内信') ||
          l.includes('回復您的訊息') || l.includes('回复您的信息');

        return (
          line.length > 0 && 
          !isNoticeNoise && // 알림 노이즈 단락이면 가차없이 버림
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
                <h3 style="margin:0; color:#00E676; font-size:14px;">📖 V49: 통합 수집기 (${siteType.toUpperCase()})</h3>
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
            버전 마일스톤: V49 본문 클린 가드 장착형<br>데이터베이스 정보를 불러옵니다...
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
    log("🚀 목차 스캔을 대기합니다... (광고 로딩 2초)");

    setTimeout(async () => {
      try {
        let parsedLinks = [];
        const novelId = state.novelKey;

        if (siteType === "novel543") {
          log("💡 novel543 '全部章节(전체 장)' 구역 정밀 스캔 가동...");
          let lists = Array.from(document.querySelectorAll('.section-list, .chapter-list, .chapter, .dir-list'));
          let targetContainer = lists.length > 0 ? lists[lists.length - 1] : document.body;
          let rawLinks = Array.from(targetContainer.querySelectorAll('a'));

          parsedLinks = rawLinks.map((el) => {
            const text = el.innerText ? el.innerText.trim() : "";
            let href = el.getAttribute('href') || "";
            return { text, href };
          }).filter(link => {
            if (!link.href) return false;
            const hasNovelId = link.href.includes(novelId);
            const isNoise = link.href.endsWith('/dir') || link.href.endsWith('/dir/') || link.text === "";
            const hasChapterPattern = /第?\s*\d+\s*[章|话|화|回]/g.test(link.text) || link.text.startsWith("第");
            return hasNovelId && !isNoise && hasChapterPattern;
          });

          // 대표 화수 정방향 정렬 (8096_1.html, 8096_2.html 기준으로 오름차순 정렬)
          parsedLinks.sort((a, b) => {
            const fileA = a.href.split('/').pop().replace('.html', '');
            const fileB = b.href.split('/').pop().replace('.html', '');
            const valA = parseInt(fileA.split('_')[1], 10) || 0;
            const valB = parseInt(fileB.split('_')[1], 10) || 0;
            return valA - valB;
          });

        } else {
          // 69shuba 챕터 탐색
          let rawLinks = Array.from(document.querySelectorAll('a'));
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
          
          parsedLinks.sort((a, b) => {
            const numA = a.text.match(/\d+/);
            const numB = b.text.match(/\d+/);
            const valA = numA ? parseInt(numA[0], 10) : 0;
            const valB = numB ? parseInt(numB[0], 10) : 0;
            return valA - valB;
          });
        }

        // 절대 경로 변환
        parsedLinks = parsedLinks.map(link => {
          if (link.href && !link.href.startsWith('http')) {
            link.href = new URL(link.href, window.location.origin).href;
          }
          return link;
        });

        // 중복 주소 제거
        let uniqueLinks = [];
        const seen = new Set();
        for (const link of parsedLinks) {
          if (!seen.has(link.href)) {
            seen.add(link.href);
            uniqueLinks.push(link);
          }
        }

        if (uniqueLinks.length === 0) {
          throw new Error("소설 정규 목차 링크를 가져오지 못했습니다.");
        }

        log(`첫 챕터 진입 확인: ${uniqueLinks[0].text}`);
        log(`마지막 챕터 진입 확인: ${uniqueLinks[uniqueLinks.length - 1].text}`);

        state.allLinks = uniqueLinks;
        document.getElementById('step-setup').style.display = 'none';
        document.getElementById('step-download').style.display = 'block';
        document.getElementById('found-count').innerText = state.allLinks.length;
        document.getElementById('range-end').value = state.allLinks.length;

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

  // --- 단일 페이지 본문 파싱 범용 함수 ---
  const extractContentFromDoc = (doc) => {
    let selectors = [];
    if (siteType === "novel543") {
      selectors = ['.content_detail', '#content_detail', '.read-content', '#chapter-content', '.content', '#htmlContent', '.text-content', 'article', '#content'];
    } else {
      selectors = ['.txtnav', '#txtnav', '.showtxt', '#content'];
    }

    let targetEl = null;
    for (let sel of selectors) {
      targetEl = doc.querySelector(sel);
      if (targetEl && targetEl.innerText.trim().length > 200) break;
    }

    if (!targetEl || targetEl.innerText.trim().length < 100) {
      let allDivs = Array.from(doc.querySelectorAll('div, article, p'));
      let longestLength = 0;
      let bestCandidate = null;

      allDivs.forEach(el => {
        let textLen = el.innerText ? el.innerText.trim().length : 0;
        if (textLen > longestLength && !el.querySelector('script') && el.id !== 'my-downloader-ui') {
          longestLength = textLen;
          bestCandidate = el;
        }
      });
      if (bestCandidate && longestLength > 200) targetEl = bestCandidate;
    }

    return targetEl ? cleanText(targetEl.innerHTML) : null;
  };

  // --- 제목 분석형 조각 한계 분석기 ---
  const parsePageLimits = (doc) => {
    try {
      let h1 = doc.querySelector('h1, title');
      if (h1) {
        let titleText = h1.innerText || h1.textContent || "";
        let match = titleText.match(/\((\d+)\/(\d+)\)/);
        if (match) {
          return {
            current: parseInt(match[1], 10),
            total: parseInt(match[2], 10)
          };
        }
      }
    } catch (e) {}
    return { current: 1, total: 1 }; 
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

      log(`⬇ [${displayNum}/${endIdx}] 받는 중...: ${ep.text}`);

      try {
        let combinedText = "";
        
        // 1. 전반부 기본 페이지 다운로드
        let res = await fetch(ep.href);
        if (res.status !== 200) throw new Error(`HTTP_ERR_${res.status}`);

        let buffer = await res.arrayBuffer();
        let htmlText = new TextDecoder('utf-8').decode(buffer);
        if (htmlText.includes('gbk') || htmlText.includes('gb2312')) htmlText = new TextDecoder('gbk').decode(buffer);

        let doc = new DOMParser().parseFromString(htmlText, 'text/html');
        let mainBody = extractContentFromDoc(doc);
        if (mainBody) combinedText += mainBody;

        // 2. 제목 기반 후반부 조각 확정 병합 루프
        if (siteType === "novel543") {
          let limits = parsePageLimits(doc);
          
          if (limits.total > 1) {
            let baseUrl = ep.href.replace('.html', '');

            for (let partIndex = 2; partIndex <= limits.total; partIndex++) {
              
              while (state.isPaused) {
                log('⏸ 조각 결합 중 일시정지 제어 개입...');
                document.getElementById('btn-pause').style.display = 'none';
                document.getElementById('btn-resume').style.display = 'block';
                await new Promise((r) => setTimeout(r, 1000));
              }

              let nextPartUrl = `${baseUrl}_${partIndex}.html`;
              await new Promise((r) => setTimeout(r, 300)); 

              try {
                let partRes = await fetch(nextPartUrl);
                if (partRes.status === 200) {
                  let partBuffer = await partRes.arrayBuffer();
                  let partHtml = new TextDecoder('utf-8').decode(partBuffer);
                  if (partHtml.includes('gbk') || partHtml.includes('gb2312')) partHtml = new TextDecoder('gbk').decode(partBuffer);

                  let partDoc = new DOMParser().parseFromString(partHtml, 'text/html');
                  let partBody = extractContentFromDoc(partDoc);
                  
                  if (partBody) {
                    log(`   ➕ 후반부 연장 조각 확정 결합... (페이지: ${partIndex}/${limits.total})`);
                    combinedText += `\n\n` + partBody;
                  }
                }
              } catch (err) {
                log(`   ⚠️ 조각 수집 중 일시적 오류 발생: ${err.message}`);
              }
            }
          }
        }

        // 데이터베이스 세이브
        if (combinedText.trim().length > 10) {
          await saveChapterToDB(state.novelKey, displayNum, combinedText, ep.text);
        } else {
          log(`❌ 본문 수집 실패 오류: ${ep.text}`);
        }

        const randomJitter = Math.random() * 1000;
        await new Promise((r) => setTimeout(r, baseSpeed + randomJitter));

      } catch (e) {
        log(`❌ 통신 오류: ${e.message}. 일시정지 상태로 전환.`);
        state.isPaused = true;
        i--; 
      }
    }

    document.getElementById('btn-pause').style.display = 'none';
    document.getElementById('btn-save').style.display = 'block';

    const savedList = await loadChaptersFromDB(state.novelKey);
    state.realEndIndex = savedList.length > 0 ? savedList[savedList.length - 1].index : 0;

    await refreshDashboard();
    log(`🎉 수집 완료! 통합 저장 파일을 생성할 준비가 되었습니다.`);
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
