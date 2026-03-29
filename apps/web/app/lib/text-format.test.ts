// @ts-nocheck
import { describe, expect, it } from "bun:test";
import { decodeHtmlEntities } from "./text-format";

describe("decodeHtmlEntities", () => {
  it("decodes ampersand entities for UI labels", () => {
    expect(decodeHtmlEntities("Top Management Commitment &amp; Accountability")).toBe(
      "Top Management Commitment & Accountability"
    );
  });

  it("decodes numeric entities", () => {
    expect(decodeHtmlEntities("A &#38; B and C &#x26; D")).toBe("A & B and C & D");
  });

  it("keeps plain strings untouched", () => {
    expect(decodeHtmlEntities("Already plain & text")).toBe("Already plain & text");
  });
});
