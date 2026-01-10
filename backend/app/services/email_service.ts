import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

interface EmailTemplateData {
  userName?: string
  actionUrl: string
  expiresIn?: string
}

class EmailService {
  private isDev = env.get('NODE_ENV') === 'development'
  private frontendUrl = env.get('FRONTEND_URL', 'http://localhost:3000')

  /**
   * Send an email
   * In development, logs the email. In production, would use SMTP.
   */
  async send(options: EmailOptions): Promise<boolean> {
    if (this.isDev) {
      // In development, just log the email
      logger.info({
        to: options.to,
        subject: options.subject,
        html: options.html.substring(0, 200) + '...',
      }, '[EMAIL] Would send email (dev mode)')

      console.log('\n========== EMAIL ==========')
      console.log(`To: ${options.to}`)
      console.log(`Subject: ${options.subject}`)
      console.log('---------------------------')
      console.log(options.text || options.html)
      console.log('============================\n')

      return true
    }

    // In production, you would use nodemailer or a service like SendGrid
    // Example with nodemailer (requires npm install nodemailer):
    /*
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.createTransport({
      host: env.get('SMTP_HOST'),
      port: env.get('SMTP_PORT'),
      secure: env.get('SMTP_SECURE'),
      auth: {
        user: env.get('SMTP_USER'),
        pass: env.get('SMTP_PASS'),
      },
    })

    await transporter.sendMail({
      from: env.get('SMTP_FROM', 'noreply@esports-tracker.com'),
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    })
    */

    logger.warn({ to: options.to }, '[EMAIL] Email service not configured for production')
    return false
  }

  /**
   * Send email verification email
   */
  async sendVerificationEmail(email: string, token: string, userName?: string): Promise<boolean> {
    const actionUrl = `${this.frontendUrl}/verify-email?token=${token}`

    const html = this.renderTemplate('verification', {
      userName,
      actionUrl,
      expiresIn: '24 heures',
    })

    return this.send({
      to: email,
      subject: 'Vérifiez votre adresse email - Esports Tracker',
      html,
      text: `Vérifiez votre email en cliquant sur ce lien: ${actionUrl}`,
    })
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, token: string, userName?: string): Promise<boolean> {
    const actionUrl = `${this.frontendUrl}/reset-password?token=${token}`

    const html = this.renderTemplate('password-reset', {
      userName,
      actionUrl,
      expiresIn: '1 heure',
    })

    return this.send({
      to: email,
      subject: 'Réinitialisation de mot de passe - Esports Tracker',
      html,
      text: `Réinitialisez votre mot de passe en cliquant sur ce lien: ${actionUrl}`,
    })
  }

  /**
   * Send welcome email after registration
   */
  async sendWelcomeEmail(email: string, userName?: string): Promise<boolean> {
    const actionUrl = `${this.frontendUrl}/login`

    const html = this.renderTemplate('welcome', {
      userName,
      actionUrl,
    })

    return this.send({
      to: email,
      subject: 'Bienvenue sur Esports Tracker!',
      html,
      text: `Bienvenue sur Esports Tracker! Connectez-vous ici: ${actionUrl}`,
    })
  }

  /**
   * Render email template
   */
  private renderTemplate(
    template: 'verification' | 'password-reset' | 'welcome',
    data: EmailTemplateData
  ): string {
    const greeting = data.userName ? `Bonjour ${data.userName},` : 'Bonjour,'

    const baseStyles = `
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #07070a;
      color: #f0f0f0;
    `

    const buttonStyles = `
      display: inline-block;
      padding: 12px 24px;
      background-color: #00dc82;
      color: #07070a;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
    `

    const templates: Record<string, string> = {
      verification: `
        <div style="${baseStyles} padding: 40px 20px;">
          <div style="max-width: 500px; margin: 0 auto; background-color: #101014; border-radius: 12px; padding: 32px; border: 1px solid #1e1e24;">
            <h1 style="color: #00dc82; margin: 0 0 24px; font-size: 24px;">Esports Tracker</h1>
            <p style="margin: 0 0 16px;">${greeting}</p>
            <p style="margin: 0 0 24px; color: #b0b0b8;">
              Merci de vous être inscrit! Veuillez vérifier votre adresse email en cliquant sur le bouton ci-dessous.
            </p>
            <p style="margin: 0 0 24px;">
              <a href="${data.actionUrl}" style="${buttonStyles}">Vérifier mon email</a>
            </p>
            <p style="margin: 0; color: #8a8a94; font-size: 14px;">
              Ce lien expire dans ${data.expiresIn}.
            </p>
            <hr style="border: none; border-top: 1px solid #1e1e24; margin: 24px 0;" />
            <p style="margin: 0; color: #8a8a94; font-size: 12px;">
              Si vous n'avez pas créé de compte, ignorez cet email.
            </p>
          </div>
        </div>
      `,
      'password-reset': `
        <div style="${baseStyles} padding: 40px 20px;">
          <div style="max-width: 500px; margin: 0 auto; background-color: #101014; border-radius: 12px; padding: 32px; border: 1px solid #1e1e24;">
            <h1 style="color: #00dc82; margin: 0 0 24px; font-size: 24px;">Esports Tracker</h1>
            <p style="margin: 0 0 16px;">${greeting}</p>
            <p style="margin: 0 0 24px; color: #b0b0b8;">
              Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.
            </p>
            <p style="margin: 0 0 24px;">
              <a href="${data.actionUrl}" style="${buttonStyles}">Réinitialiser mon mot de passe</a>
            </p>
            <p style="margin: 0; color: #8a8a94; font-size: 14px;">
              Ce lien expire dans ${data.expiresIn}.
            </p>
            <hr style="border: none; border-top: 1px solid #1e1e24; margin: 24px 0;" />
            <p style="margin: 0; color: #8a8a94; font-size: 12px;">
              Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. Votre mot de passe restera inchangé.
            </p>
          </div>
        </div>
      `,
      welcome: `
        <div style="${baseStyles} padding: 40px 20px;">
          <div style="max-width: 500px; margin: 0 auto; background-color: #101014; border-radius: 12px; padding: 32px; border: 1px solid #1e1e24;">
            <h1 style="color: #00dc82; margin: 0 0 24px; font-size: 24px;">Bienvenue sur Esports Tracker!</h1>
            <p style="margin: 0 0 16px;">${greeting}</p>
            <p style="margin: 0 0 24px; color: #b0b0b8;">
              Votre compte a été créé avec succès. Vous pouvez maintenant vous connecter et commencer à suivre vos joueurs esports préférés.
            </p>
            <p style="margin: 0 0 24px;">
              <a href="${data.actionUrl}" style="${buttonStyles}">Se connecter</a>
            </p>
            <hr style="border: none; border-top: 1px solid #1e1e24; margin: 24px 0;" />
            <p style="margin: 0; color: #8a8a94; font-size: 12px;">
              Merci d'utiliser Esports Tracker!
            </p>
          </div>
        </div>
      `,
    }

    return templates[template] || templates.welcome
  }
}

// Export singleton instance
const emailService = new EmailService()
export default emailService
