# redirect stdout and stderr to js_print at appropriate severity
import sys
import numpy as np
class CustomStdout:
  def write(self, msg):
      js_print(msg, level="info")
class CustomStderr:
  def write(self, msg):
      js_print(msg, level="warn")
sys.stdout = CustomStdout()
sys.stderr = CustomStderr()

print("DESeq2 pipeline script started")

print("Importing dependencies")
import pandas as pd

from pydeseq2.dds import DeseqDataSet
from pydeseq2.ds import DeseqStats
from pydeseq2.default_inference import DefaultInference
import json
import io
from time import time

print("Imported dependencies")

GENES_TO_TRACK = ['TFF3', 'ABO', 'EEF1A2', 'NFE2', 'EVPL']



def load_data():

  start_time = time()

  print("Loading data")

  cohort_A = js_payload.cohortA
  cohort_B = js_payload.cohortB
  stored_map_data = js_payload.map
  expression_data = js_payload.data

  # n: string (the name of the cohort). Could be good for display
  # sids: string[],
  # pids: string[]
  cohort_A = pd.DataFrame({
      "sids": cohort_A.sids,
      "pids": cohort_A.pids
  })
  cohort_A['cohortName'] = "A"
  cohort_B = pd.DataFrame({
      "sids": cohort_B.sids,
      "pids": cohort_B.pids
  })
  cohort_B['cohortName'] = "B"

  # we need to manually convert the stored_map_data and expression_data proxies to Python lists
  stored_map_data = stored_map_data.to_py()
  expression_data = expression_data.to_py()



  # i: number
  # s: string (like "008ae101-874b-4eb6-b811-3945e5eccfd9"). Probably the sample ID
  stored_map_data = pd.DataFrame.from_records(stored_map_data)
  # sort by i column. This will ensure that the order of the columns in the counts matrix is the same as the order of the columns in the cohort data.
  # Otherwise, we would be misaligning the gene expression counts and the sample ids
  stored_map_data = stored_map_data.sort_values(by=['i'])
  # rename columns
  stored_map_data = stored_map_data.rename(columns={"s": "sid"})

  # m: string (I think this is the geneID)
  # d: int[] (counts. All the same size)
  expression_data = pd.DataFrame.from_records(expression_data)
  print('RAW COUNTS FOR')
  for GENE_TO_TRACK in GENES_TO_TRACK:
      print(GENE_TO_TRACK)
      print(expression_data[expression_data.m == GENE_TO_TRACK].d.tolist())
  expression_data = expression_data.rename(columns={"m": "geneID", "d": "counts"})

  print('<b>DATA LOADED</b>. Runtime (s):', time() - start_time)
  # print("Data snapshot:")
  # print("Cohort A:")
  # print(cohort_A.head().to_html())
  # print("Cohort B:")
  # print(cohort_B.head().to_html())
  # print("Map:")
  # print(stored_map_data.head().to_html())
  # print("Expression:")
  # print(expression_data.head().to_html())

  return cohort_A, cohort_B, stored_map_data, expression_data

def preprocess_for_deseq2(expression_data, stored_map_data, cohort_A, cohort_B):
  """
  Preprocesses the counts matrix for use with DESeq2. Returns a tuple of the preprocessed counts matrix and the cohort data.
  """

  start_time = time()

  print("Preprocessing data for DESeq2...")

  # Load dataset
  print("...Number of genes:", expression_data.shape[0])

  # combine cohort data, rename columns, subset, and set index
  print('...Combining cohort data')
  cohort_data = pd.concat([cohort_A, cohort_B])
  cohort_data = cohort_data.rename(columns={'sids': 'Sample', 'cohortName': 'Condition'})
  cohort_data = cohort_data[['Sample', 'Condition']]
  cohort_data = cohort_data.set_index('Sample')

  # create the counts_matrix, where genes are columns, samples are rows
  # currently, express_data has geneID as a string and counts as a list of values
  counts_matrix = pd.DataFrame(expression_data.counts.tolist(), index=expression_data.geneID, columns=stored_map_data.sid)

  # drop columns that are not in cohort data
  n_samples_before = counts_matrix.shape[1]
  print('...Filtering out samples that are not in cohort A or B')
  # Filter out samples that are not in cohort A or B
  samples_to_keep = counts_matrix.columns.isin(cohort_data.index)
  counts_matrix = counts_matrix.loc[:, samples_to_keep]
  print(f"...Filtered out {n_samples_before - counts_matrix.shape[1]} samples from analysis")

  # drop cohort data that is not in counts matrix
  n_samples_before = cohort_data.shape[0]
  print('...Filtering out cohort members that are not in counts matrix')
  # Filter out samples that are not in counts matrix
  samples_to_keep = cohort_data.index.isin(counts_matrix.columns)
  cohort_data = cohort_data.loc[samples_to_keep, :]
  print(f"...Filtered out {n_samples_before - cohort_data.shape[0]} cohort members from analysis")

  # filter out genes that have zeros across all samples
  # n_genes_before = counts_matrix.shape[0]
  # print('...Filtering out genes with zeros across all samples')
  # counts_matrix = counts_matrix.loc[(counts_matrix != 0).any(axis=1)]
  # print(f"...Filtered out {n_genes_before - counts_matrix.shape[0]} genes from analysis")

  # # filter out columns that are not in cohort data
  # n_samples_before = counts_matrix.shape[1]
  # print('Filtering out samples that are not in cohort A or B')
  # # Filter out samples that are not in cohort A or B
  # samples_to_keep = counts_matrix.index.isin(cohort_data.index)
  # counts_matrix = counts_matrix.loc[samples_to_keep, :]
  # print(f"Filtered out {n_samples_before - counts_matrix.shape[1]} samples from analysis")

  # transpose counts_matrix so that samples are rows and genes are columns
  print('...Transposing counts matrix')
  counts_matrix = counts_matrix.transpose()
  # rename index to Sample
  counts_matrix.index.name = 'Sample'

  # sort the two indices by each other
  print('...Sorting indices')
  counts_matrix = counts_matrix.reindex(index=cohort_data.index)

  print('<b>PREPROCESSING FINISHED</b>. Runtime (s):', time() - start_time)

  # print("Counts matrix:", counts_matrix.shape)
  # print(counts_matrix.head().to_html())
  # print("Cohort data:", cohort_data.shape)
  # print(cohort_data.head().to_html())

  print('Preprocessed counts for')
  for GENE_TO_TRACK in GENES_TO_TRACK:
      print(GENE_TO_TRACK)
      print(counts_matrix.loc[:, GENE_TO_TRACK].tolist())

  return counts_matrix, cohort_data

def deseq(counts_matrix: pd.DataFrame, metadata: pd.DataFrame) -> pd.DataFrame:

    # coerse all data in the counts matrix to be integers
    print("...Warning: Coercing all data in the counts matrix to be integers. This is because DESeq2 requires integer data")
    counts_matrix = counts_matrix.astype(int)

    def genes_status(dds: DeseqDataSet) -> pd.DataFrame:
      status = pd.DataFrame({'geneID': GENES_TO_TRACK})

      filtered_genes = counts_matrix.columns[dds.filtered_genes]
      status['filtered'] = status['geneID'].isin(filtered_genes)
      if hasattr(dds, 'non_zero_genes'):
          status['nonZero'] = status['geneID'].isin(dds.non_zero_genes)
      if hasattr(dds, "new_all_zeroes_genes"):
          status['newAllZero'] = status['geneID'].isin(dds.new_all_zeroes_genes)
      return status

    start_time = time()

    print('Running Deseq2')

    from unittest.mock import patch
    from joblib import parallel_backend

    # ensure that inner_max_num_threads = None. This is a workaround for a Pyodide limitation
    class ModifiedParallelBackend(parallel_backend):
      def __init__(self, *args, **kwargs):
          # Drop inner_max_num_threads from kwargs
          kwargs.pop('inner_max_num_threads', None)
          # Ensure 'verbose' is an integer (or None) before passing it to super().__init__
          kwargs['verbose'] = int(kwargs.get('verbose', 0))
          super().__init__(*args, **kwargs)

    # define a custom version of pydeseq2.default_inference.DefaultInference that uses the modified_parallel_backend
    class CustomInference(DefaultInference):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)

        def lin_reg_mu(self, *args, **kwargs):
            with patch('pydeseq2.default_inference.parallel_backend', ModifiedParallelBackend):
                return super().lin_reg_mu(*args, **kwargs)

        def irls(self, *args, **kwargs):
            with patch('pydeseq2.default_inference.parallel_backend', ModifiedParallelBackend):
                return super().irls(*args, **kwargs)

        def alpha_mle(self, *args, **kwargs):
            with patch('pydeseq2.default_inference.parallel_backend', ModifiedParallelBackend):
                return super().alpha_mle(*args, **kwargs)

        def wald_test(self, *args, **kwargs):
            with patch('pydeseq2.default_inference.parallel_backend', ModifiedParallelBackend):
                return super().wald_test(*args, **kwargs)

        def lfc_shrink_nbinom_glm(self, *args, **kwargs):
            with patch('pydeseq2.default_inference.parallel_backend', ModifiedParallelBackend):
                return super().lfc_shrink_nbinom_glm(*args, **kwargs)

    # run dispersion and log fold-change (LFC) estimation.
    dds = DeseqDataSet(counts=counts_matrix, metadata=metadata, design_factors="Condition", inference = CustomInference())
    # dds.deseq2()
    dds.fit_size_factors()
    # print(genes_status(dds))
    # Fit an independent negative binomial model per gene
    dds.fit_genewise_dispersions()
    # print(genes_status(dds))
    # Fit a parameterized trend curve for dispersions, of the form
    # f(\mu) = \alpha_1/\mu + a_0
    dds.fit_dispersion_trend()
    # print(genes_status(dds))
    # Compute prior dispersion variance
    dds.fit_dispersion_prior()
    # print(genes_status(dds))
    # Refit genewise dispersions a posteriori (shrinks estimates towards trend curve)
    dds.fit_MAP_dispersions()
    # print(genes_status(dds))
    # Fit log-fold changes (in natural log scale)
    dds.fit_LFC()
    # print(genes_status(dds))
    # Compute Cooks distances to find outliers
    dds.calculate_cooks()
    # print(genes_status(dds))

    if dds.refit_cooks:
        # Replace outlier counts, and refit dispersions and LFCs
        # for genes that had outliers replaced
        dds.refit()
        # print(genes_status(dds))

    print('...Running stat summary')
    # summary of statistical tests
    stat_res = DeseqStats(dds, contrast = ('Condition','A','B'), inference = CustomInference(), cooks_filter=False, independent_filter=False)
    stat_res.summary()
    res = stat_res.results_df

    print('<br/><b>DESEQ FINISHED</b>. Runtime (s):', time() - start_time)

    return res


def deseq_pipeline():
  try:
    start_time = time()

    # Load data
    cohort_A, cohort_B, stored_map_data, expression_data = load_data()

    counts_matrix, cohort_data = preprocess_for_deseq2(expression_data, stored_map_data, cohort_A, cohort_B)
    res = deseq(counts_matrix, cohort_data)
    print('[TOTAL RUNTIME (s)]:', time() - start_time)
    return {"status": "success",
            "data": res.to_json(),
            "type": "json"
            }
  except Exception as e:
    print(e)
    return {"status": "error",
            "data": str(e),
            "type": "error"
            }


res = deseq_pipeline()

# for testing output
# res = pd.DataFrame({'a': list(range(1, 21)), 'b': list(range(21, 41)), 'c': list(range(41, 61)), 'd': list(range(61, 81))})
# res = {"status": "success",
#         "data": res.to_html(),
#         "type": "html"
#       }
sys.stdout = io.StringIO()
json.dumps(res)


