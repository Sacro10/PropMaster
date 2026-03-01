type SendResendEmailParams = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
};

export async function sendResendEmail(
  params: SendResendEmailParams
): Promise<{ id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = params.from || process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM;

  if (!apiKey || !fromEmail) {
    throw new Error('RESEND_API_KEY and RESEND_FROM_EMAIL (or RESEND_FROM) must be configured');
  }

  const recipients = (Array.isArray(params.to) ? params.to : [params.to])
    .map((recipient) => recipient?.trim())
    .filter(Boolean) as string[];

  if (recipients.length === 0) {
    throw new Error('Resend recipient email is required');
  }

  if (!params.text && !params.html) {
    throw new Error('Resend email content is required (text or html)');
  }

  const payload: Record<string, unknown> = {
    from: fromEmail,
    to: recipients,
    subject: params.subject,
  };

  if (params.text) {
    payload.text = params.text;
  }

  if (params.html) {
    payload.html = params.html;
  }

  if (params.replyTo) {
    payload.reply_to = params.replyTo;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  if (!response.ok) {
    let details = responseText.trim();
    if (responseText) {
      try {
        const parsed = JSON.parse(responseText) as { message?: string; error?: string; name?: string };
        const parsedDetails = parsed.message || parsed.error || parsed.name;
        if (parsedDetails) {
          details = parsedDetails;
        }
      } catch {
        // Keep original text details.
      }
    }
    const detailSuffix = details ? `: ${details}` : '';
    throw new Error(
      `Resend email failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''})${detailSuffix}`
    );
  }

  try {
    const data = JSON.parse(responseText) as { id?: string };
    return { id: data?.id };
  } catch {
    return {};
  }
}
