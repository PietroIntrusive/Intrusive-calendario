/*
   INTRUSIVE — LOGIN
   Autenticação do time via Supabase.
*/

(async function redirectIfAuthenticated() {
    const { data: { session } } = await db.auth.getSession();
    if (session) window.location.replace('app.html');
})();

function updateLoginCountdown() {
    const el = document.getElementById('landingCountdown');
    if (!el) return;

    const diff = COUNTDOWN_TARGET.getTime() - Date.now();
    if (diff <= 0) {
        el.textContent = 'LANÇADO!';
        return;
    }

    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    el.textContent = `${d}D ${String(h).padStart(2, '0')}H ${String(m).padStart(2, '0')}M`;
}

async function doLogin(event) {
    // Submissão via <form> — preventDefault pra não recarregar a página,
    // mas o browser AINDA reconhece como login real e oferece salvar a senha.
    if (event) event.preventDefault();

    const emailEl = document.getElementById('loginEmail');
    const passEl  = document.getElementById('loginPassword');
    const email = emailEl.value.trim();
    const pass  = passEl.value;
    const errEl = document.getElementById('loginError');
    const btn   = document.getElementById('loginBtn');
    errEl.textContent = '';

    if (!email) {
        errEl.textContent = 'INFORME SEU E-MAIL.';
        emailEl.focus();
        return;
    }

    if (!pass) {
        errEl.textContent = 'INFORME SUA SENHA.';
        passEl.focus();
        return;
    }

    btn.textContent = 'VERIFICANDO...';
    btn.disabled = true;

    const { error } = await db.auth.signInWithPassword({ email, password: pass });

    if (error) {
        btn.textContent = 'ACESSAR COMMAND CENTER';
        btn.disabled = false;

        const msg = error.message.toLowerCase();
        if (
            msg.includes('invalid login') ||
            msg.includes('invalid credentials') ||
            msg.includes('email not confirmed')
        ) {
            errEl.textContent = 'CREDENCIAIS INVÁLIDAS.';
        } else if (msg.includes('rate limit')) {
            errEl.textContent = 'MUITAS TENTATIVAS. AGUARDE.';
        } else {
            errEl.textContent = 'ERRO: ' + error.message.toUpperCase();
        }
        return;
    }

    btn.textContent = 'ACESSO LIBERADO →';
    // Pequeno delay pro browser registrar a submissão bem-sucedida
    // e oferecer salvar a senha antes de navegar.
    setTimeout(() => window.location.replace('app.html'), 400);
}

// Liga o submit do form (Enter + clique no botão funcionam automaticamente)
const loginForm = document.getElementById('loginForm');
if (loginForm) loginForm.addEventListener('submit', doLogin);

updateLoginCountdown();
setInterval(updateLoginCountdown, 30000);

window.doLogin = doLogin;
