import { InfoCircleOutlined } from '@ant-design/icons'
import { Tooltip } from 'antd'
import type { ReactNode } from 'react'

interface InfoLabelProps {
  children: ReactNode
  info: ReactNode
}

export function InfoLabel({ children, info }: InfoLabelProps) {
  return (
    <span className="info-label">
      {children}
      <Tooltip title={info} placement="topLeft">
        <InfoCircleOutlined className="info-label-icon" aria-label="Information" tabIndex={0} />
      </Tooltip>
    </span>
  )
}
