using BaikorR.Core.Configuration;
using BaikorR.Host.Authentication;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Tokens;

namespace BaikorR.Host.Hosting;

internal static class ApplicationSecurityExtensions
{
    private const string BrowserOrBearerScheme = "BrowserOrBearer";

    public static WebApplicationBuilder AddApplicationSecurity(
        this WebApplicationBuilder builder,
        bool runMigrations)
    {
        var authentication = builder.Configuration
            .GetSection(AuthenticationConfiguration.SectionName)
            .Get<AuthenticationConfiguration>() ?? new AuthenticationConfiguration();

        if (!runMigrations && !authentication.Enabled && !builder.Environment.IsDevelopment())
        {
            throw new InvalidOperationException(
                "Authentication must be enabled outside the Development environment.");
        }

        AddDataProtection(builder);
        AddForwardedHeaders(builder.Services);
        AddAuthentication(builder.Services, authentication);
        AddAuthorization(builder.Services);
        AddAntiforgery(builder.Services, authentication.Enabled);

        return builder;
    }

    private static void AddDataProtection(WebApplicationBuilder builder)
    {
        var configuration = builder.Configuration
            .GetSection(DataProtectionConfiguration.SectionName)
            .Get<DataProtectionConfiguration>() ?? new DataProtectionConfiguration();

        if (!string.IsNullOrWhiteSpace(configuration.KeysPath))
        {
            builder.Services
                .AddDataProtection()
                .SetApplicationName("BaikorR")
                .PersistKeysToFileSystem(new DirectoryInfo(configuration.KeysPath));
        }
    }

    private static void AddForwardedHeaders(IServiceCollection services) =>
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
        });

    private static void AddAuthentication(
        IServiceCollection services,
        AuthenticationConfiguration configuration)
    {
        if (!configuration.Enabled)
        {
            services
                .AddAuthentication(DevelopmentAuthenticationHandler.SchemeName)
                .AddScheme<DevelopmentAuthenticationOptions, DevelopmentAuthenticationHandler>(
                    DevelopmentAuthenticationHandler.SchemeName,
                    _ => { });
            return;
        }

        EnsureOpenIdConnectConfiguration(configuration);
        services
            .AddAuthentication(options =>
            {
                options.DefaultScheme = BrowserOrBearerScheme;
                options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
            })
            .AddPolicyScheme(BrowserOrBearerScheme, BrowserOrBearerScheme, options =>
            {
                options.ForwardDefaultSelector = context =>
                    context.Request.Headers.Authorization.ToString().StartsWith(
                        "Bearer ",
                        StringComparison.OrdinalIgnoreCase)
                        ? JwtBearerDefaults.AuthenticationScheme
                        : CookieAuthenticationDefaults.AuthenticationScheme;
            })
            .AddCookie(options =>
            {
                options.Cookie.Name = "__Host-BaikorR.Auth";
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Lax;
                options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
                options.ExpireTimeSpan = TimeSpan.FromHours(8);
                options.SlidingExpiration = true;
                options.Events.OnRedirectToAccessDenied = context =>
                {
                    // The SPA fallback is protected too; redirecting to the default
                    // /Account/AccessDenied path would repeatedly forbid that path.
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    context.Response.Headers.CacheControl = "no-store";
                    if (context.Request.Path.StartsWithSegments("/api"))
                    {
                        context.Response.ContentType = "text/plain; charset=utf-8";
                        return context.Response.WriteAsync(AccessDeniedPage.Message);
                    }

                    var antiforgery = context.HttpContext.RequestServices.GetRequiredService<IAntiforgery>();
                    var token = antiforgery.GetAndStoreTokens(context.HttpContext).RequestToken
                        ?? throw new InvalidOperationException("No logout antiforgery token was created.");
                    context.Response.ContentType = "text/html; charset=utf-8";
                    return context.Response.WriteAsync(AccessDeniedPage.Render(token));
                };
            })
            .AddOpenIdConnect(options =>
            {
                options.Authority = configuration.Authority;
                options.ClientId = configuration.ClientId;
                options.ClientSecret = configuration.ClientSecret;
                options.ResponseType = "code";
                options.UsePkce = true;
                // ASP.NET's OIDC sign-out handler reads the ID token from the
                // authentication ticket and sends it to Keycloak as id_token_hint.
                // Without the saved token, Keycloak rejects RP-initiated logout.
                options.SaveTokens = true;
                options.GetClaimsFromUserInfoEndpoint = false;
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    NameClaimType = "preferred_username",
                    RoleClaimType = BaikorClaimTypes.Roles
                };

                if (configuration.AllowInvalidServerCertificate)
                {
                    options.BackchannelHttpHandler = new HttpClientHandler
                    {
                        ServerCertificateCustomValidationCallback =
                            HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
                    };
                }
            })
            .AddJwtBearer(options =>
            {
                options.Authority = configuration.Authority;
                options.Audience = configuration.ClientId;
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    NameClaimType = "preferred_username",
                    RoleClaimType = BaikorClaimTypes.Roles
                };

                if (configuration.AllowInvalidServerCertificate)
                {
                    options.BackchannelHttpHandler = new HttpClientHandler
                    {
                        ServerCertificateCustomValidationCallback =
                            HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
                    };
                }
            });
    }

    private static void EnsureOpenIdConnectConfiguration(AuthenticationConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(configuration.Authority))
        {
            throw new InvalidOperationException("Authentication:Authority must be configured.");
        }

        if (string.IsNullOrWhiteSpace(configuration.ClientId))
        {
            throw new InvalidOperationException("Authentication:ClientId must be configured.");
        }

        if (string.IsNullOrWhiteSpace(configuration.ClientSecret))
        {
            throw new InvalidOperationException("Authentication:ClientSecret must be configured.");
        }
    }

    private static void AddAuthorization(IServiceCollection services) =>
        services.AddAuthorizationBuilder()
            .AddPolicy(BaikorPolicies.Viewer, policy =>
                policy.RequireAssertion(context => BaikorRoles.All.Any(context.User.IsInRole)))
            .AddPolicy(BaikorPolicies.Editor, policy =>
                policy.RequireAssertion(context => BaikorRoles.Editors.Any(context.User.IsInRole)))
            .AddPolicy(BaikorPolicies.Importer, policy =>
                policy.RequireAssertion(context => context.User.IsInRole(BaikorRoles.Importer)
                    || BaikorRoles.Editors.Any(context.User.IsInRole)))
            .AddPolicy(BaikorPolicies.Approver, policy =>
                policy.RequireAssertion(context => BaikorRoles.Approvers.Any(context.User.IsInRole)))
            .AddPolicy(BaikorPolicies.Administrator, policy =>
                policy.RequireRole(BaikorRoles.Administrator));

    private static void AddAntiforgery(IServiceCollection services, bool authenticationEnabled) =>
        services.AddAntiforgery(options =>
        {
            options.HeaderName = "X-CSRF-TOKEN";
            options.Cookie.Name = authenticationEnabled
                ? "__Host-BaikorR.Antiforgery"
                : "BaikorR.Antiforgery";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.SecurePolicy = authenticationEnabled
                ? CookieSecurePolicy.Always
                : CookieSecurePolicy.SameAsRequest;
        });
}
