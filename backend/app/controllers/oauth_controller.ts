import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import User from '#models/user'
import OAuthAccount, { type OAuthProvider } from '#models/oauth_account'
import auditService from '#services/audit_service'
import env from '#start/env'

// OAuth configuration
const OAUTH_CONFIG = {
  google: {
    clientId: () => env.get('GOOGLE_CLIENT_ID', ''),
    clientSecret: () => env.get('GOOGLE_CLIENT_SECRET', ''),
    redirectUri: () => env.get('GOOGLE_REDIRECT_URI', ''),
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: ['email', 'profile'],
  },
  github: {
    clientId: () => env.get('GITHUB_CLIENT_ID', ''),
    clientSecret: () => env.get('GITHUB_CLIENT_SECRET', ''),
    redirectUri: () => env.get('GITHUB_REDIRECT_URI', ''),
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scopes: ['user:email'],
  },
  discord: {
    clientId: () => env.get('DISCORD_CLIENT_ID', ''),
    clientSecret: () => env.get('DISCORD_CLIENT_SECRET', ''),
    redirectUri: () => env.get('DISCORD_REDIRECT_URI', ''),
    authUrl: 'https://discord.com/api/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    userInfoUrl: 'https://discord.com/api/users/@me',
    scopes: ['identify', 'email'],
  },
}

interface OAuthUserInfo {
  id: string
  email: string | null
  name: string | null
}

export default class OAuthController {
  /**
   * Generate a random state parameter for CSRF protection
   */
  private generateState(): string {
    return Array.from({ length: 32 }, () =>
      Math.random().toString(36).charAt(2)
    ).join('')
  }

  /**
   * Redirect to OAuth provider
   * GET /api/auth/oauth/:provider
   */
  async redirect({ params, response, session }: HttpContext) {
    const provider = params.provider as OAuthProvider

    if (!['google', 'github', 'discord'].includes(provider)) {
      return response.badRequest({ error: 'Provider non supporté' })
    }

    const config = OAUTH_CONFIG[provider]

    // Check if provider is configured
    if (!config.clientId()) {
      return response.internalServerError({ error: `OAuth ${provider} non configuré` })
    }

    // Generate and store state for CSRF protection
    const state = this.generateState()
    session.put('oauth_state', state)
    session.put('oauth_provider', provider)

    // Build authorization URL
    const params_obj = new URLSearchParams({
      client_id: config.clientId(),
      redirect_uri: config.redirectUri(),
      scope: config.scopes.join(' '),
      response_type: 'code',
      state,
    })

    // GitHub requires different parameter for scope
    if (provider === 'github') {
      params_obj.set('scope', config.scopes.join(' '))
    }

    // Discord requires additional parameters
    if (provider === 'discord') {
      params_obj.set('response_type', 'code')
    }

    const authUrl = `${config.authUrl}?${params_obj.toString()}`

    return response.redirect(authUrl)
  }

  /**
   * Handle OAuth callback
   * GET /api/auth/oauth/:provider/callback
   */
  async callback({ params, request, response, session, auth }: HttpContext) {
    const ctx = arguments[0] as HttpContext
    const provider = params.provider as OAuthProvider

    if (!['google', 'github', 'discord'].includes(provider)) {
      return response.badRequest({ error: 'Provider non supporté' })
    }

    const config = OAUTH_CONFIG[provider]

    // Verify state
    const state = request.input('state')
    const storedState = session.get('oauth_state')
    const storedProvider = session.get('oauth_provider')

    if (!state || state !== storedState || provider !== storedProvider) {
      session.forget('oauth_state')
      session.forget('oauth_provider')
      return response.badRequest({ error: 'State invalide - possible CSRF attack' })
    }

    // Clear state
    session.forget('oauth_state')
    session.forget('oauth_provider')

    // Check for error from provider
    const error = request.input('error')
    if (error) {
      const errorDescription = request.input('error_description') || error
      return response.badRequest({ error: `OAuth error: ${errorDescription}` })
    }

    // Get authorization code
    const code = request.input('code')
    if (!code) {
      return response.badRequest({ error: 'Code d\'autorisation manquant' })
    }

    try {
      // Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(provider, code, config)

      // Get user info from provider
      const userInfo = await this.getUserInfo(provider, tokens.access_token, config)

      if (!userInfo.id) {
        return response.badRequest({ error: 'Impossible de récupérer les informations utilisateur' })
      }

      // Check if OAuth account already exists
      let oauthAccount = await OAuthAccount.query()
        .where('provider', provider)
        .where('providerUserId', userInfo.id)
        .preload('user')
        .first()

      let user: User

      if (oauthAccount) {
        // OAuth account exists - login
        user = oauthAccount.user

        // Update tokens
        oauthAccount.accessToken = tokens.access_token
        oauthAccount.refreshToken = tokens.refresh_token || null
        oauthAccount.tokenExpiresAt = tokens.expires_in
          ? DateTime.now().plus({ seconds: tokens.expires_in })
          : null
        await oauthAccount.save()
      } else {
        // Check if we're linking to existing session
        const currentUser = auth.user

        if (currentUser) {
          // Link OAuth to existing account
          oauthAccount = await OAuthAccount.create({
            userId: currentUser.id,
            provider,
            providerUserId: userInfo.id,
            providerEmail: userInfo.email,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            tokenExpiresAt: tokens.expires_in
              ? DateTime.now().plus({ seconds: tokens.expires_in })
              : null,
          })

          await auditService.logOAuthLinked(currentUser.id, provider, ctx)

          // Redirect to settings page
          const frontendUrl = env.get('FRONTEND_URL', 'http://localhost:3000')
          return response.redirect(`${frontendUrl}/settings?oauth=linked&provider=${provider}`)
        }

        // Check if email already exists
        if (userInfo.email) {
          const existingUser = await User.findBy('email', userInfo.email)

          if (existingUser) {
            // Link OAuth to existing account with same email
            oauthAccount = await OAuthAccount.create({
              userId: existingUser.id,
              provider,
              providerUserId: userInfo.id,
              providerEmail: userInfo.email,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || null,
              tokenExpiresAt: tokens.expires_in
                ? DateTime.now().plus({ seconds: tokens.expires_in })
                : null,
            })

            user = existingUser
            await auditService.logOAuthLinked(user.id, provider, ctx)
          } else {
            // Create new user
            user = await User.create({
              email: userInfo.email,
              password: this.generateState() + this.generateState(), // Random password
              fullName: userInfo.name,
              role: 'user',
              emailVerified: true, // OAuth verified the email
            })

            oauthAccount = await OAuthAccount.create({
              userId: user.id,
              provider,
              providerUserId: userInfo.id,
              providerEmail: userInfo.email,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || null,
              tokenExpiresAt: tokens.expires_in
                ? DateTime.now().plus({ seconds: tokens.expires_in })
                : null,
            })

            await auditService.logRegister(user.id, ctx)
          }
        } else {
          // No email from provider - need to ask user for email
          // For now, return error
          return response.badRequest({
            error: 'Impossible de récupérer l\'email depuis le provider. Veuillez vous inscrire normalement.',
          })
        }
      }

      // Login user
      await auth.use('web').login(user)

      // Update last login
      user.lastLoginAt = DateTime.now()
      user.lastLoginIp = this.getClientIp(ctx)
      await user.save()

      // Log OAuth login
      await auditService.logLogin(user.id, ctx, provider)

      // Redirect to frontend
      const frontendUrl = env.get('FRONTEND_URL', 'http://localhost:3000')
      return response.redirect(`${frontendUrl}/admin/players?oauth=success`)
    } catch (error) {
      console.error('OAuth error:', error)
      return response.internalServerError({
        error: 'Erreur lors de l\'authentification OAuth',
      })
    }
  }

  /**
   * Unlink OAuth account
   * DELETE /api/auth/oauth/:provider
   */
  async unlink({ params, response, auth }: HttpContext) {
    const ctx = arguments[0] as HttpContext
    const provider = params.provider as OAuthProvider
    const user = auth.user

    if (!user) {
      return response.unauthorized({ error: 'Non authentifié' })
    }

    if (!['google', 'github', 'discord'].includes(provider)) {
      return response.badRequest({ error: 'Provider non supporté' })
    }

    // Find OAuth account
    const oauthAccount = await OAuthAccount.query()
      .where('userId', user.id)
      .where('provider', provider)
      .first()

    if (!oauthAccount) {
      return response.notFound({ error: 'Compte OAuth non trouvé' })
    }

    // Check if user has password (can still login without OAuth)
    // If no password and no other OAuth accounts, don't allow unlinking
    const otherOAuthAccounts = await OAuthAccount.query()
      .where('userId', user.id)
      .whereNot('provider', provider)
      .count('* as total')
      .first()

    const hasOtherAccounts = Number(otherOAuthAccounts?.$extras.total || 0) > 0

    // Note: User always has a password (random one for OAuth signups)
    // But we should warn them to set a password first
    if (!hasOtherAccounts) {
      // Allow unlinking but warn to set password
    }

    await oauthAccount.delete()

    await auditService.logOAuthUnlinked(user.id, provider, ctx)

    return response.ok({
      success: true,
      message: `Compte ${provider} délié`,
    })
  }

  /**
   * Get linked OAuth accounts
   * GET /api/auth/oauth/accounts
   */
  async accounts({ response, auth }: HttpContext) {
    const user = auth.user

    if (!user) {
      return response.unauthorized({ error: 'Non authentifié' })
    }

    const oauthAccounts = await OAuthAccount.query()
      .where('userId', user.id)
      .select('provider', 'providerEmail', 'createdAt')

    return response.ok({
      accounts: oauthAccounts.map((account) => ({
        provider: account.provider,
        email: account.providerEmail,
        linkedAt: account.createdAt,
      })),
    })
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(
    _provider: OAuthProvider,
    code: string,
    config: (typeof OAUTH_CONFIG)[OAuthProvider]
  ): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
    const body = new URLSearchParams({
      client_id: config.clientId(),
      client_secret: config.clientSecret(),
      code,
      redirect_uri: config.redirectUri(),
      grant_type: 'authorization_code',
    })

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Token exchange failed: ${errorText}`)
    }

    const data = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number }
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    }
  }

  /**
   * Get user info from provider
   */
  private async getUserInfo(
    provider: OAuthProvider,
    accessToken: string,
    config: (typeof OAUTH_CONFIG)[OAuthProvider]
  ): Promise<OAuthUserInfo> {
    const response = await fetch(config.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to get user info')
    }

    const data = await response.json() as Record<string, unknown>

    // Normalize user info based on provider
    switch (provider) {
      case 'google':
        return {
          id: data.id as string,
          email: data.email as string | null,
          name: data.name as string | null,
        }
      case 'github':
        return {
          id: String(data.id),
          email: data.email as string | null,
          name: (data.name || data.login) as string | null,
        }
      case 'discord':
        return {
          id: data.id as string,
          email: data.email as string | null,
          name: (data.global_name || data.username) as string | null,
        }
      default:
        throw new Error(`Unknown provider: ${provider}`)
    }
  }

  /**
   * Get client IP from request
   */
  private getClientIp(ctx: HttpContext): string {
    const forwarded = ctx.request.header('x-forwarded-for')
    if (forwarded) {
      return forwarded.split(',')[0].trim()
    }
    return ctx.request.ip() || 'unknown'
  }
}
