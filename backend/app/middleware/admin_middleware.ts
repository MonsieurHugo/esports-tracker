import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Admin middleware to verify that user has admin role
 */
export default class AdminMiddleware {
  async handle({ auth, response }: HttpContext, next: NextFn) {
    const user = auth.user

    if (!user) {
      return response.unauthorized({ error: 'Non authentifié' })
    }

    if (user.role !== 'admin') {
      return response.forbidden({ error: 'Accès réservé aux administrateurs' })
    }

    return next()
  }
}
