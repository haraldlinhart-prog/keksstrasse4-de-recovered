const { createClient } = require('@supabase/supabase-js');
function sanitize(str) { if (typeof str !== 'string') return ''; return str.replace(/[<>]/g, '').trim().slice(0, 4000); }
const rateLimitMap = new Map();
function isRateLimited(ip) { const now = Date.now(); const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + 3600000 }; if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 3600000; } entry.count++; rateLimitMap.set(ip, entry); return entry.count > 5; }
function isGibberish(str) {
  const words = (str || '').split(/\s+/).filter(w => w.length >= 6);
  const vowelChars = 'aeiouyAEIOUYäöüÄÖÜàáâãåèéêëìíîïòóôõùúûýÀÁÂÃÅÈÉÊËÌÍÎÏÒÓÔÕÙÚÛÝ';
  for (const word of words) {
    const letters = word.replace(/[^a-zA-ZäöüÄÖÜßàáâãåèéêëìíîïòóôõùúûýÀÁÂÃÅÈÉÊËÌÍÎÏÒÓÔÕÙÚÛÝ]/g, '');
    if (letters.length < 6) continue;
    let vowels = 0; for (const ch of letters) if (vowelChars.includes(ch)) vowels++;
    const vowelRatio = vowels / letters.length;
    let transitions = 0;
    for (let i = 1; i < letters.length; i++) { const prevUpper = letters[i-1] === letters[i-1].toUpperCase() && letters[i-1] !== letters[i-1].toLowerCase(); const curUpper = letters[i] === letters[i].toUpperCase() && letters[i] !== letters[i].toLowerCase(); if (prevUpper !== curUpper) transitions++; }
    const transitionRatio = transitions / (letters.length - 1);
    const vowelThreshold = letters.length >= 14 ? 0.28 : (letters.length >= 11 ? 0.22 : 0.16);
    if (vowelRatio < vowelThreshold && transitionRatio > 0.3) return true;
  }
  return false;
}
function hashIp(ip) { let h = 0; const s = String(ip || ''); for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return 'ip_' + Math.abs(h).toString(36); }
function getSupabase() { return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); }
async function sendEmail({ to, from, replyTo, subject, html, cc }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.error('RESEND_API_KEY fehlt'); return false; }
  const body = { from, to: Array.isArray(to) ? to : [to], reply_to: replyTo, subject, html };
  if (cc) body.cc = Array.isArray(cc) ? cc : [cc];
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await r.text();
  console.log('Resend status:', r.status, text);
  return r.ok;
}
const NOTIFY_TO = (process.env.KEKS_NOTIFY_EMAIL || 'haraldlinhart@gmail.com').split(',').map(s => s.trim());
const NOTIFY_CC_MARTIN = ['info@martin-linhart.de'];
const SEND_FROM = 'Keksstraße 4 <de@pan21.com>';
const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}
function verifyPassword(password, hash, salt) {
  try {
    const check = crypto.scryptSync(String(password), salt, 64).toString('hex');
    const a = Buffer.from(check, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
function sessionSecret() {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback') + ':keks-broker-session';
}
function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return body + '.' + sig;
}
function verifySession(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch { return null; }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}
const SESSION_COOKIE = 'keks_broker_session';

module.exports = { sanitize, isRateLimited, isGibberish, hashIp, getSupabase, sendEmail, NOTIFY_TO, NOTIFY_CC_MARTIN, SEND_FROM, hashPassword, verifyPassword, signSession, verifySession, parseCookies, SESSION_COOKIE };
