import { ChangeDetectorRef, Component, OnInit, Pipe, PipeTransform } from '@angular/core';
import { CsvLoaderService } from './service/csv-loader.service';
import { PythonService } from './service/python.service';
import { MatSnackBar } from '@angular/material';
import { EnrichmentAnalysisService } from './service/enrichment-analysis/enrichment-analysis.service';
import { DEAService } from './service/dea/dea.service';
import { HttpClient } from '@angular/common/http';
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  private _pythonService: PythonService;
  private _deaService: DEAService;

  private replaceKeys(data: any, toReplace: string[], replaceWith: string): any {
    toReplace.forEach((key) => {
      if (data[key]) {
        data[replaceWith] = data[key];
        delete data[key];
      }
    });
  }

  onResultsUploaded({data, filename}: {data: any, filename: string}) {

    // if there is a key "genes" or lowercase "geneid" or "gene_id" or "gene", replace them with "geneID"
    this.replaceKeys(data, ['genes', 'geneid', 'gene_id', 'gene'], 'geneID');

    // if the geneID column still doesn't exist, use the first column as geneID
    if (!data.geneID) {
      const keys = Object.keys(data);
      if (keys.length > 0) {
        data['geneID'] = data[keys[0]];
        delete data[keys[0]];
      }
    }

    // same for logFC to log2FoldChange
    this.replaceKeys(data, ['logFC'], 'log2FoldChange');

    // same for FDR to padj
    this.replaceKeys(data, ['FDR'], 'padj');

    // if the 3 columns needs are still not there, return early and alert the user
    if (!data.geneID || !data.log2FoldChange || !data.padj) {
      alert('Invalid CSV file. Please make sure the file contains geneID, log2FoldChange, and padj columns with column headers');
      return;
    }

    this._pythonService.createDummyJob(data, filename);
  }

  ngOnInit() {
    // open

    this.csv.loadResultsCSVFromFile('assets/data/mng_example.csv').subscribe(data => {
      this._pythonService.createDummyJob(data, 'Example');
    })

  }

  constructor(
    private csv: CsvLoaderService,
    private ea: EnrichmentAnalysisService,
    private http: HttpClient,
    _snackbar: MatSnackBar) {
    this._pythonService = new PythonService(_snackbar, csv);
    this._deaService = new DEAService(http)
  }
}
