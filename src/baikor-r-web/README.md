# Baikor_R web application

React and OpenLayers frontend for the protected Baustellen editor. Build and development instructions are maintained in the repository-level [README](../../README.md).

## Application theme

[`public/theme.css`](public/theme.css) is the single source for the application palette, typography and shared design tokens. The application, signed-out page and access-denied page consume these CSS variables. Change the tokens there instead of adding palette values to JavaScript or component CSS. Reload development pages after editing; rebuild and redeploy for production.

The stylesheet loads before the application module. [`src/theme.ts`](src/theme.ts) reads its computed values for Ant Design and OpenLayers, which require actual color values. The `--map-*` tokens supply both map features and their legend; keep their meanings distinct from the brand palette. Construction-site status tags use the shared neutral, information, success and warning tokens.

The `--table-*` tokens control table headers, borders, hover and selection surfaces. The open site's row has a brown-red accent; rows selected for bulk actions use sage. On narrow panels the table scrolls horizontally so every column remains available.

Table headers and ordinary editor actions use neutral gray surfaces. The `--editor-action-*` tokens control the secondary add/upload buttons; cancellation keeps its semantic danger styling.

The supplied R_next logo retains its original artwork and colors; its viewport removes excess canvas whitespace. The favicon and application icon use the original geometric mark.

Open Sans is served locally from [`public/fonts/open-sans-latin-wght-normal.woff2`](public/fonts/open-sans-latin-wght-normal.woff2), a normal-style Latin variable font covering weights 300–800. It was downloaded from the [Google Fonts stylesheet](https://fonts.googleapis.com/css2?family=Open+Sans:wght@300..800&display=swap) ([font file](https://fonts.gstatic.com/s/opensans/v44/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS-muw.woff2)). Copyright 2020 The Open Sans Project Authors; licensed under the SIL Open Font License 1.1, included in [`public/fonts/OFL.txt`](public/fonts/OFL.txt) from the [Google Fonts upstream](https://github.com/google/fonts/tree/main/ofl/opensans). No remote font request is made at runtime.
