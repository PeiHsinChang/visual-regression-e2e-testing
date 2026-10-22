import { test, expect } from "@playwright/test";
import {
  isValidEmail,
  isValidUKPhone,
  isValidUKPostcode,
  selectableOptions,
  selectedExclusiveValue,
  type RadioOption,
} from "./checkout-validators.ts";

// Pure unit tests — no browser, no network. Runs under the same Playwright
// runner as the E2E spec but asserts logic only.

test.describe("checkout field validators", () => {
  test("email — valid shapes pass", () => {
    for (const v of [
      "a@b.co",
      "first.last@example.com",
      "u+tag@sub.example.co.uk",
      "VRT.Test@Example.COM",
    ]) {
      expect(isValidEmail(v), v).toBe(true);
    }
  });

  test("email — malformed shapes fail", () => {
    for (const v of ["", " ", "foo", "foo@", "@bar.com", "foo@bar", "foo @bar.com", "foo@bar..com"]) {
      expect(isValidEmail(v), v).toBe(false);
    }
  });

  test("UK postcode — valid formats pass (case / space tolerant)", () => {
    for (const v of ["SW1A 1AA", "sw1a 1aa", "SW1A1AA", "W1A 0AX", "M1 1AE", "B33 8TH", "CR2 6XH", "DN55 1PT", "GIR 0AA"]) {
      expect(isValidUKPostcode(v), v).toBe(true);
    }
  });

  test("UK postcode — invalid formats fail", () => {
    for (const v of ["", "12345", "ABCDE", "SW1A", "SW1A 1A", "QW1A 1AA"]) {
      expect(isValidUKPostcode(v), v).toBe(false);
    }
  });

  test("UK phone — mobile + international pass", () => {
    for (const v of ["07700900000", "07700 900000", "+447700900000", "+44 7700 900 000"]) {
      expect(isValidUKPhone(v), v).toBe(true);
    }
  });

  test("UK phone — wrong length / landline / junk fail", () => {
    for (const v of ["", "0770090000", "077009000000", "02079460000", "+4407700900000", "abcdefghijk"]) {
      expect(isValidUKPhone(v), v).toBe(false);
    }
  });
});

test.describe("checkout radio group selectability", () => {
  const shipping: RadioOption[] = [
    { value: "flatrate_flatrate", checked: true },
    { value: "freeshipping_freeshipping", disabled: true },
    { value: "tablerate_bestway" },
  ];

  test("selectableOptions — excludes disabled + hidden", () => {
    expect(selectableOptions(shipping)).toEqual([
      "flatrate_flatrate",
      "tablerate_bestway",
    ]);
    expect(
      selectableOptions([
        { value: "a", visible: false },
        { value: "b" },
        { value: "c", disabled: true },
      ])
    ).toEqual(["b"]);
  });

  test("selectedExclusiveValue — single checked wins", () => {
    expect(selectedExclusiveValue(shipping)).toBe("flatrate_flatrate");
  });

  test("selectedExclusiveValue — zero / multiple checked => null", () => {
    expect(
      selectedExclusiveValue([
        { value: "a" },
        { value: "b" },
      ])
    ).toBeNull();

    expect(
      selectedExclusiveValue([
        { value: "a", checked: true },
        { value: "b", checked: true },
      ])
    ).toBeNull();
  });

  test("selectedExclusiveValue — a disabled 'checked' option does not count", () => {
    expect(
      selectedExclusiveValue([
        { value: "a", checked: true, disabled: true },
        { value: "b", checked: true },
      ])
    ).toBe("b");
  });
});
