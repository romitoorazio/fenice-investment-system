export function normalizeIsin(value: unknown): string {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function expandIsinCharacters(isin: string): string | null {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return null;
  let expanded = "";
  for (const character of isin) {
    if (/^[0-9]$/.test(character)) {
      expanded += character;
      continue;
    }
    const numeric = character.charCodeAt(0) - 55;
    if (numeric < 10 || numeric > 35) return null;
    expanded += String(numeric);
  }
  return expanded;
}

/**
 * Validates a 12-character ISIN including the ISO 6166 check digit.
 * Letters are expanded A=10..Z=35 and the resulting digits are verified
 * with the Luhn modulus-10 algorithm, including the existing check digit.
 */
export function isValidIsin(value: unknown): boolean {
  const isin = normalizeIsin(value);
  const expanded = expandIsinCharacters(isin);
  if (!expanded) return false;

  let sum = 0;
  let doubleDigit = false;
  for (let index = expanded.length - 1; index >= 0; index -= 1) {
    let digit = Number(expanded[index]);
    if (!Number.isInteger(digit)) return false;
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

export function requireValidIsin(value: unknown): string | null {
  const isin = normalizeIsin(value);
  return isValidIsin(isin) ? isin : null;
}
