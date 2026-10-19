import type { TFunction } from 'i18next'
import * as yup from 'yup'
import { constructionSiteStatuses } from './constants'
import type { ConstructionSiteFormValues, ConstructionSiteStatus } from './types'

export function createConstructionSiteSchema(t: TFunction): yup.ObjectSchema<ConstructionSiteFormValues> {
  return yup.object({
    title: yup.string()
      .trim()
      .required(t('validation.titleRequired'))
      .max(200, t('validation.titleTooLong')),
    status: yup.mixed<ConstructionSiteStatus>()
      .oneOf(constructionSiteStatuses)
      .required(t('validation.statusRequired')),
    plannedStart: yup.string().defined(),
    plannedEnd: yup.string()
      .defined()
      .test('not-before-start', t('validation.endBeforeStart'), function (value) {
        return !value || !this.parent.plannedStart || value >= this.parent.plannedStart
      }),
    diversion: yup.string().defined().max(10000, t('validation.diversionTooLong')),
    contacts: yup.array().of(yup.object({
      id: yup.string().nullable().defined(),
      firstName: yup.string().trim().required(t('validation.firstNameRequired')).max(100),
      lastName: yup.string().trim().required(t('validation.lastNameRequired')).max(100),
      role: yup.string().trim().required(t('validation.roleRequired')).max(100),
      email: yup.string().trim().email(t('validation.emailInvalid')).max(254).defined(),
      phone1: yup.string().trim().max(50).defined(),
      phone2: yup.string().trim().max(50).defined(),
    })).defined(),
    communications: yup.array().of(yup.object({
      id: yup.string().nullable().defined(),
      type: yup.string().trim().required(t('validation.communicationTypeRequired')).max(2000),
      note: yup.string().trim().max(2000).defined(),
    })).defined(),
    metadata: yup.array().of(yup.object({
      key: yup.string()
        .trim()
        .required(t('validation.metadataKeyRequired'))
        .max(100, t('validation.metadataKeyTooLong')),
      value: yup.string()
        .trim()
        .required(t('validation.metadataValueRequired'))
        .max(4000, t('validation.metadataValueTooLong')),
    })).max(100, t('validation.metadataTooManyEntries'))
      .test('unique-keys', t('validation.metadataKeysNotUnique'), (entries) => {
        const keys = (entries ?? []).map((entry) => entry.key.trim().toLocaleLowerCase())
        return new Set(keys).size === keys.length
      })
      .defined(),
  })
}
