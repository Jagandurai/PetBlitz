import { describe, expect, it } from "vitest";
import { productListQuery } from "@/validations/product.validation";

describe("product listing filters", () => {
  it("survive being validated twice (route, then service), as on the Offers page", () => {
    const once = productListQuery.parse({ onSale: "true", inStock: "false" });
    expect(productListQuery.parse(once)).toMatchObject({ onSale: true, inStock: false });
    expect(productListQuery.safeParse({ onSale: "yes" }).success).toBe(false);
  });
});
