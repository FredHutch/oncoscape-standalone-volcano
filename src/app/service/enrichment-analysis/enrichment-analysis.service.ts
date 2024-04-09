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
  /** key is background. value is a map of term to genes list */
  private cachedBackgrounds: { [key: string]: Map<string, string[]> } = {};
  /** key is gene names concatted with a + and the background dataset name */
  private cachedResults: { [key: string]: EnrichrGSEAResults } = {};

  /** Given a list of genes and background Type, get cached results, if any */
  getCachedResult(genes: string[], backgroundType: string, regulation: 'up' | 'down' | 'none'): EnrichrGSEAResults {
    const sortedGenesToCache = [...genes].sort()
    const cacheKey = this.generateCacheKey(sortedGenesToCache, backgroundType, regulation);
    return this.cachedResults[cacheKey];
  }

  async loadBackgroundDatasetMapping(dataset: string, cancel: Subject<void> = new Subject(), onCanceled: () => void = () => {}): Promise<Map<string, string[]>> {
    if (dataset in this.cachedBackgrounds) {
      return this.cachedBackgrounds[dataset]
    }

    const url = `https://maayanlab.cloud/Enrichr/geneSetLibrary?mode=text&libraryName=${dataset}`;
    return this.http
      .get(url, { responseType: "text" })
      .pipe(
        takeUntil(cancel),
        finalize(() => {
          EnrichmentAnalysisService.apiAvailability[EA_API.GENE_ONTOLOGY] =
            true;
          onCanceled();
        })
      )
      .toPromise()
      .then((tsvData: string) => {
        // Split the TSV data into rows
        const rows = tsvData.split("\n");
        const termToGenesMapping = new Map<string, string[]>();
        rows.map((row) => {
          const columns = row.split("\t");
          termToGenesMapping.set(columns[0], columns.slice(1));
        });
        this.cachedBackgrounds[dataset] = termToGenesMapping;
        return termToGenesMapping;
      })
      .catch((error) => {
        console.error("Error fetching data:", error);
        throw error;
      });
  }

  async getGenesByTerm(
    dataset: string,
    term: string,
    cancel: Subject<void> = new Subject<void>(),
    onCanceled: () => void = () => {}
  ): Promise<string[]> {

    const termToGenesMapping = await this.loadBackgroundDatasetMapping(dataset, cancel, onCanceled);
    const genes = termToGenesMapping.get(term);
    if (!genes) {
      throw new Error(`Term ${term} not found in dataset ${dataset}`);
    }
    return genes;
  }

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
    const ENDPOINT = "https://maayanlab.cloud/Enrichr/addList";
    const description = "Example gene list";
    const formData = new FormData();
    formData.append("list", genes.join("\n"));
    formData.append("description", description);

    // Define headers to specify content type
    const headers = new HttpHeaders();
    headers.append("Content-Type", "multipart/form-data");

    return this.http.post<any>(ENDPOINT, formData, { headers: headers });
  }

  private generateCacheKey(genes: string[], backgroundType: string, regulation: 'up' | 'down' | 'none'): string {
    const sortedGenesToCache = [...genes].sort((a, b) => a.localeCompare(b)); // Custom sorting function
    return [...sortedGenesToCache, backgroundType, regulation].join("+");
  }

  /**
   *
   * @param genes list of genes
   * @param backgroundType Background Dataset type (e.g. "KEGG_2019_Human" or "GO_Biological_Process_2018")
   * @param regulation "up" or "down" for upregulated or downregulated genes (not used in calculation, just for caching lookup purposes)
   * @returns
   */
  async runEnrichrGSEA(
    genes: string[],
    backgroundType: (typeof EnrichmentAnalysisService)["AVAILABLE_BACKGROUNDS"][number]["value"],
    regulation: "up" | "down" = "up"
  ): Promise<Observable<EnrichrGSEAResults>> {

    // create a key for the cache
    const cacheKey = this.generateCacheKey(genes, backgroundType, regulation);

    // see if we have the results cached
    if (cacheKey in this.cachedResults) {
      return of(this.cachedResults[cacheKey]);
    }

    // otherwise create a new list and run the analysis
    const { userListId, shortId } = await this.createEnrichrGeneList(
      genes
    ).toPromise();

    const ENDPOINT = "https://maayanlab.cloud/Enrichr/enrich";
    const urlParams = {
      userListId: userListId.toString(),
      backgroundType: backgroundType.toString(),
    };

    const full_url = ENDPOINT + "?" + new URLSearchParams(urlParams).toString();

    return this.http.get(full_url).pipe(
      map((res: any) => {
        const data = res[backgroundType];
        const results: EnrichrGSEAResults = data.map((d: Array<any>) => {
          return {
            index: d[0],
            term: d[1],
            pValue: d[2],
            oddsRatio: d[3],
            combinedScore: d[4],
            overlappingGenes: d[5],
            adjPValue: d[6],
          };
        });

        // cache the results
        this.cachedResults[cacheKey] = results;

        return results;
      })
    );
  }

  constructor(private http: HttpClient, private snackbar: MatSnackBar) {}
}
