import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import User from '#models/user'

export default class CreateAdmin extends BaseCommand {
  static commandName = 'create:admin'
  static description = 'Créer un utilisateur administrateur'

  static options: CommandOptions = {
    startApp: true,
  }

  @args.string({ description: 'Email de l\'admin' })
  declare email: string

  @args.string({ description: 'Mot de passe' })
  declare password: string

  @flags.string({ description: 'Nom complet (optionnel)' })
  declare fullName?: string

  async run() {
    // Check if user already exists
    const existingUser = await User.findBy('email', this.email)
    if (existingUser) {
      this.logger.error(`Un utilisateur avec l'email ${this.email} existe déjà`)
      return
    }

    // Create admin user
    const user = await User.create({
      email: this.email,
      password: this.password,
      fullName: this.fullName || null,
      role: 'admin',
    })

    this.logger.success(`Admin créé avec succès!`)
    this.logger.info(`  ID: ${user.id}`)
    this.logger.info(`  Email: ${user.email}`)
    this.logger.info(`  Rôle: ${user.role}`)
  }
}
