/*
   ═══════════════════════════════════════════════════════════════════════════
   INTRUSIVE — SUPABASE CONFIG
   ═══════════════════════════════════════════════════════════════════════════

   PREENCHA com as credenciais do projeto Supabase antes de subir / rodar.

   Onde encontrar:
     Supabase Dashboard → Project Settings → API
       • SUPABASE_URL      = "Project URL"
       • SUPABASE_ANON_KEY = "anon public" key (segura pra client-side)

   IMPORTANTE: a anon key é pública por design. NÃO use a "service_role" key
   aqui — essa é secreta e nunca deve ir pro front-end.
   ═══════════════════════════════════════════════════════════════════════════
*/

const SUPABASE_URL      = 'https://SEU-PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA-CHAVE-ANON-AQUI';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
