import { Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import { formatArea, formatDate, formatDateTime } from '../../../shared/formatters'
import { statusTranslationKey } from '../constants'
import type { ConstructionSiteSummary } from '../types'
import { AttachmentsEditor } from './AttachmentsEditor'
import { ConstructionSiteFooter } from './ConstructionSiteFooter'
import { GeometryList } from './GeometryList'
import '../record-workspace.css'

interface ConstructionSiteDetailsProps {
  site: ConstructionSiteSummary
  canEdit: boolean
  deleting: boolean
  onEdit: () => void
  onDelete: () => Promise<void>
  selectedAreaKey: string | null
  onSelectArea: (key: string) => void
}

export function ConstructionSiteDetails({
  site, canEdit, deleting, onEdit, onDelete, selectedAreaKey, onSelectArea,
}: ConstructionSiteDetailsProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage === 'en' ? 'en-GB' : 'de-DE'
  const metadata = Object.entries(site.metadata).sort(([left], [right]) => left.localeCompare(right, locale))

  return (
    <article className="editor-panel record-workspace record-details" aria-label={t('record.details')}>
      <div className="record-details-scroll">
        <header className="section-heading record-heading">
          <h2 tabIndex={-1}>{site.title}</h2>
        </header>

        <div className="record-details-content">
          <dl className="record-summary">
            <div><dt>{t('record.period')}</dt><dd>
              {site.plannedStart ? formatDate(site.plannedStart, locale) : t('record.noDate')}
              <span className="record-period-separator" aria-hidden="true"> – </span>
              {site.plannedEnd ? formatDate(site.plannedEnd, locale) : t('record.noDate')}
            </dd></div>
            <div><dt>{t('record.totalArea')}</dt><dd>{formatArea(site.areaSquareMetres, locale)}<small>{t('record.areaCount', { count: site.areas.length })}</small></dd></div>
            <div><dt>{t('record.updated')}</dt><dd>{formatDateTime(site.updatedAt, locale)}</dd></div>
            <div><dt>{t('constructionSites.status.label')}</dt><dd>
              <Tag className={`construction-site-status status-${site.status}`}>{t(statusTranslationKey(site.status))}</Tag>
            </dd></div>
          </dl>

          <section className="record-group">
            <h3>{t('constructionSites.sections.areas')}</h3>
            <GeometryList
              areas={site.areas.map(({ id, name, areaSquareMetres }) => ({ key: id, id, name, areaSquareMetres }))}
              selectedAreaKey={selectedAreaKey} canEdit={false} canDelete={false} onSelect={onSelectArea}
            />
          </section>

          <section className="record-group">
            <h3>{t('constructionSites.attachments.label')}</h3>
            <AttachmentsEditor constructionSiteId={site.id} canEdit={false} showHeading={false} />
          </section>

          <section className="record-group record-additional">
            <h3>{t('constructionSites.sections.additionalData')}</h3>
            <div className="record-additional-content">
              <section className="record-group">
                <h3>{t('constructionSites.contacts.label')}</h3>
                {site.contacts.length ? <div className="record-item-list">{site.contacts.map((contact) => (
                  <div className="record-item" key={contact.id}>
                    <strong>{contact.firstName} {contact.lastName}</strong>
                    <span>{contact.role}</span>
                    {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
                    {contact.phone1 && <a href={`tel:${contact.phone1}`}>{contact.phone1}</a>}
                    {contact.phone2 && <a href={`tel:${contact.phone2}`}>{contact.phone2}</a>}
                  </div>
                ))}</div> : <p className="details-hint">{t('constructionSites.contacts.empty')}</p>}
              </section>

              <section className="record-group">
                <h3>{t('constructionSites.diversion.label')}</h3>
                <p className={site.diversion ? 'record-free-text' : 'details-hint'}>{site.diversion || t('record.empty')}</p>
              </section>

              <section className="record-group">
                <h3>{t('constructionSites.communications.label')}</h3>
                {site.communications.length ? <div className="record-item-list">{site.communications.map((communication) => (
                  <div className="record-item" key={communication.id}>
                    <strong>{communication.type}</strong>
                    {communication.note && <p className="record-free-text">{communication.note}</p>}
                  </div>
                ))}</div> : <p className="details-hint">{t('constructionSites.communications.empty')}</p>}
              </section>

              <section className="record-group">
                <h3>{t('constructionSites.metadata.label')}</h3>
                <p className="details-hint">{t('constructionSites.metadata.info')}</p>
                {metadata.length ? <dl className="record-metadata">{metadata.map(([key, value]) => (
                  <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
                ))}</dl> : <p className="details-hint">{t('record.empty')}</p>}
              </section>
            </div>
          </section>
        </div>
      </div>
      <ConstructionSiteFooter mode="readonly" selectedSite={site} canEdit={canEdit}
        deleting={deleting} onEdit={onEdit} onDelete={onDelete} />
    </article>
  )
}
