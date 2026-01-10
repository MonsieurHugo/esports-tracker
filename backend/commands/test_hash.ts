import { BaseCommand, args } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import hash from '@adonisjs/core/services/hash'

export default class TestHash extends BaseCommand {
  static commandName = 'test:hash'
  static description = 'Test password hashing'

  static options: CommandOptions = {
    startApp: true,
  }

  @args.string({ description: 'Password to hash' })
  declare password: string

  async run() {
    this.logger.info(`Password: "${this.password}"`)

    // Create hash
    const hashed = await hash.make(this.password)
    this.logger.info(`New hash: ${hashed}`)

    // Verify immediately
    const isValid = await hash.verify(hashed, this.password)
    this.logger.info(`Immediate verify: ${isValid}`)
  }
}
