export type VrtConfig = {
  viewports: { width: number; height: number }[];
  excludeSelectors: string[];
  computedStyleProps: string[];
  diffThreshold: number;
};

const config: VrtConfig = {
  // Empty = takeSnapshot uses each Playwright project's own viewport
  // (so mobile devices get their real mobile size instead of an override).
  viewports: [],

  excludeSelectors: ["#clock", ".carousel", "[data-vrt-ignore]"],

  computedStyleProps: [
    "backgroundColor",
    "backgroundImage",
    "background",
    "color",
    "fontSize",
    "fontFamily",
    "fontWeight",
    "padding",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "margin",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "border",
    "borderTop",
    "borderRight",
    "borderBottom",
    "borderLeft",
    "borderRadius",
    "display",
    "position",
    "width",
    "height",
    "opacity",
    "transform",
    "boxShadow",
    "textAlign",
    "lineHeight",
  ],

  diffThreshold: 0.1,
};

export default config;
