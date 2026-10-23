import { env } from '../env';
import { logger } from '../logger';

/**
 * Getting a message to a person, with the transport chosen by configuration.
 *
 * There is no mail provider baked in. A ticketing demo should not require an
 * account with a third party before it will run, and a hard dependency on one
 * would mean the test suite either talks to the internet or mocks something
 * that was never exercised.
 *
 * So: set `RESEND_API_KEY` and mail is sent. Leave it unset and the message is
 * written to the log instead, which is enough to complete a password reset
 * from the server's own logs and is exactly what local development wants.
 * What is never acceptable is returning the link to the caller, because the
 * caller is whoever typed the email address, and that is not a reset flow, it
 * is account takeover with a confirmation step.
 */
export type Mail = {
  to: string;
  subject: string;
  text: string;
};

export type MailResult = { delivered: boolean; transport: 'resend' | 'log' };

async function sendViaResend(mail: Mail): Promise<MailResult> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // Logged, not thrown to the caller: whether the mail went out is not
    // something the person who asked for a reset is allowed to learn, because
    // the answer tells them whether the address exists.
    logger.error({ status: response.status, detail: detail.slice(0, 300) }, 'Mail send failed');
    return { delivered: false, transport: 'resend' };
  }
  return { delivered: true, transport: 'resend' };
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  if (env.RESEND_API_KEY) {
    try {
      return await sendViaResend(mail);
    } catch (err) {
      logger.error({ err }, 'Mail transport threw');
      return { delivered: false, transport: 'resend' };
    }
  }

  // No provider configured. The body goes to the log at info level so a reset
  // can still be completed by whoever can read the logs, and so the flow is
  // visible in development without any setup at all.
  logger.info(
    { to: mail.to, subject: mail.subject, body: mail.text },
    'Mail not configured, logging instead. Set RESEND_API_KEY to deliver it.',
  );
  return { delivered: false, transport: 'log' };
}
