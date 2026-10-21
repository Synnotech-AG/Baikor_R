using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Shared.Antiforgery;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class ValidateAntiforgeryForCookieAttribute()
    : TypeFilterAttribute(typeof(ValidateAntiforgeryForCookieFilter));
