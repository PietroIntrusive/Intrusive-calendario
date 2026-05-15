/*
   INTRUSIVE — PROJECT CONSTANTS
   Calendário, fases e helpers de data.
   Edite aqui para ajustar datas de fases e lançamento.
*/

/* ── HOJE ──────────────────────────────────────────────────────────────────── */
const _now = new Date();
const TODAY = [
    _now.getFullYear(),
    String(_now.getMonth() + 1).padStart(2, '0'),
    String(_now.getDate()).padStart(2, '0'),
].join('-');

/* ── FASES DO PROJETO ──────────────────────────────────────────────────────── */
// s = data de início (YYYY-MM-DD)
// e = data de fim
// num = número da fase
// name = nome da fase
// color = cor da barra no calendário
const PHASES = [
    { s: '2026-01-01', e: '2026-02-28', num: 1, name: 'CONCEITO',        color: '#4a90d9' },
    { s: '2026-03-01', e: '2026-04-30', num: 2, name: 'PRODUÇÃO',        color: '#e6a020' },
    { s: '2026-05-01', e: '2026-06-30', num: 3, name: 'PRÉ-LANÇAMENTO',  color: '#9c4fd6' },
    { s: '2026-07-01', e: '2026-07-12', num: 4, name: 'LANÇAMENTO',      color: '#e63022' },
];

/* ── DATA DO LANÇAMENTO ────────────────────────────────────────────────────── */
const PROJECT_END = '2026-07-12';
const COUNTDOWN_TARGET = new Date('2026-07-12T20:00:00');

/* ── MESES DO CALENDÁRIO ───────────────────────────────────────────────────── */
// { y: ano, m: mês (0-indexed), n: nome }
const MONTHS = [
    { y: 2026, m: 0,  n: 'Janeiro'   },
    { y: 2026, m: 1,  n: 'Fevereiro' },
    { y: 2026, m: 2,  n: 'Março'     },
    { y: 2026, m: 3,  n: 'Abril'     },
    { y: 2026, m: 4,  n: 'Maio'      },
    { y: 2026, m: 5,  n: 'Junho'     },
    { y: 2026, m: 6,  n: 'Julho'     },
];

/* ── DIAS DA SEMANA ────────────────────────────────────────────────────────── */
const WDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

/* ── HELPERS DE DATA ───────────────────────────────────────────────────────── */
function dStr(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function inRange(ds) {
    return PHASES.some(p => ds >= p.s && ds <= p.e);
}

function getPhase(ds) {
    return PHASES.find(p => ds >= p.s && ds <= p.e) || null;
}

function isPast(ds) {
    return ds < TODAY;
}
