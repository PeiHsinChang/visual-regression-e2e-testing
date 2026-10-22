import type { BrandAdapter } from "../core/brand.ts";

export const brandBAdapter = {
  id: "brand-b",
  name: "BrandB",
  environments: [
    {
      id: "uk-dev",
      label: "BrandB UK Dev",
      market: "UK",
      storefrontUrl: "https://brand-b.local.test/uk/",
      allowedOrigins: ["https://brand-b.local.test"],
      allowedPathPrefixes: ["/uk/"],
    },
    {
      id: "uk-staging",
      label: "BrandB UK Staging",
      market: "UK",
      storefrontUrl: "https://brand-b.staging.example.com/uk/",
      allowedOrigins: ["https://brand-b.staging.example.com"],
      allowedPathPrefixes: ["/uk/"],
    },
  ],
  features: [
    {
      featureId: "pdp-behavior",
      selectors: {
        productForm: "#product_addtocart_form",
        productSkuAttribute: "data-product-sku",
        title: "h1",
        price: "[data-role='priceBox']",
        gallery: "[data-gallery-role='gallery-placeholder']",
        variantOptions: "input[type='radio'][name^='super_attribute']",
        addToBag: "button[title='add to bag']",
        outOfStock: "button[title='out of stock']",
        galleryNext: "button[aria-label='Next']",
        galleryFullscreen:
          "button[aria-label='Click to view image in fullscreen']",
        preselectComponent: "[x-init*='initPdpPreselect']",
        renderedSku: "[itemprop='sku'], .product-info-stock-sku .sku .value",
      },
      rules: {
        preselect: {
          attributeCode: "color",
          noHashPriority: ["configured-preselect", "first-option"],
        },
        inStock: {
          variantControl: "visible-selectable",
          addToBag: "visible-enabled",
          outOfStock: "not-primary",
        },
        outOfStock: {
          variantControl: "visible-selectable",
          addToBag: "hidden-or-disabled",
          outOfStock: "visible-enabled",
        },
        verifyGallery: true,
        addFirstSalableVariantToCart: true,
      },
    },
  ],
} as const satisfies BrandAdapter;
