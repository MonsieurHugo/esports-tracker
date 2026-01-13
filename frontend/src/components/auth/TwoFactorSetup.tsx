'use client'

import { useState } from 'react'
import { authApi } from '@/lib/auth'
import { useAuth } from '@/contexts/AuthContext'

type SetupStep = 'initial' | 'qrcode' | 'verify' | 'complete' | 'disable'

interface TwoFactorSetupProps {
  isEnabled: boolean
  onUpdate: () => void
}

export default function TwoFactorSetup({ isEnabled, onUpdate }: TwoFactorSetupProps) {
  const { refreshUser } = useAuth()
  const [step, setStep] = useState<SetupStep>('initial')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [secret, setSecret] = useState('')
  const [qrCodeUri, setQrCodeUri] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleStartSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const result = await authApi.setup2FA(password)
      setSecret(result.secret)
      setQrCodeUri(result.qrCodeUri)
      setStep('qrcode')
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'initialisation')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const result = await authApi.verify2FA(code)
      setRecoveryCodes(result.recoveryCodes)
      setStep('complete')
      await refreshUser()
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code invalide')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await authApi.disable2FA(password, code)
      setStep('initial')
      setPassword('')
      setCode('')
      await refreshUser()
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la desactivation')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegenerateCodes = async () => {
    setError('')
    setIsLoading(true)

    try {
      const codes = await authApi.regenerateRecoveryCodes(password)
      setRecoveryCodes(codes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la regeneration')
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  // Initial state - Enable or Disable button
  if (step === 'initial') {
    return (
      <div className="p-6 bg-(--bg-secondary) border border-(--border) rounded-xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-medium mb-1">Authentification a deux facteurs (2FA)</h3>
            <p className="text-sm text-(--text-muted)">
              {isEnabled
                ? 'La 2FA est activee sur votre compte'
                : 'Ajoutez une couche de securite supplementaire'}
            </p>
          </div>
          <span
            className={`px-2.5 py-1 text-xs font-medium rounded-full ${
              isEnabled
                ? 'bg-(--positive)/10 text-(--positive)'
                : 'bg-(--text-muted)/10 text-(--text-muted)'
            }`}
          >
            {isEnabled ? 'Active' : 'Desactive'}
          </span>
        </div>

        <button
          onClick={() => setStep(isEnabled ? 'disable' : 'qrcode')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            isEnabled
              ? 'bg-(--negative)/10 text-(--negative) hover:bg-(--negative)/20'
              : 'bg-(--accent) text-(--bg-primary) hover:bg-(--accent-hover)'
          }`}
        >
          {isEnabled ? 'Desactiver la 2FA' : 'Activer la 2FA'}
        </button>
      </div>
    )
  }

  // Password confirmation for setup
  if (step === 'qrcode' && !secret) {
    return (
      <div className="p-6 bg-(--bg-secondary) border border-(--border) rounded-xl">
        <button
          onClick={() => setStep('initial')}
          className="mb-4 text-sm text-(--text-muted) hover:text-(--text-primary) transition-colors"
        >
          &larr; Retour
        </button>

        <h3 className="font-medium mb-4">Confirmez votre mot de passe</h3>

        <form onSubmit={handleStartSetup} className="space-y-4">
          <div>
            <label
              htmlFor="setup-password"
              className="block text-sm font-medium text-(--text-secondary) mb-1.5"
            >
              Mot de passe
            </label>
            <input
              id="setup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2.5 bg-(--bg-card) border border-(--border) rounded-lg text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:border-(--accent) transition-colors"
            />
          </div>

          {error && (
            <div className="px-3 py-2 bg-(--negative)/10 border border-(--negative)/30 rounded-lg text-sm text-(--negative)">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-(--accent) text-(--bg-primary) font-medium rounded-lg hover:bg-(--accent-hover) transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Chargement...' : 'Continuer'}
          </button>
        </form>
      </div>
    )
  }

  // QR Code display
  if (step === 'qrcode' && secret) {
    return (
      <div className="p-6 bg-(--bg-secondary) border border-(--border) rounded-xl">
        <button
          onClick={() => {
            setStep('initial')
            setSecret('')
            setQrCodeUri('')
          }}
          className="mb-4 text-sm text-(--text-muted) hover:text-(--text-primary) transition-colors"
        >
          &larr; Annuler
        </button>

        <h3 className="font-medium mb-4">Scannez le QR code</h3>
        <p className="text-sm text-(--text-muted) mb-4">
          Utilisez une application comme Google Authenticator, Authy ou 1Password
        </p>

        {/* QR Code placeholder - in production, generate actual QR code */}
        <div className="mb-4 p-4 bg-white rounded-lg inline-block">
          <div className="w-48 h-48 flex items-center justify-center border-2 border-dashed border-gray-300 rounded">
            <span className="text-xs text-gray-500 text-center px-2">
              QR Code<br />
              <span className="font-mono text-[10px]">{qrCodeUri.slice(0, 50)}...</span>
            </span>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-sm text-(--text-muted) mb-2">
            Ou entrez cette cle manuellement:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-(--bg-card) border border-(--border) rounded font-mono text-sm break-all">
              {secret}
            </code>
            <button
              onClick={() => copyToClipboard(secret)}
              className="px-3 py-2 text-sm bg-(--bg-card) border border-(--border) rounded hover:bg-(--bg-hover) transition-colors"
            >
              Copier
            </button>
          </div>
        </div>

        <button
          onClick={() => setStep('verify')}
          className="w-full py-2.5 bg-(--accent) text-(--bg-primary) font-medium rounded-lg hover:bg-(--accent-hover) transition-colors"
        >
          J&apos;ai scanne le QR code
        </button>
      </div>
    )
  }

  // Verify code
  if (step === 'verify') {
    return (
      <div className="p-6 bg-(--bg-secondary) border border-(--border) rounded-xl">
        <button
          onClick={() => setStep('qrcode')}
          className="mb-4 text-sm text-(--text-muted) hover:text-(--text-primary) transition-colors"
        >
          &larr; Retour
        </button>

        <h3 className="font-medium mb-4">Verifiez votre configuration</h3>
        <p className="text-sm text-(--text-muted) mb-4">
          Entrez le code a 6 chiffres affiche dans votre application
        </p>

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              autoComplete="one-time-code"
              placeholder="000000"
              className="w-full px-3 py-4 bg-(--bg-card) border border-(--border) rounded-lg text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:border-(--accent) transition-colors font-mono text-center text-2xl tracking-widest"
            />
          </div>

          {error && (
            <div className="px-3 py-2 bg-(--negative)/10 border border-(--negative)/30 rounded-lg text-sm text-(--negative)">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || code.length !== 6}
            className="w-full py-2.5 bg-(--accent) text-(--bg-primary) font-medium rounded-lg hover:bg-(--accent-hover) transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Verification...' : 'Activer la 2FA'}
          </button>
        </form>
      </div>
    )
  }

  // Complete - show recovery codes
  if (step === 'complete') {
    return (
      <div className="p-6 bg-(--bg-secondary) border border-(--border) rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-(--positive)/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-(--positive)" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="font-medium">2FA activee avec succes!</h3>
        </div>

        <div className="p-4 bg-(--warning)/10 border border-(--warning)/30 rounded-lg mb-4">
          <p className="text-sm text-(--warning) font-medium mb-2">
            Sauvegardez vos codes de recuperation
          </p>
          <p className="text-xs text-(--text-muted)">
            Ces codes vous permettront de vous connecter si vous perdez acces a votre application authenticator.
            Ils ne seront plus affiches apres cette page.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {recoveryCodes.map((code, index) => (
            <code
              key={index}
              className="px-3 py-2 bg-(--bg-card) border border-(--border) rounded font-mono text-sm text-center"
            >
              {code}
            </code>
          ))}
        </div>

        <button
          onClick={() => copyToClipboard(recoveryCodes.join('\n'))}
          className="w-full py-2 text-sm bg-(--bg-card) border border-(--border) rounded-lg hover:bg-(--bg-hover) transition-colors mb-4"
        >
          Copier tous les codes
        </button>

        <button
          onClick={() => setStep('initial')}
          className="w-full py-2.5 bg-(--accent) text-(--bg-primary) font-medium rounded-lg hover:bg-(--accent-hover) transition-colors"
        >
          J&apos;ai sauvegarde mes codes
        </button>
      </div>
    )
  }

  // Disable 2FA
  if (step === 'disable') {
    return (
      <div className="p-6 bg-(--bg-secondary) border border-(--border) rounded-xl">
        <button
          onClick={() => {
            setStep('initial')
            setPassword('')
            setCode('')
            setError('')
          }}
          className="mb-4 text-sm text-(--text-muted) hover:text-(--text-primary) transition-colors"
        >
          &larr; Annuler
        </button>

        <h3 className="font-medium mb-4">Desactiver la 2FA</h3>
        <p className="text-sm text-(--text-muted) mb-4">
          Entrez votre mot de passe et un code 2FA pour confirmer
        </p>

        <form onSubmit={handleDisable} className="space-y-4">
          <div>
            <label
              htmlFor="disable-password"
              className="block text-sm font-medium text-(--text-secondary) mb-1.5"
            >
              Mot de passe
            </label>
            <input
              id="disable-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2.5 bg-(--bg-card) border border-(--border) rounded-lg text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:border-(--accent) transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="disable-code"
              className="block text-sm font-medium text-(--text-secondary) mb-1.5"
            >
              Code 2FA
            </label>
            <input
              id="disable-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              autoComplete="one-time-code"
              placeholder="000000"
              className="w-full px-3 py-2.5 bg-(--bg-card) border border-(--border) rounded-lg text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:border-(--accent) transition-colors font-mono text-center tracking-widest"
            />
          </div>

          {error && (
            <div className="px-3 py-2 bg-(--negative)/10 border border-(--negative)/30 rounded-lg text-sm text-(--negative)">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || code.length !== 6}
            className="w-full py-2.5 bg-(--negative) text-white font-medium rounded-lg hover:bg-(--negative)/90 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Desactivation...' : 'Desactiver la 2FA'}
          </button>
        </form>
      </div>
    )
  }

  return null
}
