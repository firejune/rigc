/**
 * Best-effort line/column for a `JSON.parse` failure.
 *
 * Bun's `JSON.parse` (JavaScriptCore) names the fault — `JSON Parse error:
 * Property name must be a string literal` — and never a position, so a caller
 * only ever learns which file was bad, not where inside it. This module fills
 * that gap without a dependency: it re-walks the text through a minimal,
 * hand-written JSON grammar and stops at the first place that grammar
 * disagrees with the text.
 *
 * ⚠️ This is not a JSON parser used to parse anything — `JSON.parse` still owns
 * every successful parse and every error MESSAGE. `locateJsonError` only ever
 * runs after `JSON.parse` has already thrown, purely to attribute a position to
 * the failure it already found. That is why it does not have to be a complete,
 * spec-perfect grammar: for the ordinary mistakes (an unquoted key, a trailing
 * comma, a missing colon, an unterminated string) the two parsers diverge at
 * the same character, so the position is exact. Wherever this scanner is
 * looser or stricter than `JSON.parse` in some corner, the position can be
 * early rather than exactly the runtime's own stopping point — which is why
 * it is documented, and named, as best-effort rather than exact.
 */

export interface JsonPosition {
  /** 1-based, like every editor and every compiler diagnostic. */
  line: number;
  column: number;
}

/** Thrown internally the moment the grammar walk disagrees with the text. */
class ScanStopped {
  constructor(readonly position: JsonPosition) {}
}

class Cursor {
  private i = 0;
  private line = 1;
  private column = 1;

  constructor(private readonly text: string) {}

  get done(): boolean {
    return this.i >= this.text.length;
  }

  peek(): string | undefined {
    return this.text[this.i];
  }

  startsWith(s: string): boolean {
    return this.text.startsWith(s, this.i);
  }

  advance(): void {
    if (this.text[this.i] === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    this.i++;
  }

  position(): JsonPosition {
    return { line: this.line, column: this.column };
  }
}

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= '0' && c <= '9';
}

function isHexDigit(c: string | undefined): boolean {
  return c !== undefined && ((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'));
}

function isWhitespace(c: string | undefined): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r';
}

function stop(cur: Cursor): never {
  throw new ScanStopped(cur.position());
}

function skipWhitespace(cur: Cursor): void {
  while (!cur.done && isWhitespace(cur.peek())) cur.advance();
}

function skipLiteral(cur: Cursor, length: number): void {
  for (let k = 0; k < length; k++) cur.advance();
}

const STRING_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't']);

function scanString(cur: Cursor): void {
  cur.advance(); // opening quote
  for (;;) {
    if (cur.done) stop(cur);
    const c = cur.peek()!;
    if (c === '"') {
      cur.advance();
      return;
    }
    if (c === '\\') {
      cur.advance();
      const esc = cur.peek();
      if (esc !== undefined && STRING_ESCAPES.has(esc)) {
        cur.advance();
        continue;
      }
      if (esc === 'u') {
        cur.advance();
        for (let k = 0; k < 4; k++) {
          if (!isHexDigit(cur.peek())) stop(cur);
          cur.advance();
        }
        continue;
      }
      stop(cur); // unknown escape
    }
    if (c.charCodeAt(0) < 0x20) stop(cur); // raw control character in a string
    cur.advance();
  }
}

function scanNumber(cur: Cursor): void {
  if (cur.peek() === '-') cur.advance();
  if (cur.peek() === '0') {
    cur.advance();
  } else if (isDigit(cur.peek())) {
    while (isDigit(cur.peek())) cur.advance();
  } else {
    stop(cur);
  }
  if (cur.peek() === '.') {
    cur.advance();
    if (!isDigit(cur.peek())) stop(cur);
    while (isDigit(cur.peek())) cur.advance();
  }
  if (cur.peek() === 'e' || cur.peek() === 'E') {
    cur.advance();
    if (cur.peek() === '+' || cur.peek() === '-') cur.advance();
    if (!isDigit(cur.peek())) stop(cur);
    while (isDigit(cur.peek())) cur.advance();
  }
}

function scanValue(cur: Cursor): void {
  skipWhitespace(cur);
  if (cur.done) stop(cur);
  const c = cur.peek();
  if (c === '{') return scanObject(cur);
  if (c === '[') return scanArray(cur);
  if (c === '"') return scanString(cur);
  if (c === '-' || isDigit(c)) return scanNumber(cur);
  if (cur.startsWith('true')) return skipLiteral(cur, 4);
  if (cur.startsWith('false')) return skipLiteral(cur, 5);
  if (cur.startsWith('null')) return skipLiteral(cur, 4);
  stop(cur);
}

function scanObject(cur: Cursor): void {
  cur.advance(); // '{'
  skipWhitespace(cur);
  if (cur.peek() === '}') {
    cur.advance();
    return;
  }
  for (;;) {
    skipWhitespace(cur);
    // The classic unquoted-key mistake stops here — this is
    // "Property name must be a string literal" in JavaScriptCore's own words.
    if (cur.peek() !== '"') stop(cur);
    scanString(cur);
    skipWhitespace(cur);
    if (cur.peek() !== ':') stop(cur);
    cur.advance();
    scanValue(cur);
    skipWhitespace(cur);
    const c = cur.peek();
    if (c === ',') {
      cur.advance();
      continue;
    }
    if (c === '}') {
      cur.advance();
      return;
    }
    stop(cur);
  }
}

function scanArray(cur: Cursor): void {
  cur.advance(); // '['
  skipWhitespace(cur);
  if (cur.peek() === ']') {
    cur.advance();
    return;
  }
  for (;;) {
    scanValue(cur);
    skipWhitespace(cur);
    const c = cur.peek();
    if (c === ',') {
      cur.advance();
      skipWhitespace(cur);
      continue;
    }
    if (c === ']') {
      cur.advance();
      return;
    }
    stop(cur);
  }
}

/**
 * Where, in `text`, a strict JSON parse first disagrees with it. Best-effort:
 * see the module doc for what that means and why.
 */
export function locateJsonError(text: string): JsonPosition {
  const cur = new Cursor(text);
  try {
    scanValue(cur);
    skipWhitespace(cur);
    if (!cur.done) stop(cur); // trailing content after the one top-level value
  } catch (err) {
    if (err instanceof ScanStopped) return err.position;
    throw err;
  }
  // The grammar walk above found nothing wrong, even though `JSON.parse` did —
  // this scanner is looser than the runtime parser in whatever way this file's
  // fault is. Rather than claim a location it did not actually find, it points
  // at the end of the file.
  return cur.position();
}

/**
 * `JSON.parse`, with a `(line N, column N)` suffix appended to the message
 * whenever it throws a `SyntaxError` — the runtime's own message, positioned.
 * Any other error (a non-JSON exception `JSON.parse` never actually throws,
 * kept here only for type safety) passes through unchanged.
 */
export function parseJsonWithPosition(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    if (err instanceof SyntaxError) {
      const { line, column } = locateJsonError(text);
      throw new SyntaxError(`${err.message} (line ${line}, column ${column})`);
    }
    throw err;
  }
}
