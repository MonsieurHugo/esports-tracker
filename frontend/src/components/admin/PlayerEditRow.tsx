'use client'

import { useState } from 'react'
import type { AdminPlayer, AdminTeam, UpdatePlayerPayload, UpsertContractPayload } from '@/lib/types'
import { PLAYER_ROLES } from '@/lib/types'

interface PlayerEditRowProps {
  player: AdminPlayer
  teams: AdminTeam[]
  onSavePlayer: (playerId: number, data: UpdatePlayerPayload) => Promise<void>
  onSaveContract: (playerId: number, data: UpsertContractPayload) => Promise<void>
  onRemoveContract: (playerId: number) => Promise<void>
}

export function PlayerEditRow({
  player,
  teams,
  onSavePlayer,
  onSaveContract,
  onRemoveContract,
}: PlayerEditRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Player info state
  const [currentPseudo, setCurrentPseudo] = useState(player.currentPseudo)
  const [firstName, setFirstName] = useState(player.firstName ?? '')
  const [lastName, setLastName] = useState(player.lastName ?? '')
  const [nationality, setNationality] = useState(player.nationality ?? '')
  const [twitter, setTwitter] = useState(player.twitter ?? '')
  const [twitch, setTwitch] = useState(player.twitch ?? '')

  // Contract state
  const [teamId, setTeamId] = useState<number | null>(player.contract?.teamId ?? null)
  const [role, setRole] = useState<string>(player.contract?.role ?? '')
  const [isStarter, setIsStarter] = useState(player.contract?.isStarter ?? true)

  const resetForm = () => {
    setCurrentPseudo(player.currentPseudo)
    setFirstName(player.firstName ?? '')
    setLastName(player.lastName ?? '')
    setNationality(player.nationality ?? '')
    setTwitter(player.twitter ?? '')
    setTwitch(player.twitch ?? '')
    setTeamId(player.contract?.teamId ?? null)
    setRole(player.contract?.role ?? '')
    setIsStarter(player.contract?.isStarter ?? true)
  }

  const handleCancel = () => {
    resetForm()
    setIsEditing(false)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Save player info if changed
      const playerPayload: UpdatePlayerPayload = {}
      if (currentPseudo !== player.currentPseudo) playerPayload.currentPseudo = currentPseudo
      if (firstName !== (player.firstName ?? '')) playerPayload.firstName = firstName || null
      if (lastName !== (player.lastName ?? '')) playerPayload.lastName = lastName || null
      if (nationality !== (player.nationality ?? '')) playerPayload.nationality = nationality || null
      if (twitter !== (player.twitter ?? '')) playerPayload.twitter = twitter || null
      if (twitch !== (player.twitch ?? '')) playerPayload.twitch = twitch || null

      if (Object.keys(playerPayload).length > 0) {
        await onSavePlayer(player.playerId, playerPayload)
      }

      // Handle contract changes
      const hadContract = player.contract !== null
      const hasNewTeam = teamId !== null

      if (hasNewTeam) {
        // Create or update contract
        const contractChanged =
          !hadContract ||
          teamId !== player.contract?.teamId ||
          role !== (player.contract?.role ?? '') ||
          isStarter !== player.contract?.isStarter

        if (contractChanged) {
          await onSaveContract(player.playerId, {
            teamId: teamId!,
            role: role || null,
            isStarter,
          })
        }
      } else if (hadContract && !hasNewTeam) {
        // Remove contract
        await onRemoveContract(player.playerId)
      }

      setIsEditing(false)
    } catch {
      // Error is re-thrown by handlers, just keep editing state
    } finally {
      setIsSaving(false)
    }
  }

  const selectedTeam = teams.find((t) => t.teamId === teamId)

  if (!isEditing) {
    // Display mode
    return (
      <tr
        className="border-b border-(--border) hover:bg-(--bg-hover) cursor-pointer transition-colors"
        onClick={() => setIsEditing(true)}
      >
        <td className="px-4 py-3 font-medium">{player.currentPseudo}</td>
        <td className="px-4 py-3 text-(--text-muted)">{player.firstName || '-'}</td>
        <td className="px-4 py-3 text-(--text-muted)">{player.lastName || '-'}</td>
        <td className="px-4 py-3 text-(--text-muted)">{player.nationality || '-'}</td>
        <td className="px-4 py-3">
          {player.contract ? (
            <span className="text-sm">
              <span className="text-(--accent)">{player.contract.teamShortName}</span>
              {player.contract.role && (
                <span className="text-(--text-muted) ml-2">{player.contract.role}</span>
              )}
              {!player.contract.isStarter && (
                <span className="text-xs text-(--warning) ml-2">(Sub)</span>
              )}
            </span>
          ) : (
            <span className="text-(--text-muted)">-</span>
          )}
        </td>
        <td className="px-4 py-3 text-(--text-muted) text-sm">
          {player.accounts.length > 0
            ? player.accounts.map((a) => `${a.gameName}#${a.tagLine}`).join(', ')
            : '-'}
        </td>
        <td className="px-4 py-3 text-(--text-muted) text-sm">{player.twitter || '-'}</td>
        <td className="px-4 py-3 text-(--text-muted) text-sm">{player.twitch || '-'}</td>
        <td className="px-4 py-3">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsEditing(true)
            }}
            className="text-xs text-(--accent) hover:underline"
          >
            Modifier
          </button>
        </td>
      </tr>
    )
  }

  // Edit mode
  return (
    <tr className="border-b border-(--border) bg-(--bg-secondary)">
      <td className="px-4 py-3">
        <input
          type="text"
          value={currentPseudo}
          onChange={(e) => setCurrentPseudo(e.target.value)}
          className="w-full bg-(--bg-card) border border-(--border) rounded-md px-2 py-1 text-sm focus:outline-none focus:border-(--accent)"
          placeholder="Pseudo"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="w-full bg-(--bg-card) border border-(--border) rounded-md px-2 py-1 text-sm focus:outline-none focus:border-(--accent)"
          placeholder="Prénom"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="w-full bg-(--bg-card) border border-(--border) rounded-md px-2 py-1 text-sm focus:outline-none focus:border-(--accent)"
          placeholder="Nom"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="text"
          value={nationality}
          onChange={(e) => setNationality(e.target.value)}
          className="w-full bg-(--bg-card) border border-(--border) rounded-md px-2 py-1 text-sm focus:outline-none focus:border-(--accent)"
          placeholder="Nationalité"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-2">
          <select
            value={teamId ?? ''}
            onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : null)}
            className="bg-(--bg-card) border border-(--border) rounded-md px-2 py-1 text-sm"
          >
            <option value="">Sans équipe</option>
            {teams.map((team) => (
              <option key={team.teamId} value={team.teamId}>
                {team.shortName} - {team.currentName}
              </option>
            ))}
          </select>
          {teamId && (
            <>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="bg-(--bg-card) border border-(--border) rounded-md px-2 py-1 text-sm"
              >
                <option value="">Rôle...</option>
                {PLAYER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-(--text-muted)">
                <input
                  type="checkbox"
                  checked={isStarter}
                  onChange={(e) => setIsStarter(e.target.checked)}
                  className="rounded border-(--border)"
                />
                Titulaire
              </label>
            </>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-(--text-muted) text-sm">
        {player.accounts.length > 0
          ? player.accounts.map((a) => `${a.gameName}#${a.tagLine}`).join(', ')
          : '-'}
      </td>
      <td className="px-4 py-3">
        <input
          type="text"
          value={twitter}
          onChange={(e) => setTwitter(e.target.value)}
          className="w-full bg-(--bg-card) border border-(--border) rounded-md px-2 py-1 text-sm focus:outline-none focus:border-(--accent)"
          placeholder="@handle"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="text"
          value={twitch}
          onChange={(e) => setTwitch(e.target.value)}
          className="w-full bg-(--bg-card) border border-(--border) rounded-md px-2 py-1 text-sm focus:outline-none focus:border-(--accent)"
          placeholder="channel"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-3 py-1 bg-(--accent) text-black rounded-md text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            {isSaving ? '...' : 'OK'}
          </button>
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="px-3 py-1 bg-(--bg-card) border border-(--border) rounded-md text-xs hover:bg-(--bg-hover) disabled:opacity-50"
          >
            Annuler
          </button>
        </div>
      </td>
    </tr>
  )
}
