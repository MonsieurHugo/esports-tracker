import { test } from '@japa/runner'
import {
  registerValidator,
  loginValidator,
  changePasswordValidator,
} from '#validators/auth_validators'

test.group('Auth Validators - Password Rules', () => {
  test('rejects password shorter than 8 characters', async ({ assert }) => {
    const data = {
      email: 'test@example.com',
      password: 'Short1!',
      confirmPassword: 'Short1!',
    }

    try {
      await registerValidator.validate(data)
      assert.fail('Should have thrown validation error')
    } catch (error: any) {
      assert.isTrue(error.messages?.some((m: any) => m.field === 'password'))
    }
  })

  test('rejects password without uppercase letter', async ({ assert }) => {
    const data = {
      email: 'test@example.com',
      password: 'lowercase123!',
      confirmPassword: 'lowercase123!',
    }

    try {
      await registerValidator.validate(data)
      assert.fail('Should have thrown validation error')
    } catch (error: any) {
      assert.isTrue(error.messages?.some((m: any) => m.field === 'password'))
    }
  })

  test('rejects password without lowercase letter', async ({ assert }) => {
    const data = {
      email: 'test@example.com',
      password: 'UPPERCASE123!',
      confirmPassword: 'UPPERCASE123!',
    }

    try {
      await registerValidator.validate(data)
      assert.fail('Should have thrown validation error')
    } catch (error: any) {
      assert.isTrue(error.messages?.some((m: any) => m.field === 'password'))
    }
  })

  test('rejects password without number', async ({ assert }) => {
    const data = {
      email: 'test@example.com',
      password: 'NoNumbers!!',
      confirmPassword: 'NoNumbers!!',
    }

    try {
      await registerValidator.validate(data)
      assert.fail('Should have thrown validation error')
    } catch (error: any) {
      assert.isTrue(error.messages?.some((m: any) => m.field === 'password'))
    }
  })

  test('rejects password without special character', async ({ assert }) => {
    const data = {
      email: 'test@example.com',
      password: 'NoSpecial123',
      confirmPassword: 'NoSpecial123',
    }

    try {
      await registerValidator.validate(data)
      assert.fail('Should have thrown validation error')
    } catch (error: any) {
      assert.isTrue(error.messages?.some((m: any) => m.field === 'password'))
    }
  })

  test('accepts valid strong password', async ({ assert }) => {
    const data = {
      email: 'test@example.com',
      password: 'StrongP@ss123',
      confirmPassword: 'StrongP@ss123',
    }

    const result = await registerValidator.validate(data)
    assert.equal(result.email, 'test@example.com')
    assert.equal(result.password, 'StrongP@ss123')
  })
})

test.group('Auth Validators - Email Validation', () => {
  test('normalizes email to lowercase', async ({ assert }) => {
    const data = {
      email: 'TEST@EXAMPLE.COM',
      password: 'StrongP@ss123',
      confirmPassword: 'StrongP@ss123',
    }

    const result = await registerValidator.validate(data)
    assert.equal(result.email, 'test@example.com')
  })

  test('trims whitespace from email', async ({ assert }) => {
    const data = {
      email: '  test@example.com  ',
      password: 'StrongP@ss123',
      confirmPassword: 'StrongP@ss123',
    }

    const result = await registerValidator.validate(data)
    assert.equal(result.email, 'test@example.com')
  })

  test('rejects invalid email format', async ({ assert }) => {
    const data = {
      email: 'not-an-email',
      password: 'StrongP@ss123',
      confirmPassword: 'StrongP@ss123',
    }

    try {
      await registerValidator.validate(data)
      assert.fail('Should have thrown validation error')
    } catch (error: any) {
      assert.isTrue(error.messages?.some((m: any) => m.field === 'email'))
    }
  })
})

test.group('Auth Validators - Login Validator', () => {
  test('accepts valid login credentials', async ({ assert }) => {
    const data = {
      email: 'test@example.com',
      password: 'anypassword',
    }

    const result = await loginValidator.validate(data)
    assert.equal(result.email, 'test@example.com')
  })

  test('accepts 2FA code when provided', async ({ assert }) => {
    const data = {
      email: 'test@example.com',
      password: 'anypassword',
      twoFactorCode: '123456',
    }

    const result = await loginValidator.validate(data)
    assert.equal(result.twoFactorCode, '123456')
  })

  test('rejects 2FA code with wrong length', async ({ assert }) => {
    const data = {
      email: 'test@example.com',
      password: 'anypassword',
      twoFactorCode: '12345', // 5 chars instead of 6
    }

    try {
      await loginValidator.validate(data)
      assert.fail('Should have thrown validation error')
    } catch (error: any) {
      assert.isTrue(error.messages?.some((m: any) => m.field === 'twoFactorCode'))
    }
  })
})

test.group('Auth Validators - Change Password Validator', () => {
  test('requires current password', async ({ assert }) => {
    const data = {
      currentPassword: '',
      newPassword: 'NewStrongP@ss1',
      confirmNewPassword: 'NewStrongP@ss1',
    }

    try {
      await changePasswordValidator.validate(data)
      assert.fail('Should have thrown validation error')
    } catch (error: any) {
      assert.isTrue(error.messages?.some((m: any) => m.field === 'currentPassword'))
    }
  })

  test('validates new password strength', async ({ assert }) => {
    const data = {
      currentPassword: 'oldpassword',
      newPassword: 'weak',
      confirmNewPassword: 'weak',
    }

    try {
      await changePasswordValidator.validate(data)
      assert.fail('Should have thrown validation error')
    } catch (error: any) {
      assert.isTrue(error.messages?.some((m: any) => m.field === 'newPassword'))
    }
  })
})
