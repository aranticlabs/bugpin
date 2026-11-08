// NCName from Namespaces in XML 1.0: an XML Name without ':'.
// https://www.w3.org/TR/xml/#NT-NameStartChar
const NC_NAME =
  /^[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}][A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/u;

const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';
const NO_PREFIXES: ReadonlySet<string> = new Set();

/**
 * Whether the browser serializer can emit this attribute as well-formed XML.
 * Attributes created by the HTML parser or `setAttribute` have no namespace, so
 * names such as `wire:navigate`, `x-on:click`, `@click` or `:class` are written
 * verbatim. A prefixed name is only valid when its prefix is declared in scope,
 * as with `xlink:href` under `xmlns:xlink`.
 */
export function isXmlSafeAttribute(
  attribute: Attr,
  prefixesInScope: ReadonlySet<string> = NO_PREFIXES
): boolean {
  if (attribute.namespaceURI !== null) {
    return true;
  }

  const name = attribute.name;
  const colonIndex = name.indexOf(':');
  if (colonIndex === -1) {
    return NC_NAME.test(name);
  }

  const prefix = name.slice(0, colonIndex);
  const localName = name.slice(colonIndex + 1);
  if (!NC_NAME.test(prefix) || !NC_NAME.test(localName)) {
    return false;
  }
  if (prefix === 'xmlns') {
    // A prefix cannot be declared with an empty namespace in XML 1.0.
    return attribute.value !== '';
  }
  return prefix === 'xml' || prefixesInScope.has(prefix);
}

/**
 * Prefixes the serialized output declares for `element` and its descendants:
 * explicit `xmlns:prefix` attributes, and the prefixes of namespaced elements and
 * attributes, which the serializer declares where it writes them. Counting a
 * prefix that might be bound keeps the attribute, as the output did without cleanup.
 */
function scopeFor(element: Element, inherited: ReadonlySet<string>): ReadonlySet<string> {
  const declared: string[] = element.prefix ? [element.prefix] : [];
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.namespaceURI === XMLNS_NAMESPACE) {
      if (attribute.prefix === 'xmlns' && attribute.value) declared.push(attribute.localName);
    } else if (attribute.namespaceURI !== null) {
      if (attribute.prefix) declared.push(attribute.prefix);
    } else if (attribute.name.startsWith('xmlns:') && attribute.value) {
      declared.push(attribute.name.slice('xmlns:'.length));
    }
  }

  const added = declared.filter((prefix) => !inherited.has(prefix));
  return added.length === 0 ? inherited : new Set([...inherited, ...added]);
}

function removeUnsafeAttributesIn(element: Element, inherited: ReadonlySet<string>): void {
  const scope = scopeFor(element, inherited);
  for (const attribute of Array.from(element.attributes)) {
    if (!isXmlSafeAttribute(attribute, scope)) {
      element.removeAttributeNode(attribute);
    }
  }
  for (const child of Array.from(element.children)) {
    removeUnsafeAttributesIn(child, scope);
  }
}

/**
 * Remove attributes whose names would make `root` serialize to malformed XML.
 * Only names that are certainly invalid are removed; a prefix that might be
 * bound keeps its attribute, as the output did without cleanup.
 */
export function removeXmlUnsafeAttributes(root: Element): void {
  removeUnsafeAttributesIn(root, NO_PREFIXES);
}
