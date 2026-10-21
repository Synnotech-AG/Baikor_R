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
          <style>
            :root { font-family: system-ui, sans-serif; color: #1f2a25; background: #f3f5f2; }
            body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
            main { width: min(440px, 100%); padding: 36px; box-sizing: border-box; text-align: center; background: white; border: 1px solid #dfe5e1; border-radius: 12px; }
            h1 { margin: 0 0 16px; font-size: 24px; }
            p { color: #617068; line-height: 1.55; }
            button { min-height: 44px; padding: 8px 20px; background: #c4dc2f; color: #172018; border: 1px solid #aec520; border-radius: 6px; font: inherit; cursor: pointer; }
            button:focus-visible { outline: 3px solid #2e6750; outline-offset: 3px; }
          </style>
        </head>
        <body>
          <main>
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
