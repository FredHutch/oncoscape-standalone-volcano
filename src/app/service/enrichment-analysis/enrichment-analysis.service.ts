import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Injectable, OnInit } from "@angular/core";
import { MatSnackBar, MatSnackBarConfig } from "@angular/material";
import { PANTHERAnnotationDataset, PANTHER_Results } from "./enrichment-analysis.service.types";
import { Observable, of } from "rxjs";
import { first, map, startWith } from "rxjs/operators";
import testData from "assets/data/PANTHERenrichmentAnalysisResults.json"

enum NCBI_TAXONS {
  HUMAN = 9606,
}

export type PANTHER_APIOptions = {
  annotationDatasetId: string;
  snackbar: boolean;
};

export enum EA_API {
  PANTHER = 'PANTHER',
  GENE_ONTOLOGY = "geneOntology"
}

@Injectable({
  providedIn: "root",
})
export class EnrichmentAnalysisService {

  static DEFAULT_PANTHER_APIOptions: PANTHER_APIOptions = {
    // biological processes
    annotationDatasetId: "GO:0008150",
    snackbar: false
  }

  // keep track of if a request is being made for each api, for rate limiting
  static apiAvailability = {
    [EA_API.PANTHER]: true,
    [EA_API.GENE_ONTOLOGY]: true
  }

  public availableAnnotationDatasets: PANTHERAnnotationDataset[];

  private mostRecentResults: PANTHER_Results;

  private snackbarConfig: MatSnackBarConfig<any> = {
    horizontalPosition: "right",
    verticalPosition: "top",
    duration: 3000
  };

  /** @description Not enrichment analysis, but often used together with EA, so it is in this service. Get a list of genes in a GO Term */
  getGenesByGOTermId(id: string): Observable<{inProgress: boolean, data: string[], cancelled: boolean}> {

    if (!EnrichmentAnalysisService.apiAvailability[EA_API.GENE_ONTOLOGY]) {
      return of({inProgress: true, data: [], cancelled: false})
    }

    const ENDPOINT = `https://api.geneontology.org/api/bioentity/function/${id}/genes`

    const urlParams = {
      taxon: `NCBITaxon:${NCBI_TAXONS.HUMAN}`,
      relationship_type: "involved_in",
      start: "0",
      rows: "20000"
    };

    const full_url =
      ENDPOINT + '?' + new URLSearchParams(urlParams).toString();

    EnrichmentAnalysisService.apiAvailability[EA_API.GENE_ONTOLOGY] = false
    return this.http.get(full_url, {
      headers: {
        "accept": "application/json"
      }
    })
    .pipe(map((res: any) => {
      const uniProt_provided_labels = res.associations
      .filter(a => a.provided_by.findIndex(p => p === "UniProt") !== -1)
      .map(a => a.subject.label)

      // enable future API calls to geneOntology
      EnrichmentAnalysisService.apiAvailability[EA_API.GENE_ONTOLOGY] = true;

      return {
        inProgress: false,
        data: Array.from<string>(new Set(uniProt_provided_labels)),
        cancelled: false
      }
    }))

  }

  getPANTHERResults(): PANTHER_Results {
    return this.mostRecentResults;
  }

  /**
   * @description Run an enrichment analysis using the [PANTHER API](https://pantherdb.org/services/openAPISpec.jsp). Access the results in this.getResults()
   * @param genes list of genes
   * @returns {Observable<PANTHER_Results>} the results
   */
  runPANTHERAnalysis(genes: string[], options: PANTHER_APIOptions): Observable<{inProgress: boolean, data: PANTHER_Results, cancelled: boolean}> {

    // dont let multiple analyses run at the same time, over any instances
    // The PANTHER API documentation (https://pantherdb.org/services/details.jsp) says:
    //  "It is recommended that response from previous web service request is received before sending a new request.
    //  Failure to comply with this policy may result in the IP address being blocked from accessing PANTHER."
    if (!EnrichmentAnalysisService.apiAvailability[EA_API.PANTHER]) {
      return of({inProgress: true, data: undefined, cancelled: false})
    }

    // use this for testing
    // @ts-ignore
    return of(testData).pipe(startWith({inProgress: false, data: testData, cancelled: false}))

    const ENDPOINT =
      'https://pantherdb.org/services/oai/pantherdb/enrich/overrep';
    const MAX_NUM_GENES = 5000;

    const input_size = genes.length;
    if (genes.length > MAX_NUM_GENES) {
      genes = this.randomSample(genes, MAX_NUM_GENES);
    }

    let msg = `Running Panther Analysis on ${genes.length} genes`;
    if (genes.length !== input_size) {
      msg += ` (sampled from ${input_size} genes)`;
      if (options.snackbar) {
        this.snackbar.open(
          msg,
          'Close',
          {
            ...this.snackbarConfig,
            duration: 10000,
          }
        );
      }
    }

    const urlParams = {
      geneInputList: genes.join(','),
      organism: NCBI_TAXONS.HUMAN.toString(),
      annotDataSet: options.annotationDatasetId,
    };

    const full_url =
      ENDPOINT + '?' + new URLSearchParams(urlParams).toString();

    EnrichmentAnalysisService.apiAvailability[EA_API.PANTHER] = false;
    return this.http.post(full_url, {}).pipe(
      map((response: {
        results: PANTHER_Results
      }) => {

        if (options.snackbar) {
          this.snackbar.open('Enrichment Analysis complete.', 'Close', this.snackbarConfig);
        }
        console.log('Enrichment Analysis complete.')
        EnrichmentAnalysisService.apiAvailability[EA_API.PANTHER] = true;

        this.mostRecentResults = response.results;
        return {
          inProgress: false,
          data: response.results,
          cancelled: false
        };
      })
    );
  }

  private randomSample<T>(list: T[], targetLength: number): T[] {
    if (list.length <= targetLength) {
      // No need to sample if the list is already within or equal to the target length
      return list;
    }

    // Use the Fisher-Yates (Knuth) shuffle algorithm
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }

    // Return a slice of the array with the desired length
    return list.slice(0, targetLength);
  }

  public getAvailableAnnotationDatasets(): Observable<
    PANTHERAnnotationDataset[]
  > {
    return this.http
      .get(
        "https://pantherdb.org/services/oai/pantherdb/supportedannotdatasets"
      )
      .pipe(
        map((res: any) => res.search.annotation_data_sets.annotation_data_type),
        first()
      );
  }

  constructor(private http: HttpClient, private snackbar: MatSnackBar) {
  }
}
