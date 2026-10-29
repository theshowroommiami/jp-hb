// Vercel Serverless Function: single-click RSVP.
// Receives { name, guests } from the invitation page, forwards them to the
// existing public Google Form, and only reports success when Google accepts
// the submission (HTTP 200 without an error page). No credentials needed:
// the Google Form is public and accepting responses.
//
// Form (verified 2026-10-27 / 2026-10-28):
//   formId: 1Zs8fhdCKS0e0SsTNR6FiWrpH5PHxc7PdS9_50pBPhxQ
//   responderUri: https://docs.google.com/forms/d/e/1FAIpQLSffFZ63GmCbeRUxmBW2E_yfyBcYNeg9umYz_Sp5T0-xukjt7g/viewform
//   Name = entry.151802951, Number of guests = entry.584697196
//   Known-good fbzx fallback (a direct POST with this token was recorded
//   by Google on 2026-10-28): 8517343667699297502

const VIEWFORM =
  'https://docs.google.com/forms/d/e/1FAIpQLSffFZ63GmCbeRUxmBW2E_yfyBcYNeg9umYz_Sp5T0-xukjt7g/viewform';
const FORM_RESPONSE =
  'https://docs.google.com/forms/d/e/1FAIpQLSffFZ63GmCbeRUxmBW2E_yfyBcYNeg9umYz_Sp5T0-xukjt7g/formResponse';
const FALLBACK_FBZX = '8517343667699297502';

async function freshFbzx() {
  try {
    const res = await fetch(VIEWFORM, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const html = await res.text();
    const m = html.match(/fbzx["']?\s*value=["'](\d+)["']/i)
      || html.match(/"fbzx"\s*,\s*"?(\d+)/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const guests = Number(body?.guests);
  if (!name) return res.status(400).json({ ok: false, error: 'Name is required' });
  if (!Number.isInteger(guests) || guests < 1) {
    return res.status(400).json({ ok: false, error: 'Guests must be 1 or more' });
  }

  const fbzx = (await freshFbzx()) || FALLBACK_FBZX;
  const params = new URLSearchParams();
  params.set('entry.151802951', name);
  params.set('entry.584697196', String(guests));
  params.set('fvv', '1');
  params.set('pageHistory', '0');
  params.set('fbzx', fbzx);

  try {
    const g = await fetch(FORM_RESPONSE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
      },
      body: params.toString(),
    });
    const text = await g.text();
    // Google answers 200 for a recorded response. Do NOT claim success on
    // an error page: that was the false-success bug on the Muse version.
    const looksLikeError = /there was a problem|an error occurred|error/i.test(text)
      && !/response has been recorded/i.test(text);
    if (!g.ok || looksLikeError) {
      return res.status(502).json({ ok: false, error: 'Google did not accept the submission' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Could not reach Google Forms' });
  }
}
