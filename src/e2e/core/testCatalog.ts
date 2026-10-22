export type TestCheckDefinition = {
  id: string;
  name: string;
  description: string;
};

export type TestFeatureDefinition = {
  id: string;
  name: string;
  description: string;
  targetKind: "url";
  checks: readonly TestCheckDefinition[];
};

export type TestCategoryDefinition = {
  id: string;
  name: string;
  description: string;
  features: readonly TestFeatureDefinition[];
};
