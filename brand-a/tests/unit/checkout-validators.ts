// Pure validators mirroring Magento mage/validation rules used on the UK
// checkout shipping step. Kept framework-free so unit tests run instantly
// in the Playwright test runner (no browser, no Magento).

// Reject consecutive dots in the domain via a negative lookahead.
export const EMAIL_RE =
  /^[A-Za-z0-9._%+-]+@(?!.*\.\.)[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Royal Mail postcode regex (government published form).
export const UK_POSTCODE_RE =
  /^(GIR 0AA|[A-PR-UWYZ]([0-9]{1,2}|([A-HK-Y][0-9]([0-9ABEHMNPRV-Y])?)|[0-9][A-HJKPSTUW]) ?[0-9][ABD-HJLNP-UW-Z]{2})$/i;

// Accepts UK mobile (07…) and intl (+44 7…). Spaces anywhere; 11 digits total.
export const UK_PHONE_RE = /^(\+44\s?|0)7\d{3}\s?\d{3}\s?\d{3}$/;

export function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

export function isValidUKPostcode(v: string): boolean {
  return UK_POSTCODE_RE.test(v.trim().toUpperCase());
}

export function isValidUKPhone(v: string): boolean {
  return UK_PHONE_RE.test(v.trim());
}

// Minimal radio-input shape so tests can describe a method group without a DOM.
export type RadioOption = {
  value: string;
  checked?: boolean;
  disabled?: boolean;
  visible?: boolean; // defaults to true
};

// Returns the values that can actually be chosen right now.
export function selectableOptions(options: RadioOption[]): string[] {
  return options
    .filter((o) => !o.disabled && o.visible !== false)
    .map((o) => o.value);
}

// Checkout radio groups (shipping method / payment method) must have exactly
// one option checked. Returns the single selected value, or null when the
// group is unselected / over-selected / entirely disabled.
export function selectedExclusiveValue(options: RadioOption[]): string | null {
  const checked = options.filter((o) => o.checked && !o.disabled);
  if (checked.length !== 1) return null;
  return checked[0].value;
}
