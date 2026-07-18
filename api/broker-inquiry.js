const { sanitize, isRateLimited, isGibberish, hashIp, getSupabase, sendEmail, NOTIFY_TO, SEND_FROM } = require('../lib/shared');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Zu viele Anfragen.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Ungültige Anfrage.' });
  if (body['_hp'] && body['_hp'].trim() !== '') return res.status(200).json({ ok: true });
  const elapsed = parseInt(body['_elapsed'], 10);
  if (!isNaN(elapsed) && elapsed < 3) return res.status(200).json({ ok: true });
  const firma = sanitize(body.firma || '');
  const ansprechpartner = sanitize(body.ansprechpartner || '');
  const email = sanitize(body.email || '');
  const telefon = sanitize(body.telefon || '');
  const nachricht = sanitize(body.nachricht || '');
  if (isGibberish(nachricht) || isGibberish(ansprechpartner)) return res.status(200).json({ ok: true });
  if (!ansprechpartner || !email) return res.status(400).json({ error: 'Name und E-Mail sind Pflichtfelder.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
  const supabase = getSupabase();
  const { error: dbError } = await supabase.from('keks_broker_inquiries').insert({ firma, ansprechpartner, email, telefon, nachricht });
  if (dbError) { console.error('Supabase insert error:', dbError); return res.status(500).json({ error: 'Speicherfehler.' }); }
  const ts = new Date().toLocaleString('de-DE');
  const html = `<h2>Neue Makler-Anfrage</h2><p>${firma||'-'} | ${ansprechpartner} | ${email} | ${telefon||'-'}</p><p>${(nachricht||'-').replace(/\n/g,'<br>')}</p><p style="font-size:11px;color:#aaa">${ts}</p>`;
  await sendEmail({ from: SEND_FROM, to: NOTIFY_TO, replyTo: email, subject: `Makler-Anfrage – ${ansprechpartner}${firma ? ' (' + firma + ')' : ''}`, html }).catch(e => console.error('Mail-Fehler:', e));
  res.status(200).json({ ok: true });
};
