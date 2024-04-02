import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Injectable, OnInit } from "@angular/core";
import { MatSnackBar, MatSnackBarConfig } from "@angular/material";
import {
  EnrichrBackgroundType,
  EnrichrGSEAResults,
  availableEnrichrBackgrounds,
} from "./enrichment-analysis.service.types";
import { Observable, Subject, of } from "rxjs";
import { finalize, first, map, startWith, takeUntil } from "rxjs/operators";

export enum EA_API {
  GENE_ONTOLOGY = "geneOntology",
}

@Injectable({
  providedIn: "root",
})
export class EnrichmentAnalysisService {

  // keep track of if a request is being made for each api, for rate limiting
  static apiAvailability = {
    [EA_API.GENE_ONTOLOGY]: true,
  };

  public static AVAILABLE_BACKGROUNDS = availableEnrichrBackgrounds;

  private snackbarConfig: MatSnackBarConfig<any> = {
    horizontalPosition: "right",
    verticalPosition: "top",
    duration: 3000,
  };

  /** @description Not enrichment analysis, but often used together with EA, so it is in this service. Get a list of genes in a GO Term */
  // getGenesByGOTermId(
  //   id: string,
  //   cancel: Subject<void> = new Subject<void>(),
  //   onCanceled: () => void = () => {}
  // ): Observable<{ inProgress: boolean; data: string[] }> {
  //   if (!EnrichmentAnalysisService.apiAvailability[EA_API.GENE_ONTOLOGY]) {
  //     return of({ inProgress: true, data: [], cancelled: false });
  //   }

  //   const ENDPOINT = `https://api.geneontology.org/api/bioentity/function/${id}/genes`;

  //   const urlParams = {
  //     taxon: `NCBITaxon:${NCBI_TAXONS.HUMAN}`,
  //     relationship_type: "involved_in",
  //     start: "0",
  //     rows: "1000",
  //   };

  //   const full_url = ENDPOINT + "?" + new URLSearchParams(urlParams).toString();

  //   EnrichmentAnalysisService.apiAvailability[EA_API.GENE_ONTOLOGY] = false;
  //   return this.http
  //     .get(full_url, {
  //       headers: {
  //         accept: "application/json",
  //       },
  //     })
  //     .pipe(
  //       takeUntil(cancel),
  //       finalize(() => {
  //         EnrichmentAnalysisService.apiAvailability[EA_API.GENE_ONTOLOGY] =
  //           true;
  //         onCanceled();
  //       })
  //     )
  //     .pipe(
  //       map((res: any) => {
  //         const uniProt_provided_labels = res.associations
  //           .filter(
  //             (a) => a.provided_by.findIndex((p) => p === "UniProt") !== -1
  //           )
  //           .map((a) => a.subject.label);

  //         // enable future API calls to geneOntology
  //         EnrichmentAnalysisService.apiAvailability[EA_API.GENE_ONTOLOGY] =
  //           true;

  //         return {
  //           inProgress: false,
  //           data: Array.from<string>(new Set(uniProt_provided_labels)),
  //         };
  //       })
  //     );
  // }

  /**
   * @description Register a list of genes in the Enrichr database.
   * @param genes list of genes
   * @returns {Observable<{userListId: number, shortId: string}>} the user list id and short id of the newly created list
   *
   */
  private createEnrichrGeneList(genes: string[]): Observable<{
    userListId: number;
    shortId: string;
  }> {
    const ENDPOINT = 'https://maayanlab.cloud/Enrichr/addList';
    const description = 'Example gene list';
    const formData = new FormData();
    formData.append('list', genes.join('\n'));
    formData.append('description', description);

    // Define headers to specify content type
    const headers = new HttpHeaders();
    headers.append('Content-Type', 'multipart/form-data');

    return this.http.post<any>(ENDPOINT, formData, { headers: headers });
  }

  async runEnrichrGSEA(genes: string[], backgroundType: typeof EnrichmentAnalysisService["AVAILABLE_BACKGROUNDS"][number]["value"]): Promise<Observable<EnrichrGSEAResults>> {

    const { userListId, shortId } = await this.createEnrichrGeneList(genes).toPromise();

    const ENDPOINT = "https://maayanlab.cloud/Enrichr/enrich";
    const urlParams = {
      userListId: userListId.toString(),
      backgroundType: backgroundType.toString(),
    };

    const full_url = ENDPOINT + "?" + new URLSearchParams(urlParams).toString();

    return this.http.get(full_url).pipe(
      map((res: any) => {
        const data = res[backgroundType];
        return data.map(d => {
          return {
            index: d[0],
            term: d[1],
            pValue: d[2],
            oddsRatio: d[3],
            combinedScore: d[4],
            overlappingGenes: d[5],
            adjPValue: d[6],
          };
        })
      })
    )
  }

  constructor(private http: HttpClient, private snackbar: MatSnackBar) {}
}
