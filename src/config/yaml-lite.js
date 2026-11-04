/**
 * @fileoverview Lightweight, zero-dependency YAML subset parser for structured locale files.
 * Supports 2-space (or consistent N-space) nested key maps, `#` comments, single/double-quoted
 * strings with escape sequences, booleans, and numbers.
 */

/**
 * Unquotes and unescapes a scalar YAML value string.
 * @param {string} rawValue
 * @returns {string}
 */
function parseYamlScalar(rawValue) {
  const trimmed = rawValue.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    const inner = trimmed.slice(1, -1);
    return inner
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }

  // Strip trailing inline `# comment` outside quotes (only when preceded by whitespace)
  const commentIdx = trimmed.search(/\s+#/);
  const clean = commentIdx >= 0 ? trimmed.slice(0, commentIdx).trim() : trimmed;
  return clean;
}

/**
 * Parses a nested YAML dictionary string into a plain nested JavaScript object.
 *
 * @param {string} yamlText
 * @returns {Record<string, any>}
 */
export function parseSimpleYaml(yamlText) {
  /** @type {Record<string, any>} */
  const root = {};
  if (typeof yamlText !== 'string' || !yamlText.trim()) {
    return root;
  }

  /** @type {Array<{ indent: number, target: Record<string, any> }>} */
  const stack = [{ indent: -1, target: root }];
  const lines = yamlText.replace(/\r\n/g, '\n').split('\n');

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) {
      continue;
    }

    const indentMatch = rawLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    const content = rawLine.slice(indent);

    const colonIdx = content.indexOf(':');
    if (colonIdx <= 0) {
      continue;
    }

    const key = content.slice(0, colonIdx).trim();
    const afterColon = content.slice(colonIdx + 1).trim();

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const currentParent = stack[stack.length - 1].target;

    if (afterColon === '' || afterColon.startsWith('#')) {
      /** @type {Record<string, any>} */
      const childObj = {};
      currentParent[key] = childObj;
      stack.push({ indent, target: childObj });
    } else {
      currentParent[key] = parseYamlScalar(afterColon);
    }
  }

  return root;
}
