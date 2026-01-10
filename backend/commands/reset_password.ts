import { BaseCommand, args } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import User from '#models/user'

export default class ResetPassword extends BaseCommand {
  static commandName = 'reset:password'
  static description = 'Réinitialiser le mot de passe d\'un utilisateur'

  static options: CommandOptions = {
    startApp: true,
  }

  @args.string({ description: 'Email de l\'utilisateur' })
  declare email: string

  @args.string({ description: 'Nouveau mot de passe' })
  declare password: string

  async run() {
    const user = await User.findBy('email', this.email)

    if (!user) {
      this.logger.error(`Aucun utilisateur trouvé avec l'email: ${this.email}`)
      return
    }

    user.password = this.password
    await user.save()

    this.logger.success(`Mot de passe réinitialisé pour ${this.email}`)
  }
}
