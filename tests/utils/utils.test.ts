import {
  getBoolean,
  parseEnvNumber,
  parseEnvString,
  shuffleArray,
  splitText,
} from "../../src/utils/utils";

describe("Utils", () => {
  describe("splitText", () => {
    it("should split text by length", () => {
      const text = "This is a test message that needs to be split";
      const result = splitText(text, 10);
      expect(result).toEqual(["This is a", "test", "message", "that", "needs to", "be split"]);
    });

    it("should handle empty strings", () => {
      const text = "";
      const result = splitText(text, 10);
      expect(result).toEqual([]);
    });

    it("should handle newlines", () => {
      const text = "First line\nSecond line\r\nThird line";
      const result = splitText(text, 20);
      expect(result).toEqual(["First line", "Second line", "Third line"]);
    });
  });

  describe("getBoolean", () => {
    it("should return true for truthy values", () => {
      expect(getBoolean("true")).toBe(true);
      expect(getBoolean("yes")).toBe(true);
      expect(getBoolean("1")).toBe(true);
      expect(getBoolean("on")).toBe(true);
    });

    it("should return false for falsy values", () => {
      expect(getBoolean("false")).toBe(false);
      expect(getBoolean("no")).toBe(false);
      expect(getBoolean("0")).toBe(false);
      expect(getBoolean("off")).toBe(false);
      expect(getBoolean("")).toBe(false);
    });
  });

  describe("parseEnvString", () => {
    it("should parse and replace date placeholder", () => {
      const dateRegex = /\w+, \d+ \w+ \d+ \d+:\d+:\d+ GMT/;
      const result = parseEnvString("Today is <date>");
      expect(result).toMatch(dateRegex);
    });

    it("should handle null or undefined input", () => {
      expect(parseEnvString(undefined as unknown as string)).toBeNull();
      expect(parseEnvString(null as unknown as string)).toBeNull();
    });
  });

  describe("parseEnvNumber", () => {
    it("should parse valid numbers", () => {
      expect(parseEnvNumber("123")).toBe(123);
      expect(parseEnvNumber("123.456")).toBe(123.456);
      expect(parseEnvNumber("-123")).toBe(-123);
    });

    it("should return null for invalid numbers", () => {
      expect(parseEnvNumber("abc")).toBeNull();
      expect(parseEnvNumber("")).toBeNull();
    });
  });

  describe("shuffleArray", () => {
    it("should return an array with the same elements", () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = shuffleArray(original);
      expect(shuffled.sort()).toEqual(original.sort());
    });

    it("should not modify the original array", () => {
      const original = [1, 2, 3, 4, 5];
      shuffleArray(original);
      expect(original).toEqual([1, 2, 3, 4, 5]);
    });
  });
});
