import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import User from '#models/user'

export default class ListUsers extends BaseCommand {
  static commandName = 'list:users'
  static description = 'Lister tous les utilisateurs'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const users = await User.all()

    if (users.length === 0) {
      this.logger.warning('Aucun utilisateur trouvé dans la base de données')
      return
    }

    this.logger.info(`${users.length} utilisateur(s) trouvé(s):`)
    for (const user of users) {
      this.logger.info(`  - ID: ${user.id}, Email: ${user.email}, Role: ${user.role}`)
    }
  }
}
