import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { MatSnackBar, MatSnackBarConfig } from "@angular/material";
import { PANTHER_Results } from "./enrichment-analysis.service.types";
import { Observable, of } from "rxjs";
import { map, startWith } from "rxjs/operators";
import testData from "assets/data/PANTHERenrichmentAnalysisResults.json"

enum PANTHER_ORGANISMS {
  HUMAN = 9606,
}

@Injectable({
  providedIn: "root",
})
export class EnrichmentAnalysisService {

  private mostRecentResults: PANTHER_Results;

  private snackbarConfig: MatSnackBarConfig<any> = {
    horizontalPosition: "right",
    verticalPosition: "top",
    duration: 3000
  };

  public static analysisInProgress = false;

  getPANTHERResults(): PANTHER_Results {
    return this.mostRecentResults;
  }

  /**
   * @description Run an enrichment analysis using the [PANTHER API](https://pantherdb.org/services/openAPISpec.jsp). Access the results in this.getResults()
   * @param genes list of genes
   * @returns {Observable<PANTHER_Results>} the results
   */
  runPANTHERAnalysis(genes: string[], snackbar=true): Observable<PANTHER_Results> {

    // dont let multiple analyses run at the same time, over any instances
    // The PANTHER API documentation (https://pantherdb.org/services/details.jsp) says:
    //  "It is recommended that response from previous web service request is received before sending a new request.
    //  Failure to comply with this policy may result in the IP address being blocked from accessing PANTHER."
    if (EnrichmentAnalysisService.analysisInProgress) {
      return
    }

    // use this for testing
    // return of(testData).pipe(startWith(testData))

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
      if (snackbar) {
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
      organism: PANTHER_ORGANISMS.HUMAN.toString(),
      annotDataSet: 'GO:0003674',
    };

    const full_url =
      ENDPOINT + '?' + new URLSearchParams(urlParams).toString();

      EnrichmentAnalysisService.analysisInProgress = true;
    return this.http.post(full_url, {}).pipe(
      map((response: {
        results: PANTHER_Results
      }) => {
        if (snackbar) {
          this.snackbar.open('Enrichment Analysis complete.', 'Close', this.snackbarConfig);
        }
        console.log('Enrichment Analysis complete.')
        EnrichmentAnalysisService.analysisInProgress = false;

        this.mostRecentResults = response.results;
        return response.results;
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

  constructor(private http: HttpClient, private snackbar: MatSnackBar) {
    // this.http.get('assets/data/example_genes.txt', { responseType: 'text' }).subscribe((data: string) => {
    //   // Split the text into an array of strings using newline as the delimiter

    //   let genes = data.split('\n').map((line) => line.trim());
    //   // filter out empty genes
    //   genes = genes.filter(g => g.length > 0)

    //   this.runPANTHERAnalysis(genes)
    // },
    // (error) => {
    //   console.error('Error reading file:', error);
    // })
  }
}
