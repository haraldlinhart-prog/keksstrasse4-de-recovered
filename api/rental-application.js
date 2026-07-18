const { sanitize, isRateLimited, isGibberish, hashIp, getSupabase, sendEmail, NOTIFY_TO, SEND_FROM } = require('../lib/shared');
const UNIT_LABELS = { eg: 'Erdgeschoss', og1: '1. Stock', og2_mansarde: '2. Stock / Mansarde' };
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
  const unit = ['eg', 'og1', 'og2_mansarde'].includes(body.unit) ? body.unit : null;
  const vorname = sanitize(body.vorname || '');
  const nachname = sanitize(body.nachname || '');
  const email = sanitize(body.email || '');
  const geburtsdatum = sanitize(body.geburtsdatum || '') || null;
  const telefon = sanitize(body.telefon || '');
  const adresse = sanitize(body.adresse || '');
  const haushalt = sanitize(body.haushalt || '');
  const haustiere = sanitize(body.haustiere || '');
  const einkommen_info = sanitize(body.einkommen_info || '');
  const einzugstermin = sanitize(body.einzugstermin || '');
  const nachricht = sanitize(body.nachricht || '');
  if (isGibberish(nachricht) || isGibberish(vorname)) return res.status(200).json({ ok: true });
  if (!unit) return res.status(400).json({ error: 'Bitte wählen Sie eine Wohneinheit.' });
  if (!vorname || !nachname || !email) return res.status(400).json({ error: 'Vorname, Nachname und E-Mail sind Pflichtfelder.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
  const supabase = getSupabase();
  const { error: dbError } = await supabase.from('keks_rental_applications').insert({ unit, vorname, nachname, email, geburtsdatum, telefon, adresse, haushalt, haustiere, einkommen_info, einzugstermin, nachricht, ip_hash: hashIp(ip) });
  if (dbError) { console.error('Supabase insert error:', dbError); return res.status(500).json({ error: 'Speicherfehler.' }); }
  const unitLabel = UNIT_LABELS[unit] || unit;
  const ts = new Date().toLocaleString('de-DE');
  const html = `<h2>Neue Mietbewerbung – ${unitLabel}</h2><p>${vorname} ${nachname} | ${email} | ${telefon||'-'}</p><p>Geburtsdatum: ${geburtsdatum||'-'} | Adresse: ${adresse||'-'}</p><p>Haushalt: ${haushalt||'-'} | Haustiere: ${haustiere||'-'} | Beruf: ${einkommen_info||'-'}</p><p>Einzug: ${einzugstermin||'-'}</p><p>${(nachricht||'-').replace(/\n/g,'<br>')}</p><p style="font-size:11px;color:#aaa">${ts}</p>`;
  await sendEmail({ from: SEND_FROM, to: NOTIFY_TO, replyTo: email, subject: `Mietbewerbung ${unitLabel} – ${vorname} ${nachname}`, html }).catch(e => console.error('Mail-Fehler:', e));
  res.status(200).json({ ok: true });
};
