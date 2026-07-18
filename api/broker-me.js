const { getSupabase, verifySession, parseCookies, SESSION_COOKIE } = require('../lib/shared');
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const cookies = parseCookies(req);
  const session = verifySession(cookies[SESSION_COOKIE]);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt.' });
  const supabase = getSupabase();
  const { data: account } = await supabase.from('keks_broker_accounts').select('name, email').eq('id', session.id).maybeSingle();
  if (!account) return res.status(401).json({ error: 'Konto nicht gefunden.' });
  const { data: config } = await supabase.from('keks_config').select('value').eq('key', 'verkaufs_pdf_url').maybeSingle();
  res.status(200).json({ ok: true, name: account.name, email: account.email, pdfUrl: config?.value || null });
};
