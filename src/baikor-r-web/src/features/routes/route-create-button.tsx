import { DownOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Dropdown, Space } from 'antd'

interface RouteCreateButtonProps {
  canEdit: boolean
  ready: boolean
  labels: { create: string; import: string; options: string }
  onCreate: () => void
  onImport: () => void
}

export function RouteCreateButton({
  canEdit,
  ready,
  labels,
  onCreate,
  onImport,
}: RouteCreateButtonProps) {
  if (!canEdit) {
    return null
  }
  return (
    <Space.Compact>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        disabled={!ready}
        onClick={() => {
          if (ready) {
            onCreate()
          }
        }}
      >
        {labels.create}
      </Button>
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        disabled={!ready}
        menu={{
          items: [
            {
              key: 'gtfs',
              label: labels.import,
              disabled: !ready,
              onClick: () => {
                if (ready) {
                  onImport()
                }
              },
            },
          ],
        }}
      >
        <Button
          type="primary"
          icon={<DownOutlined />}
          disabled={!ready}
          aria-label={labels.options}
          aria-haspopup="menu"
        />
      </Dropdown>
    </Space.Compact>
  )
}
