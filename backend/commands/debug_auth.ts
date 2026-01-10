import { BaseCommand, args } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import User from '#models/user'
import hash from '@adonisjs/core/services/hash'

export default class DebugAuth extends BaseCommand {
  static commandName = 'debug:auth'
  static description = 'Debug authentication'

  static options: CommandOptions = {
    startApp: true,
  }

  @args.string({ description: 'Email' })
  declare email: string

  @args.string({ description: 'Password to test' })
  declare password: string

  async run() {
    const user = await User.findBy('email', this.email)

    if (!user) {
      this.logger.error(`User not found: ${this.email}`)
      return
    }

    this.logger.info(`User found: ${user.email}`)
    this.logger.info(`Stored password hash: ${user.password}`)
    this.logger.info(`Hash length: ${user.password.length}`)

    // Test hash verification
    try {
      const isValid = await hash.verify(user.password, this.password)
      this.logger.info(`Password valid: ${isValid}`)
    } catch (error) {
      this.logger.error(`Hash verify error: ${error}`)
    }

    // Test verifyCredentials
    try {
      const verifiedUser = await User.verifyCredentials(this.email, this.password)
      this.logger.success(`verifyCredentials succeeded! User ID: ${verifiedUser.id}`)
    } catch (error) {
      this.logger.error(`verifyCredentials failed: ${error}`)
    }
  }
}
