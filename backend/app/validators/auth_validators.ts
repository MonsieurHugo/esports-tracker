import vine from '@vinejs/vine'

/**
 * Password validation rules
 * - Minimum 8 characters, maximum 128
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character (@$!%*?&)
 */
const passwordRules = vine
  .string()
  .minLength(8)
  .maxLength(128)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/~`])/)
  .withMessage(
    'Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial'
  )

/**
 * Login validator
 */
export const loginValidator = vine.compile(
  vine.object({
    email: vine.string().email().trim().toLowerCase(),
    password: vine.string().minLength(1),
    twoFactorCode: vine.string().fixedLength(6).optional(),
    recoveryCode: vine.string().optional(),
  })
)

/**
 * Registration validator (public signup)
 */
export const registerValidator = vine.compile(
  vine.object({
    email: vine.string().email().trim().toLowerCase(),
    password: passwordRules,
    confirmPassword: vine.string(),
    fullName: vine.string().trim().minLength(2).maxLength(100).optional(),
  })
)

/**
 * Admin create user validator
 */
export const adminCreateUserValidator = vine.compile(
  vine.object({
    email: vine.string().email().trim().toLowerCase(),
    password: passwordRules,
    fullName: vine.string().trim().minLength(2).maxLength(100).optional(),
    role: vine.enum(['user', 'admin']).optional(),
  })
)

/**
 * Change password validator
 */
export const changePasswordValidator = vine.compile(
  vine.object({
    currentPassword: vine.string().minLength(1),
    newPassword: passwordRules,
    confirmNewPassword: vine.string(),
  })
)

/**
 * Password reset request validator
 */
export const forgotPasswordValidator = vine.compile(
  vine.object({
    email: vine.string().email().trim().toLowerCase(),
  })
)

/**
 * Password reset validator
 */
export const resetPasswordValidator = vine.compile(
  vine.object({
    token: vine.string().minLength(1),
    password: passwordRules,
    confirmPassword: vine.string(),
  })
)

/**
 * Email verification validator
 */
export const verifyEmailValidator = vine.compile(
  vine.object({
    token: vine.string().minLength(1),
  })
)

/**
 * 2FA setup validator
 */
export const setupTwoFactorValidator = vine.compile(
  vine.object({
    password: vine.string().minLength(1),
  })
)

/**
 * 2FA verify validator
 */
export const verifyTwoFactorValidator = vine.compile(
  vine.object({
    code: vine.string().fixedLength(6),
  })
)

/**
 * 2FA disable validator
 */
export const disableTwoFactorValidator = vine.compile(
  vine.object({
    password: vine.string().minLength(1),
    code: vine.string().fixedLength(6),
  })
)

/**
 * Update profile validator
 */
export const updateProfileValidator = vine.compile(
  vine.object({
    fullName: vine.string().trim().minLength(2).maxLength(100).optional(),
  })
)
