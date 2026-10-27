# Baikor_R web application

## Construction-site workspace

The overview shares search, status and period filters between the list and map.
The heading, New action and filters form one compact white toolbar. Status and
Period use compact fixed widths, while search fills the remaining space. Reset,
date-specific options and the selection-outside-filters message keep their layout
space while hidden, so filter changes do not resize inputs or move the panels.
Reset sits below the inputs, with the selection message beside it as secondary
text. Controls stack on narrow screens and retain visible labels and
primary-colored focus rings.
One workspace contains the table, details and map. The default arrangement puts
the table on the left, details on the right and the map across the bottom. Drag
a panel's title-bar grip toward another panel's left, right, top or bottom edge.
A dragged panel follows the pointer with its original content. The other panels
show their prospective arrangement, and a placeholder marks the exact destination,
including panel minimum sizes and dividers. Hovering never saves the layout;
releasing over a valid destination commits it, while Escape or an invalid release
restores the original arrangement without discarding form or map drafts. The move
menu opens by clicking the grip and offers the same destinations using the keyboard.

Drag a divider to resize panels, or focus it and use the arrow keys (Shift for
larger steps), Home or End. Double-click a divider to reset its split. Collapse
a panel from its title bar; its form draft, open record and map state stay in
place. The permanent right toolbar shows the available panels and resets the
layout. On desktop, its panel buttons collapse visible panels or restore collapsed
ones; on narrow screens, they select the panel to display. The toolbar remains
available when every panel is collapsed.
Opening or creating a site reveals Details; geometry actions reveal Map. Narrow
screens show one panel at a time, selected through the rail, while keeping the
desktop arrangement.

Panel positions, proportions and collapsed state are optional, versioned local
browser preferences. Reset restores the default arrangement. Unavailable storage
does not prevent using the workspace.

The Columns menu controls secondary table information. Bulk actions appear after
selecting rows; changing filters clears bulk selection to avoid hidden targets.
Pagination uses ten records per page, with centered controls and a record count
at the bottom right. Filtering updates that count without repeating it above the
table. Opening a record keeps the current table page.

The map has a compact address input with debounced suggestions. Selecting a
suggestion moves the map; Enter accepts the active suggestion, with the first
result active initially. Typing, leaving the input or dismissing suggestions does
not move the map. Address search changes the map position rather than filtering
construction sites; the adjacent control fits the visible results on the map.

Selecting a site opens read-only details. The widget title stays Details; the
content header shows the site name. Edit is available in the persistent footer.
Area cards are selectable in both
read-only and editing views; clicking or pressing Enter/Space reveals the map and
focuses that area without changing the record. Edit opens directly into the
fields, with Save/Discard for pending changes and a compact Delete control in the
footer. Invalid submissions reveal and focus the first invalid field. In both
read-only and editing views, the content scrolls independently while the footer
stays visible, including in short panes. Edit, Back and Save/Discard sit on the
left, with Delete on the right. New starts an unsaved local draft; only Create
persists it.
Navigation and browser unload protect pending edits. Editing captures the record
version so concurrent changes still produce the existing conflict response.

Additional data is always expanded in read-only details. Status is read-only
there; change it in the main edit form and persist it with the same global Save
as other site fields. Unchanged existing records show Back, which returns directly
to read-only details without confirmation. Pending changes replace Back with Save
and Discard; new drafts keep Create and Discard available. Discard resets pending
edits and keeps the selected record displayed. Discard and the compact Delete
action each require an anchored confirmation popover; there is no separate Cancel
button in the editor footer.

Geometry changes require an explicit draw or edit mode. The dashed New area card
sits beside existing areas in the editor and remains available for an empty list.
While drawing, Details offers Abort. A compact map status bar provides the polygon Finish and Cancel actions;
Finish becomes available after three vertices. Drawing guidance is available on
the status label's tooltip. The pencil beside address search starts vertex
editing, which ends from the same status bar. Finish updates the local draft;
the construction site's Save/Create action persists the changes. Finish or cancel
an unfinished polygon before saving. Discard restores the draft's loaded state.
Documents use the existing immediate-save API, independently of form Save/Discard,
and deletion requires confirmation. New sites must be saved before adding files.

The general editor retains its existing four status choices for editing roles;
the backend contract and publication rules are unchanged.

Run `pnpm run test`, `pnpm run lint` and `pnpm run build` before delivery. The tests
use Node's built-in runner (Node 22.18+ or 24), without additional dependencies.

React and OpenLayers frontend for the protected Baustellen editor. Build and development instructions are maintained in the repository-level [README](../../README.md).

## Adding workspace panels

The generic renderer and layout model live in `src/shared/docking`. The
construction-site page supplies a panel registry and a default binary split
tree. A `DockingPanel` has a stable, unique `id`, a localized `title`, an `icon`,
React `content` and optional `minWidth`/`minHeight`. Add another entry to the
`panels` passed to `DockingWorkspace`, for example:

```tsx
const timelinePanel: DockingPanel = {
  id: 'timeline',
  title: t('timeline.title'),
  icon: <CalendarOutlined />,
  content: <TimelinePanel />,
  minWidth: 280,
  minHeight: 200,
}

const panels = [sitesPanel, detailsPanel, mapPanel, timelinePanel]
```

Keep panel IDs stable across releases and keep application rules in the page.
The renderer owns docking, resizing, collapse and compact navigation; it does
not depend on construction-site data. `defaultLayout` defines the initial split
tree, `storageKey` identifies its local layout, and `compact` selects narrow-screen
navigation. A ref exposes `showPanel(id)` for actions that need to reveal a panel.
Use `onLayoutChange` to refresh content that depends on its dimensions, such as
the map's `updateSize()`.

Layout storage records a versioned split tree and collapsed panel IDs. It drops
unknown IDs, appends newly registered panels missing from a saved layout, and
falls back safely for malformed data. Collapsed panels retain their place and
proportions. The renderer keeps panel wrappers in registry order in the DOM and
updates their rectangles, preserving React children and the OpenLayers target
when a panel moves, resizes or collapses. Keep panel content mounted rather than
moving it between different React parents.

## Application theme

[`public/theme.css`](public/theme.css) is the single source for the application palette, typography and shared design tokens. The application, signed-out page and access-denied page consume these CSS variables. Change the tokens there instead of adding palette values to JavaScript or component CSS. Reload development pages after editing; rebuild and redeploy for production.

The canvas stays light. Widget title bars, content and the filter toolbar stay
white; visible-panel buttons use the soft primary accent.

The stylesheet loads before the application module. [`src/theme.ts`](src/theme.ts) reads its computed values for Ant Design and OpenLayers, which require actual color values. The `--map-*` tokens supply both map features and their legend; keep their meanings distinct from the brand palette. Construction-site status tags use the shared neutral, information, success and warning tokens.

Focus borders and outlines derive from `--color-primary` through the shared
`--color-focus` and `--color-focus-ring` tokens, including Ant Design inputs,
selects and buttons. Button and segmented-control shadows are disabled in the
Ant Design theme. Filter controls share a white surface with their container.

The `--widget-header-*` tokens control docking title-bar backgrounds, title text
and separators. Widget headers, table options and column headings stay white.
`--workspace-rail-active-*` styles visible-panel buttons.
`--workspace-panel-*` controls their outline, 8px corners and restrained
shell shadow; `--workspace-toolbar-*` and `--workspace-control-*` style the unified
toolbar. Keep shadows on widget shells, with buttons and form controls flat.
Icons and placeholders use the shared secondary text color; keyboard outlines
use the primary. These values remain in the single `public/theme.css` file.

The `--table-*` tokens control table headers, borders, hover and selection surfaces. The open site's row has a brown-red accent; rows selected for bulk actions use sage. On narrow panels the table scrolls horizontally so every column remains available.

Table headings use a white surface with secondary text and a fine divider.
The `--editor-action-*` tokens control the neutral secondary add/upload buttons;
cancellation keeps its semantic danger styling.

The supplied R_next logo retains its original artwork and colors; its viewport removes excess canvas whitespace. The favicon and application icon use the original geometric mark.

Open Sans is served locally from [`public/fonts/open-sans-latin-wght-normal.woff2`](public/fonts/open-sans-latin-wght-normal.woff2), a normal-style Latin variable font covering weights 300–800. It was downloaded from the [Google Fonts stylesheet](https://fonts.googleapis.com/css2?family=Open+Sans:wght@300..800&display=swap) ([font file](https://fonts.gstatic.com/s/opensans/v44/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS-muw.woff2)). Copyright 2020 The Open Sans Project Authors; licensed under the SIL Open Font License 1.1, included in [`public/fonts/OFL.txt`](public/fonts/OFL.txt) from the [Google Fonts upstream](https://github.com/google/fonts/tree/main/ofl/opensans). No remote font request is made at runtime.
