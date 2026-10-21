namespace BaikorR.Core.Features.ConstructionSites.Common;

internal static class ConstructionSiteValidationErrorKeys
{
    public const string TitleRequired = "constructionSites.validation.title.required";
    public const string TitleTooLong = "constructionSites.validation.title.tooLong";
    public const string StatusInvalid = "constructionSites.validation.status.invalid";
    public const string PlannedStartRequired = "constructionSites.validation.plannedStart.required";
    public const string PlannedEndRequired = "constructionSites.validation.plannedEnd.required";
    public const string PlannedEndBeforeStart = "constructionSites.validation.plannedEnd.beforeStart";
    public const string AreasRequired = "constructionSites.validation.areas.required";
    public const string AreaNamesNotUnique = "constructionSites.validation.areas.namesNotUnique";
    public const string AreaIdentifiersNotUnique = "constructionSites.validation.areas.identifiersNotUnique";
    public const string AreaNameRequired = "constructionSites.validation.area.name.required";
    public const string AreaNameTooLong = "constructionSites.validation.area.name.tooLong";
    public const string AreaGeometryInvalid = "constructionSites.validation.area.geometry.invalid";
    public const string DiversionTooLong = "constructionSites.validation.diversion.tooLong";
    public const string MetadataTooManyEntries = "constructionSites.validation.metadata.tooManyEntries";
    public const string MetadataKeyRequired = "constructionSites.validation.metadata.key.required";
    public const string MetadataKeyTooLong = "constructionSites.validation.metadata.key.tooLong";
    public const string MetadataValueRequired = "constructionSites.validation.metadata.value.required";
    public const string MetadataValueTooLong = "constructionSites.validation.metadata.value.tooLong";
    public const string MetadataKeysNotUnique = "constructionSites.validation.metadata.keysNotUnique";
    public const string ContactFirstNameRequired = "constructionSites.validation.contact.firstName.required";
    public const string ContactFirstNameTooLong = "constructionSites.validation.contact.firstName.tooLong";
    public const string ContactLastNameRequired = "constructionSites.validation.contact.lastName.required";
    public const string ContactLastNameTooLong = "constructionSites.validation.contact.lastName.tooLong";
    public const string ContactRoleRequired = "constructionSites.validation.contact.role.required";
    public const string ContactRoleTooLong = "constructionSites.validation.contact.role.tooLong";
    public const string ContactEmailInvalid = "constructionSites.validation.contact.email.invalid";
    public const string ContactIdentifiersNotUnique = "constructionSites.validation.contacts.identifiersNotUnique";
    public const string CommunicationTypeRequired = "constructionSites.validation.communication.type.required";
    public const string CommunicationTypeTooLong = "constructionSites.validation.communication.type.tooLong";
    public const string CommunicationNoteTooLong = "constructionSites.validation.communication.note.tooLong";
    public const string CommunicationIdentifiersNotUnique = "constructionSites.validation.communications.identifiersNotUnique";
}
