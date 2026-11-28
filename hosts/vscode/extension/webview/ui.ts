// VS Code's own controls for the page, from vscode-elements (MIT): each one by its own module, so only these are
// bundled. They take every color from the theme's --vscode-* variables, like the workbench around the page.
export { default as Badge } from '@vscode-elements/react-elements/dist/components/VscodeBadge.js'
export { default as Button } from '@vscode-elements/react-elements/dist/components/VscodeButton.js'
export { default as Collapsible } from '@vscode-elements/react-elements/dist/components/VscodeCollapsible.js'
export { default as ProgressRing } from '@vscode-elements/react-elements/dist/components/VscodeProgressRing.js'
export { default as TabHeader } from '@vscode-elements/react-elements/dist/components/VscodeTabHeader.js'
export { default as TabPanel } from '@vscode-elements/react-elements/dist/components/VscodeTabPanel.js'
export { default as Tabs } from '@vscode-elements/react-elements/dist/components/VscodeTabs.js'
export { default as Textarea } from '@vscode-elements/react-elements/dist/components/VscodeTextarea.js'
export { default as Textfield } from '@vscode-elements/react-elements/dist/components/VscodeTextfield.js'
export { default as ToolbarButton } from '@vscode-elements/react-elements/dist/components/VscodeToolbarButton.js'

/** vscode-elements draws its icons from the page's codicon stylesheet, which it finds by this id. */
export function markCodicons() {
  const link = document.querySelector<HTMLLinkElement>('link[href*="codicon.css"]')
  if (link && !link.id) link.id = 'vscode-codicon-stylesheet'
}

/** The text of a vscode-elements field from its input or change event. */
/** A ref that focuses its element once it's on the page (the wrappers drop React's autoFocus). */
export const focusMe = (el: HTMLElement | null) => {
  if (el) requestAnimationFrame(() => el.focus())
}

export const valueOf = (e: { target: EventTarget | null }) => (e.target as HTMLInputElement | null)?.value ?? ''
