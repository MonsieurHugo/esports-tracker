import { BaseCommand, args } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import User from '#models/user'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'

export default class FixUser extends BaseCommand {
  static commandName = 'fix:user'
  static description = 'Fix user password by directly updating the hash'

  static options: CommandOptions = {
    startApp: true,
  }

  @args.string({ description: 'Email' })
  declare email: string

  @args.string({ description: 'New password' })
  declare password: string

  async run() {
    // Create hash directly
    const hashedPassword = await hash.make(this.password)
    this.logger.info(`Created hash: ${hashedPassword}`)

    // Verify hash works
    const verifyTest = await hash.verify(hashedPassword, this.password)
    this.logger.info(`Hash verification test: ${verifyTest}`)

    // Update directly in database (bypass model)
    await db.from('users')
      .where('email', this.email)
      .update({ password: hashedPassword })

    this.logger.info(`Updated password directly in database`)

    // Verify the update
    const user = await User.findBy('email', this.email)
    if (user) {
      this.logger.info(`User password from DB: ${user.password}`)
      this.logger.info(`Passwords match: ${user.password === hashedPassword}`)

      // Final verification
      const finalVerify = await hash.verify(user.password, this.password)
      this.logger.info(`Final hash verification: ${finalVerify}`)

      // Test verifyCredentials
      try {
        await User.verifyCredentials(this.email, this.password)
        this.logger.success('Login test successful!')
      } catch (e) {
        this.logger.error(`Login test failed: ${e}`)
      }
    }
  }
}
