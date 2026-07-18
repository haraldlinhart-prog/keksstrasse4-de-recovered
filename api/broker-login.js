const { sanitize, isRateLimited, hashIp, getSupabase, verifyPassword, signSession, SESSION_COOKIE } = require('../lib/shared');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Zu viele Anfragen.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Ungültige Anfrage.' });
  const email = sanitize((body.email || '').toLowerCase());
  const password = String(body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort erforderlich.' });
  const supabase = getSupabase();
  const { data: account, error } = await supabase.from('keks_broker_accounts').select('id, email, password_hash, password_salt').eq('email', email).maybeSingle();
  if (error || !account || !verifyPassword(password, account.password_hash, account.password_salt)) {
    return res.status(401).json({ error: 'E-Mail oder Passwort ist falsch.' });
  }
  const token = signSession({ id: account.id, email: account.email, exp: Date.now() + 90 * 24 * 60 * 60 * 1000 });
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${90 * 24 * 60 * 60}`);
  res.status(200).json({ ok: true });
};
