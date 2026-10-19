using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Api.Shared.Antiforgery;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class ValidateAntiforgeryForCookieAttribute()
    : TypeFilterAttribute(typeof(ValidateAntiforgeryForCookieFilter));
