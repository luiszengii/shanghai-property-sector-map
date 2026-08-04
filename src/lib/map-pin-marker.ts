function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

interface MapPinMarkerContentOptions {
  ariaLabel: string;
  iconSvg: string;
  labelHtml?: string;
  selected?: boolean;
  variantClass?: string;
  pinClass?: string;
}

export function mapPinMarkerContent({
  ariaLabel,
  iconSvg,
  labelHtml = "",
  selected = false,
  variantClass = "",
  pinClass = "",
}: MapPinMarkerContentOptions) {
  return '<button class="project-marker'
    + (selected ? " is-selected" : "")
    + (variantClass ? ` ${variantClass}` : "")
    + '" aria-label="' + escapeHtml(ariaLabel)
    + '"><span class="project-pin'
    + (pinClass ? ` ${pinClass}` : "")
    + '"><i>' + iconSvg + "</i></span>"
    + labelHtml + "</button>";
}

export { escapeHtml as escapeMapPinHtml };
