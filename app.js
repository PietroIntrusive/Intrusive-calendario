/* ════════════════════════════════════════════════════════════════════════
   INTRUSIVE — COMMAND CENTER
   app.js — toda a lógica do command center

   SEÇÕES:
     1.  CONFIG (Supabase)
     2.  ESTADO global
     3.  CONSTANTES (data, fases, meses)
     4.  LOGIN
     5.  DADOS (carregar do banco)
     6.  ROLLOVER (mover pendentes)
     7.  TOAST do rollover
     8.  REALTIME (subscriptions)
     9.  CALENDÁRIO
     10. OVERLAY DO DIA (abrir/fechar)
     11. PROGRESSO DO DIA
     12. TAREFAS — render + criar + alternar + excluir
     13. NOVA TAREFA inline (substitui o prompt)
     14. EDIÇÃO de tarefa inline
     15. PRESENÇA do time
     16. ACTIVITY LOG (sidebar)
     17. RANKING — tracker + push + render
     18. UTILS (escape HTML, etc)
   ════════════════════════════════════════════════════════════════════════ */


/* ── 1. CONFIG ──────────────────────────────────────────────────────────── */
const SB_URL = 'https://xebtpqjcpeatxkxmijgw.supabase.co';
const SB_KEY = 'sb_publishable_CxfVXlt7AwSAOQHDkRAS4Q_QmGM0H3z';

// O CDN do supabase-js define window.supabase globalmente.
// Por isso usamos "db" em vez de "supabase" para evitar conflito de nome.
const db = window.supabase.createClient(SB_URL, SB_KEY);


/* ── 2. ESTADO ──────────────────────────────────────────────────────────── */
let user       = { name: '', photo: '' };
let currentDay = '';
let actLog     = [];
let cache      = { tasks: [], presence: [], doneDays: [], notes: [] };
let toastTimer = null;

// estado da edição inline de tarefas
let editingTaskId = null;

// estado do session tracker (ranking)
let sessionDeltaSec   = 0;     // segundos acumulados desde o último push ao banco
let pendingTaskDelta  = 0;     // tarefas concluídas desde o último push (pode ser negativo)
let myStats           = { time: 0, tasks: 0 };
let rankingEnabled    = true;  // desligado automaticamente se a tabela não existir

// estado do bloco de notas / chat colaborativo
let notesEnabled      = true;  // desligado automaticamente se a tabela não existir


/* ── 3. CONSTANTES ──────────────────────────────────────────────────────── */

// data de hoje, dinâmica (NUNCA hardcode aqui)
const TODAY = new Date().toISOString().split('T')[0];

// fases do projeto
const PHASES = {
    1: { name: 'FUNDAÇÃO',       color: '#1D9E75', s: '2026-05-12', e: '2026-05-25' },
    2: { name: 'IDENTIDADE',     color: '#378ADD', s: '2026-05-26', e: '2026-06-08' },
    3: { name: 'PRODUÇÃO',       color: '#BA7517', s: '2026-06-09', e: '2026-06-22' },
    4: { name: 'PRÉ-LANÇAMENTO', color: '#A32D2D', s: '2026-06-23', e: '2026-07-07' },
    5: { name: 'LANÇAMENTO',     color: '#1D9E75', s: '2026-07-08', e: '2026-07-12' },
};
function getPhase(ds) {
    for (const [n, p] of Object.entries(PHASES))
        if (ds >= p.s && ds <= p.e) return { num: parseInt(n), ...p };
    return null;
}

// meses exibidos no grid + nomes dos dias da semana
const MONTHS = [
    { y: 2026, m: 4, n: 'MAIO'  },
    { y: 2026, m: 5, n: 'JUNHO' },
    { y: 2026, m: 6, n: 'JULHO' },
];
const WDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

// data-alvo do countdown = última data do calendário (fim do LANÇAMENTO)
// Pegamos automaticamente o maior `e` (end) dentro de PHASES — assim, quando
// você expandir o projeto adicionando novas fases, o countdown se ajusta sozinho.
const PROJECT_END = Object.values(PHASES)
    .reduce((max, p) => p.e > max ? p.e : max, '0000-00-00');
const COUNTDOWN_TARGET = new Date(PROJECT_END + 'T23:59:59');

function inRange(ds) { return ds >= '2026-05-12' && ds <= '2026-07-12'; }
function isPast(ds)  { return ds < TODAY; }
function dStr(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}


/* ── 4. LOGIN ───────────────────────────────────────────────────────────── */
async function initCommandCenter() {
    const name = document.getElementById('userName').value.trim();
    if (!name) {
        document.getElementById('loginError').textContent = 'DIGITE SEU NOME PARA ENTRAR.';
        return;
    }
    user.name  = name;
    user.photo = document.getElementById('userAvatar').value.trim() ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=e63022&color=fff&bold=true`;

    const overlay = document.getElementById('loginOverlay');
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.style.display = 'none', 400);

    setSyncStatus(false);
    await loadData();

    // move tarefas pendentes de dias anteriores para hoje
    await rolloverTasks();

    renderCalendar();
    subscribeRealtime();
    heartbeat();
    setInterval(heartbeat, 20000);

    // inicia o ranking (tracker de tempo e tarefas)
    initSessionTracker();

    // inicia o countdown até a última data do projeto
    startCountdown();

    // carrega o bloco de notas / chat colaborativo
    await loadNotes();
    renderNotepadPreview();
}

// permite enviar com Enter no campo de nome
document.getElementById('userName').addEventListener('keydown', e => {
    if (e.key === 'Enter') initCommandCenter();
});


/* ── 5. DADOS ───────────────────────────────────────────────────────────── */
async function loadData() {
    try {
        const [{ data: t, error: te }, { data: p }, { data: d }] = await Promise.all([
            db.from('tasks').select('*').order('created_at', { ascending: true }),
            db.from('team_presence').select('*'),
            db.from('done_days').select('date_id'),
        ]);
        if (te) throw te;
        cache.tasks    = t || [];
        cache.presence = p || [];
        cache.doneDays = (d || []).map(r => r.date_id);
        updatePresenceBar();
        setSyncStatus(true);
    } catch (err) {
        setSyncStatus(false);
        console.error('[INTRUSIVE] Supabase error:', err);
    }
}


/* ── 6. ROLLOVER ────────────────────────────────────────────────────────── */
// Verifica se há tarefas pendentes de dias anteriores.
// Se houver, move todas para hoje e exibe um aviso na tela.
async function rolloverTasks() {
    const pendingTasks = cache.tasks.filter(t => t.date_id < TODAY && !t.is_done);
    if (pendingTasks.length === 0) return;

    const daysAffected = [...new Set(pendingTasks.map(t => t.date_id))].length;

    const { error } = await db
        .from('tasks')
        .update({ date_id: TODAY })
        .eq('is_done', false)
        .lt('date_id', TODAY);

    if (error) {
        console.error('[INTRUSIVE] Erro no rollover:', error);
        return;
    }

    await loadData();
    addLog(`${pendingTasks.length} tarefa(s) pendente(s) movida(s) para hoje`);
    showRolloverToast(pendingTasks, daysAffected);
}


/* ── 7. ROLLOVER TOAST ──────────────────────────────────────────────────── */
function showRolloverToast(tasks, daysCount) {
    const toast    = document.getElementById('rolloverToast');
    const subtitle = document.getElementById('toastSubtitle');
    const taskList = document.getElementById('toastTaskList');
    const progress = document.getElementById('toastProgress');

    subtitle.textContent =
        `${tasks.length} TAREFA${tasks.length > 1 ? 'S' : ''} DE ` +
        `${daysCount} DIA${daysCount > 1 ? 'S' : ''} ANTERIOR${daysCount > 1 ? 'ES' : ''} → HOJE`;

    const shown = tasks.slice(0, 5);
    const extra = tasks.length - shown.length;
    taskList.innerHTML = shown.map(t =>
        `<div><span>›</span>${escHtml(t.task_text)}</div>`
    ).join('') + (extra > 0 ? `<div style="color:var(--gray); margin-top:4px;">+ ${extra} mais...</div>` : '');

    // reinicia a animação da barra de progresso
    progress.style.animation = 'none';
    progress.offsetHeight; // força reflow
    progress.style.animation = '';

    toast.classList.add('show');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(dismissToast, 8000);
}

function dismissToast() {
    document.getElementById('rolloverToast').classList.remove('show');
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
}


/* ── 8. REALTIME ────────────────────────────────────────────────────────── */
function subscribeRealtime() {
    db.channel('intrusive-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, payload => {
            const row = payload.new || payload.old;
            if (payload.eventType === 'INSERT') {
                if (!cache.tasks.find(t => t.id === row.id)) cache.tasks.push(row);
                if (row.created_by !== user.name) addLog(`${row.created_by} adicionou tarefa em ${row.date_id}`);
            } else if (payload.eventType === 'UPDATE') {
                cache.tasks = cache.tasks.map(t => t.id === row.id ? row : t);
            } else if (payload.eventType === 'DELETE') {
                cache.tasks = cache.tasks.filter(t => t.id !== row.id);
            }
            if (currentDay && currentDay === row?.date_id) renderTasks();
            renderCalendar();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'team_presence' }, payload => {
            const row = payload.new;
            const idx = cache.presence.findIndex(p => p.user_name === row?.user_name);
            if (idx >= 0) cache.presence[idx] = row; else if (row) cache.presence.push(row);
            updatePresenceBar();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'done_days' }, payload => {
            if (payload.eventType === 'INSERT') {
                const ds = payload.new.date_id;
                if (!cache.doneDays.includes(ds)) {
                    cache.doneDays.push(ds);
                    if (payload.new.marked_by !== user.name) addLog(`${payload.new.marked_by} concluiu o dia ${ds}`);
                }
            } else if (payload.eventType === 'DELETE') {
                cache.doneDays = cache.doneDays.filter(d => d !== payload.old.date_id);
            }
            renderCalendar();
            if (currentDay) updateDayDoneBtn();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'team_notes' }, payload => {
            const row = payload.new || payload.old;
            if (payload.eventType === 'INSERT') {
                if (!cache.notes.find(n => n.id === row.id)) {
                    cache.notes.push(row);
                    if (row.user_name !== user.name) {
                        addLog(`${row.user_name} enviou uma nota`);
                    }
                }
            } else if (payload.eventType === 'DELETE') {
                cache.notes = cache.notes.filter(n => n.id !== row.id);
            } else if (payload.eventType === 'UPDATE') {
                cache.notes = cache.notes.map(n => n.id === row.id ? row : n);
            }
            renderNotepadPreview();
            if (document.getElementById('notepadOverlay').classList.contains('show')) {
                renderNotepadMessages();
            }
        })
        .subscribe();
}


/* ── 9. CALENDÁRIO ──────────────────────────────────────────────────────── */
function renderCalendar() {
    const area = document.getElementById('calendarArea');
    area.innerHTML = '';
    MONTHS.forEach(({ y, m, n }) => {
        const firstDay = new Date(y, m, 1).getDay();
        const lastDay  = new Date(y, m + 1, 0).getDate();
        let html = `<div class="month-section">
            <div class="month-header">${n.slice(0,-1)}<span>${n.slice(-1)}</span> ${y}</div>
            <div class="weekdays-row">${WDAYS.map(w=>`<div class="weekday-lbl">${w}</div>`).join('')}</div>
            <div class="days-grid">`;

        for (let i = 0; i < firstDay; i++) html += '<div class="day-cell cell-empty"></div>';

        for (let d = 1; d <= lastDay; d++) {
            const ds       = dStr(y, m, d);
            const ir       = inRange(ds);
            const ph       = getPhase(ds);
            const done     = cache.doneDays.includes(ds);
            const today    = ds === TODAY;
            const past     = isPast(ds);
            const dayTasks = cache.tasks.filter(t => t.date_id === ds);
            const tCnt     = dayTasks.length;
            const hasOpen  = dayTasks.some(t => !t.is_done);

            if (!ir) {
                html += `<div class="day-cell cell-outrange"><div class="cell-num">${d}</div></div>`;
                continue;
            }

            let cls = 'day-cell';
            if (done) {
                cls += ' cell-done';
            } else if (today) {
                cls += ' cell-today';
            } else if (past && hasOpen) {
                cls += ' cell-incomplete';
            } else if (past) {
                cls += ' cell-past';
            }

            const phColor = ph ? ph.color : 'transparent';
            html += `<div class="${cls}" onclick="openDay('${ds}')">
                ${tCnt > 0 ? `<div class="cell-badge">${tCnt}</div>` : ''}
                <div class="cell-num">${d}</div>
                <div class="phase-bar" style="background:${phColor}"></div>
                ${done ? '<div class="cell-check">✓</div>' : ''}
            </div>`;
        }

        html += '</div></div>';
        area.innerHTML += html;
    });
}


/* ── 10. OVERLAY DO DIA ─────────────────────────────────────────────────── */
function openDay(ds) {
    currentDay = ds;
    const d = new Date(ds + 'T00:00:00');
    document.getElementById('exDate').textContent =
        `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;

    const ph    = getPhase(ds);
    const badge = document.getElementById('exPhaseBadge');
    if (ph) {
        badge.textContent      = `FASE ${ph.num} — ${ph.name}`;
        badge.style.background = ph.color + '20';
        badge.style.border     = `1px solid ${ph.color}`;
        badge.style.color      = ph.color;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    // reseta estados ao abrir um novo dia
    editingTaskId = null;
    cancelInlineTask();

    document.getElementById('dayExpansion').classList.add('show');
    renderTasks();
    updateDayDoneBtn();
    updateDayProgress();
}

function closeDay() {
    editingTaskId = null;
    cancelInlineTask();
    document.getElementById('dayExpansion').classList.remove('show');
}

// ESC contextual: cancela edição → fecha nova tarefa → fecha notepad → fecha ranking → fecha dia
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (editingTaskId) {
        cancelTaskEdit();
        return;
    }
    if (!document.getElementById('newTaskBox').classList.contains('hidden')) {
        cancelInlineTask();
        return;
    }
    if (document.getElementById('notepadOverlay').classList.contains('show')) {
        closeNotepad();
        return;
    }
    if (document.getElementById('rankingOverlay').classList.contains('show')) {
        closeRanking();
        return;
    }
    closeDay();
});

function updateDayDoneBtn() {
    const btn = document.getElementById('dayDoneBtn');
    if (cache.doneDays.includes(currentDay)) {
        btn.textContent = '✓ DIA CONCLUÍDO — DESMARCAR';
        btn.classList.add('day-done');
    } else {
        btn.textContent = 'MARCAR DIA COMO FEITO';
        btn.classList.remove('day-done');
    }
}


/* ── 11. PROGRESSO DO DIA ───────────────────────────────────────────────── */
async function updateDayProgress() {
    const dayTasks    = cache.tasks.filter(t => t.date_id === currentDay);
    const total       = dayTasks.length;
    const completed   = dayTasks.filter(t => t.is_done).length;
    const allDone     = total > 0 && completed === total;
    const progress    = total > 0 ? (completed / total) * 100 : 0;
    const alreadyDone = cache.doneDays.includes(currentDay);

    const bar = document.getElementById('progressFill');
    if (bar) bar.style.width = `${progress}%`;

    // 100% → marca o dia automaticamente
    if (allDone && !alreadyDone) {
        const { error } = await db.from('done_days').insert({
            date_id: currentDay,
            marked_by: user.name,
        });
        if (!error) {
            cache.doneDays.push(currentDay);
            addLog(`Dia ${currentDay} concluído automaticamente (100%)`);
        }
    }

    // desmarcou alguma tarefa → tira o dia da lista
    if (!allDone && alreadyDone) {
        await db.from('done_days').delete().eq('date_id', currentDay);
        cache.doneDays = cache.doneDays.filter(d => d !== currentDay);
    }

    updateDayDoneBtn();
    renderCalendar();
}


/* ── 12. TAREFAS ────────────────────────────────────────────────────────── */
function renderTasks() {
    const dayTasks = cache.tasks.filter(t => t.date_id === currentDay);
    const list     = document.getElementById('taskList');

    if (!dayTasks.length) {
        list.innerHTML = '<div class="tasks-empty">NENHUMA TAREFA — ADICIONE UMA</div>';
        return;
    }

    list.innerHTML = dayTasks.map(t => {
        // se estou editando esta tarefa, mostra input no lugar do texto
        if (editingTaskId === t.id) {
            return `
            <div class="task-card ${t.is_done ? 'task-done' : ''}">
                <div class="check-box ${t.is_done ? 'checked' : ''}" onclick="toggleTask('${t.id}')">
                    ${t.is_done ? '✓' : ''}
                </div>
                <input id="editInput_${t.id}"
                       class="task-text-edit"
                       type="text"
                       maxlength="280"
                       value="${escHtmlAttr(t.task_text)}"
                       onkeydown="handleEditKeydown(event, '${t.id}')"
                       onblur="commitTaskEdit('${t.id}')">
                <div class="task-author">${escHtml(t.created_by || '')}</div>
            </div>`;
        }

        // render padrão da tarefa
        const isRolled = !!t.rolled_from;
        const rolledBadge = isRolled
            ? `<div class="task-rolled-badge">↑ ${escHtml(t.rolled_from)}</div>`
            : '';
        return `
        <div class="task-card ${t.is_done ? 'task-done' : ''} ${isRolled ? 'task-rolled' : ''}">
            <div class="check-box ${t.is_done ? 'checked' : ''}" onclick="toggleTask('${t.id}')">
                ${t.is_done ? '✓' : ''}
            </div>
            <div class="task-text">
                ${escHtml(t.task_text)}
                ${rolledBadge}
            </div>
            <div class="task-author">${escHtml(t.created_by || '')}</div>
            <div class="task-edit" onclick="startEditTask('${t.id}')" title="Editar">✎</div>
            <div class="task-del"  onclick="deleteTask('${t.id}')"   title="Excluir">✕</div>
        </div>`;
    }).join('');

    // se há um input ativo, foca e seleciona o texto
    if (editingTaskId) {
        const input = document.getElementById('editInput_' + editingTaskId);
        if (input) { input.focus(); input.select(); }
    }
}

async function toggleTask(id) {
    const task = cache.tasks.find(t => t.id === id);
    if (!task) return;
    const wasNotDone = !task.is_done;
    const { error } = await db.from('tasks').update({ is_done: !task.is_done }).eq('id', id);
    if (!error) {
        task.is_done = !task.is_done;
        renderTasks();
        await updateDayProgress();

        // ranking: contabiliza tarefa concluída/desfeita
        pendingTaskDelta += wasNotDone ? 1 : -1;
        pushStats();
    }
}

async function deleteTask(id) {
    if (!confirm('Excluir esta tarefa?')) return;
    const { error } = await db.from('tasks').delete().eq('id', id);
    if (!error) {
        cache.tasks = cache.tasks.filter(t => t.id !== id);
        renderTasks();
        await updateDayProgress();
    }
}

async function toggleDayDone() {
    if (!currentDay) return;
    const isDone = cache.doneDays.includes(currentDay);
    if (isDone) {
        await db.from('done_days').delete().eq('date_id', currentDay);
        cache.doneDays = cache.doneDays.filter(d => d !== currentDay);
    } else {
        const { error } = await db.from('done_days').insert({ date_id: currentDay, marked_by: user.name });
        if (error) {
            alert('Erro: ' + error.message + '\n\nCrie a tabela done_days no Supabase.');
            return;
        }
        cache.doneDays.push(currentDay);
        addLog(`Você concluiu o dia ${currentDay}`);
    }
    renderCalendar();
    updateDayDoneBtn();
}


/* ── 13. NOVA TAREFA INLINE (substitui o prompt) ────────────────────────── */
function openInlineTaskInput() {
    document.getElementById('newTaskBox').classList.remove('hidden');
    document.getElementById('dayActions').classList.add('hidden');
    const input = document.getElementById('newTaskInput');
    input.value = '';
    setTimeout(() => input.focus(), 60);
}

function cancelInlineTask() {
    document.getElementById('newTaskBox').classList.add('hidden');
    document.getElementById('dayActions').classList.remove('hidden');
    document.getElementById('newTaskInput').value = '';
}

async function submitInlineTask() {
    const input = document.getElementById('newTaskInput');
    const txt   = input.value.trim();
    if (!txt) { input.focus(); return; }
    if (!currentDay) return;

    const submitBtn = document.querySelector('.new-task-submit');
    submitBtn.disabled = true;

    const { error } = await db.from('tasks').insert({
        date_id:    currentDay,
        task_text:  txt,
        created_by: user.name,
        is_done:    false,
    });

    submitBtn.disabled = false;

    if (error) {
        alert('Erro ao salvar: ' + error.message);
        return;
    }

    addLog(`Você adicionou tarefa em ${currentDay}`);
    cancelInlineTask();
    await loadData();
    renderTasks();
    await updateDayProgress();
}

// Enter envia, Esc cancela (no input do nova-tarefa)
document.getElementById('newTaskInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();  // não borbulha pro handler global
        submitInlineTask();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();  // idem
        cancelInlineTask();
    }
});


/* ── 14. EDIÇÃO DE TAREFA INLINE ────────────────────────────────────────── */
function startEditTask(id) {
    editingTaskId = id;
    renderTasks();
}

function cancelTaskEdit() {
    editingTaskId = null;
    renderTasks();
}

function handleEditKeydown(e, id) {
    if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();  // não deixa o Enter borbulhar pro handler global
        e.target.blur(); // dispara o commit via onblur
    } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();  // não deixa o Esc fechar o modal do dia
        // marca como cancelado pra evitar o save no blur
        e.target.dataset.cancel = '1';
        e.target.blur();
    }
}

async function commitTaskEdit(id) {
    const input = document.getElementById('editInput_' + id);
    if (!input) return;

    // se cancelou via Esc, apenas restaura
    if (input.dataset.cancel === '1') {
        cancelTaskEdit();
        return;
    }

    const newText = input.value.trim();
    const task    = cache.tasks.find(t => t.id === id);

    // limpa o estado ANTES do await pra evitar foco-fantasma
    editingTaskId = null;

    // texto vazio ou inalterado: só re-renderiza
    if (!task || !newText || task.task_text === newText) {
        renderTasks();
        return;
    }

    const { error } = await db.from('tasks').update({ task_text: newText }).eq('id', id);
    if (error) {
        alert('Erro ao editar: ' + error.message);
        renderTasks();
        return;
    }
    task.task_text = newText;
    addLog(`Você editou tarefa em ${task.date_id}`);
    renderTasks();
}


/* ── 15. PRESENÇA ───────────────────────────────────────────────────────── */
async function heartbeat() {
    try {
        await db.from('team_presence').upsert({
            user_name:  user.name,
            avatar_url: user.photo,
            is_online:  true,
            last_seen:  new Date().toISOString(),
        }, { onConflict: 'user_name' });
        await loadData();
    } catch (e) {}
}

function updatePresenceBar() {
    const now = Date.now();
    document.getElementById('presenceBar').innerHTML = cache.presence.map(p => {
        const online = (now - new Date(p.last_seen).getTime()) < 60000;
        return `<img src="${escHtmlAttr(p.avatar_url)}" class="presence-avatar ${online?'':'offline'}"
                     title="${escHtmlAttr(p.user_name)}${online?'':' (offline)'}"
                     alt="${escHtmlAttr(p.user_name)}">`;
    }).join('');
}


/* ── 16. ACTIVITY LOG ───────────────────────────────────────────────────── */
function addLog(msg) {
    const t  = new Date();
    const hm = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
    actLog.unshift({ msg, hm, who: user.name });
    if (actLog.length > 40) actLog.pop();
    const el = document.getElementById('logContainer');
    el.innerHTML = actLog.map(e =>
        `<div class="log-entry"><span class="log-user">${escHtml(e.who)}</span> ${escHtml(e.msg)}<div class="log-time">${e.hm}</div></div>`
    ).join('');
}


/* ════════════════════════════════════════════════════════════════════════
   17. RANKING — sistema de pontuação e leaderboard
   ════════════════════════════════════════════════════════════════════════

   COMO FUNCIONA:
     - Cada usuário tem 1 linha por dia na tabela `user_stats` no Supabase.
     - A cada segundo, contamos +1 em sessionDeltaSec localmente.
     - A cada 20s (ou imediatamente após concluir tarefa), enviamos o delta
       acumulado pro banco — assim funciona corretamente com múltiplas abas
       e múltiplos dispositivos.
     - Score = (time_seconds / 60)  +  (tasks_completed * 10)

   SQL NECESSÁRIO (criar 1x no Supabase):

       CREATE TABLE user_stats (
           user_name       TEXT        NOT NULL,
           avatar_url      TEXT,
           date_id         DATE        NOT NULL,
           time_seconds    INTEGER     NOT NULL DEFAULT 0,
           tasks_completed INTEGER     NOT NULL DEFAULT 0,
           last_update     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           PRIMARY KEY (user_name, date_id)
       );

       -- política básica de RLS (ajustar conforme sua segurança)
       ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
       CREATE POLICY "anyone can read"  ON user_stats FOR SELECT USING (true);
       CREATE POLICY "anyone can write" ON user_stats FOR ALL USING (true) WITH CHECK (true);

   Enquanto a tabela não existir, o ranking é desativado automaticamente.
   ════════════════════════════════════════════════════════════════════════ */

function calcScore(timeSec, tasks) {
    return Math.floor((timeSec || 0) / 60) + ((tasks || 0) * 10);
}

async function initSessionTracker() {
    // carrega meus stats de hoje
    await loadMyStats();
    // garante que apareço no ranking desde o início
    await pushStats(true);

    if (!rankingEnabled) return;

    // tick local de 1 em 1 segundo (acumula delta)
    setInterval(() => { sessionDeltaSec++; }, 1000);

    // push pro banco a cada 20s
    setInterval(() => pushStats(false), 20000);

    // push antes de fechar a aba (best-effort)
    window.addEventListener('beforeunload', () => {
        // não dá pra esperar a promise resolver — apenas dispara
        pushStats(false);
    });

    // revela o FAB
    document.getElementById('rankingFab').classList.remove('hidden');
    updateFabDisplay();
}

async function loadMyStats() {
    try {
        const { data, error } = await db.from('user_stats')
            .select('time_seconds, tasks_completed')
            .eq('user_name', user.name)
            .eq('date_id', TODAY)
            .maybeSingle();
        if (error) {
            handleRankingError(error);
            return;
        }
        myStats.time  = data?.time_seconds    || 0;
        myStats.tasks = data?.tasks_completed || 0;
    } catch (e) {
        handleRankingError(e);
    }
}

async function pushStats(forceInsert = false) {
    if (!rankingEnabled) return;
    if (!user.name) return;
    if (!forceInsert && sessionDeltaSec === 0 && pendingTaskDelta === 0) return;

    // captura os deltas atuais e zera ANTES de await — evita corrida com outros pushes
    const dTime  = sessionDeltaSec;
    const dTasks = pendingTaskDelta;
    sessionDeltaSec  = 0;
    pendingTaskDelta = 0;

    try {
        // lê o estado atual no banco para somar (necessário para suportar várias abas)
        const { data: current, error: readErr } = await db.from('user_stats')
            .select('time_seconds, tasks_completed')
            .eq('user_name', user.name)
            .eq('date_id', TODAY)
            .maybeSingle();

        if (readErr) {
            handleRankingError(readErr);
            // restaura os deltas (não conseguimos enviar)
            sessionDeltaSec  += dTime;
            pendingTaskDelta += dTasks;
            return;
        }

        const baseTime  = current?.time_seconds    || 0;
        const baseTasks = current?.tasks_completed || 0;
        const newTime   = baseTime + dTime;
        const newTasks  = Math.max(0, baseTasks + dTasks);

        const { error: upErr } = await db.from('user_stats').upsert({
            user_name:       user.name,
            avatar_url:      user.photo,
            date_id:         TODAY,
            time_seconds:    newTime,
            tasks_completed: newTasks,
            last_update:     new Date().toISOString(),
        }, { onConflict: 'user_name,date_id' });

        if (upErr) {
            handleRankingError(upErr);
            sessionDeltaSec  += dTime;
            pendingTaskDelta += dTasks;
            return;
        }

        myStats.time  = newTime;
        myStats.tasks = newTasks;
        updateFabDisplay();
    } catch (e) {
        handleRankingError(e);
        sessionDeltaSec  += dTime;
        pendingTaskDelta += dTasks;
    }
}

function handleRankingError(err) {
    // Se a tabela não existe (42P01) ou erro permanente, desliga o ranking
    const msg = (err?.message || '').toLowerCase();
    if (err?.code === '42P01' || msg.includes('does not exist') || msg.includes('user_stats')) {
        rankingEnabled = false;
        document.getElementById('rankingFab').classList.add('hidden');
        console.warn(
            '[INTRUSIVE] Ranking desativado.\n' +
            'Crie a tabela `user_stats` no Supabase para ativar (veja o SQL no topo do app.js, seção 17).'
        );
    } else {
        console.error('[INTRUSIVE] Ranking error:', err);
    }
}

function updateFabDisplay() {
    const el = document.getElementById('fabMyPoints');
    if (el) el.textContent = calcScore(myStats.time, myStats.tasks);
}

async function openRanking() {
    // push final antes de mostrar (pra meu próprio score estar fresco)
    await pushStats(false);
    document.getElementById('rankingOverlay').classList.add('show');
    document.getElementById('rankingList').innerHTML =
        '<div class="ranking-empty">CARREGANDO DADOS DO TIME...</div>';
    document.getElementById('rankingSubtitle').textContent = TODAY.split('-').reverse().join('/');
    await renderRanking();
}

function closeRanking() {
    document.getElementById('rankingOverlay').classList.remove('show');
}

async function renderRanking() {
    if (!rankingEnabled) {
        document.getElementById('rankingList').innerHTML =
            '<div class="ranking-empty">RANKING DESATIVADO — CRIE A TABELA user_stats</div>';
        return;
    }

    try {
        const { data, error } = await db.from('user_stats')
            .select('*')
            .eq('date_id', TODAY);

        if (error) {
            handleRankingError(error);
            document.getElementById('rankingList').innerHTML =
                '<div class="ranking-empty">ERRO AO CARREGAR RANKING</div>';
            return;
        }

        const rows = (data || [])
            .map(r => ({
                ...r,
                score: calcScore(r.time_seconds, r.tasks_completed),
            }))
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                // critério de desempate: mais tarefas primeiro, depois mais tempo
                if (b.tasks_completed !== a.tasks_completed) return b.tasks_completed - a.tasks_completed;
                return b.time_seconds - a.time_seconds;
            })
            .slice(0, 10);

        if (rows.length === 0) {
            document.getElementById('rankingList').innerHTML =
                '<div class="ranking-empty">NINGUÉM NO RANKING AINDA — VOLTE EM ALGUNS SEGUNDOS</div>';
            return;
        }

        const list = document.getElementById('rankingList');
        list.innerHTML = rows.map((r, i) => {
            const pos     = i + 1;
            const isMe    = r.user_name === user.name;
            const minutes = Math.floor((r.time_seconds || 0) / 60);
            const seconds = (r.time_seconds || 0) % 60;
            const timeStr = `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
            const avatar  = r.avatar_url ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(r.user_name)}&background=e63022&color=fff&bold=true`;

            return `
            <div class="rank-row rank-${pos} ${isMe ? 'is-me' : ''}"
                 style="animation-delay: ${i * 40}ms;">
                <div class="rank-position">${pos}</div>
                <img class="rank-avatar" src="${escHtmlAttr(avatar)}" alt="${escHtmlAttr(r.user_name)}">
                <div class="rank-user">
                    <div>
                        <div class="rank-name">
                            ${escHtml(r.user_name)}
                            ${isMe ? '<span class="me-tag">VOCÊ</span>' : ''}
                        </div>
                        <div class="rank-stats">
                            <span class="rank-stat-time">⏱ ${timeStr}</span>
                            <span class="rank-stat-tasks">✓ ${r.tasks_completed || 0} TAREFA${(r.tasks_completed||0)===1?'':'S'}</span>
                        </div>
                    </div>
                </div>
                <div class="rank-score">${r.score}</div>
            </div>`;
        }).join('');
    } catch (e) {
        handleRankingError(e);
        document.getElementById('rankingList').innerHTML =
            '<div class="ranking-empty">ERRO AO CARREGAR RANKING</div>';
    }
}


/* ════════════════════════════════════════════════════════════════════════
   18. COUNTDOWN — contagem regressiva até a última data do projeto
   ════════════════════════════════════════════════════════════════════════

   Target é calculado automaticamente em PROJECT_END (maior `e` em PHASES).
   Quando você adicionar uma nova fase, o countdown se ajusta sozinho.
   ════════════════════════════════════════════════════════════════════════ */

function startCountdown() {
    updateCountdown();
    setInterval(updateCountdown, 1000);
}

function updateCountdown() {
    const el  = document.getElementById('countdown');
    const val = document.getElementById('countdownValue');
    if (!el || !val) return;

    const diff = COUNTDOWN_TARGET.getTime() - Date.now();

    if (diff <= 0) {
        val.textContent = '🚀 LANÇADO!';
        el.classList.remove('urgent');
        el.classList.add('finished');
        el.title = 'Projeto lançado em ' + PROJECT_END;
        return;
    }

    const sec    = Math.floor(diff / 1000);
    const days   = Math.floor(sec / 86400);
    const hours  = Math.floor((sec % 86400) / 3600);
    const mins   = Math.floor((sec % 3600) / 60);
    const secs   = sec % 60;

    const pad = n => String(n).padStart(2, '0');
    val.textContent = `${days}D ${pad(hours)}H ${pad(mins)}M ${pad(secs)}S`;

    // urgência: <= 7 dias → pulsa em vermelho
    if (days <= 7) {
        el.classList.add('urgent');
    } else {
        el.classList.remove('urgent');
    }
    el.title = `${days} dias até o LANÇAMENTO (${PROJECT_END})`;
}


/* ════════════════════════════════════════════════════════════════════════
   19. NOTEPAD / CHAT COLABORATIVO — sidebar + overlay full screen
   ════════════════════════════════════════════════════════════════════════

   COMO FUNCIONA:
     - Cada nota = 1 mensagem na tabela `team_notes` no Supabase.
     - O preview na sidebar mostra as últimas 4 notas (compactas).
     - Click na sidebar → abre overlay full em estilo chat (respeita a coluna).
     - Realtime: novas notas de outros membros aparecem instantaneamente.

   SQL NECESSÁRIO (criar 1x no Supabase):

       CREATE TABLE team_notes (
           id          BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
           user_name   TEXT        NOT NULL,
           avatar_url  TEXT,
           message     TEXT        NOT NULL,
           created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );

       ALTER TABLE team_notes ENABLE ROW LEVEL SECURITY;
       CREATE POLICY "anyone can read"   ON team_notes FOR SELECT USING (true);
       CREATE POLICY "anyone can insert" ON team_notes FOR INSERT WITH CHECK (true);
       CREATE POLICY "anyone can delete" ON team_notes FOR DELETE USING (true);

       -- Habilite Realtime para a tabela team_notes no painel do Supabase.
   ════════════════════════════════════════════════════════════════════════ */

async function loadNotes() {
    try {
        const { data, error } = await db.from('team_notes')
            .select('*')
            .order('created_at', { ascending: true })
            .limit(200);
        if (error) {
            handleNotesError(error);
            return;
        }
        cache.notes = data || [];
    } catch (e) {
        handleNotesError(e);
    }
}

function handleNotesError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (err?.code === '42P01' || msg.includes('does not exist') || msg.includes('team_notes')) {
        notesEnabled = false;
        const preview = document.getElementById('notepadPreview');
        if (preview) {
            preview.innerHTML = `
                <div class="notepad-empty" style="color:var(--orange);">
                    ⚠ TABELA team_notes NÃO EXISTE<br>
                    <span style="font-size:9px; letter-spacing:1px; line-height:1.4; display:block; margin-top:6px;">
                        Crie a tabela no Supabase (SQL na seção 19 do app.js)
                    </span>
                </div>`;
        }
        console.warn(
            '[INTRUSIVE] Bloco de notas desativado.\n' +
            'Crie a tabela `team_notes` no Supabase para ativar (veja o SQL na seção 19 do app.js).'
        );
    } else {
        console.error('[INTRUSIVE] Notes error:', err);
    }
}

function renderNotepadPreview() {
    const el = document.getElementById('notepadPreview');
    if (!el) return;

    if (!notesEnabled) return; // o erro já foi mostrado

    if (!cache.notes.length) {
        el.innerHTML = '<div class="notepad-empty">NENHUMA NOTA — CLIQUE PARA ESCREVER</div>';
        return;
    }

    // pega as 4 mais recentes, em ordem invertida (mais novas no topo do preview)
    const recent = cache.notes.slice(-4).reverse();
    el.innerHTML = recent.map(n => `
        <div class="notepad-msg-preview">
            <div class="msg-author">${escHtml(n.user_name)}</div>
            <div class="msg-text">${escHtml(n.message)}</div>
            <div class="msg-time">${formatNoteTime(n.created_at)}</div>
        </div>
    `).join('');
}

function renderNotepadMessages() {
    const el    = document.getElementById('notepadMessages');
    const count = document.getElementById('notepadCount');
    if (!el) return;

    if (!notesEnabled) {
        el.innerHTML = `
            <div class="notepad-empty" style="color:var(--orange);">
                ⚠ BLOCO DESATIVADO — CRIE A TABELA team_notes NO SUPABASE
            </div>`;
        return;
    }

    if (!cache.notes.length) {
        el.innerHTML = '<div class="notepad-empty">SEM MENSAGENS AINDA — SEJA O PRIMEIRO A ESCREVER</div>';
        if (count) count.textContent = 'CHAT COLABORATIVO DO TIME';
        return;
    }

    if (count) {
        const n = cache.notes.length;
        count.textContent = `${n} MENSAGEM${n === 1 ? '' : 'S'} · CHAT COLABORATIVO DO TIME`;
    }

    el.innerHTML = cache.notes.map(n => {
        const isMine = n.user_name === user.name;
        const avatar = n.avatar_url ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(n.user_name)}&background=e63022&color=fff&bold=true`;
        return `
            <div class="chat-msg ${isMine ? 'mine' : ''}">
                <img class="chat-avatar" src="${escHtmlAttr(avatar)}" alt="${escHtmlAttr(n.user_name)}">
                <div class="chat-bubble">
                    <div class="chat-meta">
                        <span class="chat-author">${escHtml(n.user_name)}</span>
                        <span class="chat-time">${formatNoteTime(n.created_at)}</span>
                        ${isMine ? `<span class="chat-del" onclick="deleteNote(${n.id})" title="Excluir">✕</span>` : ''}
                    </div>
                    <div class="chat-text">${escHtml(n.message)}</div>
                </div>
            </div>`;
    }).join('');

    // auto-scroll pra última mensagem
    setTimeout(() => { el.scrollTop = el.scrollHeight; }, 30);
}

function openNotepad() {
    if (!notesEnabled) {
        // mostra o erro mesmo assim — o usuário pode ver as instruções
        renderNotepadMessages();
        document.getElementById('notepadOverlay').classList.add('show');
        return;
    }
    document.getElementById('notepadOverlay').classList.add('show');
    renderNotepadMessages();
    setTimeout(() => {
        const input = document.getElementById('notepadInput');
        if (input) input.focus();
    }, 100);
}

function closeNotepad() {
    document.getElementById('notepadOverlay').classList.remove('show');
}

async function sendNote() {
    if (!notesEnabled) return;
    const input = document.getElementById('notepadInput');
    const txt   = input.value.trim();
    if (!txt) { input.focus(); return; }

    const sendBtn = document.querySelector('.notepad-send');
    if (sendBtn) sendBtn.disabled = true;

    // .select().single() retorna a linha inserida com id e created_at do banco
    const { data, error } = await db.from('team_notes').insert({
        user_name:  user.name,
        avatar_url: user.photo,
        message:    txt,
    }).select().single();

    if (sendBtn) sendBtn.disabled = false;

    if (error) {
        handleNotesError(error);
        alert('Erro ao enviar nota: ' + error.message);
        return;
    }

    input.value = '';
    input.focus();

    // Atualiza o cache imediatamente (sem esperar o Realtime)
    // O listener do Realtime vai deduplicar usando o id
    if (data && !cache.notes.find(n => n.id === data.id)) {
        cache.notes.push(data);
        renderNotepadMessages();
        renderNotepadPreview();
    }

    addLog('Você enviou uma nota');
}

async function deleteNote(id) {
    if (!confirm('Excluir esta mensagem?')) return;
    const { error } = await db.from('team_notes').delete().eq('id', id);
    if (error) {
        alert('Erro ao excluir: ' + error.message);
        return;
    }
    cache.notes = cache.notes.filter(n => n.id !== id);
    renderNotepadMessages();
    renderNotepadPreview();
}

function formatNoteTime(iso) {
    if (!iso) return '';
    const d   = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (sameDay) return `${hh}:${mm}`;
    const dd = String(d.getDate()).padStart(2, '0');
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${MM} ${hh}:${mm}`;
}

// Enter envia (o script tem defer, então o DOM já existe quando esse trecho executa)
(function attachNotepadInputHandler() {
    const input = document.getElementById('notepadInput');
    if (!input) return;
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            sendNote();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeNotepad();
        }
    });
})();


/* ── 20. UTILS ──────────────────────────────────────────────────────────── */
function setSyncStatus(live) {
    const el = document.getElementById('syncStatus');
    el.textContent = live ? 'AO VIVO' : 'OFFLINE';
    el.classList.toggle('live', live);
}

// Escape para conteúdo entre tags (innerHTML)
function escHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Escape para conteúdo dentro de atributos (aspas duplas)
function escHtmlAttr(s) {
    return escHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
