/* ── State ─────────────────────────────────────────────────────────────────── */
const state = {
  currentPage: 'health',
  currentJobId: null,
  pollTimer: null,
  currentResult: null,
  igSelectedImages: new Set(),
  igAllImages: [],
  igCurrentSetId: null,
  igCurrentTitle: '',
  igConfig: null,
  // 모달 상태 — onclick 속성에 JSON 직렬화하지 않고 여기에 저장
  modalImages: [],
  modalIndex: 0,
  // 상세 페이지용 이미지 목록
  detailImages: [],
  // 결과 화면용 이미지 목록
  resultImages: [],
  detailSetId: null,
  // 편집기 상태
  currentDeck: null,
  editingCardIndex: 0,
  editingSetId: null,
};

/* ── API Client ────────────────────────────────────────────────────────────── */
const api = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
  async post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `${res.status} ${res.statusText}`);
    }
    return res.json();
  },
  async patch(url, body) {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
};

/* ── Navigation ────────────────────────────────────────────────────────────── */
function navigateTo(page) {
  state.currentPage = page;

  document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.remove('hidden');

  // detail 페이지는 sidebar에 대응 항목이 없으므로 'history' 활성화
  const navKey = page === 'detail' ? 'history' : page;
  const navEl = document.querySelector(`[data-page="${navKey}"]`);
  if (navEl) navEl.classList.add('active');

  if (page === 'history') loadHistory();
  if (page === 'instagram') {
    loadInstagramConfig();
    loadInstagramSets();
  }
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

/* ── Tabs ──────────────────────────────────────────────────────────────────── */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabGroup = btn.closest('.card, .page-body');
    tabGroup.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    tabGroup.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById(`tab-${btn.dataset.tab}`);
    if (panel) panel.classList.add('active');
  });
});

/* ── Generate: KDCA ────────────────────────────────────────────────────────── */
async function generateKdca() {
  const keyword = document.getElementById('kdca-keyword').value.trim();
  const contentId = document.getElementById('kdca-contentid').value.trim();

  if (!keyword && !contentId) {
    alert('키워드 또는 Content ID를 입력하거나 "다음 미제작 글 자동 선택"을 사용하세요.');
    return;
  }
  await startGenerate({ mode: 'kdca', keyword: keyword || undefined, contentId: contentId || undefined, capture: true });
}

async function generateKdcaAuto() {
  await startGenerate({ mode: 'kdca', autoSelect: true, capture: true });
}

/* ── Generate: Custom Topic ────────────────────────────────────────────────── */
async function generateCustom() {
  const topic = document.getElementById('custom-topic').value.trim();
  if (!topic) { alert('주제를 입력하세요.'); return; }

  const referenceField = document.getElementById('custom-reference');
  const referenceText = referenceField.value.trim();
  if (!referenceText) {
    alert('참고 내용을 입력해야 카드뉴스를 생성할 수 있습니다.\n\nGemini가 카드뉴스 본문을 작성할 때 반드시 이 내용을 근거로 사용합니다.');
    referenceField.focus();
    return;
  }
  if (referenceText.length < 80) {
    const ok = confirm(
      `참고 내용이 ${referenceText.length}자로 다소 짧습니다.\n` +
        `최소 200자 이상의 구체적인 정보를 입력하면 카드뉴스 품질이 좋아집니다.\n\n이대로 진행할까요?`
    );
    if (!ok) { referenceField.focus(); return; }
  }

  const cardCount = parseInt(document.getElementById('custom-cardcount').value, 10);

  await startGenerate({
    mode: 'custom-topic',
    topic,
    cardCount,
    referenceText,
    capture: true,
  });
}

/* ── Start Generate ────────────────────────────────────────────────────────── */
async function startGenerate(input) {
  try {
    setGenerateButtonsDisabled(true);
    showProgressSection();
    resetProgressUI();

    const { jobId } = await api.post('/api/cardnews/generate', input);
    state.currentJobId = jobId;
    document.getElementById('progress-jobid').textContent = jobId;

    startPolling(jobId);
  } catch (err) {
    alert('생성 요청 실패: ' + err.message);
    setGenerateButtonsDisabled(false);
  }
}

function setGenerateButtonsDisabled(disabled) {
  ['btn-generate-kdca', 'btn-generate-custom'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
  });
}

/* ── Progress UI ───────────────────────────────────────────────────────────── */
function showProgressSection() {
  document.getElementById('progress-section').classList.remove('hidden');
  document.getElementById('result-section').classList.add('hidden');
  document.getElementById('progress-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetProgressUI() {
  document.getElementById('progress-bar').style.width = '0%';
  document.getElementById('progress-bar').className = 'progress-bar-fill';
  document.getElementById('progress-percent').textContent = '0%';
  document.getElementById('progress-status-dot').className = 'status-dot running';
  document.getElementById('progress-title').textContent = '카드뉴스 생성 중...';
  document.getElementById('log-console').innerHTML = '<div class="log-line info">[시스템] 파이프라인 시작 중...</div>';
  renderStepTimeline(makeDefaultSteps());
}

function makeDefaultSteps() {
  const names = ['원문 자료 수집', '카드뉴스 기획', '이미지 생성', 'HTML/CSS 렌더링', 'Playwright 캡처', '결과 저장', '인스타그램 업로드 준비'];
  return names.map((name, i) => ({ id: i + 1, name, status: 'waiting', message: '' }));
}

function renderStepTimeline(steps) {
  const container = document.getElementById('step-timeline');
  container.innerHTML = steps.map(step => {
    const icon = stepIcon(step.status, step.id);
    return `
      <div class="step-item ${step.status}">
        <div class="step-icon-wrap">
          <div class="step-icon">${icon}</div>
        </div>
        <div class="step-content">
          <div class="flex items-center gap-2">
            <span class="step-name">${step.name}</span>
            <span class="step-badge ${step.status}">${stepStatusLabel(step.status)}</span>
          </div>
          ${step.message ? `<div class="step-message">${escapeHtml(step.message)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function stepIcon(status, id) {
  if (status === 'success') return '✓';
  if (status === 'failed') return '✕';
  if (status === 'running') return `<span style="display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite;"></span>`;
  if (status === 'skipped') return '↷';
  return id;
}

function stepStatusLabel(status) {
  return { waiting: '대기', running: '실행 중', success: '완료', failed: '실패', skipped: '건너뜀' }[status] || status;
}

/* ── Polling ───────────────────────────────────────────────────────────────── */
function startPolling(jobId) {
  stopPolling();
  state.pollTimer = setInterval(() => pollJob(jobId), 1500);
}

function stopPolling() {
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
}

async function pollJob(jobId) {
  try {
    const job = await api.get(`/api/cardnews/jobs/${jobId}`);
    updateProgressUI(job);

    if (job.status === 'success' || job.status === 'failed') {
      stopPolling();
      setGenerateButtonsDisabled(false);
      if (job.status === 'success') await showResult(job);
    }
  } catch (err) {
    console.error('Poll error:', err);
  }
}

function updateProgressUI(job) {
  const successCount = job.steps.filter(s => s.status === 'success' || s.status === 'skipped').length;
  const percent = Math.round((successCount / job.steps.length) * 100);

  const bar = document.getElementById('progress-bar');
  bar.style.width = percent + '%';
  if (job.status === 'success') bar.className = 'progress-bar-fill success';
  else if (job.status === 'failed') bar.className = 'progress-bar-fill failed';

  document.getElementById('progress-percent').textContent = percent + '%';
  document.getElementById('progress-status-dot').className = 'status-dot ' + job.status;

  const title = document.getElementById('progress-title');
  if (job.status === 'success') title.textContent = '✅ 카드뉴스 생성 완료!';
  else if (job.status === 'failed') title.textContent = '❌ 생성 실패';
  else title.textContent = '카드뉴스 생성 중...';

  renderStepTimeline(job.steps);
  updateLogs(job.logs);
}

function updateLogs(logs) {
  const console_ = document.getElementById('log-console');
  const wasAtBottom = console_.scrollTop + console_.clientHeight >= console_.scrollHeight - 10;
  console_.innerHTML = logs.map(line => {
    let cls = '';
    if (line.includes('실패') || line.includes('[오류]')) cls = 'error';
    else if (line.includes('경고') || line.includes('건너뜀')) cls = 'warn';
    else if (line.includes('완료') || line.includes('✅')) cls = 'info';
    return `<div class="log-line ${cls}">${escapeHtml(line)}</div>`;
  }).join('');
  if (wasAtBottom) console_.scrollTop = console_.scrollHeight;
}

function clearLogs() {
  document.getElementById('log-console').innerHTML = '';
}

/* ── Result (생성 완료 후) ──────────────────────────────────────────────────── */
async function showResult(job) {
  if (!job.result) return;

  // API로 정확한 URL 가져오기 (절대경로 직접 조작하지 않음)
  let detail = null;
  try {
    detail = await api.get(`/api/cardnews/sets/${job.result.setId}`);
  } catch (err) {
    console.warn('sets API 호출 실패, fallback 사용:', err);
  }

  state.currentResult = { ...job.result, detail };
  const imageUrls = detail?.imageUrls ?? [];
  const htmlUrl = detail?.htmlUrl ?? null;

  document.getElementById('result-section').classList.remove('hidden');
  document.getElementById('result-title').textContent = job.result.title;
  document.getElementById('result-setid').textContent = job.result.setId;
  document.getElementById('result-card-count').textContent = imageUrls.length + '장';

  // 이미지 목록을 state에 저장 (onclick 속성 안에 JSON 직접 넣지 않음)
  state.resultImages = imageUrls;

  // 이미지 그리드
  const grid = document.getElementById('result-image-grid');
  if (!imageUrls.length) {
    grid.innerHTML = '<div class="text-muted">PNG 이미지가 없습니다. (capture=false로 실행된 경우)</div>';
  } else {
    grid.innerHTML = imageUrls.map((url, i) => `
      <div class="image-card-wrap">
        <div class="image-card" onclick="openModal(state.resultImages, ${i})">
          <img src="${escapeHtml(url)}" alt="카드 ${i + 1}" loading="lazy" />
          <div class="image-label">카드 ${i + 1}</div>
        </div>
        <div class="image-actions">
          <a href="${escapeHtml(url)}" download class="btn btn-secondary btn-sm">⬇ 저장</a>
          <button class="btn btn-secondary btn-sm" onclick="openModal(state.resultImages, ${i})">🔍 크게</button>
        </div>
      </div>`).join('');
  }

  // HTML 미리보기 버튼 상태
  const htmlBtn = document.getElementById('btn-html-preview');
  if (htmlBtn) {
    htmlBtn._htmlUrl = htmlUrl;
    htmlBtn.disabled = !htmlUrl;
  }

  document.getElementById('result-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openHtmlPreview() {
  const btn = document.getElementById('btn-html-preview');
  const url = btn?._htmlUrl || (state.currentResult?.detail?.htmlUrl);
  if (url) window.open(url, '_blank');
  else alert('HTML 파일을 찾을 수 없습니다.');
}

function goInstagramDraft() {
  if (!state.currentResult) return;
  navigateTo('instagram');
  setTimeout(async () => {
    await loadInstagramSets();
    const sel = document.getElementById('ig-set-select');
    const setId = state.currentResult.setId;
    for (let opt of sel.options) {
      if (opt.value === setId) { sel.value = setId; await loadInstagramDraft(); break; }
    }
  }, 300);
}

function resetForm() {
  state.currentJobId = null;
  state.currentResult = null;
  document.getElementById('progress-section').classList.add('hidden');
  document.getElementById('result-section').classList.add('hidden');
  setGenerateButtonsDisabled(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function refreshHistory() { loadHistory(); }

/* ── Image Modal ───────────────────────────────────────────────────────────── */
function openModal(images, index) {
  state.modalImages = images;
  state.modalIndex = index;
  document.getElementById('image-modal').classList.remove('hidden');
  renderModal();
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('image-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

function prevCard() {
  if (!state.modalImages.length) return;
  state.modalIndex = (state.modalIndex - 1 + state.modalImages.length) % state.modalImages.length;
  renderModal();
}

function nextCard() {
  if (!state.modalImages.length) return;
  state.modalIndex = (state.modalIndex + 1) % state.modalImages.length;
  renderModal();
}

function renderModal() {
  const url = state.modalImages[state.modalIndex];
  const total = state.modalImages.length;
  const current = state.modalIndex + 1;

  document.getElementById('modal-img').src = url || '';
  document.getElementById('modal-caption').textContent = `카드 ${current}`;
  document.getElementById('modal-counter').textContent = `${current} / ${total}`;
}

document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('image-modal');
  if (modal.classList.contains('hidden')) return;
  if (e.key === 'Escape') closeModal();
  else if (e.key === 'ArrowLeft') prevCard();
  else if (e.key === 'ArrowRight') nextCard();
});

/* ── History Page ──────────────────────────────────────────────────────────── */
async function loadHistory() {
  const container = document.getElementById('history-content');
  container.innerHTML = '<div class="text-muted">이력 불러오는 중...</div>';
  try {
    const history = await api.get('/api/cardnews/history');
    if (!history.length) {
      container.innerHTML = `<div class="empty-state"><div class="icon">📭</div><h3>생성 이력이 없습니다</h3><p>TY 건강 카드뉴스 메뉴에서 첫 카드뉴스를 생성해보세요.</p></div>`;
      return;
    }

    container.innerHTML = `
      <table class="history-table">
        <thead>
          <tr>
            <th>생성일 / ID</th>
            <th>제목</th>
            <th>소스</th>
            <th>카드</th>
            <th>미리보기</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          ${history.map(entry => {
            const srcBadge = { kdca: 'badge-blue', 'custom-topic': 'badge-purple', cli: 'badge-gray' }[entry.source] || 'badge-gray';
            const firstImg = entry.imageUrls?.[0] ?? '';
            const dateStr = entry.createdAt
              ? new Date(entry.createdAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
              : entry.setId.slice(0, 8);

            return `
            <tr style="cursor:pointer" onclick="loadSetDetail('${escapeHtml(entry.setId)}')">
              <td class="font-mono text-sm" title="${escapeHtml(entry.setId)}">${escapeHtml(dateStr)}</td>
              <td><strong>${escapeHtml(entry.title)}</strong></td>
              <td><span class="badge ${srcBadge}">${entry.source}</span></td>
              <td>${entry.cardCount}장</td>
              <td onclick="event.stopPropagation()">
                ${firstImg
                  ? `<img src="${escapeHtml(firstImg)}" style="width:40px;height:50px;object-fit:cover;border-radius:4px;cursor:pointer" onclick="openHistoryModal('${escapeHtml(entry.setId)}')" />`
                  : '<span class="text-muted text-sm">—</span>'}
              </td>
              <td onclick="event.stopPropagation()">
                <div class="flex gap-2">
                  <button class="btn btn-primary btn-sm" onclick="loadSetDetail('${escapeHtml(entry.setId)}')">상세보기</button>
                  ${entry.htmlUrl ? `<button class="btn btn-secondary btn-sm" onclick="window.open('${escapeHtml(entry.htmlUrl)}','_blank')">🌐</button>` : ''}
                  <button class="btn btn-secondary btn-sm" onclick="loadInstagramForSet('${escapeHtml(entry.setId)}')">📱</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    container.innerHTML = `<div class="text-muted" style="color:var(--error)">이력 로드 실패: ${escapeHtml(err.message)}</div>`;
  }
}

async function openHistoryModal(setId) {
  try {
    const detail = await api.get(`/api/cardnews/sets/${setId}`);
    openModal(detail.imageUrls || [], 0);
  } catch (err) {
    console.error('모달 열기 실패:', err);
  }
}

function loadInstagramForSet(setId) {
  navigateTo('instagram');
  setTimeout(async () => {
    await loadInstagramSets();
    const sel = document.getElementById('ig-set-select');
    sel.value = setId;
    if (sel.value === setId) await loadInstagramDraft();
  }, 200);
}

/* ── Set Detail Page ───────────────────────────────────────────────────────── */
async function loadSetDetail(setId) {
  state.detailSetId = setId;
  navigateTo('detail');

  document.getElementById('detail-title').textContent = '불러오는 중...';
  document.getElementById('detail-setid').textContent = setId;
  document.getElementById('detail-meta-grid').innerHTML = '<div class="text-muted">로딩 중...</div>';
  document.getElementById('detail-image-grid').innerHTML = '';
  document.getElementById('detail-files-list').innerHTML = '';

  try {
    const detail = await api.get(`/api/cardnews/sets/${setId}`);
    renderSetDetail(detail);
  } catch (err) {
    document.getElementById('detail-title').textContent = '로드 실패';
    document.getElementById('detail-meta-grid').innerHTML = `<div style="color:var(--error)">${escapeHtml(err.message)}</div>`;
  }
}

function renderSetDetail(detail) {
  const deck = detail.deck || {};
  const meta = detail.webMeta || {};
  const report = detail.batchReport || {};

  // 제목
  document.getElementById('detail-title').textContent = deck.title || detail.setId;
  document.getElementById('detail-setid').textContent = detail.setId;

  // HTML 버튼
  const htmlBtn = document.getElementById('detail-html-btn');
  if (detail.htmlUrl) {
    htmlBtn.onclick = () => window.open(detail.htmlUrl, '_blank');
    htmlBtn.disabled = false;
  } else {
    htmlBtn.disabled = true;
  }

  // 인스타그램 버튼
  document.getElementById('detail-ig-btn').onclick = () => {
    state.detailSetId = detail.setId;
    loadInstagramForSet(detail.setId);
  };

  // 메타 그리드
  const imgSummary = report.imageSummary || {};
  const providerChips = Object.entries(imgSummary)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `<span class="provider-chip chip-${name}">${name}: ${count}장</span>`)
    .join('');

  const createdAt = meta.createdAt
    ? new Date(meta.createdAt).toLocaleString('ko-KR')
    : (detail.setId.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') || '—');

  const metaItems = [
    { label: '소스', value: `<span class="badge ${meta.source === 'kdca' ? 'badge-blue' : meta.source === 'custom-topic' ? 'badge-purple' : 'badge-gray'}">${meta.source || 'cli'}</span>` },
    { label: '생성일', value: escapeHtml(createdAt) },
    { label: 'Content ID', value: `<span class="mono">${escapeHtml(meta.contentId || '—')}</span>` },
    { label: '카드 수', value: `${detail.imageUrls?.length || detail.imagePaths?.length || (deck.cards?.length + 1) || 0}장` },
    { label: '이미지 공급자', value: providerChips || '—' },
    { label: '감사 상태', value: report.overallStatus ? `<span class="badge ${report.overallStatus === 'ok' ? 'badge-green' : 'badge-gray'}">${report.overallStatus}</span>` : '—' },
    { label: '패턴', value: escapeHtml(deck.pattern || '—') },
    { label: 'Deck ID', value: `<span class="mono">${escapeHtml(deck.id || '—')}</span>` },
  ];

  document.getElementById('detail-meta-grid').innerHTML = metaItems.map(item => `
    <div class="meta-item">
      <div class="meta-label">${item.label}</div>
      <div class="meta-value">${item.value}</div>
    </div>`).join('');

  // 이미지 목록을 state에 저장 (onclick 속성 안에 JSON 직렬화하지 않음)
  const imageUrls = detail.imageUrls || [];
  const imageFileNames = detail.imageFileNames || imageUrls.map((_, i) => `card-${String(i + 1).padStart(2, '0')}.png`);
  state.detailImages = imageUrls;
  document.getElementById('detail-img-count').textContent = `총 ${imageUrls.length}장`;

  // 편집기 초기화
  initEditor(detail.setId, detail.deck || null, imageUrls);

  if (!imageUrls.length) {
    document.getElementById('detail-image-grid').innerHTML = '<div class="text-muted">PNG 이미지가 없습니다.</div>';
  } else {
    document.getElementById('detail-image-grid').innerHTML = imageUrls.map((url, i) => `
      <div class="image-card-wrap">
        <div class="image-card" onclick="openModal(state.detailImages, ${i})">
          <img src="${escapeHtml(url)}" alt="카드 ${i + 1}" loading="lazy" />
          <div class="image-label">카드 ${i + 1}</div>
        </div>
        <div class="image-actions">
          <a href="${escapeHtml(url)}" download="${escapeHtml(imageFileNames[i] || `card-${i + 1}.png`)}" class="btn btn-secondary btn-sm">⬇ 저장</a>
          <button class="btn btn-secondary btn-sm" onclick="openModal(state.detailImages, ${i})">🔍</button>
        </div>
      </div>`).join('');
  }

  // 파일 목록
  const files = [];
  if (detail.htmlUrl) {
    files.push({ icon: '🌐', name: 'HTML 카드뉴스', path: detail.htmlUrl, action: `<button class="btn btn-secondary btn-sm" onclick="window.open('${escapeHtml(detail.htmlUrl)}','_blank')">열기</button>` });
  }
  if (detail.hasDeck) {
    files.push({ icon: '📋', name: 'deck.json', path: `output/${detail.setId}/deck.json`, action: '' });
  }
  if (detail.hasBatchReport) {
    files.push({ icon: '📊', name: 'batch-report.json', path: `output/${detail.setId}/batch-report.json`, action: '' });
  }
  if (detail.hasPrompts) {
    files.push({ icon: '🔍', name: 'prompts.json', path: `output/${detail.setId}/debug/prompts.json`, action: '' });
  }
  imageUrls.forEach((url, i) => {
    const fname = imageFileNames[i] || `card-${i + 1}.png`;
    files.push({ icon: '🖼', name: fname, path: url, action: `<a href="${escapeHtml(url)}" download="${escapeHtml(fname)}" class="btn btn-secondary btn-sm">⬇</a>` });
  });

  document.getElementById('detail-files-list').innerHTML = files.map(f => `
    <div class="file-item">
      <div class="file-icon">${f.icon}</div>
      <div class="file-info">
        <div class="file-name">${escapeHtml(f.name)}</div>
        <div class="file-path">${escapeHtml(f.path)}</div>
      </div>
      <div class="file-actions">${f.action}</div>
    </div>`).join('');
}

function openDetailHtml() {
  const btn = document.getElementById('detail-html-btn');
  if (btn && !btn.disabled) btn.click();
}

function goDetailInstagram() {
  if (state.detailSetId) loadInstagramForSet(state.detailSetId);
}

function downloadDetailZip() {
  alert('ZIP 다운로드는 추후 구현됩니다.');
}

/* ── Instagram Page ────────────────────────────────────────────────────────── */

/** Instagram 게시 가능 여부를 백엔드에 조회해 UI를 게이팅 */
async function loadInstagramConfig() {
  const banner = document.getElementById('ig-config-banner');
  const title = document.getElementById('ig-config-title');
  const message = document.getElementById('ig-config-message');
  const uploadBtn = document.getElementById('ig-upload-btn');
  const blocked = document.getElementById('ig-upload-blocked');
  const blockedMsg = document.getElementById('ig-upload-blocked-message');
  const hint = document.getElementById('ig-upload-hint');

  try {
    const cfg = await api.get('/api/instagram/config');
    state.igConfig = cfg;

    if (cfg.canPublish) {
      banner.className = 'ig-config-banner ig-config-banner--ok';
      banner.querySelector('.ig-config-icon').textContent = '✅';
      title.textContent = `Instagram 게시 준비 완료 (Graph API ${cfg.apiVersion})`;
      message.textContent =
        `공개 저장소: ${cfg.publicAsset.provider} · 토큰/계정 설정 확인 완료`;
      uploadBtn.disabled = (state.igSelectedImages?.size ?? 0) === 0;
      blocked.classList.add('hidden');
      hint.textContent = 'Carousel(2~10장) 자동 업로드';
    } else {
      banner.className = 'ig-config-banner ig-config-banner--blocked';
      banner.querySelector('.ig-config-icon').textContent = '⚠️';
      title.textContent = '공개 이미지 저장소 설정이 필요합니다';
      message.textContent = cfg.hint || '환경변수를 설정한 뒤 서버를 재시작하세요.';
      uploadBtn.disabled = true;
      blocked.classList.remove('hidden');
      blockedMsg.innerHTML =
        '<div>다음 항목을 <code>.env</code>에 설정한 뒤 서버를 재시작하세요:</div>' +
        '<ul style="margin:6px 0 0 18px">' +
        (cfg.missing || []).map(m => `<li><code>${escapeHtml(m)}</code></li>`).join('') +
        '</ul>';
      hint.textContent = '설정 미완료 — 게시 비활성화';
    }
  } catch (err) {
    banner.className = 'ig-config-banner ig-config-banner--blocked';
    banner.querySelector('.ig-config-icon').textContent = '⚠️';
    title.textContent = '설정 확인 실패';
    message.textContent = err.message || String(err);
    uploadBtn.disabled = true;
  }
}

/** 사이드바에서 메뉴 진입 시 세트 목록 로드 */
async function loadInstagramSets() {
  try {
    const history = await api.get('/api/cardnews/history');
    const sel = document.getElementById('ig-set-select');
    const current = sel.value;
    sel.innerHTML = '<option value="">-- 세트를 선택하세요 --</option>' +
      history.map(e => {
        const dateStr = e.createdAt
          ? new Date(e.createdAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
          : '';
        const label = `${dateStr ? '[' + dateStr + '] ' : ''}${e.title || e.setId} (${e.cardCount}장)`;
        return `<option value="${escapeHtml(e.setId)}">${escapeHtml(label)}</option>`;
      }).join('');
    if (current) sel.value = current;
  } catch (err) {
    console.error('Failed to load sets:', err);
  }
}

/** 드롭다운 선택 변경 시 — 자동 캡션 생성하지는 않고, 사용자가 명시적으로 버튼 누르도록 */
function onIgSetChange() {
  const setId = document.getElementById('ig-set-select').value;
  if (!setId) {
    document.getElementById('ig-draft-section').classList.add('hidden');
  }
}

/** "선택 · 캡션 자동 생성" 버튼 — 캡션 + 이미지 그리드 로드, card-01부터 전체 선택 */
async function loadInstagramDraft() {
  const setId = document.getElementById('ig-set-select').value;
  if (!setId) { alert('세트를 먼저 선택하세요.'); return; }

  const btn = document.getElementById('ig-load-btn');
  btn.disabled = true;
  btn.textContent = '⏳ 캡션 생성 중...';

  try {
    const draft = await api.post('/api/instagram/draft', { setId });

    // 상태 저장 (card-01부터 순서대로 모두 선택)
    state.igCurrentSetId = draft.setId;
    state.igCurrentTitle = draft.title || draft.setId;
    state.igAllImages = draft.imagePaths || [];
    state.igSelectedImages = new Set(state.igAllImages);

    // 제목/setId 표시
    document.getElementById('ig-set-title').textContent = state.igCurrentTitle;
    document.getElementById('ig-set-id').textContent = state.igCurrentSetId;

    // 캡션 채우기
    document.getElementById('ig-caption').value = draft.caption || '';

    // 이미지 그리드 렌더링
    renderIgImageGrid();

    // 업로드 로그 초기화
    const logEl = document.getElementById('ig-upload-log');
    logEl.classList.add('hidden');
    logEl.innerHTML = '';

    document.getElementById('ig-draft-section').classList.remove('hidden');
    document.getElementById('ig-draft-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    alert('캡션 생성 실패: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ 선택 · 캡션 자동 생성';
  }
}

function renderIgImageGrid() {
  const grid = document.getElementById('ig-image-grid');
  if (!state.igAllImages.length) {
    grid.innerHTML = '<div class="text-muted">이미지를 찾을 수 없습니다.</div>';
    updateIgCount();
    return;
  }

  grid.innerHTML = state.igAllImages.map((p, i) => {
    const url = p.startsWith('/') ? p : '/' + p;
    const selected = state.igSelectedImages.has(p);
    const label = i === 0 ? '표지' : `카드 ${i}`;
    return `
      <div class="image-card ig-image-card ${selected ? 'selected' : ''}"
           data-path="${escapeHtml(p)}"
           onclick="toggleIgImage(this, '${escapeHtml(p)}')">
        <div class="ig-check">
          <span class="ig-check-box">✓</span>
        </div>
        <div class="ig-order">${i + 1}</div>
        <img src="${escapeHtml(url)}" alt="${label}" loading="lazy" />
        <div class="image-label">${label}</div>
      </div>`;
  }).join('');
  updateIgCount();
}

function toggleIgImage(el, path) {
  if (state.igSelectedImages.has(path)) {
    state.igSelectedImages.delete(path);
    el.classList.remove('selected');
  } else {
    state.igSelectedImages.add(path);
    el.classList.add('selected');
  }
  updateIgCount();
}

function updateIgCount() {
  const total = state.igAllImages.length;
  const selected = state.igSelectedImages.size;
  const badge = document.getElementById('ig-image-count-badge');
  if (badge) badge.textContent = `${selected}/${total}장 선택`;
  const uploadBtn = document.getElementById('ig-upload-btn');
  if (uploadBtn) {
    // config가 canPublish=false면 무조건 비활성, 그 외에는 선택장수가 1 이상일 때 활성
    const canPublish = state.igConfig?.canPublish === true;
    uploadBtn.disabled = !canPublish || selected === 0;
  }
}

function igSelectAll() {
  state.igSelectedImages = new Set(state.igAllImages);
  document.querySelectorAll('.ig-image-card').forEach(el => el.classList.add('selected'));
  updateIgCount();
}

function igDeselectAll() {
  state.igSelectedImages = new Set();
  document.querySelectorAll('.ig-image-card').forEach(el => el.classList.remove('selected'));
  updateIgCount();
}

/** card-01.png부터 순서대로 전체 선택을 다시 적용 */
function igSelectInOrder() {
  igSelectAll();
}

/** 캡션 다시 생성 — 사용자가 textarea를 직접 수정한 경우 되돌리기용 */
async function regenerateCaption() {
  const setId = state.igCurrentSetId || document.getElementById('ig-set-select').value;
  if (!setId) { alert('세트를 먼저 선택하세요.'); return; }

  const captionEl = document.getElementById('ig-caption');
  const previous = captionEl.value;
  if (previous && previous.trim()) {
    const ok = confirm('현재 캡션 내용이 사라집니다. 다시 생성할까요?');
    if (!ok) return;
  }

  try {
    const draft = await api.post('/api/instagram/draft', { setId });
    captionEl.value = draft.caption || '';
  } catch (err) {
    alert('캡션 다시 생성 실패: ' + err.message);
  }
}

async function uploadInstagram() {
  const setId = state.igCurrentSetId || document.getElementById('ig-set-select').value;
  const caption = document.getElementById('ig-caption').value;
  // 원래 순서 유지 — Set 순회 순서가 아니라 igAllImages 순서로 필터
  const imagePaths = state.igAllImages.filter(p => state.igSelectedImages.has(p));

  if (!setId) { alert('세트를 선택하세요.'); return; }
  if (!caption.trim()) { alert('캡션을 입력하세요.'); return; }
  if (!imagePaths.length) { alert('이미지를 1장 이상 선택하세요.'); return; }
  if (imagePaths.length < 2 || imagePaths.length > 10) {
    alert(`Carousel은 2~10장만 허용됩니다 (현재 ${imagePaths.length}장).`);
    return;
  }

  const logEl = document.getElementById('ig-upload-log');
  const resultEl = document.getElementById('ig-upload-result');
  const uploadBtn = document.getElementById('ig-upload-btn');
  const spinner = document.getElementById('ig-upload-btn-spinner');
  const btnLabel = document.getElementById('ig-upload-btn-label');

  // 로딩 상태
  resultEl.classList.add('hidden');
  resultEl.innerHTML = '';
  logEl.classList.remove('hidden');
  logEl.innerHTML = '<div class="log-line info">[업로드] Instagram Graph API 호출 중...</div>';
  uploadBtn.disabled = true;
  spinner.classList.remove('hidden');
  btnLabel.textContent = '게시 중...';

  let res = null;
  let httpError = null;
  try {
    res = await api.post('/api/instagram/upload', { setId, caption, imagePaths });
  } catch (err) {
    httpError = err;
  } finally {
    spinner.classList.add('hidden');
    btnLabel.textContent = '📤 Instagram에 게시';
    // 게이팅 — 다시 활성화
    updateIgCount();
  }

  // 결과 렌더링
  if (res && res.status === 'published') {
    renderIgUploadResult({ kind: 'success', payload: res });
    appendIgLogLines(logEl, [
      `[업로드 성공] status=${res.status}`,
      `[업로드 성공] media_id=${res.mediaId}`,
      `[업로드 성공] container_id=${res.containerId}`,
      `[업로드 성공] 이미지 ${res.imageCount}장`,
    ]);
    return;
  }

  // 실패 경로
  const failPayload = res || (httpError && extractErrorPayload(httpError)) || {
    status: 'failed',
    error: httpError?.message || '알 수 없는 오류',
  };
  renderIgUploadResult({ kind: 'failed', payload: failPayload });
  appendIgLogLines(logEl, [
    `[업로드 실패] status=${failPayload.status ?? 'failed'}`,
    failPayload.failedStep ? `[업로드 실패] step=${failPayload.failedStep}` : null,
    `[업로드 실패] error=${failPayload.error ?? '메시지 없음'}`,
  ].filter(Boolean));
}

/** api.post가 throw한 Error에서 백엔드의 JSON payload를 복원 */
function extractErrorPayload(err) {
  // api.post는 res.json().error만 throw 메시지로 사용하므로 message만 활용
  return { status: 'failed', error: err.message };
}

function appendIgLogLines(logEl, lines) {
  const html = lines.map(l => {
    const cls = l.includes('실패') ? 'error' : l.includes('성공') ? 'info' : '';
    return `<div class="log-line ${cls}">${escapeHtml(l)}</div>`;
  }).join('');
  logEl.innerHTML = html;
}

function renderIgUploadResult({ kind, payload }) {
  const el = document.getElementById('ig-upload-result');
  el.classList.remove('hidden');

  if (kind === 'success') {
    const stepsHtml = (payload.steps || []).map(s => {
      const ok = s.ok ? '✓' : '✕';
      return `<div class="row"><div class="label">${escapeHtml(s.step)}</div><div class="value">${ok} ${escapeHtml(s.message || '')}</div></div>`;
    }).join('');
    el.innerHTML = `
      <div class="ig-upload-result-card success">
        <div class="alert-success" style="margin-bottom:10px">
          <strong>✅ Instagram 게시 성공</strong>
        </div>
        <div class="row"><div class="label">status</div><div class="value">${escapeHtml(payload.status)}</div></div>
        <div class="row"><div class="label">media_id</div><div class="value">${escapeHtml(payload.mediaId || '')}</div></div>
        <div class="row"><div class="label">container_id</div><div class="value">${escapeHtml(payload.containerId || '')}</div></div>
        <div class="row"><div class="label">이미지 수</div><div class="value">${payload.imageCount}장</div></div>
        ${stepsHtml ? `<details style="margin-top:8px"><summary>단계별 상세</summary>${stepsHtml}</details>` : ''}
      </div>`;
    return;
  }

  // failed
  const stepsHtml = (payload.steps || []).map(s => {
    const ok = s.ok ? '✓' : '✕';
    return `<div class="row"><div class="label">${escapeHtml(s.step)}</div><div class="value">${ok} ${escapeHtml(s.message || '')}</div></div>`;
  }).join('');
  el.innerHTML = `
    <div class="ig-upload-result-card failed">
      <div class="alert-error" style="margin-bottom:10px">
        <strong>❌ Instagram 게시 실패</strong>
        <div class="text-sm mt-1">${escapeHtml(payload.error || '알 수 없는 오류')}</div>
      </div>
      ${payload.failedStep ? `<div class="row"><div class="label">실패 단계</div><div class="value">${escapeHtml(payload.failedStep)}</div></div>` : ''}
      ${payload.setId ? `<div class="row"><div class="label">setId</div><div class="value">${escapeHtml(payload.setId)}</div></div>` : ''}
      ${stepsHtml ? `<details style="margin-top:8px" open><summary>단계별 상세</summary>${stepsHtml}</details>` : ''}
    </div>`;
}

/* ── Util ──────────────────────────────────────────────────────────────────── */
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── CSS: spinner + image-grid gap ────────────────────────────────────────── */
const extraStyle = document.createElement('style');
extraStyle.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  .image-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
`;
document.head.appendChild(extraStyle);

/* ── Card Editor ───────────────────────────────────────────────────────────── */

function initEditor(setId, deck, imageUrls) {
  state.editingSetId = setId;
  state.currentDeck = deck;
  state.editingCardIndex = 0;

  const noDecEl = document.getElementById('editor-no-deck');
  const containerEl = document.getElementById('editor-container');
  const actionsEl = document.getElementById('rebuild-actions');

  if (!deck) {
    noDecEl.classList.remove('hidden');
    containerEl.classList.add('hidden');
    actionsEl.classList.add('hidden');
    return;
  }

  noDecEl.classList.add('hidden');
  containerEl.classList.remove('hidden');
  actionsEl.classList.remove('hidden');

  renderEditorStrip(imageUrls);
  selectEditorCard(0);
}

function renderEditorStrip(imageUrls) {
  const strip = document.getElementById('editor-strip');
  const totalCards = state.currentDeck
    ? state.currentDeck.cards.length + 1
    : imageUrls.length;

  let html = '';
  for (let i = 0; i < totalCards; i++) {
    const url = imageUrls[i];
    const label = i === 0 ? '표지' : `카드 ${i}`;
    html += `
      <div class="editor-thumb ${i === 0 ? 'active' : ''}" id="editor-thumb-${i}" onclick="selectEditorCard(${i})">
        ${url
          ? `<img src="${escapeHtml(url)}" alt="${label}" />`
          : `<div class="editor-thumb-placeholder text-muted text-sm">${label}</div>`}
      </div>`;
  }
  strip.innerHTML = html;
}

function selectEditorCard(index) {
  state.editingCardIndex = index;

  document.querySelectorAll('.editor-thumb').forEach((el, i) => {
    el.classList.toggle('active', i === index);
  });

  renderEditorForm(index);
}

function renderEditorForm(index) {
  const panel = document.getElementById('editor-panel');
  const deck = state.currentDeck;
  if (!deck) { panel.innerHTML = '<div class="text-muted text-sm">deck.json 없음</div>'; return; }

  let fieldsHtml = '';

  if (index === 0) {
    // 표지 카드
    const titleLines = (deck.cover?.titleLines || []).join('\n');
    const subtitle = deck.cover?.subtitle || '';
    fieldsHtml = `
      <div class="editor-field">
        <label>제목 (줄바꿈으로 구분)</label>
        <textarea id="ef-titleLines" rows="3" class="form-control">${escapeHtml(titleLines)}</textarea>
      </div>
      <div class="editor-field mt-3">
        <label>부제</label>
        <input id="ef-subtitle" type="text" class="form-control" value="${escapeHtml(subtitle)}" />
      </div>`;
  } else {
    const card = deck.cards[index - 1] || {};
    const highlights = (card.highlights || []).join('\n');
    fieldsHtml = `
      <div class="editor-field">
        <label>제목</label>
        <input id="ef-title" type="text" class="form-control" value="${escapeHtml(card.title || '')}" />
      </div>
      <div class="editor-field mt-3">
        <label>부제</label>
        <input id="ef-subtitle" type="text" class="form-control" value="${escapeHtml(card.subtitle || '')}" />
      </div>
      <div class="editor-field mt-3">
        <label>인트로</label>
        <input id="ef-intro" type="text" class="form-control" value="${escapeHtml(card.intro || '')}" />
      </div>
      <div class="editor-field mt-3">
        <label>하이라이트 (줄바꿈으로 구분)</label>
        <textarea id="ef-highlights" rows="4" class="form-control">${escapeHtml(highlights)}</textarea>
      </div>
      <div class="editor-field mt-3">
        <label>아웃트로</label>
        <input id="ef-outro" type="text" class="form-control" value="${escapeHtml(card.outro || '')}" />
      </div>`;
  }

  const label = index === 0 ? '표지' : `카드 ${index}`;
  panel.innerHTML = `
    <div class="text-sm text-muted mb-3" style="font-weight:600">${label} 편집</div>
    ${fieldsHtml}
    <div class="editor-actions">
      <button class="btn btn-primary btn-sm" onclick="saveCard()">💾 저장</button>
      <button class="btn btn-success btn-sm" onclick="saveAndRebuild()">🔨 저장 + 재빌드</button>
    </div>`;
}

function getFormValues(index) {
  const patch = {};
  if (index === 0) {
    const titleLinesEl = document.getElementById('ef-titleLines');
    const subtitleEl = document.getElementById('ef-subtitle');
    if (titleLinesEl) patch.titleLines = titleLinesEl.value.split('\n').filter(l => l.trim());
    if (subtitleEl) patch.subtitle = subtitleEl.value;
  } else {
    const titleEl = document.getElementById('ef-title');
    const subtitleEl = document.getElementById('ef-subtitle');
    const introEl = document.getElementById('ef-intro');
    const highlightsEl = document.getElementById('ef-highlights');
    const outroEl = document.getElementById('ef-outro');
    if (titleEl) patch.title = titleEl.value;
    if (subtitleEl) patch.subtitle = subtitleEl.value;
    if (introEl) patch.intro = introEl.value;
    if (highlightsEl) patch.highlights = highlightsEl.value.split('\n').filter(l => l.trim());
    if (outroEl) patch.outro = outroEl.value;
  }
  return patch;
}

async function saveCard() {
  const setId = state.editingSetId;
  const index = state.editingCardIndex;
  if (!setId || state.currentDeck === null) return;

  const patch = getFormValues(index);
  try {
    const res = await api.patch(`/api/cardnews/sets/${setId}/cards/${index}`, patch);
    state.currentDeck = res.deck;
    showRebuildStatus('success', '✅ 저장 완료');
  } catch (err) {
    showRebuildStatus('failed', '❌ 저장 실패: ' + err.message);
  }
}

async function saveAndRebuild() {
  await saveCard();
  const statusEl = document.getElementById('rebuild-status');
  if (statusEl && statusEl.classList.contains('failed')) return;
  await rebuildSet();
}

async function rebuildSet() {
  const setId = state.editingSetId;
  if (!setId) return;
  showRebuildStatus('running', '🔨 재빌드 중...');
  try {
    const res = await api.post(`/api/cardnews/sets/${setId}/rebuild`, {});
    const ts = Date.now();
    const bust = (url) => url + '?t=' + ts;
    const newUrls = (res.imageUrls || []).map(bust);
    refreshDetailImages(newUrls);
    // HTML 버튼 URL 갱신
    if (res.htmlUrl) {
      const btn = document.getElementById('detail-html-btn');
      if (btn) btn.onclick = () => window.open(res.htmlUrl, '_blank');
    }
    showRebuildStatus('success', '✅ 재빌드 완료 (' + (res.imageUrls || []).length + '장)');
  } catch (err) {
    showRebuildStatus('failed', '❌ 재빌드 실패: ' + err.message);
  }
}

async function rerenderOnly() {
  const setId = state.editingSetId;
  if (!setId) return;
  showRebuildStatus('running', '🔄 HTML 재생성 중...');
  try {
    const res = await api.post(`/api/cardnews/sets/${setId}/rerender`, {});
    if (res.htmlUrl) {
      const btn = document.getElementById('detail-html-btn');
      if (btn) btn.onclick = () => window.open(res.htmlUrl, '_blank');
    }
    showRebuildStatus('success', '✅ HTML 재생성 완료');
  } catch (err) {
    showRebuildStatus('failed', '❌ HTML 재생성 실패: ' + err.message);
  }
}

async function recaptureOnly() {
  const setId = state.editingSetId;
  if (!setId) return;
  showRebuildStatus('running', '📸 PNG 재캡처 중...');
  try {
    const res = await api.post(`/api/cardnews/sets/${setId}/recapture`, {});
    const ts = Date.now();
    const newUrls = (res.imageUrls || []).map(url => url + '?t=' + ts);
    refreshDetailImages(newUrls);
    showRebuildStatus('success', '✅ PNG 재캡처 완료 (' + newUrls.length + '장)');
  } catch (err) {
    showRebuildStatus('failed', '❌ PNG 재캡처 실패: ' + err.message);
  }
}

function refreshDetailImages(imageUrls) {
  state.detailImages = imageUrls;
  document.getElementById('detail-img-count').textContent = `총 ${imageUrls.length}장`;

  // 이미지 그리드 갱신
  const grid = document.getElementById('detail-image-grid');
  if (!imageUrls.length) {
    grid.innerHTML = '<div class="text-muted">PNG 이미지가 없습니다.</div>';
  } else {
    grid.innerHTML = imageUrls.map((url, i) => `
      <div class="image-card-wrap">
        <div class="image-card" onclick="openModal(state.detailImages, ${i})">
          <img src="${escapeHtml(url)}" alt="카드 ${i + 1}" loading="lazy" />
          <div class="image-label">카드 ${i + 1}</div>
        </div>
        <div class="image-actions">
          <a href="${escapeHtml(url)}" download class="btn btn-secondary btn-sm">⬇ 저장</a>
          <button class="btn btn-secondary btn-sm" onclick="openModal(state.detailImages, ${i})">🔍</button>
        </div>
      </div>`).join('');
  }

  // 에디터 썸네일 갱신
  imageUrls.forEach((url, i) => {
    const thumb = document.getElementById(`editor-thumb-${i}`);
    if (thumb) {
      const img = thumb.querySelector('img');
      if (img) img.src = url;
    }
  });
}

function showRebuildStatus(type, message) {
  const el = document.getElementById('rebuild-status');
  if (!el) return;
  el.className = `rebuild-status ${type}`;
  el.textContent = message;
  el.classList.remove('hidden');
  if (type === 'success') {
    setTimeout(() => { el.style.animation = 'fadeOut 1s forwards'; }, 2000);
    setTimeout(() => { el.classList.add('hidden'); el.style.animation = ''; }, 3000);
  }
}

/* ── Init ──────────────────────────────────────────────────────────────────── */
navigateTo('health');
