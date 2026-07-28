// /api/verify-email.js
// Vercel Serverless Function — runs on the server, never in the browser.
// Keeps the Abstract API key secret and checks whether an email address is
// really deliverable (valid format + valid MX records + valid SMTP mailbox),
// not just "looks like an email".

export default async function handler(req, res) {
  // Only allow POST to avoid the email showing up in server logs via query strings.
  if (req.method !== 'POST') {
    return res.status(405).json({ valid: false, reason: 'method_not_allowed' });
  }

  const { email } = req.body || {};

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ valid: false, reason: 'invalid_format' });
  }

  const apiKey = process.env.ABSTRACT_EMAIL_API_KEY;
  if (!apiKey) {
    // Fail closed with a clear server-side error rather than silently letting everything through.
    console.error('ABSTRACT_EMAIL_API_KEY is not set in Vercel environment variables.');
    return res.status(500).json({ valid: false, reason: 'server_misconfigured' });
  }

  try {
    const apiUrl = `https://emailvalidation.abstractapi.com/v1/?api_key=${apiKey}&email=${encodeURIComponent(email)}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      console.error('Abstract API error:', response.status);
      // Fail open (allow signup) on a provider outage so real users aren't blocked
      // by a third-party incident — but log it so you notice.
      return res.status(200).json({ valid: true, reason: 'provider_unavailable' });
    }

    const data = await response.json();
    const deliverability = data.deliverability; // "DELIVERABLE" | "UNDELIVERABLE" | "RISKY" | "UNKNOWN"
    const isDisposable = data.is_disposable_email?.value === true;

    const valid = deliverability === 'DELIVERABLE' && !isDisposable;

    return res.status(200).json({
      valid,
      reason: isDisposable ? 'disposable_email' : deliverability?.toLowerCase() || 'unknown'
    });
  } catch (err) {
    console.error('verify-email error:', err);
    // Fail open on unexpected errors so a bug here never locks out real users.
    return res.status(200).json({ valid: true, reason: 'check_failed' });
  }
}