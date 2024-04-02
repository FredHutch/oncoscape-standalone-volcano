export enum EnrichrPathwaysBackground {
  REACTOME_2022 = "Reactome_2022",
  BIOCARTA_2016 = "BioCarta_2016",
  KEGG_2021_HUMAN = "KEGG_2021_Human",
  MSIGDB_HALLMARK_2020 = "MSigDB_Hallmark_2020"
}

export enum EnrichrGOBackground {
  GO_BIOLOGICAL_PROCESS_2023 = "GO_Biological_Process_2023",
  GO_CELLULAR_COMPONENT_2023 = "GO_Cellular_Component_2023",
  GO_MOLECULAR_FUNCTION_2023 = "GO_Molecular_Function_2023"
}

export enum EnrichrBackgroundType {
  PATHWAY = "Pathway",
  GO = "Ontology"
}

export const availableEnrichrBackgrounds = [
  {
    name: "Reactome 2022",
    value: EnrichrPathwaysBackground.REACTOME_2022,
    type: EnrichrBackgroundType.PATHWAY,
  },
  {
    name: "BioCarta 2016",
    value: EnrichrPathwaysBackground.BIOCARTA_2016,
    type: EnrichrBackgroundType.PATHWAY,
  },
  {
    name: "KEGG 2021 Human",
    value: EnrichrPathwaysBackground.KEGG_2021_HUMAN,
    type: EnrichrBackgroundType.PATHWAY,
  },
  {
    name: "MSigDB Hallmark 2020",
    value: EnrichrPathwaysBackground.MSIGDB_HALLMARK_2020,
    type: EnrichrBackgroundType.PATHWAY,
  },
  {
    name: "GO Biological Process 2023",
    value: EnrichrGOBackground.GO_BIOLOGICAL_PROCESS_2023,
    type: EnrichrBackgroundType.GO,
  },
  {
    name: "GO Cellular Component 2023",
    value: EnrichrGOBackground.GO_CELLULAR_COMPONENT_2023,
    type: EnrichrBackgroundType.GO,
  },
  {
    name: "GO Molecular Function 2023",
    value: EnrichrGOBackground.GO_MOLECULAR_FUNCTION_2023,
    type: EnrichrBackgroundType.GO,
  },
]

export type EnrichrGSEAResults = {
  index: number;
  term: string;
  pValue: number;
  oddsRatio: number;
  combinedScore: number;
  overlappingGenes: string[];
  adjPValue: number;
}[]
