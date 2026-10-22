using System.Text.Encodings.Web;

namespace BaikorR.Host.Authentication;

internal static class AccessDeniedPage
{
    public const string Message = "Kein Zugriff. Bitte wenden Sie sich an Ihren Administrator, " +
        "damit Ihrem Benutzer eine Baikor-Rolle zugewiesen wird.";

    public static string Render(string logoutToken) => $$"""
        <!doctype html>
        <html lang="de">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Baikor_R – Kein Zugriff</title>
          <link rel="stylesheet" href="/theme.css" />
          <style>
            :root { font-family: var(--font-family); color: var(--color-text); background: var(--color-canvas); }
            body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
            main { width: min(440px, 100%); padding: 36px; box-sizing: border-box; text-align: center; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--border-radius); }
            .logo { display: block; width: min(240px, 100%); height: auto; margin: 0 auto 24px; }
            h1 { margin: 0 0 16px; font-size: 24px; }
            p { color: var(--color-text-secondary); line-height: 1.55; }
            button { min-height: 44px; padding: 8px 20px; background: var(--color-primary); color: var(--color-on-primary); border: 1px solid var(--color-primary); border-radius: var(--border-radius); font: inherit; cursor: pointer; }
            button:hover { background: var(--color-primary-hover); border-color: var(--color-primary-hover); }
            button:active { background: var(--color-primary-active); border-color: var(--color-primary-active); }
            button:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 3px; }
          </style>
        </head>
        <body>
          <main>
            <img class="logo" src="/r-next-logo.svg" alt="R_next – R_Lab Mobilität" />
            <h1>Kein Zugriff</h1>
            <p>{{Message}}</p>
            <p>Sie können sich abmelden und anschließend mit einem anderen Konto anmelden.</p>
            <form method="post" action="/auth/logout">
              <input type="hidden" name="__RequestVerificationToken" value="{{HtmlEncoder.Default.Encode(logoutToken)}}" />
              <button type="submit">Abmelden und Konto wechseln</button>
            </form>
          </main>
        </body>
        </html>
        """;
}
