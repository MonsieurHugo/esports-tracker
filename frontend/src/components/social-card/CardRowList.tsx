import type { ReactNode } from 'react'
import { CardRankBadge } from './CardRankBadge'
import { CARD_COLORS } from './types'

interface CardRowListProps<T> {
  records: T[]
  renderRow: (record: T, index: number, isFirst: boolean) => ReactNode
  header?: ReactNode
  rowPadH: number
  rowPadL?: number
  rowGap: number
  badgeSize?: number
  rowHeight?: number
  leftBorder?: (record: T, index: number) => string | undefined
}

export function CardRowList<T>({
  records,
  renderRow,
  header,
  rowPadH,
  rowPadL,
  rowGap,
  badgeSize,
  rowHeight,
  leftBorder,
}: CardRowListProps<T>) {
  const top10 = records.slice(0, 10)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {header}
      {top10.map((r, i) => {
        const isFirst = i === 0
        const bgColor = isFirst
          ? CARD_COLORS.accent + '14'
          : i % 2 === 0
            ? CARD_COLORS.bgRow
            : CARD_COLORS.bgRowAlt

        const border = leftBorder?.(r, i)

        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              ...(rowHeight != null ? { height: rowHeight } : { flex: 1 }),
              padding: `0 ${rowPadH}px`,
              ...(rowPadL != null ? { paddingLeft: rowPadL } : {}),
              backgroundColor: bgColor,
              borderBottom: i < top10.length - 1 ? `1px solid ${CARD_COLORS.border}40` : 'none',
              ...(border ? { borderLeft: border } : {}),
              gap: rowGap,
            }}
          >
            <CardRankBadge rank={i + 1} size={badgeSize} />
            {renderRow(r, i, isFirst)}
          </div>
        )
      })}
    </div>
  )
}
