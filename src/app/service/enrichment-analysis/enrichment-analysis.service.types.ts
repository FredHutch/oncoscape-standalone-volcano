type PANTHER_Term = {
  id: string;
  label: string;
};

type PANTHER_ResultItem = {
  number_in_list: number;
  fold_enrichment: number;
  fdr: number;
  expected: number;
  number_in_reference: number;
  pValue: number;
  term: PANTHER_Term;
  plus_minus: string;
};

export type PANTHER_Results = {
  reference: {
    organism: string;
    mapped_count: number;
    unmapped_count: number;
  };
  input_list: {
    organism: string;
    mapped_count: number;
    mapped_id: string;
    unmapped_count: number;
  };
  result: PANTHER_ResultItem[];
};
